/**
 * 벡터 적재 검증 스크립트
 *
 * documents 테이블에 적재된 데이터를 검증합니다.
 *
 * 기능:
 * - documents 테이블 총 행 수 조회
 * - 임의 5건 샘플 조회하여 content + metadata + embedding 존재 확인
 * - match_documents RPC 테스트 호출 (테스트 쿼리 벡터로)
 * - 결과 출력
 *
 * 실행: npx tsx scripts/load/verify-load.ts
 * 환경변수: .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VerifyResult, SampleDetail } from './types';

// ─── 설정 ───

const SAMPLE_COUNT = 5;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Supabase 클라이언트 타입 (스키마 미지정 프로젝트용)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

// ─── 환경변수 로드 ───

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    let value = trimmed.substring(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(PROJECT_ROOT, '.env.local'));

// ─── 환경변수 검증 ───

function validateEnv(): { url: string; serviceKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('\n[에러] 환경변수가 설정되지 않았습니다:');
    if (!url) console.error('  - NEXT_PUBLIC_SUPABASE_URL');
    if (!serviceKey) console.error('  - SUPABASE_SERVICE_ROLE_KEY');
    console.error('\n.env.local 파일에 값을 설정해 주세요.');
    process.exit(1);
  }

  return { url, serviceKey };
}

// ─── 검증 함수들 ───

async function checkTotalRows(supabase: AnySupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw new Error(`행 수 조회 실패: ${error.message}`);
  }

  return count ?? 0;
}

async function checkSamples(
  supabase: AnySupabaseClient,
  sampleCount: number,
): Promise<SampleDetail[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, content, metadata, embedding')
    .limit(100);

  if (error) {
    throw new Error(`샘플 조회 실패: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // 랜덤 셔플 후 sampleCount만큼 선택
  const shuffled = [...data].sort(() => Math.random() - 0.5);
  const samples = shuffled.slice(0, Math.min(sampleCount, shuffled.length));

  return samples.map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ''),
    hasContent: typeof row.content === 'string' && (row.content as string).length > 0,
    hasMetadata: row.metadata !== null && typeof row.metadata === 'object',
    hasEmbedding: Array.isArray(row.embedding) && (row.embedding as unknown[]).length > 0,
    contentPreview:
      typeof row.content === 'string'
        ? (row.content as string).substring(0, 80) +
          ((row.content as string).length > 80 ? '...' : '')
        : '(없음)',
  }));
}

async function checkMatchDocumentsRpc(
  supabase: AnySupabaseClient,
): Promise<{ passed: boolean; resultCount: number; detail: string }> {
  // 테스트용 쿼리 벡터: 첫 번째 문서의 임베딩을 가져와서 사용
  const { data: firstDoc, error: fetchError } = await supabase
    .from('documents')
    .select('embedding')
    .limit(1)
    .single();

  if (fetchError || !firstDoc?.embedding) {
    // 데이터가 없는 경우 제로 벡터로 테스트
    const zeroVector = Array(768).fill(0);
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: zeroVector,
      match_threshold: 0.0,
      match_count: 3,
    });

    if (error) {
      return {
        passed: false,
        resultCount: 0,
        detail: `RPC 호출 실패: ${error.message}`,
      };
    }

    const rpcData = data as unknown[] | null;
    return {
      passed: true,
      resultCount: rpcData?.length ?? 0,
      detail: `제로 벡터 테스트 — 결과 ${rpcData?.length ?? 0}건 (threshold=0.0)`,
    };
  }

  // 첫 번째 문서의 임베딩으로 유사도 검색
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: firstDoc.embedding,
    match_threshold: 0.5,
    match_count: 5,
  });

  if (error) {
    return {
      passed: false,
      resultCount: 0,
      detail: `RPC 호출 실패: ${error.message}`,
    };
  }

  const rpcData = data as Array<{ similarity?: number }> | null;
  const resultCount = rpcData?.length ?? 0;

  if (resultCount === 0) {
    return {
      passed: false,
      resultCount: 0,
      detail: '기존 임베딩으로 검색했으나 결과 없음 — 임베딩 데이터 확인 필요',
    };
  }

  // 첫 번째 결과의 similarity 확인
  const topSimilarity = rpcData![0]?.similarity ?? 0;
  return {
    passed: true,
    resultCount,
    detail: `결과 ${resultCount}건 반환, 최고 유사도: ${topSimilarity.toFixed(4)}`,
  };
}

// ─── 메인 실행 ───

async function main(): Promise<void> {
  console.log('========================================');
  console.log('  한의사AI — 벡터 적재 검증');
  console.log('========================================');

  // 1. 환경변수 검증
  const { url, serviceKey } = validateEnv();
  console.log(`\nSupabase URL: ${url}`);

  // 2. Supabase 클라이언트 생성
  const supabase: AnySupabaseClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result: VerifyResult = {
    totalRows: 0,
    sampleCheck: { checked: 0, passed: 0, details: [] },
    rpcTest: { passed: false, resultCount: 0, detail: '' },
  };

  let allPassed = true;

  // 3. 총 행 수 조회
  console.log('\n1. documents 테이블 행 수 조회...');
  try {
    result.totalRows = await checkTotalRows(supabase);
    console.log(`   총 행 수: ${result.totalRows}`);

    if (result.totalRows === 0) {
      console.log('   [경고] 테이블이 비어있습니다. 적재 스크립트를 먼저 실행하세요.');
      allPassed = false;
    }
  } catch (e) {
    console.error(`   [실패] ${e instanceof Error ? e.message : String(e)}`);
    allPassed = false;
  }

  // 4. 샘플 검증
  console.log(`\n2. 임의 ${SAMPLE_COUNT}건 샘플 검증...`);
  try {
    const samples = await checkSamples(supabase, SAMPLE_COUNT);
    result.sampleCheck.checked = samples.length;
    result.sampleCheck.details = samples;

    if (samples.length === 0) {
      console.log('   [경고] 샘플 데이터 없음');
      allPassed = false;
    } else {
      for (const sample of samples) {
        const checks = [
          sample.hasContent ? 'O' : 'X',
          sample.hasMetadata ? 'O' : 'X',
          sample.hasEmbedding ? 'O' : 'X',
        ];
        const passed =
          sample.hasContent && sample.hasMetadata && sample.hasEmbedding;

        if (passed) {
          result.sampleCheck.passed++;
        } else {
          allPassed = false;
        }

        console.log(
          `   ${passed ? '[통과]' : '[실패]'} ${sample.id.substring(0, 8)}... ` +
            `content:${checks[0]} metadata:${checks[1]} embedding:${checks[2]}`,
        );
        console.log(`          "${sample.contentPreview}"`);
      }

      console.log(
        `\n   샘플 검증: ${result.sampleCheck.passed}/${result.sampleCheck.checked} 통과`,
      );
    }
  } catch (e) {
    console.error(`   [실패] ${e instanceof Error ? e.message : String(e)}`);
    allPassed = false;
  }

  // 5. match_documents RPC 테스트
  console.log('\n3. match_documents RPC 테스트...');
  try {
    result.rpcTest = await checkMatchDocumentsRpc(supabase);
    console.log(
      `   ${result.rpcTest.passed ? '[통과]' : '[실패]'} ${result.rpcTest.detail}`,
    );
    if (!result.rpcTest.passed) {
      allPassed = false;
    }
  } catch (e) {
    console.error(`   [실패] ${e instanceof Error ? e.message : String(e)}`);
    allPassed = false;
  }

  // 6. 최종 결과
  console.log('\n========================================');
  console.log(`  검증 결과: ${allPassed ? '모두 통과' : '일부 실패'}`);
  console.log('========================================');
  console.log(`  총 행 수: ${result.totalRows}`);
  console.log(
    `  샘플 검증: ${result.sampleCheck.passed}/${result.sampleCheck.checked} 통과`,
  );
  console.log(
    `  RPC 테스트: ${result.rpcTest.passed ? '통과' : '실패'} (${result.rpcTest.resultCount}건)`,
  );

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('\n[에러] 검증 스크립트 에러:', error);
  process.exit(1);
});
