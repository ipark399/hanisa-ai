/**
 * 한의학 데이터 청킹 타입 정의
 *
 * 3종 데이터(경전/약재/처방)에 대한 공통 Chunk 인터페이스와
 * 각 데이터 소스별 입력 타입을 정의합니다.
 */

// ─── 공통 Chunk 타입 ───

export interface ChunkMetadata {
  /** 출처 (동의보감, OASIS 등) */
  source: string;
  /** 카테고리 (경전, 약재, 처방) */
  category: '경전' | '약재' | '처방';
  /** 제목 (편명, 약재명, 처방명) */
  title: string;
  /** 세부 위치 (권, 장, 절) — 경전 텍스트용 */
  section?: string;
  /** 원본 데이터 ID */
  original_id?: string;
}

export interface Chunk {
  /** 고유 ID (출처-카테고리-순번) */
  id: string;
  /** 청킹된 텍스트 (임베딩 대상) */
  content: string;
  /** 메타데이터 */
  metadata: ChunkMetadata;
  /** 토큰 수 (검증용) */
  token_count: number;
}

// ─── 경전 텍스트 입력 타입 ───

export interface ClassicTextMetadata {
  /** 서적명 (예: 동의보감) */
  book: string;
  /** 편명 (예: 내경편) */
  volume?: string;
  /** 권 (예: 권1) */
  chapter?: string;
  /** 장 (예: 身形) */
  section?: string;
  /** 절 */
  subsection?: string;
}

// ─── 약재 데이터 입력 타입 ───

export interface HerbData {
  /** 약재명 (한글) */
  name: string;
  /** 약재명 (한자) */
  name_hanja?: string;
  /** 학명 */
  latin_name?: string;
  /** 성미(性味) */
  properties?: string;
  /** 귀경(歸經) */
  meridians?: string;
  /** 효능분류 */
  efficacy_category?: string;
  /** 효능 */
  efficacy?: string;
  /** 주치 */
  indications?: string;
  /** 용량 */
  dosage?: string;
  /** 주의사항/금기 */
  cautions?: string;
  /** 출처 */
  source?: string;
  /** 원본 ID (예: OASIS idx) */
  original_id?: string;
}

// ─── 처방 데이터 입력 타입 ───

export interface PrescriptionIngredient {
  /** 약재명 */
  herb: string;
  /** 용량 */
  dose?: string;
}

export interface PrescriptionData {
  /** 처방명 (한글) */
  name: string;
  /** 처방명 (한자) */
  name_hanja?: string;
  /** 영문명 */
  name_english?: string;
  /** 구성 약재 + 용량 */
  ingredients: PrescriptionIngredient[];
  /** 효능 */
  efficacy?: string;
  /** 적응증/주치 */
  indications?: string;
  /** 출처/출전 */
  source?: string;
  /** 시대별 기록 */
  historical_notes?: string;
  /** 주의사항 */
  cautions?: string;
  /** 원본 ID */
  original_id?: string;
}

// ─── 청킹 설정 타입 ───

export interface ChunkingConfig {
  /** 토큰 상한 (기본: 512) */
  maxTokens: number;
  /** 토큰 하한 (기본: 256) — 경전 텍스트 병합 기준 */
  minTokens: number;
  /** 청크 간 오버랩 문장 수 (기본: 1) */
  overlapSentences: number;
}

export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  maxTokens: 512,
  minTokens: 256,
  overlapSentences: 1,
};

// ─── 검증 결과 타입 ───

export interface ValidationResult {
  totalChunks: number;
  validChunks: number;
  oversizedChunks: { id: string; token_count: number }[];
  undersizedChunks: { id: string; token_count: number }[];
  averageTokenCount: number;
}
