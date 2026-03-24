# 한의사 AI 배포 가이드

## 1. 사전 준비

### 1.1 Vercel 계정
- [vercel.com](https://vercel.com)에서 계정 생성
- Hobby(무료) 플랜으로 시작 가능

### 1.2 Supabase 프로젝트
1. [supabase.com](https://supabase.com)에서 프로젝트 생성
2. Region: **Northeast Asia (Seoul)** 선택 권장
3. 마이그레이션 실행 (아래 "6. Supabase 마이그레이션 순서" 참고)

### 1.3 Google AI API 키
1. [Google AI Studio](https://aistudio.google.com/apikey)에서 API 키 발급
2. Gemini 모델 사용 가능 여부 확인

### 1.4 데이터 파이프라인 실행
```bash
npx tsx scripts/pipeline.ts
```
- Supabase에 문서 임베딩 데이터를 적재합니다
- `.env.local`에 Supabase 키가 설정되어 있어야 합니다

---

## 2. Vercel 배포

### 방법 A: GitHub 연결 (권장)
1. GitHub에 리포지토리 push
2. Vercel 대시보드 → **Add New Project** → GitHub 리포 선택
3. Framework Preset: **Next.js** 자동 감지
4. 환경변수 설정 (아래 3번 참고)
5. **Deploy** 클릭

### 방법 B: Vercel CLI
```bash
# Vercel CLI 설치
npm i -g vercel

# 프로젝트 루트에서 실행
vercel

# 프로덕션 배포
vercel --prod
```

---

## 3. 환경변수 설정

Vercel 대시보드 → **Settings** → **Environment Variables**에서 아래 4개를 등록합니다.

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API 키 | `AIza...` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 키 | `eyJ...` |

> **주의**: `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용입니다. `NEXT_PUBLIC_` 접두사를 붙이지 마세요.

---

## 4. 커스텀 도메인 연결

1. Vercel 대시보드 → **Settings** → **Domains**
2. 도메인 입력 후 **Add**
3. DNS 레코드 설정:
   - **A 레코드**: `76.76.21.21` (루트 도메인)
   - **CNAME 레코드**: `cname.vercel-dns.com` (서브도메인)
4. SSL 인증서는 Vercel이 자동 발급합니다

---

## 5. 배포 후 검증 체크리스트

- [ ] 홈페이지 로드 확인
- [ ] 대화 입력 → 스트리밍 응답 확인
- [ ] 출처 표시 확인
- [ ] 수정 요청 기능 확인
- [ ] 면책 문구 표시 확인
- [ ] 모바일/PC 반응형 확인
- [ ] Lighthouse 성능 측정 (Performance, Accessibility, Best Practices, SEO)

---

## 6. Supabase 마이그레이션 순서

Supabase SQL Editor에서 아래 순서대로 실행합니다.

```
001_initial_schema.sql    — pgvector 확장, documents, corrections 테이블, match_documents RPC
002_corrections_rpc.sql   — match_documents_with_corrections RPC
003_reembed_tracking.sql  — corrections.reembedded_at 컬럼 추가
```

파일 위치: `supabase/migrations/`

---

## 7. 트러블슈팅

### 빌드 실패
- `next build`를 로컬에서 먼저 실행하여 에러 확인
- Node.js 버전: 18.x 이상 필요

### API 타임아웃
- `vercel.json`에서 `maxDuration: 30`으로 설정됨 (Hobby 플랜 최대)
- Pro 플랜에서는 최대 300초까지 가능

### 환경변수 누락
- Vercel 배포 로그에서 `GOOGLE_GENERATIVE_AI_API_KEY` 관련 에러 확인
- 환경변수 추가 후 **Redeploy** 필요
