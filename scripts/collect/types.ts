/**
 * 한의사AI 데이터 수집 타입 정의
 * 각 데이터 소스의 TypeScript 인터페이스
 */

// ─── 동의보감 경전 텍스트 ───

export interface DongeuibogamEntry {
  /** 고유 ID */
  id: string;
  /** 편명 (내경편, 외형편, 잡병편, 탕액편, 침구편) */
  section: '내경편' | '외형편' | '잡병편' | '탕액편' | '침구편';
  /** 권 번호 */
  volume: number;
  /** 장 제목 */
  chapter: string;
  /** 절 제목 */
  subchapter: string;
  /** 원문 (한문) */
  originalText: string;
  /** 번역 (한국어) */
  translatedText: string;
  /** 카테고리 (양생, 진단, 치료, 본초 등) */
  category: string;
  /** 출처 메타데이터 */
  source: SourceMeta;
}

export interface DongeuibogamCollection {
  dataType: 'dongeuibogam';
  version: string;
  generatedAt: string;
  totalCount: number;
  entries: DongeuibogamEntry[];
}

// ─── 약재 데이터 ───

export interface HerbEntry {
  /** 고유 ID */
  id: string;
  /** 약재명 (한글) */
  nameKo: string;
  /** 약재명 (한자) */
  nameHanja: string;
  /** 약재명 (영문, 학명) */
  nameLatin?: string;
  /** 성미 (性味) - 성질과 맛 */
  properties: {
    /** 성질 (寒, 涼, 平, 溫, 熱) */
    nature: string;
    /** 맛 (酸, 苦, 甘, 辛, 鹹, 淡, 澁) - 복수 가능 */
    taste: string[];
  };
  /** 귀경 (歸經) - 어떤 장부에 작용하는지 */
  meridians: string[];
  /** 효능 (功效) */
  effects: string[];
  /** 주치 (主治) - 주요 치료 대상 */
  indications: string[];
  /** 주의사항 (注意事項) */
  cautions: string[];
  /** 효능분류 (解表藥, 清熱藥, 補氣藥 등) */
  category: string;
  /** 용량 (일반적 사용량) */
  dosage?: string;
  /** 출처 메타데이터 */
  source: SourceMeta;
}

export interface HerbCollection {
  dataType: 'herbs';
  version: string;
  generatedAt: string;
  totalCount: number;
  entries: HerbEntry[];
}

// ─── 처방 데이터 ───

export interface PrescriptionIngredient {
  /** 약재명 (한글) */
  herbNameKo: string;
  /** 약재명 (한자) */
  herbNameHanja: string;
  /** 용량 */
  amount: string;
  /** 역할 (君, 臣, 佐, 使) */
  role?: '君' | '臣' | '佐' | '使';
}

export interface PrescriptionEntry {
  /** 고유 ID */
  id: string;
  /** 처방명 (한글) */
  nameKo: string;
  /** 처방명 (한자) */
  nameHanja: string;
  /** 구성 약재 및 용량 */
  ingredients: PrescriptionIngredient[];
  /** 효능 (功效) */
  effects: string[];
  /** 적응증 (適應症) */
  indications: string[];
  /** 용법 (用法) */
  usage?: string;
  /** 출처 (동의보감, 상한론, 금궤요략 등) */
  classicSource: string;
  /** 출처 메타데이터 */
  source: SourceMeta;
}

export interface PrescriptionCollection {
  dataType: 'prescriptions';
  version: string;
  generatedAt: string;
  totalCount: number;
  entries: PrescriptionEntry[];
}

// ─── 공통 ───

export interface SourceMeta {
  /** 데이터 출처 (mediclassics, oasis, manual 등) */
  origin: string;
  /** 수집/생성 방법 */
  method: 'sample-generation' | 'crawling' | 'api' | 'manual';
  /** 수집/생성 일시 */
  collectedAt: string;
  /** 참고 URL (실제 수집 시) */
  url?: string;
  /** 비고 */
  note?: string;
}
