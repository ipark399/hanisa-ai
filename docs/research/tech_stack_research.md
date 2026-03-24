# 한의사 AI 웹앱 기술 스택 리서치

- **조사일**: 2026-03-23
- **조사자**: Scientist (oh-my-claudecode)
- **다음 최신화 조건**: Vercel AI SDK 메이저 버전 업, Gemini API 신모델 출시, 벡터 DB 가격 정책 변경 시
- **변경 이력**:
  - 2026-03-23: 최초 작성

---

## 프로젝트 컨텍스트

| 항목 | 내용 |
|------|------|
| 서비스 유형 | 한의학 진단 보조 / 상담 / 처방 추천 AI 채팅 |
| UI 스타일 | ChatGPT 스타일 대화형 |
| AI 모델 | Gemini 2.5 Pro API |
| 배포 플랫폼 | Vercel |
| 인증 | 없음 (도메인 접속 방식) |
| 데이터 저장 | 세션 기반, 환자 데이터 미저장 |
| 지식 수정 | 한의사 피드백 → 지식 베이스 반영 |

---

## 1. 프론트엔드 프레임워크

### 결론: Next.js App Router + Vercel AI SDK

**Next.js App Router (v15+)**가 Vercel 배포 기준 최적 선택이다.

- Vercel이 직접 관리하는 프레임워크로 Edge/Serverless 최적화가 내장되어 있음
- App Router의 React Server Components(RSC)로 초기 로딩 속도 최적화 가능
- Streaming Response를 위한 Server Actions 지원

**Vercel AI SDK (v4.2+)**는 ChatGPT 스타일 UI 구현의 핵심이다.

```bash
npm install ai @ai-sdk/google @ai-sdk/react
```

핵심 기능:
- `useChat` hook: 메시지 상태 관리, 스트리밍 수신, 입력 처리 일괄 처리
- `streamText`: 서버에서 Gemini 응답을 실시간 스트리밍
- `generateObject`: 구조화된 출력 (처방 정보, 증상 분류 등)
- 통합 API: OpenAI → Gemini 전환 시 코드 최소 변경

**ChatGPT 스타일 UI 라이브러리**:
- `shadcn/ui` + Tailwind CSS: Vercel 공식 챗봇 템플릿이 사용하는 조합, 한국어 폰트(Noto Sans KR) 설정 용이
- `react-markdown` + `rehype-highlight`: AI 응답 마크다운 렌더링
- `react-textarea-autosize`: 입력창 자동 크기 조절

**참고 오픈소스 템플릿**:
- [github.com/vercel/chatbot](https://github.com/vercel/chatbot) — 공식 Next.js AI 챗봇 (가장 권장)
- [supabase-community/vercel-ai-chatbot](https://github.com/supabase-community/vercel-ai-chatbot) — Supabase + Vercel 통합 버전
- [mckaywrigley/chatbot-ui](https://github.com/mckaywrigley/chatbot-ui) — 경량 로컬 실행 가능 버전

---

## 2. Gemini 2.5 Pro API 연동

### 결론: Vercel AI SDK Google Provider 완전 지원

**지원 여부 확인** (2026-03 기준):
- Vercel AI Gateway에서 `gemini-2.5-pro` 모델 ID로 직접 호출 가능
- [vercel.com/ai-gateway/models/gemini-2.5-pro](https://vercel.com/ai-gateway/models/gemini-2.5-pro) 공식 등록됨
- Gemini AI Chatbot Template이 Vercel 공식 템플릿으로 제공됨

**스트리밍 응답**:
```typescript
import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();
  
  const result = streamText({
    model: google('gemini-2.5-pro'),
    messages,
    system: '당신은 한의학 전문 AI 보조입니다...',
  });
  
  return result.toDataStreamResponse();
}
```

**Function Calling (Tool Use)**:
- Vercel AI SDK의 `tools` 파라미터로 정의, Gemini 2.5 Pro에서 완전 지원
- 활용 예: 증상 분류 도구, 처방 데이터베이스 조회 도구, RAG 검색 트리거
- Gemini 2.5 Pro는 multi-step function calling 지원 (복잡한 진단 흐름에 유용)

**주의사항**:
- `@ai-sdk/google` 패키지 4.0.34 이후 버전에서 tool calling 버그가 보고된 이력 있음 ([GitHub Issue #4412](https://github.com/vercel/ai/issues/4412)). 최신 패치 버전 사용 필수
- `strict: true` 옵션이 Google/Vertex 프로바이더에서 무시되는 이슈 있음 ([#12767](https://github.com/vercel/ai/issues/12767))

---

## 3. RAG 아키텍처

### 3-1. 벡터 DB 선택

#### 권장: Supabase pgvector (MVP) → Pinecone (스케일업)

| DB | 장점 | 단점 | Vercel 호환성 | 비용 |
|----|------|------|----------------|------|
| **Supabase pgvector** | PostgreSQL 통합, 관리 단순, 무료 시작 | 수백만 벡터 이상 성능 저하 | HTTP API로 완전 호환 | 무료~$25/월 |
| **Pinecone** | 엔터프라이즈 신뢰성, P99 레이턴시 보장, 서버리스 | 유료, 별도 서비스 | HTTP API 호환 | $70+/월 |
| **Qdrant** | 오픈소스, Rust 기반 고성능, 페이로드 필터링 | 셀프호스팅 관리 필요 (Cloud 있음) | HTTP API 호환 | 오픈소스/Cloud |
| **Weaviate** | 하이브리드 검색(벡터+키워드), GraphQL | 설정 복잡 | HTTP API 호환 | 오픈소스/Cloud |

**한의사 AI MVP 권장**: Supabase pgvector
- 이미 Vercel 배포 생태계와 긴밀 통합
- 한의학 문서 수는 초기에 수만~수십만 벡터 수준으로 pgvector로 충분
- 지식 수정 이력 관리를 같은 PostgreSQL DB에서 처리 가능
- 무료 티어로 시작 → 트래픽 증가 시 Pinecone 마이그레이션

#### 벡터 DB 연동 예시 (Supabase)
```sql
-- pgvector 확장 활성화
create extension vector;

-- 한의학 문서 청크 테이블
create table hanuisahak_docs (
  id bigserial primary key,
  content text,
  embedding vector(1536),
  source text,         -- 문서 출처
  doc_type text,       -- 논문/교과서/경전/수정본
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_correction boolean default false  -- 한의사 수정 여부
);

create index on hanuisahak_docs using ivfflat (embedding vector_cosine_ops);
```

### 3-2. 임베딩 모델 추천

#### 권장: Google Gemini Embedding (text-embedding-004 또는 gemini-embedding-exp-03)

| 모델 | MTEB 다국어 | 한국어 지원 | 비용 | 특징 |
|------|-------------|-------------|------|------|
| **Google gemini-embedding-exp** | 69.9 (1위) | 100+ 언어 | 무료 한도 있음 | Gemini 생태계 통일성 |
| OpenAI text-embedding-3-small | 중간 | 지원 | $0.02/1M 토큰 | 가성비 |
| OpenAI text-embedding-3-large | 높음 | 지원 | $0.13/1M 토큰 | 고품질 |
| Cohere embed-v4.0 | 높음 | 한국어 명시 지원 | 유료 | 하이브리드 검색 내장 |

**한의사 AI 권장**: Google `text-embedding-004` 또는 `gemini-embedding-exp-03-07`
- Gemini 2.5 Pro와 같은 생태계 → API 관리 단순화
- MTEB Multilingual 1위, 한국어 우수
- Gemini API 무료 한도 내에서 임베딩 비용 절감 가능
- `@ai-sdk/google` 또는 Google AI SDK로 통일된 코드

### 3-3. 청킹 전략

한의학 문서는 구조가 다양하므로 문서 유형별 청킹 전략이 필요하다.

#### 전략별 권장 적용

| 문서 유형 | 권장 청킹 전략 | 청크 크기 | 오버랩 |
|-----------|----------------|-----------|--------|
| 동의보감, 상한론 등 한의학 경전 | Recursive + Semantic | 256~512 토큰 | 10~20% |
| 논문/학술지 | Semantic (섹션 단위) | 512~1024 토큰 | 15% |
| 처방집 (약재 목록) | Fixed-size (처방 단위) | 128~256 토큰 | 0% |
| 증례 보고서 | Hierarchical (증례 → 증상 → 처방) | 512 토큰 | 20% |

**권장 라이브러리**:
- LangChain의 `RecursiveCharacterTextSplitter` (한국어 구분자 커스텀 가능)
- LlamaIndex의 `SentenceSplitter` (의미 단위 분리에 우수)

**한국어 특수 처리**:
- 한자-한글 혼용 문서: 형태소 분석기 적용 후 청킹 권장 (KoNLPy, Kiwi 등)
- 한문 경전 원문: 문장 단위(。 기준) 분리 후 N개 묶음으로 청킹
- 약재명 보존: 청크 경계에서 약재명이 잘리지 않도록 Named Entity 기반 경계 설정

---

## 4. 한의사 수정 반영 메커니즘

### 아키텍처: 수정 레이어 + 주기적 인덱스 업데이트

```
한의사 수정 요청
       │
       ▼
corrections 테이블 저장 (원본 ID, 수정 내용, 수정자, 타임스탬프)
       │
       ├── 즉시 효과: corrections 테이블을 RAG 검색 시 우선순위 부여
       │              (원본 벡터보다 수정본 먼저 반환)
       │
       └── 주기적 처리 (Cron Job): 
           수정본 재임베딩 → 기존 벡터 업데이트 → 원본 is_deprecated=true
```

#### DB 스키마 (수정 이력)
```sql
create table corrections (
  id bigserial primary key,
  original_doc_id bigint references hanuisahak_docs(id),
  corrected_content text not null,
  correction_reason text,
  corrected_by text,          -- 한의사 식별자 (로그인 없으면 IP or 세션)
  status text default 'pending',  -- pending / applied / rejected
  created_at timestamptz default now(),
  applied_at timestamptz
);
```

#### 수정 반영 절차
1. **즉시 효과**: UI에서 "이 응답 수정" 버튼 → `corrections` 테이블 INSERT
2. **우선순위 조회**: RAG 검색 쿼리 시 `corrections.status = 'applied'`인 항목을 기본 벡터보다 상위 랭킹
3. **배치 적용**: Vercel Cron Job (하루 1회) → `pending` 수정본을 재임베딩하여 벡터 업데이트
4. **충돌 해결**: 동일 원본에 복수 수정이 있을 경우 최신 `applied_at` 우선 적용, 관리 UI에서 수동 검토 옵션 제공

#### 간단한 구현 (MVP)
로그인 없는 환경에서는 별도 관리 페이지(`/admin`)에 비밀번호 보호를 두고, 한의사가 직접 수정본을 입력하는 방식이 현실적이다.

---

## 5. Vercel 배포 제약사항

### Timeout 한계

| 런타임 | 최대 실행 시간 | 스트리밍 시작 데드라인 | 비고 |
|--------|---------------|----------------------|------|
| Edge Runtime | 300초 (2025-03부터) | 25초 이내 첫 응답 필수 | 스트리밍에 권장 |
| Serverless (Node.js) | Hobby: 10초, Pro: 60초, Enterprise: 900초 | N/A | RAG 처리 용도 |

**한의사 AI에서의 영향**:
- RAG 검색 + Gemini 2.5 Pro 추론은 10~30초 소요 가능 → **Vercel Pro 플랜($20/월) 필수**
- Edge Runtime으로 스트리밍 응답 처리: 첫 토큰을 25초 이내 전송하면 이후 300초 유지
- 권장 아키텍처: RAG 검색(Serverless) → 스트리밍 응답 시작(Edge) 파이프라인 분리

### API Route 제한
- 동시 실행: Pro 플랜 기준 1000 concurrent executions
- 응답 크기: 4.5MB 제한 (한의학 RAG 컨텍스트는 통상 50~200KB로 문제없음)
- Cold Start: Edge Runtime은 ~5ms, Node.js Serverless는 ~500ms

### 비용 예측 (월간, 중소 규모 기준)

| 항목 | 예상 비용 |
|------|-----------|
| Vercel Pro | $20/월 |
| Gemini 2.5 Pro API (1000회/일, 평균 2K input + 1K output 토큰) | ~$30~60/월 |
| Google Embedding API (초기 임베딩 비용) | $0~5/월 |
| Supabase (pgvector, 500MB DB) | 무료~$25/월 |
| **합계 추정** | **$50~110/월** |

> Gemini API 비용은 실제 사용량에 따라 크게 변동. 무료 티어(분당 60 요청) 초과 시 과금 시작.

---

## 6. 유사 오픈소스 프로젝트

### 주요 참고 프로젝트

| 프로젝트 | GitHub | 특징 | 권장 용도 |
|----------|--------|------|-----------|
| **vercel/chatbot** | [github.com/vercel/chatbot](https://github.com/vercel/chatbot) | 공식 Next.js + AI SDK 챗봇, Vercel AI Gateway 통합 | 기반 코드로 직접 활용 |
| **supabase-community/vercel-ai-chatbot** | [링크](https://github.com/supabase-community/vercel-ai-chatbot) | Supabase Auth + pgvector 통합 버전 | DB 설계 참고 |
| **mckaywrigley/chatbot-ui** | 검색 결과 | 경량, 멀티 모델 지원 | UI 컴포넌트 참고 |
| **NirDiamant/RAG_Techniques** | [링크](https://github.com/NirDiamant/RAG_Techniques) | RAG 피드백 루프 구현 예제 포함 | 수정 반영 메커니즘 참고 |

---

## 7. 권장 기술 스택 요약

```
┌─────────────────────────────────────────────────┐
│                  한의사 AI 스택                   │
├─────────────────────────────────────────────────┤
│ Frontend     │ Next.js 15 (App Router)           │
│              │ Vercel AI SDK v4+ (@ai-sdk/react) │
│              │ shadcn/ui + Tailwind CSS           │
│              │ react-markdown                    │
├─────────────────────────────────────────────────┤
│ AI Model     │ Gemini 2.5 Pro (@ai-sdk/google)   │
│              │ Streaming + Function Calling       │
├─────────────────────────────────────────────────┤
│ Embedding    │ Google text-embedding-004          │
│              │ (또는 gemini-embedding-exp-03-07)  │
├─────────────────────────────────────────────────┤
│ Vector DB    │ Supabase pgvector (MVP)            │
│              │ → Pinecone (스케일업 시)           │
├─────────────────────────────────────────────────┤
│ RAG          │ LangChain (청킹/파이프라인)        │
│ Framework    │ 문서 유형별 청킹 전략              │
├─────────────────────────────────────────────────┤
│ 수정 관리    │ Supabase corrections 테이블         │
│              │ Vercel Cron Job (배치 재임베딩)    │
├─────────────────────────────────────────────────┤
│ 배포         │ Vercel Pro ($20/월)                │
│              │ Edge Runtime (스트리밍)            │
└─────────────────────────────────────────────────┘
```

---

## 8. 주의사항 및 리스크

1. **Gemini 2.5 Pro 비용**: 컨텍스트 윈도우가 크므로 RAG 컨텍스트 토큰이 많아지면 비용이 급등할 수 있음. 청크 수 제한(top-k=3~5) 권장
2. **의료 정보 책임**: 한의학 AI 응답에 "의료 조언이 아님" 면책 문구 필수. 처방 추천은 반드시 한의사 검토 전제
3. **한국어 RAG 품질**: 임베딩 모델의 한국어 한자 혼용 처리 능력 사전 검증 필요. 한자 경전 원문은 별도 전처리 파이프라인 고려
4. **cold start 문제**: Serverless 함수의 cold start가 사용자 경험 저하 요인. Edge Runtime 우선 사용 권장
5. **수정 메커니즘 거버넌스**: 로그인 없는 환경에서 악의적 수정 방지를 위한 관리 페이지 접근 통제 필요

---

## 출처

- [Vercel AI SDK Google Provider 공식 문서](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)
- [Gemini 2.5 Pro on Vercel AI Gateway](https://vercel.com/ai-gateway/models/gemini-2.5-pro)
- [Vercel Functions Limitations 공식 문서](https://vercel.com/docs/functions/limitations)
- [Vercel Edge Function Duration Limit 변경 (2025-03)](https://vercel.com/changelog/new-execution-duration-limit-for-edge-functions)
- [Best Vector Databases for RAG 2026 - Engineers Guide](https://engineersguide.substack.com/p/best-vector-databases-rag)
- [Supabase vs Pinecone vs Weaviate vs Qdrant - Medium](https://medium.com/@zawanah/supabase-vs-pinecone-vs-weviate-vs-qdrant-choosing-the-right-vector-database-for-your-rag-pipeline-203f7f345bea)
- [Best Embedding Models 2026 - Elephas](https://elephas.app/blog/best-embedding-models)
- [RAG Chunking Strategies 2025 - Firecrawl](https://www.firecrawl.dev/blog/best-chunking-strategies-rag)
- [RAG with Human-in-the-Loop Review - Label Studio](https://labelstud.io/blog/why-human-review-is-essential-for-better-rag-systems/)
- [RAG Feedback Loop Techniques - NirDiamant GitHub](https://github.com/NirDiamant/RAG_Techniques)
- [vercel/chatbot 공식 오픈소스](https://github.com/vercel/chatbot)
- [Gemini AI Chatbot Template - Vercel](https://vercel.com/templates/next.js/gemini-ai-chatbot)
