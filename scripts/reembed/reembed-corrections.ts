/**
 * 승인된 교정(corrections)의 수정 내용을 documents 테이블 임베딩에 반영하는 배치 재임베딩 모듈
 *
 * 흐름:
 * 1. corrections 테이블에서 status='approved' AND reembedded_at IS NULL 조회
 * 2. correction_text로 새 임베딩 벡터 생성 (embedBatch 재사용)
 * 3. documents 테이블 UPDATE: content, embedding, metadata 갱신
 * 4. corrections.reembedded_at 업데이트
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { embedBatch, DEFAULT_EMBEDDING_CONFIG, type EmbeddingClientConfig } from '../embed/embedding-client'

// ─── 타입 ───

interface PendingCorrection {
  id: string
  original_chunk_id: string
  original_content: string | null
  correction_text: string
}

interface DocumentRow {
  content: string
  metadata: Record<string, unknown> | null
}

interface ReembedResult {
  processed: number
  succeeded: number
  failed: number
  failures: { correctionId: string; error: string }[]
  totalTokens: number
}

// ─── Supabase 서버 클라이언트 생성 ───

function createReembedClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      '환경변수 누락: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요'
    )
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ─── 대상 조회 ───

async function fetchPendingCorrections(
  supabase: SupabaseClient,
): Promise<PendingCorrection[]> {
  const { data, error } = await supabase
    .from('corrections')
    .select('id, original_chunk_id, original_content, correction_text')
    .eq('status', 'approved')
    .is('reembedded_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`corrections 조회 실패: ${error.message}`)
  }

  const rows = (data ?? []) as Array<{
    id: string
    original_chunk_id: string | null
    original_content: string | null
    correction_text: string
  }>

  // original_chunk_id가 null인 교정은 대상에서 제외 (documents와 연결 불가)
  return rows.filter(
    (c): c is PendingCorrection => c.original_chunk_id !== null
  )
}

// ─── 단일 교정 반영 ───

async function applyCorrection(
  supabase: SupabaseClient,
  correction: PendingCorrection,
  newEmbedding: number[],
): Promise<void> {
  // 1. 기존 document의 metadata + content 조회
  const { data, error: fetchError } = await supabase
    .from('documents')
    .select('content, metadata')
    .eq('id', correction.original_chunk_id)
    .single()

  if (fetchError || !data) {
    throw new Error(
      `document ${correction.original_chunk_id} 조회 실패: ${fetchError?.message ?? '존재하지 않음'}`
    )
  }

  const doc = data as DocumentRow

  // 2. metadata에 corrected 마크 + 원본 content 보존
  const updatedMetadata = {
    ...(doc.metadata ?? {}),
    corrected: true,
    original_content: doc.content,
  }

  // 3. documents 테이블 업데이트
  const { error: updateDocError } = await supabase
    .from('documents')
    .update({
      content: correction.correction_text,
      embedding: JSON.stringify(newEmbedding), // Supabase vector 타입: JSON string으로 전달
      metadata: updatedMetadata,
    })
    .eq('id', correction.original_chunk_id)

  if (updateDocError) {
    throw new Error(
      `document ${correction.original_chunk_id} 업데이트 실패: ${updateDocError.message}`
    )
  }

  // 4. corrections.reembedded_at 업데이트
  const { error: updateCorrError } = await supabase
    .from('corrections')
    .update({ reembedded_at: new Date().toISOString() })
    .eq('id', correction.id)

  if (updateCorrError) {
    throw new Error(
      `correction ${correction.id} reembedded_at 업데이트 실패: ${updateCorrError.message}`
    )
  }
}

// ─── 메인 함수 ───

export interface ReembedOptions {
  dryRun?: boolean
  embeddingConfig?: EmbeddingClientConfig
}

export async function reembedCorrections(
  options: ReembedOptions = {},
): Promise<ReembedResult> {
  const { dryRun = false, embeddingConfig = DEFAULT_EMBEDDING_CONFIG } = options
  const supabase = createReembedClient()

  // 1. 대상 조회
  console.log('📋 승인된 미반영 교정 조회 중...')
  const pending = await fetchPendingCorrections(supabase)

  if (pending.length === 0) {
    console.log('✅ 반영할 교정이 없습니다.')
    return { processed: 0, succeeded: 0, failed: 0, failures: [], totalTokens: 0 }
  }

  console.log(`📝 대상: ${pending.length}건`)

  // 2. dry-run 모드
  if (dryRun) {
    console.log('\n🔍 [DRY-RUN] 대상 목록 (실제 업데이트 없음):')
    console.log('─'.repeat(80))
    for (const c of pending) {
      console.log(`  correction: ${c.id}`)
      console.log(`  document:   ${c.original_chunk_id}`)
      console.log(`  내용 미리보기: ${c.correction_text.substring(0, 100)}...`)
      console.log('─'.repeat(80))
    }
    console.log(`\n총 ${pending.length}건이 재임베딩 대상입니다.`)
    return { processed: pending.length, succeeded: 0, failed: 0, failures: [], totalTokens: 0 }
  }

  // 3. 배치 임베딩 생성
  console.log('\n🔄 임베딩 벡터 생성 중...')
  const texts = pending.map((c) => c.correction_text)
  const batchSize = embeddingConfig.batchSize

  const allEmbeddings: number[][] = []
  let totalTokens = 0

  for (let i = 0; i < texts.length; i += batchSize) {
    const batchTexts = texts.slice(i, i + batchSize)
    const batchNum = Math.floor(i / batchSize) + 1
    const totalBatches = Math.ceil(texts.length / batchSize)

    console.log(`  배치 ${batchNum}/${totalBatches} (${batchTexts.length}건)...`)

    const { embeddings, tokens } = await embedBatch(batchTexts, embeddingConfig)
    allEmbeddings.push(...embeddings)
    totalTokens += tokens

    // 배치 간 대기 (마지막 배치 제외)
    if (i + batchSize < texts.length && embeddingConfig.batchDelay > 0) {
      await new Promise((r) => setTimeout(r, embeddingConfig.batchDelay))
    }
  }

  console.log(`  임베딩 완료: ${allEmbeddings.length}건, 토큰: ${totalTokens}`)

  // 4. 개별 교정 반영
  console.log('\n📥 documents 테이블 업데이트 중...')
  let succeeded = 0
  let failed = 0
  const failures: { correctionId: string; error: string }[] = []

  for (let i = 0; i < pending.length; i++) {
    const correction = pending[i]
    const embedding = allEmbeddings[i]

    try {
      await applyCorrection(supabase, correction, embedding)
      succeeded++
      console.log(
        `  [${i + 1}/${pending.length}] ✅ ${correction.id} → doc ${correction.original_chunk_id}`,
      )
    } catch (error) {
      failed++
      const errMsg = error instanceof Error ? error.message : String(error)
      failures.push({ correctionId: correction.id, error: errMsg })
      console.error(
        `  [${i + 1}/${pending.length}] ❌ ${correction.id}: ${errMsg}`,
      )
    }
  }

  // 5. 결과 요약
  console.log('\n' + '═'.repeat(60))
  console.log('📊 재임베딩 결과 요약')
  console.log('═'.repeat(60))
  console.log(`  대상:     ${pending.length}건`)
  console.log(`  성공:     ${succeeded}건`)
  console.log(`  실패:     ${failed}건`)
  console.log(`  토큰:     ${totalTokens}`)
  if (failures.length > 0) {
    console.log('\n  실패 목록:')
    for (const f of failures) {
      console.log(`    - ${f.correctionId}: ${f.error}`)
    }
  }
  console.log('═'.repeat(60))

  return {
    processed: pending.length,
    succeeded,
    failed,
    failures,
    totalTokens,
  }
}
