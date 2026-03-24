/**
 * 임베딩 통합 실행 스크립트
 *
 * 전체 파이프라인: 샘플 데이터 로드 → 청킹 → 임베딩 → JSONL 저장
 *
 * 실행: npx tsx scripts/embed/run-embed.ts
 * 환경변수: GOOGLE_GENERATIVE_AI_API_KEY (.env.local)
 */

import * as fs from 'fs';
import * as path from 'path';

// .env.local 로드 (dotenv 없이 직접 파싱)
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
    // 따옴표 제거
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env.local'));

import type {
  DongeuibogamCollection,
  HerbCollection,
  PrescriptionCollection,
} from '../collect/types';
import type { Chunk } from '../chunking/types';
import type { ClassicTextMetadata, HerbData, PrescriptionData } from '../chunking/types';
import {
  chunkClassicText,
  chunkHerb,
  chunkPrescription,
} from '../chunking/chunker';
import { embedChunks, type EmbeddedChunk } from './embed';

// ─── 경로 설정 ───

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const RAW_DIR = path.join(PROJECT_ROOT, 'data/raw');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data/embedded');

// ─── 데이터 로드 ───

function loadDongeuibogam(): Chunk[] {
  const filePath = path.join(RAW_DIR, 'dongeuibogam/dongeuibogam-samples.json');
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ 동의보감 샘플 파일 없음: ${filePath}`);
    return [];
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DongeuibogamCollection;
  console.log(`  동의보감: ${raw.entries.length}건 로드`);

  const chunks: Chunk[] = [];
  for (const entry of raw.entries) {
    // 원문 + 번역문 결합
    const text = [entry.originalText, entry.translatedText]
      .filter(Boolean)
      .join('\n\n');

    const metadata: ClassicTextMetadata = {
      book: '동의보감',
      volume: entry.section,
      chapter: `권${entry.volume}`,
      section: entry.chapter,
      subsection: entry.subchapter,
    };

    const entryChunks = chunkClassicText(text, metadata);
    chunks.push(...entryChunks);
  }

  return chunks;
}

function loadHerbs(): Chunk[] {
  const filePath = path.join(RAW_DIR, 'herbs/herbs-samples.json');
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ 약재 샘플 파일 없음: ${filePath}`);
    return [];
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as HerbCollection;
  console.log(`  약재: ${raw.entries.length}건 로드`);

  const chunks: Chunk[] = [];
  for (let i = 0; i < raw.entries.length; i++) {
    const entry = raw.entries[i];

    const herbData: HerbData = {
      name: entry.nameKo,
      name_hanja: entry.nameHanja,
      latin_name: entry.nameLatin,
      properties: `${entry.properties.nature}, ${entry.properties.taste.join(' ')}`,
      meridians: entry.meridians.join(', '),
      efficacy_category: entry.category,
      efficacy: entry.effects.join(', '),
      indications: entry.indications.join(', '),
      dosage: entry.dosage,
      cautions: entry.cautions.join(', '),
      source: entry.source.origin,
      original_id: entry.id,
    };

    const herbChunks = chunkHerb(herbData, i + 1);
    chunks.push(...herbChunks);
  }

  return chunks;
}

function loadPrescriptions(): Chunk[] {
  const filePath = path.join(RAW_DIR, 'prescriptions/prescriptions-samples.json');
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ 처방 샘플 파일 없음: ${filePath}`);
    return [];
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PrescriptionCollection;
  console.log(`  처방: ${raw.entries.length}건 로드`);

  const chunks: Chunk[] = [];
  for (let i = 0; i < raw.entries.length; i++) {
    const entry = raw.entries[i];

    const prescriptionData: PrescriptionData = {
      name: entry.nameKo,
      name_hanja: entry.nameHanja,
      ingredients: entry.ingredients.map((ing) => ({
        herb: ing.herbNameKo,
        dose: ing.amount,
      })),
      efficacy: entry.effects.join(', '),
      indications: entry.indications.join(', '),
      source: entry.classicSource,
      original_id: entry.id,
    };

    const prescriptionChunks = chunkPrescription(prescriptionData, i + 1);
    chunks.push(...prescriptionChunks);
  }

  return chunks;
}

// ─── JSONL 저장 ───

interface EmbeddedChunkRecord {
  chunk_id: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
}

function saveToJsonl(embedded: EmbeddedChunk[], outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lines = embedded.map((item) => {
    const record: EmbeddedChunkRecord = {
      chunk_id: item.chunk.id,
      content: item.chunk.content,
      metadata: item.chunk.metadata as unknown as Record<string, unknown>,
      embedding: item.embedding,
    };
    return JSON.stringify(record);
  });

  fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf-8');
  console.log(`  → ${outputPath} (${lines.length}건)`);
}

// ─── 메인 실행 ───

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  한의사AI 임베딩 생성 파이프라인           ║');
  console.log('║  모델: Google text-embedding-004 (768d)    ║');
  console.log('╚════════════════════════════════════════════╝\n');

  // 1. 데이터 로드 + 청킹
  console.log('1. 데이터 로드 + 청킹...');
  const dongeuibogamChunks = loadDongeuibogam();
  const herbChunks = loadHerbs();
  const prescriptionChunks = loadPrescriptions();

  const allChunks = [...dongeuibogamChunks, ...herbChunks, ...prescriptionChunks];

  console.log(`\n   총 청크 수: ${allChunks.length}`);
  console.log(`   - 경전: ${dongeuibogamChunks.length}`);
  console.log(`   - 약재: ${herbChunks.length}`);
  console.log(`   - 처방: ${prescriptionChunks.length}`);

  if (allChunks.length === 0) {
    console.error('\n✗ 처리할 청크가 없습니다. data/raw/ 디렉토리를 확인하세요.');
    process.exit(1);
  }

  // 2. 임베딩 생성
  console.log('\n2. 임베딩 생성...');
  const result = await embedChunks(allChunks);

  if (result.embedded.length === 0) {
    console.error('\n✗ 임베딩 생성 실패. API 키와 네트워크를 확인하세요.');
    process.exit(1);
  }

  // 3. JSONL 저장
  console.log('\n3. 결과 저장...');

  // 카테고리별 분리 저장
  const byCategory = {
    경전: result.embedded.filter((e) => e.chunk.metadata.category === '경전'),
    약재: result.embedded.filter((e) => e.chunk.metadata.category === '약재'),
    처방: result.embedded.filter((e) => e.chunk.metadata.category === '처방'),
  };

  if (byCategory['경전'].length > 0) {
    saveToJsonl(
      byCategory['경전'],
      path.join(OUTPUT_DIR, 'dongeuibogam-embedded.jsonl'),
    );
  }

  if (byCategory['약재'].length > 0) {
    saveToJsonl(
      byCategory['약재'],
      path.join(OUTPUT_DIR, 'herbs-embedded.jsonl'),
    );
  }

  if (byCategory['처방'].length > 0) {
    saveToJsonl(
      byCategory['처방'],
      path.join(OUTPUT_DIR, 'prescriptions-embedded.jsonl'),
    );
  }

  // 전체 통합 저장
  saveToJsonl(
    result.embedded,
    path.join(OUTPUT_DIR, 'all-embedded.jsonl'),
  );

  // 4. 최종 요약
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  파이프라인 완료                           ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`  총 청크: ${result.stats.totalChunks}`);
  console.log(`  성공: ${result.stats.successCount}`);
  console.log(`  실패: ${result.stats.failureCount}`);
  console.log(`  사용 토큰: ${result.stats.totalTokens}`);
  console.log(`  소요 시간: ${(result.stats.durationMs / 1000).toFixed(1)}s`);
  console.log(`  출력: ${OUTPUT_DIR}/`);

  if (result.failures.length > 0) {
    console.log('\n  [실패 청크]');
    for (const f of result.failures) {
      console.log(`  - ${f.chunkId}: ${f.error}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n✗ 파이프라인 에러:', error);
  process.exit(1);
});
