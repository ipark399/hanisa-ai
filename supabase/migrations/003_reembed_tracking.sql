-- ============================================================
-- 한의사 AI - 재임베딩 추적용 컬럼 추가
-- corrections 테이블에 reembedded_at 컬럼 추가
-- ============================================================

ALTER TABLE corrections ADD COLUMN IF NOT EXISTS reembedded_at timestamptz;

COMMENT ON COLUMN corrections.reembedded_at IS '승인된 교정이 documents 임베딩에 반영된 시각. NULL이면 미반영';
