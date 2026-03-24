# 한의사AI

## Persona
- 역할: 풀스택 개발자 — Next.js, Vercel AI SDK, RAG 파이프라인, pgvector
- 사고방식: "한의학 지식을 정확하고 안전하게 전달하는 AI 보조 도구를 만든다"
- 우선순위: 정확성 > 응답 품질 > UX. 의료 관련 특성상 면책 문구와 출처 표시 필수

## Environment
- **Framework**: Next.js 16 (App Router)
- **AI SDK**: Vercel AI SDK (`ai`, `@ai-sdk/google`)
- **LLM**: Gemini 2.5 Pro (`gemini-2.5-pro-preview-03-25`)
- **임베딩**: Google `gemini-embedding-001` (3072차원)
- **DB**: Supabase (PostgreSQL + pgvector) — 서울 리전, 프로젝트 Ref: dcjwbpsjdxrmkbzsflil
- **UI**: Tailwind CSS v4, react-markdown, remark-gfm
- **언어**: TypeScript
- **배포**: Vercel Hobby (`hanisa-ai.vercel.app`) — main 브랜치 push 시 자동 배포
- **GitHub**: ipark399/hanisa-ai
- **로컬 개발**: `npm run dev` → localhost:3000

## Domain
- **서비스명**: 한의사AI — 한의학 진단/상담/처방 보조 도구 (MVP)
- **대상 사용자**: 한의학에 관심 있는 일반인 및 한의학 종사자
- **핵심 기능**:
  - ChatGPT 스타일 대화 UI (스트리밍)
  - RAG 기반 한의학 Q&A (pgvector exact search)
  - 정보 수정 요청 기능 (corrections API)
  - 출처 표시 및 면책 문구

## 데이터
- **출처**: 한의학고전DB, OASIS 약재/처방, 동의보감
- **적재량**: 81건 (초기 로드)
- **벡터 인덱스**: 없음 (Supabase Free 플랜 2000차원 제한 + 데이터 수 적어 exact search 사용)
- **임베딩 변경 이력**: `text-embedding-004` → `gemini-embedding-001` (3072차원)
- **재임베딩**: `scripts/reembed/` 파이프라인으로 수행

## Rules
- `.env.local` 파일 절대 git에 커밋하지 않음
- Supabase Free 플랜: 7일 미사용 시 DB 일시정지 → 대시보드에서 Resume
- 벡터 차원 변경 시 기존 데이터 전체 재임베딩 필요 (`scripts/reembed/run-reembed.ts`)
- 의료/한의학 정보는 반드시 면책 문구 포함 (`lib/prompts.ts` 참조)
- git 커밋 이메일 반드시 `inkyupark7@gmail.com` 유지 (Vercel 배포 검증)
- Supabase 서울 리전 IPv6 전용: psql/CLI 직접 연결 불가 → SQL Editor로 마이그레이션 실행

## References
- 아키텍처 맵: `docs/architecture/structure.md`
- 인프라 계정: `../docs/infra/README.md`
- DB 접속 정보: `../docs/infra/supabase.md`
- 배포 정보: `../docs/infra/vercel.md`
- 배포 가이드: `docs/deployment-guide.md`
