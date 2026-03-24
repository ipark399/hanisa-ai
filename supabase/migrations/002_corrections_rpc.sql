-- ============================================================
-- 한의사 AI - corrections 반영 RAG 검색 RPC
-- approved corrections가 있는 청크는 수정본을 반환
-- ============================================================

CREATE OR REPLACE FUNCTION match_documents_with_corrections(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float,
  is_corrected boolean
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    COALESCE(c.correction_text, d.content) as content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) as similarity,
    (c.id IS NOT NULL) as is_corrected
  FROM documents d
  LEFT JOIN LATERAL (
    SELECT c2.id, c2.correction_text
    FROM corrections c2
    WHERE c2.original_chunk_id = d.id
      AND c2.status = 'approved'
    ORDER BY c2.created_at DESC
    LIMIT 1
  ) c ON true
  WHERE 1 - (d.embedding <=> query_embedding) >= match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_documents_with_corrections IS 'approved corrections를 반영한 cosine similarity 기반 유사 문서 검색 RPC';
