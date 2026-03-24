/**
 * Google gemini-embedding-001 임베딩 클라이언트
 *
 * ai SDK의 embedMany를 래핑하여 배치 처리, rate limit 핸들링,
 * exponential backoff 재시도 로직을 제공합니다.
 */

import { embedMany } from 'ai';
import { google } from '@ai-sdk/google';

// ─── 설정 ───

export interface EmbeddingClientConfig {
  /** 배치당 청크 수 (기본: 20) */
  batchSize: number;
  /** 최대 재시도 횟수 (기본: 5) */
  maxRetries: number;
  /** 초기 재시도 대기 시간 ms (기본: 1000) */
  initialRetryDelay: number;
  /** 최대 재시도 대기 시간 ms (기본: 60000) */
  maxRetryDelay: number;
  /** 배치 간 대기 시간 ms (기본: 200) — rate limit 방지 */
  batchDelay: number;
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingClientConfig = {
  batchSize: 20,
  maxRetries: 5,
  initialRetryDelay: 1000,
  maxRetryDelay: 60000,
  batchDelay: 200,
};

// ─── 결과 타입 ───

export interface EmbeddingResult {
  /** 입력 텍스트 인덱스 */
  index: number;
  /** 임베딩 벡터 (768차원) */
  embedding: number[];
}

export interface BatchEmbeddingResult {
  /** 성공한 임베딩 결과 */
  results: EmbeddingResult[];
  /** 실패한 인덱스 + 에러 */
  failures: { index: number; error: string }[];
  /** 총 사용 토큰 */
  totalTokens: number;
}

// ─── 유틸리티 ───

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 에러가 rate limit (429) 에러인지 판별합니다.
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('resource exhausted') ||
      msg.includes('quota exceeded') ||
      msg.includes('too many requests')
    );
  }
  return false;
}

/**
 * 에러가 재시도 가능한 에러인지 판별합니다.
 */
function isRetryableError(error: unknown): boolean {
  if (isRateLimitError(error)) return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('500') ||
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('network')
    );
  }
  return false;
}

// ─── 임베딩 클라이언트 ───

/**
 * 단일 배치의 텍스트를 임베딩합니다.
 * Exponential backoff로 재시도합니다.
 */
export async function embedBatch(
  texts: string[],
  config: EmbeddingClientConfig = DEFAULT_EMBEDDING_CONFIG,
): Promise<{ embeddings: number[][]; tokens: number }> {
  let retryDelay = config.initialRetryDelay;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const model = google.embeddingModel('gemini-embedding-001');

      const result = await embedMany({
        model,
        values: texts,
        maxRetries: 0, // 자체 재시도 로직 사용
      });

      return {
        embeddings: result.embeddings as number[][],
        tokens: result.usage?.tokens ?? 0,
      };
    } catch (error) {
      const isLastAttempt = attempt === config.maxRetries;

      if (!isRetryableError(error) || isLastAttempt) {
        throw error;
      }

      // Rate limit 에러 시 더 긴 대기
      const actualDelay = isRateLimitError(error)
        ? retryDelay * 2
        : retryDelay;

      const cappedDelay = Math.min(actualDelay, config.maxRetryDelay);
      // jitter 추가 (0.5~1.5x)
      const jitteredDelay = cappedDelay * (0.5 + Math.random());

      console.warn(
        `  ⚠ 임베딩 API 에러 (시도 ${attempt + 1}/${config.maxRetries + 1}): ${error instanceof Error ? error.message : String(error)}`,
      );
      console.warn(
        `    → ${Math.round(jitteredDelay)}ms 후 재시도...`,
      );

      await sleep(jitteredDelay);
      retryDelay *= 2; // exponential backoff
    }
  }

  // 도달하지 않는 코드 (TypeScript 안전장치)
  throw new Error('embedBatch: 최대 재시도 횟수 초과');
}

/**
 * 대량의 텍스트를 배치로 나누어 임베딩합니다.
 * 진행률 콜백과 실패 청크 추적을 지원합니다.
 */
export async function embedAll(
  texts: string[],
  config: EmbeddingClientConfig = DEFAULT_EMBEDDING_CONFIG,
  onProgress?: (completed: number, total: number) => void,
): Promise<BatchEmbeddingResult> {
  const results: EmbeddingResult[] = [];
  const failures: { index: number; error: string }[] = [];
  let totalTokens = 0;

  // 배치 분할
  const batches: { texts: string[]; indices: number[] }[] = [];
  for (let i = 0; i < texts.length; i += config.batchSize) {
    const batchTexts = texts.slice(i, i + config.batchSize);
    const batchIndices = Array.from(
      { length: batchTexts.length },
      (_, j) => i + j,
    );
    batches.push({ texts: batchTexts, indices: batchIndices });
  }

  let completed = 0;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];

    try {
      const { embeddings, tokens } = await embedBatch(batch.texts, config);
      totalTokens += tokens;

      for (let j = 0; j < embeddings.length; j++) {
        results.push({
          index: batch.indices[j],
          embedding: embeddings[j],
        });
      }

      completed += batch.texts.length;
      onProgress?.(completed, texts.length);
    } catch (_error) {
      // 배치 전체 실패 시 개별 텍스트 단위로 재시도
      console.warn(
        `  ⚠ 배치 ${batchIdx + 1} 전체 실패, 개별 재시도 시작...`,
      );

      for (let j = 0; j < batch.texts.length; j++) {
        try {
          const { embeddings, tokens } = await embedBatch(
            [batch.texts[j]],
            config,
          );
          totalTokens += tokens;
          results.push({
            index: batch.indices[j],
            embedding: embeddings[0],
          });
        } catch (individualError) {
          const errMsg =
            individualError instanceof Error
              ? individualError.message
              : String(individualError);
          failures.push({
            index: batch.indices[j],
            error: errMsg,
          });
          console.error(
            `  ✗ 텍스트 #${batch.indices[j]} 임베딩 실패: ${errMsg}`,
          );
        }

        completed += 1;
        onProgress?.(completed, texts.length);
      }
    }

    // 배치 간 대기 (마지막 배치 제외)
    if (batchIdx < batches.length - 1 && config.batchDelay > 0) {
      await sleep(config.batchDelay);
    }
  }

  // 인덱스 순서로 정렬
  results.sort((a, b) => a.index - b.index);

  return { results, failures, totalTokens };
}
