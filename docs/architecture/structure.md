# 한의사AI — 아키텍처 구조 맵

> 최종 갱신: 2026-03-24

## 디렉토리 구조

```
한의사ai/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # 루트 레이아웃 (HTML, body, 전역 스타일)
│   ├── page.tsx                  # 메인 채팅 페이지 (ChatGPT 스타일 UI)
│   ├── globals.css               # 전역 Tailwind CSS 스타일
│   └── api/
│       ├── chat/
│       │   └── route.ts          # POST /api/chat — 스트리밍 채팅 엔드포인트
│       └── corrections/
│           └── route.ts          # POST /api/corrections — 정보 수정 요청 저장
│
├── components/
│   └── CorrectionModal.tsx       # 정보 수정 요청 모달 컴포넌트
│
├── lib/
│   ├── prompts.ts                # 시스템 프롬프트 (면책 문구, 한의학 지침 포함)
│   ├── rag.ts                    # RAG 파이프라인 (임베딩 생성 → pgvector 검색 → 컨텍스트 조립)
│   └── supabase.ts               # Supabase 클라이언트 초기화
│
├── scripts/                      # 데이터 파이프라인 (일회성/관리용 스크립트)
│   ├── pipeline.ts               # 전체 파이프라인 진입점
│   ├── test-supabase.ts          # Supabase 연결 테스트
│   ├── chunking/
│   │   ├── types.ts              # 청킹 타입 정의
│   │   ├── chunker.ts            # 텍스트 청킹 로직
│   │   └── test-chunker.ts       # 청커 단위 테스트
│   ├── collect/
│   │   ├── types.ts              # 수집 타입 정의
│   │   └── generate-samples.ts   # 샘플 데이터 생성
│   ├── embed/
│   │   ├── types.ts              # 임베딩 타입 정의
│   │   ├── embed.ts              # 임베딩 생성 로직
│   │   ├── embedding-client.ts   # Google Gemini 임베딩 API 클라이언트
│   │   └── run-embed.ts          # 임베딩 실행 진입점
│   ├── load/
│   │   ├── types.ts              # 로드 타입 정의
│   │   ├── load-vectors.ts       # Supabase pgvector 적재 로직
│   │   └── verify-load.ts        # 적재 결과 검증
│   └── reembed/
│       ├── reembed-corrections.ts # 수정 요청 데이터 재임베딩
│       └── run-reembed.ts        # 재임베딩 실행 진입점 (임베딩 모델 변경 시 사용)
│
├── supabase/
│   └── migrations/               # Supabase DB 마이그레이션 파일
│
├── docs/
│   ├── architecture/
│   │   └── structure.md          # 이 파일
│   ├── research/                 # 리서치 문서
│   └── deployment-guide.md       # 배포 절차 가이드
│
├── data/                         # 로컬 원본 데이터 (한의학고전DB, OASIS, 동의보감 등)
├── 산출물/                        # 파이프라인 중간 산출물
├── public/                       # 정적 파일
├── next.config.ts                # Next.js 설정
├── vercel.json                   # Vercel 배포 설정
├── tsconfig.json                 # TypeScript 설정
└── package.json                  # 의존성 관리
```

## 핵심 데이터 흐름

### 1. 채팅 요청 흐름 (런타임)
```
사용자 메시지
  → app/page.tsx (useChat 훅, @ai-sdk/react)
  → POST /api/chat (app/api/chat/route.ts)
      → lib/rag.ts: 쿼리 임베딩 생성 (gemini-embedding-001)
      → Supabase pgvector: match_documents() exact search (top-K 유사 문서 검색)
      → lib/prompts.ts: 시스템 프롬프트 + 검색 결과 컨텍스트 조립
      → Gemini 2.5 Pro: streamText() 호출
  → 스트리밍 응답 → 사용자 UI (출처 표시 포함)
```

### 2. 정보 수정 요청 흐름
```
사용자 → CorrectionModal.tsx (components/)
  → POST /api/corrections (app/api/corrections/route.ts)
  → Supabase corrections 테이블 저장
  → (선택) scripts/reembed/ 파이프라인으로 재임베딩
```

### 3. 데이터 적재 파이프라인 (일회성)
```
원본 데이터 (data/)
  → scripts/collect/: 수집 및 정제
  → scripts/chunking/: 텍스트 청킹
  → scripts/embed/: gemini-embedding-001 임베딩 생성 (3072차원)
  → scripts/load/: Supabase pgvector 적재
  → 산출물/: 중간 결과물 저장
```

## 주요 외부 의존성

| 서비스 | 용도 | 비고 |
|--------|------|------|
| Gemini 2.5 Pro | 채팅 응답 생성 | `@ai-sdk/google` |
| gemini-embedding-001 | 벡터 임베딩 (3072차원) | text-embedding-004에서 변경 |
| Supabase pgvector | 벡터 유사도 검색 | exact search (인덱스 없음) |
| Vercel | 배포 호스팅 | Hobby 플랜 |

## Supabase 테이블 구조 (주요)

| 테이블 | 설명 |
|--------|------|
| `documents` | 한의학 문서 청크 + 벡터 (3072차원) |
| `corrections` | 사용자 정보 수정 요청 |

## 환경변수

| 변수명 | 설명 |
|--------|------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API 키 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 (클라이언트용) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 키 (서버/스크립트용) |
