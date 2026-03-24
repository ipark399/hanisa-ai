/**
 * RAG 검색 모듈
 *
 * 사용자 질문을 임베딩하여 pgvector에서 유사 문서를 검색합니다.
 * Edge Runtime 호환 — Node.js 전용 API 미사용.
 */

import { embed } from 'ai'
import { google } from '@ai-sdk/google'
import { createServerClient, type MatchDocumentWithCorrectionsResult } from '@/lib/supabase'

// ─── 임베딩 ───

/**
 * 쿼리 텍스트를 임베딩 벡터로 변환합니다.
 * Google gemini-embedding-001 모델 사용 (768차원).
 */
export async function embedQuery(query: string): Promise<number[]> {
  const { embedding } = await embed({
    model: google.embeddingModel('gemini-embedding-001'),
    value: query,
  })

  return embedding as number[]
}

// ─── 문서 검색 ───

/**
 * Supabase match_documents_with_corrections RPC로 유사 문서를 검색합니다.
 * approved corrections가 있는 청크는 원본 대신 수정본을 반환합니다.
 *
 * @param queryEmbedding - 쿼리 임베딩 벡터 (768차원)
 * @param matchThreshold - 유사도 임계값 (기본: 0.3)
 * @param matchCount - 반환할 최대 문서 수 (기본: 5)
 */
export async function searchDocuments(
  queryEmbedding: number[],
  matchThreshold: number = 0.3,
  matchCount: number = 5,
): Promise<MatchDocumentWithCorrectionsResult[]> {
  const supabase = createServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DB 스키마 타입 미생성 상태에서 RPC 호출
  const { data, error } = await (supabase.rpc as any)('match_documents_with_corrections', {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
  })

  if (error) {
    throw new Error(`match_documents_with_corrections RPC 실패: ${error.message}`)
  }

  return (data ?? []) as MatchDocumentWithCorrectionsResult[]
}

// ─── 통합 검색 ───

/**
 * 사용자 질문으로부터 관련 문서 청크를 검색합니다.
 *
 * embedQuery -> searchDocuments 파이프라인을 통합하며,
 * 에러 발생 시 빈 배열을 반환합니다 (graceful degradation).
 *
 * @param query - 사용자 질문 텍스트
 * @param matchCount - 반환할 최대 문서 수 (기본: 5)
 */
export async function retrieveContext(
  query: string,
  matchCount: number = 5,
): Promise<
  { content: string; metadata: Record<string, unknown> | null; similarity: number }[]
> {
  try {
    const t0 = Date.now()
    const queryEmbedding = await embedQuery(query)
    const tEmbed = Date.now()

    const documents = await searchDocuments(queryEmbedding, 0.3, matchCount)
    const tSearch = Date.now()

    const correctedCount = documents.filter((d) => d.is_corrected).length
    console.log(
      `[perf:rag] embed=${tEmbed - t0}ms | pgvector=${tSearch - tEmbed}ms | total=${tSearch - t0}ms | results=${documents.length} | corrected=${correctedCount}`,
    )

    return documents.map((doc) => ({
      content: doc.content,
      metadata: doc.is_corrected
        ? { ...doc.metadata, corrected: true }
        : doc.metadata,
      similarity: doc.similarity,
    }))
  } catch (error) {
    console.error(
      '[RAG] retrieveContext 실패:',
      error instanceof Error ? error.message : String(error),
    )
    return []
  }
}
