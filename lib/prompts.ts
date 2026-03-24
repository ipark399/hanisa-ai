/**
 * 시스템 프롬프트 빌더
 *
 * RAG 검색 결과를 시스템 프롬프트에 주입하여
 * 한의학 전문 AI 보조의 응답 품질을 높입니다.
 */

interface RetrievedContext {
  content: string
  metadata: Record<string, unknown> | null
  similarity: number
}

const BASE_SYSTEM_PROMPT = `당신은 한의학 전문 AI 보조입니다. 한의학 경전, 본초학, 방제학에 대한 전문 지식을 바탕으로 정확하고 신뢰할 수 있는 정보를 제공합니다.

## 응답 가이드라인

- 마크다운 형식을 사용하세요 (제목, 목록, 표, 강조 등).
- 한국어로 답변하세요.
- 참고자료에 없는 내용을 언급할 경우, 일반 지식임을 명시하세요.
- 불확실한 경우 "정확한 확인이 필요합니다"라고 안내하세요.
- 약재 정보는 성미(性味), 귀경(歸經), 효능 등을 구조화하여 제공하세요.
- 처방 정보는 구성 약재, 용량, 적응증을 포함하세요.
- 답변 내에서 참고한 자료의 출처를 [출처: {source} - {title}] 형태로 인용하세요.`

/**
 * 검색된 컨텍스트를 <참고자료> 블록으로 포맷합니다.
 */
function formatContextBlock(contexts: RetrievedContext[]): string {
  if (contexts.length === 0) return ''

  const chunks = contexts
    .map((ctx, i) => {
      const source = ctx.metadata?.source ?? '알 수 없음'
      const title = ctx.metadata?.title ?? '제목 없음'
      const sim = (ctx.similarity * 100).toFixed(1)
      const correctedTag = ctx.metadata?.corrected ? ' [수정됨]' : ''
      return `### 참고 ${i + 1} [유사도: ${sim}%]${correctedTag}\n[출처: ${source} - ${title}]\n${ctx.content}`
    })
    .join('\n\n')

  return `\n\n<참고자료>\n${chunks}\n</참고자료>`
}

/**
 * RAG 검색 결과를 포함한 시스템 프롬프트를 생성합니다.
 *
 * @param contexts - retrieveContext()에서 반환된 검색 결과 배열
 * @returns 완성된 시스템 프롬프트 문자열
 */
export function buildSystemPrompt(contexts: RetrievedContext[]): string {
  const contextBlock = formatContextBlock(contexts)

  if (contextBlock) {
    return `${BASE_SYSTEM_PROMPT}\n\n## 참고자료 활용 지침\n아래 참고자료를 우선적으로 활용하여 답변하세요. 참고자료에서 인용한 내용은 반드시 출처를 표기하세요.${contextBlock}`
  }

  return BASE_SYSTEM_PROMPT
}
