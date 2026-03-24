/**
 * Supabase 연결 테스트 스크립트
 *
 * 실행 방법:
 *   npx tsx scripts/test-supabase.ts
 *
 * 사전 조건:
 *   - .env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *     SUPABASE_SERVICE_ROLE_KEY가 설정되어 있어야 합니다.
 *   - 001_initial_schema.sql이 Supabase에 실행되어 있어야 합니다.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// .env.local 수동 로드 (tsx 환경에서 Next.js 환경변수 자동 로드 안 됨)
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local')
    const envContent = readFileSync(envPath, 'utf-8')
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex === -1) continue
      const key = trimmed.slice(0, eqIndex)
      const value = trimmed.slice(eqIndex + 1)
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // .env.local 없으면 환경변수에서 직접 읽음
  }
}

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('❌ 환경변수 미설정:')
  if (!url) console.error('  - NEXT_PUBLIC_SUPABASE_URL')
  if (!serviceKey) console.error('  - SUPABASE_SERVICE_ROLE_KEY')
  console.error('\n.env.local 파일에 값을 설정해 주세요.')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface TestResult {
  name: string
  passed: boolean
  detail: string
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  // 테스트 1: 기본 연결 확인
  try {
    const { data, error } = await supabase.from('documents').select('id').limit(1)
    if (error && error.code === '42P01') {
      // 테이블이 없는 경우
      results.push({
        name: 'Supabase 연결',
        passed: true,
        detail: '연결 성공 (documents 테이블 미생성 — 마이그레이션 실행 필요)',
      })
    } else if (error) {
      results.push({ name: 'Supabase 연결', passed: false, detail: error.message })
    } else {
      results.push({
        name: 'Supabase 연결',
        passed: true,
        detail: `연결 성공 (documents 행 수: ${data?.length ?? 0})`,
      })
    }
  } catch (e) {
    results.push({
      name: 'Supabase 연결',
      passed: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  // 테스트 2: pgvector 확장 확인
  try {
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: Array(768).fill(0),
      match_threshold: 0.99,
      match_count: 1,
    })
    if (error && error.message.includes('function') && error.message.includes('does not exist')) {
      // RPC 함수가 없는 경우 — 직접 SQL로 vector 타입 확인
      results.push({
        name: 'pgvector 확장',
        passed: false,
        detail: 'match_documents 함수 미존재 — 마이그레이션 실행 필요',
      })
    } else if (error) {
      results.push({ name: 'pgvector 확장', passed: false, detail: error.message })
    } else {
      results.push({
        name: 'pgvector 확장',
        passed: true,
        detail: `match_documents RPC 정상 동작 (결과: ${data?.length ?? 0}건)`,
      })
    }
  } catch (e) {
    results.push({
      name: 'pgvector 확장',
      passed: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  // 테스트 3: documents 테이블 존재 확인
  try {
    const { error } = await supabase.from('documents').select('id, content, metadata, created_at').limit(0)
    if (error) {
      results.push({ name: 'documents 테이블', passed: false, detail: error.message })
    } else {
      results.push({ name: 'documents 테이블', passed: true, detail: '테이블 존재 확인' })
    }
  } catch (e) {
    results.push({
      name: 'documents 테이블',
      passed: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  // 테스트 4: corrections 테이블 존재 확인
  try {
    const { error } = await supabase
      .from('corrections')
      .select('id, original_chunk_id, correction_text, status, created_at')
      .limit(0)
    if (error) {
      results.push({ name: 'corrections 테이블', passed: false, detail: error.message })
    } else {
      results.push({ name: 'corrections 테이블', passed: true, detail: '테이블 존재 확인' })
    }
  } catch (e) {
    results.push({
      name: 'corrections 테이블',
      passed: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  return results
}

async function main() {
  console.log('=== 한의사 AI — Supabase 연결 테스트 ===\n')
  console.log(`URL: ${url}\n`)

  const results = await runTests()

  let allPassed = true
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌'
    console.log(`${icon} ${r.name}: ${r.detail}`)
    if (!r.passed) allPassed = false
  }

  console.log(`\n${allPassed ? '✅ 모든 테스트 통과' : '⚠️  일부 테스트 실패 — 위 항목 확인 필요'}`)
  process.exit(allPassed ? 0 : 1)
}

main()
