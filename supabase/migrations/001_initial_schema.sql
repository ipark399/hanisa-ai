-- ============================================================
-- 한의사 AI - 초기 DB 스키마 마이그레이션
-- Supabase Dashboard > SQL Editor에서 실행
-- ============================================================

-- 1. pgvector 확장 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. documents 테이블: 한의학 문헌 청크 + 임베딩 저장
CREATE TABLE IF NOT EXISTS documents (
  id          uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  content     text            NOT NULL,
  metadata    jsonb,           -- 출처, 카테고리, 원문 위치 등
  embedding   vector(768),     -- text-embedding-004 차원
  created_at  timestamptz     NOT NULL DEFAULT now()
);

-- documents 테이블 코멘트
COMMENT ON TABLE documents IS '한의학 문헌 청크 및 임베딩 저장 테이블';
COMMENT ON COLUMN documents.content IS '문헌 텍스트 청크';
COMMENT ON COLUMN documents.metadata IS '출처, 카테고리, 원문 위치 등 메타데이터 (jsonb)';
COMMENT ON COLUMN documents.embedding IS 'text-embedding-004 임베딩 벡터 (768차원)';

-- 3. corrections 테이블: 전문가 교정 내역
CREATE TABLE IF NOT EXISTS corrections (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  original_chunk_id   uuid    REFERENCES documents(id) ON DELETE CASCADE,
  original_content    text,    -- 수정 전 원문
  correction_text     text    NOT NULL,  -- 수정 내용
  reason              text,    -- 수정 사유
  status              text    NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- corrections 테이블 코멘트
COMMENT ON TABLE corrections IS '전문가 교정 내역 테이블';
COMMENT ON COLUMN corrections.original_chunk_id IS '교정 대상 문헌 청크 ID (documents.id FK)';
COMMENT ON COLUMN corrections.status IS '교정 상태: pending / approved / rejected';

-- 4. embedding 컬럼 IVFFlat 인덱스 (cosine distance)
-- 참고: IVFFlat은 데이터가 어느 정도 존재한 후 효과적. 초기에는 exact search 사용 가능.
CREATE INDEX IF NOT EXISTS idx_documents_embedding
  ON documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 5. match_documents RPC 함수: cosine similarity 기반 유사 문서 검색
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding   vector(768),
  match_threshold   float DEFAULT 0.5,
  match_count       int   DEFAULT 10
)
RETURNS TABLE (
  id          uuid,
  content     text,
  metadata    jsonb,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documents d
  WHERE 1 - (d.embedding <=> query_embedding) >= match_threshold
  ORDER BY d.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_documents IS 'cosine similarity 기반 유사 문서 검색 RPC';
