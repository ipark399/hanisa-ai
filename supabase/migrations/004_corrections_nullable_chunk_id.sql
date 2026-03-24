-- ============================================================
-- 한의사 AI - corrections.original_chunk_id nullable 변경
-- CorrectionModal에서 chunk_id 없이 수정 요청 가능하도록
-- 001 스키마의 NOT NULL 제약을 제거
-- ============================================================

ALTER TABLE corrections ALTER COLUMN original_chunk_id DROP NOT NULL;

COMMENT ON COLUMN corrections.original_chunk_id IS '교정 대상 문헌 청크 ID (documents.id FK). NULL 허용 — UI에서 chunk_id 없이 수정 요청 가능';
