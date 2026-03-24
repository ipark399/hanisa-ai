/**
 * 벡터 적재 파이프라인 타입 정의
 */

// ─── JSONL 레코드 타입 (data/embedded/*.jsonl 파싱용) ───

/** JSONL 파일의 한 줄을 파싱한 레코드 */
export interface EmbeddedChunkRecord {
  /** 청크 고유 ID */
  chunk_id: string;
  /** 청크 텍스트 내용 */
  content: string;
  /** 메타데이터 (카테고리, 출처 등) */
  metadata: Record<string, unknown>;
  /** 임베딩 벡터 (768차원) */
  embedding: number[];
}

// ─── Supabase insert 타입 ───

/** Supabase documents 테이블 insert 형식 */
export interface DocumentInsert {
  /** UUID — chunk_id를 사용하거나 자동 생성 */
  id?: string;
  /** 문헌 텍스트 청크 */
  content: string;
  /** 메타데이터 (jsonb) */
  metadata: Record<string, unknown>;
  /** 임베딩 벡터 (number[] → Supabase가 vector로 변환) */
  embedding: number[];
}

// ─── 적재 결과 타입 ───

export interface LoadStats {
  /** 원본 JSONL 총 레코드 수 */
  totalRecords: number;
  /** 적재 성공 수 */
  successCount: number;
  /** 적재 실패 수 */
  failureCount: number;
  /** 소요 시간 (ms) */
  durationMs: number;
  /** 처리한 파일 목록 */
  files: string[];
}

// ─── 검증 결과 타입 ───

export interface VerifyResult {
  /** documents 테이블 총 행 수 */
  totalRows: number;
  /** 샘플 검증 결과 */
  sampleCheck: {
    checked: number;
    passed: number;
    details: SampleDetail[];
  };
  /** match_documents RPC 테스트 결과 */
  rpcTest: {
    passed: boolean;
    resultCount: number;
    detail: string;
  };
}

export interface SampleDetail {
  id: string;
  hasContent: boolean;
  hasMetadata: boolean;
  hasEmbedding: boolean;
  contentPreview: string;
}
