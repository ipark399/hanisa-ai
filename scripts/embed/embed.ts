/**
 * 임베딩 생성 파이프라인
 *
 * 청크 배열을 입력 받아 Google text-embedding-004로 임베딩을 생성합니다.
 * 배치 처리, rate limit 핸들링, 진행률 출력을 포함합니다.
 */

import type { Chunk } from '../chunking/types';
import {
  embedAll,
  type EmbeddingClientConfig,
  DEFAULT_EMBEDDING_CONFIG,
} from './embedding-client';

// ─── 결과 타입 ───

export interface EmbeddedChunk {
  /** 원본 청크 */
  chunk: Chunk;
  /** 임베딩 벡터 (768차원) */
  embedding: number[];
}

export interface EmbedPipelineResult {
  /** 성공한 임베딩 */
  embedded: EmbeddedChunk[];
  /** 실패한 청크 ID + 에러 */
  failures: { chunkId: string; error: string }[];
  /** 통계 */
  stats: {
    totalChunks: number;
    successCount: number;
    failureCount: number;
    totalTokens: number;
    durationMs: number;
  };
}

// ─── 환경변수 검증 ───

function validateEnv(): void {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error(
      '\n✗ 환경변수 GOOGLE_GENERATIVE_AI_API_KEY가 설정되지 않았습니다.',
    );
    console.error('  .env.local 파일에 다음을 추가하세요:');
    console.error('  GOOGLE_GENERATIVE_AI_API_KEY=your-api-key-here\n');
    process.exit(1);
  }
}

// ─── 메인 파이프라인 ───

/**
 * 청크 배열을 임베딩합니다.
 *
 * @param chunks - 임베딩할 청크 배열
 * @param config - 임베딩 클라이언트 설정 (선택)
 * @returns 임베딩 결과 (성공/실패 분리)
 */
export async function embedChunks(
  chunks: Chunk[],
  config: EmbeddingClientConfig = DEFAULT_EMBEDDING_CONFIG,
): Promise<EmbedPipelineResult> {
  validateEnv();

  if (chunks.length === 0) {
    return {
      embedded: [],
      failures: [],
      stats: {
        totalChunks: 0,
        successCount: 0,
        failureCount: 0,
        totalTokens: 0,
        durationMs: 0,
      },
    };
  }

  console.log(`\n=== 임베딩 생성 시작 ===`);
  console.log(`모델: Google text-embedding-004 (768차원)`);
  console.log(`청크 수: ${chunks.length}`);
  console.log(`배치 크기: ${config.batchSize}`);
  console.log(
    `배치 수: ${Math.ceil(chunks.length / config.batchSize)}`,
  );
  console.log('');

  const startTime = Date.now();

  // 청크 content 추출
  const texts = chunks.map((c) => c.content);

  // 임베딩 실행
  const result = await embedAll(texts, config, (completed, total) => {
    const pct = Math.round((completed / total) * 100);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(
      `\r  ${completed}/${total} 처리중... (${pct}%) [${elapsed}s]`,
    );
  });

  const durationMs = Date.now() - startTime;
  console.log(''); // 진행률 줄바꿈

  // 결과 매핑
  const embedded: EmbeddedChunk[] = result.results.map((r) => ({
    chunk: chunks[r.index],
    embedding: r.embedding,
  }));

  const failures = result.failures.map((f) => ({
    chunkId: chunks[f.index].id,
    error: f.error,
  }));

  const stats = {
    totalChunks: chunks.length,
    successCount: embedded.length,
    failureCount: failures.length,
    totalTokens: result.totalTokens,
    durationMs,
  };

  // 결과 요약 출력
  console.log(`\n=== 임베딩 생성 완료 ===`);
  console.log(`성공: ${stats.successCount}/${stats.totalChunks}`);
  if (stats.failureCount > 0) {
    console.log(`실패: ${stats.failureCount}`);
    for (const f of failures) {
      console.log(`  - ${f.chunkId}: ${f.error}`);
    }
  }
  console.log(`사용 토큰: ${stats.totalTokens}`);
  console.log(`소요 시간: ${(stats.durationMs / 1000).toFixed(1)}s`);
  console.log(`처리 속도: ${((stats.successCount / stats.durationMs) * 1000).toFixed(1)} 청크/초`);

  return { embedded, failures, stats };
}
