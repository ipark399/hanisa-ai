/**
 * 한의사AI 통합 파이프라인 오케스트레이터
 *
 * 수집 → 청킹 → 임베딩 → 적재 전체 파이프라인을 일괄 또는 단계별 실행합니다.
 *
 * 사용법:
 *   npx tsx scripts/pipeline.ts              # 전체 실행
 *   npx tsx scripts/pipeline.ts --step collect  # 수집만
 *   npx tsx scripts/pipeline.ts --step chunk    # 청킹만
 *   npx tsx scripts/pipeline.ts --step embed    # 임베딩만
 *   npx tsx scripts/pipeline.ts --step load     # 적재만
 *
 * 중간 결과물:
 *   data/raw/          ← Step 1 (Collect)
 *   data/chunked/      ← Step 2 (Chunk)
 *   data/embedded/     ← Step 3 (Embed)
 *   documents 테이블   ← Step 4 (Load)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

import type {
  DongeuibogamCollection,
  HerbCollection,
  PrescriptionCollection,
} from './collect/types';
import type { Chunk } from './chunking/types';
import type { ClassicTextMetadata, HerbData, PrescriptionData } from './chunking/types';
import {
  chunkClassicText,
  chunkHerb,
  chunkPrescription,
  validateChunks,
  formatValidationReport,
} from './chunking/chunker';
import { embedChunks, type EmbeddedChunk } from './embed/embed';

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

// ─── 경로 설정 ───

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.resolve(__dirname);
const RAW_DIR = path.join(PROJECT_ROOT, 'data/raw');
const CHUNKED_DIR = path.join(PROJECT_ROOT, 'data/chunked');
const EMBEDDED_DIR = path.join(PROJECT_ROOT, 'data/embedded');

// .env.local 로드
loadEnvFile(path.resolve(PROJECT_ROOT, '.env.local'));

// ─── 타입 정의 ───

type StepName = 'collect' | 'chunk' | 'embed' | 'load';

interface StepResult {
  step: StepName;
  success: boolean;
  durationMs: number;
  itemCount: number;
  error?: string;
}

// ─── 유틸리티 ───

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function logStep(step: StepName, message: string): void {
  const timestamp = new Date().toISOString().substring(11, 19);
  console.log(`  [${timestamp}] [${step}] ${message}`);
}

// ─── Step 1: Collect (수집) ───

function runCollect(): StepResult {
  const start = Date.now();
  const step: StepName = 'collect';

  try {
    logStep(step, '샘플 데이터 생성 시작...');

    const scriptPath = path.join(SCRIPTS_DIR, 'collect/generate-samples.ts');
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`스크립트 파일 없음: ${scriptPath}`);
    }

    execSync(`npx tsx "${scriptPath}"`, {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    // 결과 확인: data/raw 하위 파일 수 집계
    let itemCount = 0;
    const subdirs = ['dongeuibogam', 'herbs', 'prescriptions'];
    for (const subdir of subdirs) {
      const dirPath = path.join(RAW_DIR, subdir);
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const data = JSON.parse(
            fs.readFileSync(path.join(dirPath, file), 'utf-8'),
          );
          if (data.totalCount) itemCount += data.totalCount;
        }
      }
    }

    const durationMs = Date.now() - start;
    logStep(step, `완료 — ${itemCount}건 생성 (${formatDuration(durationMs)})`);
    return { step, success: true, durationMs, itemCount };
  } catch (error) {
    const durationMs = Date.now() - start;
    const errMsg = error instanceof Error ? error.message : String(error);
    logStep(step, `실패 — ${errMsg}`);
    return { step, success: false, durationMs, itemCount: 0, error: errMsg };
  }
}

// ─── Step 2: Chunk (청킹) ───

function runChunk(): StepResult {
  const start = Date.now();
  const step: StepName = 'chunk';

  try {
    logStep(step, '청킹 시작...');

    // raw 데이터 존재 확인
    if (!fs.existsSync(RAW_DIR)) {
      throw new Error(
        `raw 데이터 디렉토리 없음: ${RAW_DIR}\n  → 먼저 collect 단계를 실행하세요.`,
      );
    }

    const allChunks: Chunk[] = [];

    // 1. 동의보감 청킹
    const dongPath = path.join(RAW_DIR, 'dongeuibogam/dongeuibogam-samples.json');
    if (fs.existsSync(dongPath)) {
      const raw = JSON.parse(fs.readFileSync(dongPath, 'utf-8')) as DongeuibogamCollection;
      logStep(step, `동의보감: ${raw.entries.length}건 로드`);

      for (const entry of raw.entries) {
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

        allChunks.push(...chunkClassicText(text, metadata));
      }
    }

    // 2. 약재 청킹
    const herbPath = path.join(RAW_DIR, 'herbs/herbs-samples.json');
    if (fs.existsSync(herbPath)) {
      const raw = JSON.parse(fs.readFileSync(herbPath, 'utf-8')) as HerbCollection;
      logStep(step, `약재: ${raw.entries.length}건 로드`);

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
        allChunks.push(...chunkHerb(herbData, i + 1));
      }
    }

    // 3. 처방 청킹
    const rxPath = path.join(RAW_DIR, 'prescriptions/prescriptions-samples.json');
    if (fs.existsSync(rxPath)) {
      const raw = JSON.parse(fs.readFileSync(rxPath, 'utf-8')) as PrescriptionCollection;
      logStep(step, `처방: ${raw.entries.length}건 로드`);

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
        allChunks.push(...chunkPrescription(prescriptionData, i + 1));
      }
    }

    if (allChunks.length === 0) {
      throw new Error('청킹 결과가 0건입니다. data/raw/ 디렉토리를 확인하세요.');
    }

    // 검증
    const validation = validateChunks(allChunks, undefined, true);
    logStep(step, formatValidationReport(validation).replace(/\n/g, '\n           '));

    // 결과 저장: data/chunked/
    ensureDir(CHUNKED_DIR);

    // 카테고리별 분리 저장
    const byCategory: Record<string, Chunk[]> = {};
    for (const chunk of allChunks) {
      const cat = chunk.metadata.category;
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(chunk);
    }

    const categoryFileMap: Record<string, string> = {
      '경전': 'dongeuibogam-chunks.json',
      '약재': 'herbs-chunks.json',
      '처방': 'prescriptions-chunks.json',
    };

    for (const [category, chunks] of Object.entries(byCategory)) {
      const filename = categoryFileMap[category] || `${category}-chunks.json`;
      const outPath = path.join(CHUNKED_DIR, filename);
      fs.writeFileSync(outPath, JSON.stringify(chunks, null, 2), 'utf-8');
      logStep(step, `저장: ${filename} (${chunks.length}건)`);
    }

    // 전체 통합 저장
    const allOutPath = path.join(CHUNKED_DIR, 'all-chunks.json');
    fs.writeFileSync(allOutPath, JSON.stringify(allChunks, null, 2), 'utf-8');
    logStep(step, `저장: all-chunks.json (${allChunks.length}건)`);

    const durationMs = Date.now() - start;
    logStep(step, `완료 — 총 ${allChunks.length}개 청크 (${formatDuration(durationMs)})`);
    return { step, success: true, durationMs, itemCount: allChunks.length };
  } catch (error) {
    const durationMs = Date.now() - start;
    const errMsg = error instanceof Error ? error.message : String(error);
    logStep(step, `실패 — ${errMsg}`);
    return { step, success: false, durationMs, itemCount: 0, error: errMsg };
  }
}

// ─── Step 3: Embed (임베딩) ───

async function runEmbed(): Promise<StepResult> {
  const start = Date.now();
  const step: StepName = 'embed';

  try {
    logStep(step, '임베딩 생성 시작...');

    // 환경변수 확인
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error(
        '환경변수 GOOGLE_GENERATIVE_AI_API_KEY가 설정되지 않았습니다.\n  → .env.local 파일에 추가하세요.',
      );
    }

    // 청킹 결과 로드
    const allChunksPath = path.join(CHUNKED_DIR, 'all-chunks.json');
    if (!fs.existsSync(allChunksPath)) {
      throw new Error(
        `청킹 데이터 없음: ${allChunksPath}\n  → 먼저 chunk 단계를 실행하세요.`,
      );
    }

    const allChunks = JSON.parse(
      fs.readFileSync(allChunksPath, 'utf-8'),
    ) as Chunk[];

    logStep(step, `${allChunks.length}개 청크 로드 완료`);

    // 임베딩 생성
    const result = await embedChunks(allChunks);

    if (result.embedded.length === 0) {
      throw new Error('임베딩 생성 결과가 0건입니다. API 키와 네트워크를 확인하세요.');
    }

    // 결과 저장: data/embedded/
    ensureDir(EMBEDDED_DIR);

    // 카테고리별 분리 저장
    const byCategory: Record<string, EmbeddedChunk[]> = {
      '경전': result.embedded.filter((e) => e.chunk.metadata.category === '경전'),
      '약재': result.embedded.filter((e) => e.chunk.metadata.category === '약재'),
      '처방': result.embedded.filter((e) => e.chunk.metadata.category === '처방'),
    };

    const categoryFileMap: Record<string, string> = {
      '경전': 'dongeuibogam-embedded.jsonl',
      '약재': 'herbs-embedded.jsonl',
      '처방': 'prescriptions-embedded.jsonl',
    };

    for (const [category, embeds] of Object.entries(byCategory)) {
      if (embeds.length === 0) continue;
      const filename = categoryFileMap[category] || `${category}-embedded.jsonl`;
      const outPath = path.join(EMBEDDED_DIR, filename);
      const lines = embeds.map((item) =>
        JSON.stringify({
          chunk_id: item.chunk.id,
          content: item.chunk.content,
          metadata: item.chunk.metadata,
          embedding: item.embedding,
        }),
      );
      fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf-8');
      logStep(step, `저장: ${filename} (${embeds.length}건)`);
    }

    // 전체 통합 저장
    const allOutPath = path.join(EMBEDDED_DIR, 'all-embedded.jsonl');
    const allLines = result.embedded.map((item) =>
      JSON.stringify({
        chunk_id: item.chunk.id,
        content: item.chunk.content,
        metadata: item.chunk.metadata,
        embedding: item.embedding,
      }),
    );
    fs.writeFileSync(allOutPath, allLines.join('\n') + '\n', 'utf-8');
    logStep(step, `저장: all-embedded.jsonl (${result.embedded.length}건)`);

    const durationMs = Date.now() - start;
    logStep(
      step,
      `완료 — 성공 ${result.stats.successCount}/${result.stats.totalChunks}, ` +
        `실패 ${result.stats.failureCount}, 토큰 ${result.stats.totalTokens} ` +
        `(${formatDuration(durationMs)})`,
    );

    if (result.stats.failureCount > 0) {
      logStep(step, `[경고] ${result.stats.failureCount}건 임베딩 실패:`);
      for (const f of result.failures) {
        logStep(step, `  - ${f.chunkId}: ${f.error}`);
      }
    }

    return { step, success: true, durationMs, itemCount: result.stats.successCount };
  } catch (error) {
    const durationMs = Date.now() - start;
    const errMsg = error instanceof Error ? error.message : String(error);
    logStep(step, `실패 — ${errMsg}`);
    return { step, success: false, durationMs, itemCount: 0, error: errMsg };
  }
}

// ─── Step 4: Load (적재) ───

function runLoad(): StepResult {
  const start = Date.now();
  const step: StepName = 'load';

  try {
    logStep(step, 'Supabase 벡터 적재 시작...');

    // 환경변수 확인
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        '환경변수가 설정되지 않았습니다.\n' +
          '  → NEXT_PUBLIC_SUPABASE_URL\n' +
          '  → SUPABASE_SERVICE_ROLE_KEY\n' +
          '  → .env.local 파일에 추가하세요.',
      );
    }

    // 임베딩 데이터 존재 확인
    if (!fs.existsSync(EMBEDDED_DIR)) {
      throw new Error(
        `임베딩 데이터 디렉토리 없음: ${EMBEDDED_DIR}\n  → 먼저 embed 단계를 실행하세요.`,
      );
    }

    const jsonlFiles = fs
      .readdirSync(EMBEDDED_DIR)
      .filter((f) => f.endsWith('.jsonl'));

    if (jsonlFiles.length === 0) {
      throw new Error(
        `${EMBEDDED_DIR}에 .jsonl 파일이 없습니다.\n  → 먼저 embed 단계를 실행하세요.`,
      );
    }

    const scriptPath = path.join(SCRIPTS_DIR, 'load/load-vectors.ts');
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`스크립트 파일 없음: ${scriptPath}`);
    }

    const output = execSync(`npx tsx "${scriptPath}"`, {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 120000, // 2분 타임아웃
    });

    // 출력에서 적재 건수 파싱
    let itemCount = 0;
    const successMatch = output.match(/성공:\s*(\d+)/);
    if (successMatch) {
      itemCount = parseInt(successMatch[1], 10);
    }

    const durationMs = Date.now() - start;
    logStep(step, `완료 — ${itemCount}건 적재 (${formatDuration(durationMs)})`);
    return { step, success: true, durationMs, itemCount };
  } catch (error) {
    const durationMs = Date.now() - start;
    const errMsg = error instanceof Error ? error.message : String(error);
    logStep(step, `실패 — ${errMsg}`);
    return { step, success: false, durationMs, itemCount: 0, error: errMsg };
  }
}

// ─── CLI 인자 파싱 ───

function parseArgs(): { step?: StepName } {
  const args = process.argv.slice(2);
  const stepIdx = args.indexOf('--step');

  if (stepIdx === -1) {
    return {}; // 전체 실행
  }

  const stepArg = args[stepIdx + 1];
  if (!stepArg) {
    console.error('[에러] --step 옵션에 값이 필요합니다: collect | chunk | embed | load');
    process.exit(1);
  }

  const validSteps: StepName[] = ['collect', 'chunk', 'embed', 'load'];
  if (!validSteps.includes(stepArg as StepName)) {
    console.error(`[에러] 유효하지 않은 단계: "${stepArg}"`);
    console.error(`  유효한 값: ${validSteps.join(', ')}`);
    process.exit(1);
  }

  return { step: stepArg as StepName };
}

// ─── 메인 실행 ───

async function main(): Promise<void> {
  const { step } = parseArgs();

  const stepLabels: Record<StepName, string> = {
    collect: '수집 (Collect)',
    chunk: '청킹 (Chunk)',
    embed: '임베딩 (Embed)',
    load: '적재 (Load)',
  };

  const stepOrder: StepName[] = ['collect', 'chunk', 'embed', 'load'];
  const stepsToRun = step ? [step] : stepOrder;

  // 헤더 출력
  console.log('');
  console.log('================================================================');
  console.log('  한의사AI 통합 파이프라인');
  console.log(`  모드: ${step ? `단계별 — ${stepLabels[step]}` : '전체 실행 (4단계)'}`);
  console.log(`  시작: ${new Date().toLocaleString('ko-KR')}`);
  console.log('================================================================');
  console.log('');

  const results: StepResult[] = [];
  const pipelineStart = Date.now();

  for (let i = 0; i < stepsToRun.length; i++) {
    const currentStep = stepsToRun[i];
    const stepNum = step ? 1 : stepOrder.indexOf(currentStep) + 1;
    const totalSteps = step ? 1 : stepOrder.length;

    console.log(`── Step ${stepNum}/${totalSteps}: ${stepLabels[currentStep]} ──`);

    let result: StepResult;

    switch (currentStep) {
      case 'collect':
        result = runCollect();
        break;
      case 'chunk':
        result = runChunk();
        break;
      case 'embed':
        result = await runEmbed();
        break;
      case 'load':
        result = runLoad();
        break;
    }

    results.push(result);
    console.log('');

    // 실패 시 파이프라인 중단 (전체 실행 모드)
    if (!result.success && !step) {
      console.log(`[중단] "${stepLabels[currentStep]}" 단계에서 실패하여 파이프라인을 중단합니다.`);
      console.log(`  에러: ${result.error}`);
      console.log(`  이 단계부터 재실행: npx tsx scripts/pipeline.ts --step ${currentStep}`);
      console.log('');
      break;
    }
  }

  // 요약 출력
  const pipelineDuration = Date.now() - pipelineStart;

  console.log('================================================================');
  console.log('  파이프라인 실행 결과');
  console.log('================================================================');

  for (const r of results) {
    const status = r.success ? '[성공]' : '[실패]';
    console.log(
      `  ${status} ${stepLabels[r.step].padEnd(16)} ` +
        `${String(r.itemCount).padStart(5)}건  ${formatDuration(r.durationMs).padStart(8)}`,
    );
    if (!r.success && r.error) {
      console.log(`         에러: ${r.error.split('\n')[0]}`);
    }
  }

  console.log('');
  console.log(`  총 소요 시간: ${formatDuration(pipelineDuration)}`);
  console.log(`  종료: ${new Date().toLocaleString('ko-KR')}`);
  console.log('================================================================');

  // 실패한 단계가 있으면 exit 1
  const hasFailure = results.some((r) => !r.success);
  if (hasFailure) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n[에러] 파이프라인 실행 에러:', error);
  process.exit(1);
});
