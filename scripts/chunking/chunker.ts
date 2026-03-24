/**
 * 한의학 데이터 청킹 모듈
 *
 * 3종 데이터에 대한 청킹 전략:
 * - 경전 텍스트: Recursive + Semantic (256~512 토큰)
 * - 약재 데이터: Fixed-size (1 약재 = 1 청크, 초과 시 분할)
 * - 처방 데이터: Fixed-size (1 처방 = 1 청크, 초과 시 분할)
 */

import {
  Chunk,
  ChunkMetadata,
  ChunkingConfig,
  ClassicTextMetadata,
  DEFAULT_CHUNKING_CONFIG,
  HerbData,
  PrescriptionData,
  ValidationResult,
} from './types';

// ─── 토큰 카운트 유틸리티 ───

/**
 * 한국어/한자 혼용 텍스트의 토큰 수를 근사 계산합니다.
 *
 * 근사 규칙:
 * - CJK 문자 (한글, 한자): 1글자 ≈ 1.5 토큰 (평균)
 * - ASCII 문자 (영문, 숫자): 4글자 ≈ 1 토큰 (BPE 기준)
 * - 공백/특수문자: 대략 1:1
 *
 * 실제 임베딩 모델(text-embedding-004)의 토크나이저와 차이가 있을 수 있으나,
 * 청크 크기 제어 목적으로는 충분한 정밀도입니다.
 */
export function estimateTokenCount(text: string): number {
  let tokenCount = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // 서로게이트 페어(surrogate pair) 건너뛰기
    if (code >= 0xd800 && code <= 0xdbff) {
      // 고위 서로게이트: 보충 문자의 첫 절반 → 다음 문자와 합쳐서 처리
      const low = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (low >= 0xdc00 && low <= 0xdfff) {
        // CJK 보충 한자 영역 (SIP)
        tokenCount += 1.5;
        i++; // 저위 서로게이트 건너뛰기
        continue;
      }
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue; // 이미 처리된 저위 서로게이트

    // CJK Unified Ideographs (한자)
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df) ||
      (code >= 0xf900 && code <= 0xfaff)
    ) {
      tokenCount += 1.5;
    }
    // Hangul Syllables (한글)
    else if (code >= 0xac00 && code <= 0xd7af) {
      tokenCount += 1.5;
    }
    // Hangul Jamo / Compatibility Jamo
    else if (
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x3130 && code <= 0x318f)
    ) {
      tokenCount += 1;
    }
    // ASCII (영문, 숫자)
    else if (code >= 0x20 && code <= 0x7e) {
      tokenCount += 0.25;
    }
    // 기타 (공백, 특수문자, 구두점 등)
    else {
      tokenCount += 0.5;
    }
  }

  return Math.ceil(tokenCount);
}

// ─── ID 생성 유틸리티 ───

function generateChunkId(
  source: string,
  category: string,
  index: number,
  subIndex?: number,
): string {
  const sanitized = source
    .replace(/[^a-zA-Z0-9가-힣]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 20);
  const base = `${sanitized}-${category}-${String(index).padStart(4, '0')}`;
  if (subIndex !== undefined) {
    return `${base}-${String(subIndex).padStart(2, '0')}`;
  }
  return base;
}

// ─── 텍스트 분할 유틸리티 ───

/**
 * 텍스트를 문장 단위로 분할합니다.
 * 한의학 텍스트의 특성을 고려하여 다양한 구분자를 지원합니다.
 */
function splitIntoSentences(text: string): string[] {
  // 문장 종결 패턴: 마침표, 한문 구두점, 줄바꿈
  const sentences = text
    .split(/(?<=[.。。\n])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return sentences;
}

/**
 * 텍스트를 문단 단위로 분할합니다.
 * 빈 줄(더블 줄바꿈)을 문단 구분자로 사용합니다.
 */
function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// ─── 1. 경전 텍스트 청킹 (Recursive + Semantic) ───

/**
 * 경전 텍스트를 Recursive 방식으로 청킹합니다.
 *
 * 전략:
 * 1. 절 → 문단 → 문장 단위로 재귀 분할
 * 2. 512 토큰 초과 시 분할
 * 3. 256 토큰 미만 시 인접 청크와 병합
 * 4. 청크에 편명/권/장 정보를 prefix로 추가하여 컨텍스트 보존
 *
 * @param text - 원문 텍스트 (한문 + 한국어 번역 혼합 가능)
 * @param metadata - 경전 메타데이터 (서적명, 편, 권, 장 등)
 * @param config - 청킹 설정 (선택)
 * @returns Chunk 배열
 */
export function chunkClassicText(
  text: string,
  metadata: ClassicTextMetadata,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG,
): Chunk[] {
  const { maxTokens, minTokens, overlapSentences } = config;

  // 컨텍스트 prefix 생성
  const prefixParts: string[] = [];
  if (metadata.book) prefixParts.push(`[${metadata.book}]`);
  if (metadata.volume) prefixParts.push(metadata.volume);
  if (metadata.chapter) prefixParts.push(metadata.chapter);
  if (metadata.section) prefixParts.push(metadata.section);
  if (metadata.subsection) prefixParts.push(metadata.subsection);
  const prefix = prefixParts.length > 0 ? prefixParts.join(' > ') + '\n' : '';
  const prefixTokens = estimateTokenCount(prefix);

  // 사용 가능한 콘텐츠 토큰 = 최대 - prefix
  const contentMaxTokens = maxTokens - prefixTokens;

  // 1단계: 문단으로 분할
  const paragraphs = splitIntoParagraphs(text);

  // 2단계: 재귀 분할 - 각 문단이 maxTokens를 초과하면 문장으로 분할
  const segments: string[] = [];
  for (const para of paragraphs) {
    const paraTokens = estimateTokenCount(para);
    if (paraTokens <= contentMaxTokens) {
      segments.push(para);
    } else {
      // 문장으로 분할
      const sentences = splitIntoSentences(para);
      for (const sent of sentences) {
        const sentTokens = estimateTokenCount(sent);
        if (sentTokens <= contentMaxTokens) {
          segments.push(sent);
        } else {
          // 긴 문장: 문자 수 기반 강제 분할
          const parts = forceSliceByTokens(sent, contentMaxTokens);
          segments.push(...parts);
        }
      }
    }
  }

  // 3단계: 병합 - 인접 세그먼트를 minTokens 이상이 되도록 병합
  const mergedSegments: string[] = [];
  let buffer = '';
  for (const seg of segments) {
    const candidateText = buffer ? `${buffer}\n${seg}` : seg;
    const candidateTokens = estimateTokenCount(candidateText);

    if (candidateTokens > contentMaxTokens && buffer) {
      // buffer 확정, 현재 seg는 새 buffer
      mergedSegments.push(buffer);
      buffer = seg;
    } else {
      buffer = candidateText;
    }
  }
  if (buffer) {
    mergedSegments.push(buffer);
  }

  // 마지막 청크가 너무 작으면 이전 청크와 병합 시도
  if (
    mergedSegments.length > 1 &&
    estimateTokenCount(mergedSegments[mergedSegments.length - 1]) < minTokens
  ) {
    const last = mergedSegments.pop()!;
    const prev = mergedSegments.pop()!;
    const combined = `${prev}\n${last}`;
    if (estimateTokenCount(combined) <= maxTokens) {
      mergedSegments.push(combined);
    } else {
      mergedSegments.push(prev, last);
    }
  }

  // 4단계: 오버랩 처리 - 이전 청크의 마지막 문장을 다음 청크 앞에 추가
  const overlappedSegments: string[] = [];
  for (let i = 0; i < mergedSegments.length; i++) {
    if (i === 0 || overlapSentences === 0) {
      overlappedSegments.push(mergedSegments[i]);
    } else {
      const prevSentences = splitIntoSentences(mergedSegments[i - 1]);
      const overlapText = prevSentences
        .slice(-overlapSentences)
        .join(' ');
      const candidate = `${overlapText}\n${mergedSegments[i]}`;
      if (estimateTokenCount(candidate) + prefixTokens <= maxTokens) {
        overlappedSegments.push(candidate);
      } else {
        overlappedSegments.push(mergedSegments[i]);
      }
    }
  }

  // 5단계: Chunk 객체 생성
  const sectionStr = [metadata.volume, metadata.chapter, metadata.section, metadata.subsection]
    .filter(Boolean)
    .join(' > ');

  return overlappedSegments.map((content, i) => {
    const fullContent = prefix + content;
    return {
      id: generateChunkId(metadata.book, '경전', i + 1),
      content: fullContent,
      metadata: {
        source: metadata.book,
        category: '경전' as const,
        title: metadata.section || metadata.chapter || metadata.book,
        section: sectionStr || undefined,
      },
      token_count: estimateTokenCount(fullContent),
    };
  });
}

// ─── 2. 약재 데이터 청킹 (Fixed-size) ───

/**
 * 약재 데이터를 Fixed-size 방식으로 청킹합니다.
 *
 * 전략:
 * - 1 약재 = 1 청크 (기본)
 * - 512 토큰 초과 시 의미 단위(효능/주치/주의사항)로 분할
 * - 구조화된 텍스트 형식으로 변환
 *
 * @param herb - 약재 데이터
 * @param index - 약재 순번 (ID 생성용)
 * @param config - 청킹 설정 (선택)
 * @returns Chunk 배열 (보통 1개, 긴 경우 2~3개)
 */
export function chunkHerb(
  herb: HerbData,
  index: number = 1,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG,
): Chunk[] {
  const source = herb.source || 'OASIS';

  // 전체 텍스트 구성
  const fullText = formatHerbText(herb);
  const totalTokens = estimateTokenCount(fullText);

  const baseMetadata: ChunkMetadata = {
    source,
    category: '약재',
    title: herb.name_hanja ? `${herb.name} (${herb.name_hanja})` : herb.name,
    original_id: herb.original_id,
  };

  // 512 토큰 이하: 1 청크
  if (totalTokens <= config.maxTokens) {
    return [
      {
        id: generateChunkId(source, '약재', index),
        content: fullText,
        metadata: baseMetadata,
        token_count: totalTokens,
      },
    ];
  }

  // 512 토큰 초과: 의미 단위로 분할
  return splitHerbIntoChunks(herb, index, source, baseMetadata, config);
}

/**
 * 약재 데이터를 구조화된 텍스트로 변환합니다.
 */
function formatHerbText(herb: HerbData): string {
  const lines: string[] = [];

  // 제목
  const titleParts = [`[약재] ${herb.name}`];
  if (herb.name_hanja) titleParts.push(`(${herb.name_hanja})`);
  if (herb.latin_name) titleParts.push(`/ ${herb.latin_name}`);
  lines.push(titleParts.join(' '));

  // 속성
  if (herb.properties) lines.push(`성미: ${herb.properties}`);
  if (herb.meridians) lines.push(`귀경: ${herb.meridians}`);
  if (herb.efficacy_category) lines.push(`효능분류: ${herb.efficacy_category}`);
  if (herb.efficacy) lines.push(`효능: ${herb.efficacy}`);
  if (herb.indications) lines.push(`주치: ${herb.indications}`);
  if (herb.dosage) lines.push(`용량: ${herb.dosage}`);
  if (herb.cautions) lines.push(`주의사항: ${herb.cautions}`);
  if (herb.source) lines.push(`출처: ${herb.source}`);

  return lines.join('\n');
}

/**
 * 긴 약재 데이터를 의미 단위로 분할합니다.
 */
function splitHerbIntoChunks(
  herb: HerbData,
  index: number,
  source: string,
  baseMetadata: ChunkMetadata,
  config: ChunkingConfig,
): Chunk[] {
  const chunks: Chunk[] = [];

  // 헤더 (항상 포함)
  const header: string[] = [];
  const titleParts = [`[약재] ${herb.name}`];
  if (herb.name_hanja) titleParts.push(`(${herb.name_hanja})`);
  if (herb.latin_name) titleParts.push(`/ ${herb.latin_name}`);
  header.push(titleParts.join(' '));
  if (herb.properties) header.push(`성미: ${herb.properties}`);
  if (herb.meridians) header.push(`귀경: ${herb.meridians}`);
  const headerText = header.join('\n');

  // 분할 단위 정의
  const sections: { label: string; content: string }[] = [];
  if (herb.efficacy_category)
    sections.push({ label: '효능분류', content: herb.efficacy_category });
  if (herb.efficacy) sections.push({ label: '효능', content: herb.efficacy });
  if (herb.indications)
    sections.push({ label: '주치', content: herb.indications });
  if (herb.dosage) sections.push({ label: '용량', content: herb.dosage });
  if (herb.cautions)
    sections.push({ label: '주의사항', content: herb.cautions });

  let currentContent = headerText;
  let subIndex = 1;

  for (const section of sections) {
    const sectionLine = `${section.label}: ${section.content}`;
    const candidate = `${currentContent}\n${sectionLine}`;

    if (estimateTokenCount(candidate) > config.maxTokens) {
      // 현재 버퍼 확정
      if (currentContent.length > headerText.length) {
        chunks.push({
          id: generateChunkId(source, '약재', index, subIndex++),
          content: currentContent,
          metadata: { ...baseMetadata },
          token_count: estimateTokenCount(currentContent),
        });
      }
      // 새 청크 시작 (헤더 + 현재 섹션)
      currentContent = `${headerText}\n${sectionLine}`;

      // 이 섹션 자체가 너무 길면 강제 분할
      if (estimateTokenCount(currentContent) > config.maxTokens) {
        const parts = forceSliceByTokens(sectionLine, config.maxTokens - estimateTokenCount(headerText) - 5);
        for (const part of parts) {
          chunks.push({
            id: generateChunkId(source, '약재', index, subIndex++),
            content: `${headerText}\n${section.label}: ${part}`,
            metadata: { ...baseMetadata },
            token_count: estimateTokenCount(`${headerText}\n${section.label}: ${part}`),
          });
        }
        currentContent = headerText;
      }
    } else {
      currentContent = candidate;
    }
  }

  // 마지막 버퍼 확정
  if (currentContent.length > headerText.length) {
    chunks.push({
      id: generateChunkId(source, '약재', index, subIndex),
      content: currentContent,
      metadata: { ...baseMetadata },
      token_count: estimateTokenCount(currentContent),
    });
  }

  // 분할 결과가 없으면 전체를 하나로 (안전장치)
  if (chunks.length === 0) {
    const fullText = formatHerbText(herb);
    chunks.push({
      id: generateChunkId(source, '약재', index),
      content: fullText,
      metadata: baseMetadata,
      token_count: estimateTokenCount(fullText),
    });
  }

  return chunks;
}

// ─── 3. 처방 데이터 청킹 (Fixed-size) ───

/**
 * 처방 데이터를 Fixed-size 방식으로 청킹합니다.
 *
 * 전략:
 * - 1 처방 = 1 청크 (기본)
 * - 512 토큰 초과 시 의미 단위로 분할
 * - 구조화된 텍스트 형식으로 변환
 *
 * @param prescription - 처방 데이터
 * @param index - 처방 순번 (ID 생성용)
 * @param config - 청킹 설정 (선택)
 * @returns Chunk 배열 (보통 1개)
 */
export function chunkPrescription(
  prescription: PrescriptionData,
  index: number = 1,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG,
): Chunk[] {
  const source = prescription.source || 'OASIS';

  // 전체 텍스트 구성
  const fullText = formatPrescriptionText(prescription);
  const totalTokens = estimateTokenCount(fullText);

  const baseMetadata: ChunkMetadata = {
    source,
    category: '처방',
    title: prescription.name_hanja
      ? `${prescription.name} (${prescription.name_hanja})`
      : prescription.name,
    original_id: prescription.original_id,
  };

  // 512 토큰 이하: 1 청크
  if (totalTokens <= config.maxTokens) {
    return [
      {
        id: generateChunkId(source, '처방', index),
        content: fullText,
        metadata: baseMetadata,
        token_count: totalTokens,
      },
    ];
  }

  // 512 토큰 초과: 의미 단위로 분할
  return splitPrescriptionIntoChunks(
    prescription,
    index,
    source,
    baseMetadata,
    config,
  );
}

/**
 * 처방 데이터를 구조화된 텍스트로 변환합니다.
 */
function formatPrescriptionText(prescription: PrescriptionData): string {
  const lines: string[] = [];

  // 제목
  const titleParts = [`[처방] ${prescription.name}`];
  if (prescription.name_hanja) titleParts.push(`(${prescription.name_hanja})`);
  if (prescription.name_english)
    titleParts.push(`/ ${prescription.name_english}`);
  lines.push(titleParts.join(' '));

  // 구성 약재
  if (prescription.ingredients.length > 0) {
    const ingredientStr = prescription.ingredients
      .map((ing) => (ing.dose ? `${ing.herb} ${ing.dose}` : ing.herb))
      .join(', ');
    lines.push(`구성: ${ingredientStr}`);
  }

  // 속성
  if (prescription.efficacy) lines.push(`효능: ${prescription.efficacy}`);
  if (prescription.indications) lines.push(`적응증: ${prescription.indications}`);
  if (prescription.historical_notes)
    lines.push(`출전: ${prescription.historical_notes}`);
  if (prescription.cautions) lines.push(`주의사항: ${prescription.cautions}`);
  if (prescription.source) lines.push(`출처: ${prescription.source}`);

  return lines.join('\n');
}

/**
 * 긴 처방 데이터를 의미 단위로 분할합니다.
 */
function splitPrescriptionIntoChunks(
  prescription: PrescriptionData,
  index: number,
  source: string,
  baseMetadata: ChunkMetadata,
  config: ChunkingConfig,
): Chunk[] {
  const chunks: Chunk[] = [];

  // 헤더 (항상 포함)
  const header: string[] = [];
  const titleParts = [`[처방] ${prescription.name}`];
  if (prescription.name_hanja) titleParts.push(`(${prescription.name_hanja})`);
  if (prescription.name_english)
    titleParts.push(`/ ${prescription.name_english}`);
  header.push(titleParts.join(' '));

  // 구성 약재는 헤더에 포함
  if (prescription.ingredients.length > 0) {
    const ingredientStr = prescription.ingredients
      .map((ing) => (ing.dose ? `${ing.herb} ${ing.dose}` : ing.herb))
      .join(', ');
    header.push(`구성: ${ingredientStr}`);
  }
  const headerText = header.join('\n');

  // 분할 단위 정의
  const sections: { label: string; content: string }[] = [];
  if (prescription.efficacy)
    sections.push({ label: '효능', content: prescription.efficacy });
  if (prescription.indications)
    sections.push({ label: '적응증', content: prescription.indications });
  if (prescription.historical_notes)
    sections.push({ label: '출전', content: prescription.historical_notes });
  if (prescription.cautions)
    sections.push({ label: '주의사항', content: prescription.cautions });

  let currentContent = headerText;
  let subIndex = 1;

  for (const section of sections) {
    const sectionLine = `${section.label}: ${section.content}`;
    const candidate = `${currentContent}\n${sectionLine}`;

    if (estimateTokenCount(candidate) > config.maxTokens) {
      // 현재 버퍼 확정
      if (currentContent.length > headerText.length) {
        chunks.push({
          id: generateChunkId(source, '처방', index, subIndex++),
          content: currentContent,
          metadata: { ...baseMetadata },
          token_count: estimateTokenCount(currentContent),
        });
      }
      currentContent = `${headerText}\n${sectionLine}`;

      // 이 섹션 자체가 너무 길면 강제 분할
      if (estimateTokenCount(currentContent) > config.maxTokens) {
        const parts = forceSliceByTokens(
          sectionLine,
          config.maxTokens - estimateTokenCount(headerText) - 5,
        );
        for (const part of parts) {
          chunks.push({
            id: generateChunkId(source, '처방', index, subIndex++),
            content: `${headerText}\n${section.label}: ${part}`,
            metadata: { ...baseMetadata },
            token_count: estimateTokenCount(
              `${headerText}\n${section.label}: ${part}`,
            ),
          });
        }
        currentContent = headerText;
      }
    } else {
      currentContent = candidate;
    }
  }

  // 마지막 버퍼 확정
  if (currentContent.length > headerText.length) {
    chunks.push({
      id: generateChunkId(source, '처방', index, subIndex),
      content: currentContent,
      metadata: { ...baseMetadata },
      token_count: estimateTokenCount(currentContent),
    });
  }

  if (chunks.length === 0) {
    const fullText = formatPrescriptionText(prescription);
    chunks.push({
      id: generateChunkId(source, '처방', index),
      content: fullText,
      metadata: baseMetadata,
      token_count: estimateTokenCount(fullText),
    });
  }

  return chunks;
}

// ─── 강제 분할 유틸리티 ───

/**
 * 텍스트를 토큰 상한에 맞게 강제 분할합니다.
 * 문장/문단 경계를 무시하고, 의미 단위가 깨질 수 있지만
 * 토큰 상한 보장이 우선일 때 사용합니다.
 */
function forceSliceByTokens(text: string, maxTokens: number): string[] {
  const parts: string[] = [];
  const chars = Array.from(text); // 유니코드 안전 분할
  let start = 0;

  while (start < chars.length) {
    // 이진 탐색으로 최대 범위 찾기
    let end = Math.min(start + Math.floor(maxTokens * 1.2), chars.length);
    let slice = chars.slice(start, end).join('');

    while (estimateTokenCount(slice) > maxTokens && end > start + 1) {
      end = Math.floor(start + (end - start) * 0.8);
      slice = chars.slice(start, end).join('');
    }

    // 가능하면 문장 경계에서 분할
    if (end < chars.length) {
      const lastPeriod = slice.lastIndexOf('.');
      const lastKoreanPeriod = slice.lastIndexOf('。');
      const lastNewline = slice.lastIndexOf('\n');
      const bestBreak = Math.max(lastPeriod, lastKoreanPeriod, lastNewline);
      if (bestBreak > slice.length * 0.5) {
        end = start + bestBreak + 1;
        slice = chars.slice(start, end).join('');
      }
    }

    parts.push(slice.trim());
    start = end;
  }

  return parts.filter((p) => p.length > 0);
}

// ─── 검증 유틸리티 ───

/**
 * 청크 배열의 토큰 상한/하한을 검증합니다.
 *
 * @param chunks - 검증할 Chunk 배열
 * @param config - 청킹 설정 (선택)
 * @param allowNaturalSize - true이면 하한 검사 무시 (약재/처방용)
 * @returns 검증 결과
 */
export function validateChunks(
  chunks: Chunk[],
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG,
  allowNaturalSize: boolean = false,
): ValidationResult {
  const oversizedChunks: { id: string; token_count: number }[] = [];
  const undersizedChunks: { id: string; token_count: number }[] = [];
  let totalTokens = 0;

  for (const chunk of chunks) {
    totalTokens += chunk.token_count;

    if (chunk.token_count > config.maxTokens) {
      oversizedChunks.push({ id: chunk.id, token_count: chunk.token_count });
    }

    if (!allowNaturalSize && chunk.token_count < config.minTokens) {
      undersizedChunks.push({ id: chunk.id, token_count: chunk.token_count });
    }
  }

  return {
    totalChunks: chunks.length,
    validChunks: chunks.length - oversizedChunks.length - undersizedChunks.length,
    oversizedChunks,
    undersizedChunks,
    averageTokenCount:
      chunks.length > 0 ? Math.round(totalTokens / chunks.length) : 0,
  };
}

/**
 * 검증 결과를 사람이 읽을 수 있는 문자열로 출력합니다.
 */
export function formatValidationReport(result: ValidationResult): string {
  const lines: string[] = [
    `=== 청크 검증 결과 ===`,
    `총 청크 수: ${result.totalChunks}`,
    `유효 청크: ${result.validChunks}`,
    `평균 토큰: ${result.averageTokenCount}`,
  ];

  if (result.oversizedChunks.length > 0) {
    lines.push(`\n[경고] 상한 초과 청크 (${result.oversizedChunks.length}건):`);
    for (const c of result.oversizedChunks) {
      lines.push(`  - ${c.id}: ${c.token_count} 토큰`);
    }
  }

  if (result.undersizedChunks.length > 0) {
    lines.push(`\n[참고] 하한 미달 청크 (${result.undersizedChunks.length}건):`);
    for (const c of result.undersizedChunks) {
      lines.push(`  - ${c.id}: ${c.token_count} 토큰`);
    }
  }

  if (
    result.oversizedChunks.length === 0 &&
    result.undersizedChunks.length === 0
  ) {
    lines.push(`\n모든 청크가 유효합니다.`);
  }

  return lines.join('\n');
}
