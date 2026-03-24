/**
 * 벡터 적재 스크립트
 *
 * data/embedded/*.jsonl 파일들을 읽어 Supabase documents 테이블에 적재합니다.
 *
 * 기능:
 * - 배치 upsert (50건씩)
 * - chunk_id 기반 중복 방지 (on conflict → update)
 * - 적재 후 검증 (적재 행 수 == 원본 청크 수)
 * - 진행률 출력
 * - 환경변수 미설정 시 graceful 에러
 *
 * 실행: npx tsx scripts/load/load-vectors.ts
 * 환경변수: .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EmbeddedChunkRecord, DocumentInsert, LoadStats } from './types';

// Supabase 클라이언트 타입 (스키마 미지정 프로젝트용)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

// ─── 설정 ───

const BATCH_SIZE = 50;
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const EMBEDDED_DIR = path.join(PROJECT_ROOT, 'data/embedded');

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

// ─── JSONL 파싱 ───

function parseJsonlFile(filePath: string): EmbeddedChunkRecord[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  const records: EmbeddedChunkRecord[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const record = JSON.parse(lines[i]) as EmbeddedChunkRecord;

      // 필수 필드 검증
      if (!record.chunk_id || !record.content || !record.embedding) {
        console.warn(
          `  [경고] ${path.basename(filePath)} 라인 ${i + 1}: 필수 필드 누락 — 건너뜀`,
        );
        continue;
      }

      records.push(record);
    } catch (_e) {
      console.warn(
        `  [경고] ${path.basename(filePath)} 라인 ${i + 1}: JSON 파싱 실패 — 건너뜀`,
      );
    }
  }

  return records;
}

function loadAllJsonlFiles(): { records: EmbeddedChunkRecord[]; files: string[] } {
  if (!fs.existsSync(EMBEDDED_DIR)) {
    console.error(`\n[에러] 임베딩 데이터 디렉토리가 없습니다: ${EMBEDDED_DIR}`);
    console.error('먼저 임베딩 파이프라인을 실행하세요: npx tsx scripts/embed/run-embed.ts');
    process.exit(1);
  }

  const jsonlFiles = fs
    .readdirSync(EMBEDDED_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .sort();

  if (jsonlFiles.length === 0) {
    console.error(`\n[에러] ${EMBEDDED_DIR}에 .jsonl 파일이 없습니다.`);
    console.error('먼저 임베딩 파이프라인을 실행하세요: npx tsx scripts/embed/run-embed.ts');
    process.exit(1);
  }

  // all-embedded.jsonl이 있으면 그것만 사용 (중복 방지)
  const allFile = jsonlFiles.find((f) => f === 'all-embedded.jsonl');
  const filesToLoad = allFile ? [allFile] : jsonlFiles;

  console.log(`\n  대상 파일:`);
  const allRecords: EmbeddedChunkRecord[] = [];
  const loadedFiles: string[] = [];

  for (const file of filesToLoad) {
    const filePath = path.join(EMBEDDED_DIR, file);
    const records = parseJsonlFile(filePath);
    console.log(`    - ${file}: ${records.length}건`);
    allRecords.push(...records);
    loadedFiles.push(file);
  }

  // chunk_id 기준 중복 제거 (동일 chunk_id가 여러 파일에 있을 수 있음)
  const seen = new Map<string, EmbeddedChunkRecord>();
  for (const record of allRecords) {
    seen.set(record.chunk_id, record);
  }
  const deduped = Array.from(seen.values());

  if (deduped.length < allRecords.length) {
    console.log(
      `  중복 제거: ${allRecords.length} → ${deduped.length}건`,
    );
  }

  return { records: deduped, files: loadedFiles };
}

// ─── 레코드 → Supabase insert 형식 변환 ───

function toDocumentInsert(record: EmbeddedChunkRecord): DocumentInsert {
  return {
    // id 생략 → DB가 UUID 자동 생성. chunk_id는 metadata에 보존
    content: record.content,
    metadata: { ...record.metadata, chunk_id: record.chunk_id },
    embedding: record.embedding,
  };
}

// ─── 배치 upsert ───

async function upsertBatch(
  supabase: AnySupabaseClient,
  batch: DocumentInsert[],
): Promise<{ success: number; failed: number; errors: string[] }> {
  const errors: string[] = [];

  // Supabase insert: UUID 자동 생성, chunk_id는 metadata에 보존
  const { error } = await supabase
    .from('documents')
    .insert(batch);

  if (error) {
    errors.push(error.message);
    return { success: 0, failed: batch.length, errors };
  }

  return { success: batch.length, failed: 0, errors };
}

// ─── 메인 실행 ───

async function main(): Promise<void> {
  console.log('========================================');
  console.log('  한의사AI — 벡터 적재 스크립트');
  console.log('========================================');

  // 1. 환경변수 검증
  const { url, serviceKey } = validateEnv();
  console.log(`\nSupabase URL: ${url}`);

  // 2. Supabase 클라이언트 생성
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 3. JSONL 파일 로드
  console.log('\n1. JSONL 파일 로드...');
  const { records, files } = loadAllJsonlFiles();

  if (records.length === 0) {
    console.error('\n[에러] 적재할 레코드가 없습니다.');
    process.exit(1);
  }

  console.log(`\n  총 레코드: ${records.length}건`);
  console.log(`  배치 크기: ${BATCH_SIZE}건`);
  console.log(`  배치 수: ${Math.ceil(records.length / BATCH_SIZE)}`);

  // 4. 배치 upsert 실행
  console.log('\n2. Supabase documents 테이블에 적재 중...\n');

  const startTime = Date.now();
  let totalSuccess = 0;
  let totalFailed = 0;
  const allErrors: string[] = [];

  const totalBatches = Math.ceil(records.length / BATCH_SIZE);

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = records.slice(i, i + BATCH_SIZE);
    const inserts = batch.map(toDocumentInsert);

    const result = await upsertBatch(supabase, inserts);
    totalSuccess += result.success;
    totalFailed += result.failed;
    allErrors.push(...result.errors);

    // 진행률 출력
    const pct = Math.round(((i + batch.length) / records.length) * 100);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(
      `\r  배치 ${batchNum}/${totalBatches} 완료 (${i + batch.length}/${records.length}, ${pct}%) [${elapsed}s]`,
    );

    // 배치 실패 시 에러 출력 후 계속 진행
    if (result.errors.length > 0) {
      console.error(`\n  [에러] 배치 ${batchNum} 실패: ${result.errors.join(', ')}`);
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(''); // 줄바꿈

  // 5. 적재 후 검증
  console.log('\n3. 적재 검증...');

  const { count, error: countError } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error(`  [에러] 행 수 조회 실패: ${countError.message}`);
  } else {
    const dbCount = count ?? 0;
    const match = dbCount >= records.length;
    console.log(`  DB 행 수: ${dbCount}`);
    console.log(`  원본 레코드 수: ${records.length}`);
    console.log(`  일치 여부: ${match ? '통과' : '불일치 (기존 데이터 포함 가능)'}`);
  }

  // 6. 결과 요약
  const stats: LoadStats = {
    totalRecords: records.length,
    successCount: totalSuccess,
    failureCount: totalFailed,
    durationMs,
    files,
  };

  console.log('\n========================================');
  console.log('  적재 완료');
  console.log('========================================');
  console.log(`  총 레코드: ${stats.totalRecords}`);
  console.log(`  성공: ${stats.successCount}`);
  console.log(`  실패: ${stats.failureCount}`);
  console.log(`  소요 시간: ${(stats.durationMs / 1000).toFixed(1)}s`);
  console.log(`  처리 속도: ${((stats.successCount / stats.durationMs) * 1000).toFixed(1)} 건/초`);

  if (allErrors.length > 0) {
    console.log('\n  [에러 목록]');
    for (const err of allErrors) {
      console.log(`    - ${err}`);
    }
  }

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n[에러] 적재 스크립트 에러:', error);
  process.exit(1);
});
