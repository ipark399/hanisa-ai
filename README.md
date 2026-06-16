# CIMB CFO Agent — PoC v2 Build Workspace

- **Reference**: `goals/architecture-v2.md` (definitive) + `goals/demo-storyboard-v2.md`
- **D-Day**: 2026-07-11
- **Session**: ws-140

이 폴더는 CIMB CFO Agent for SMEs v2 PoC의 **구현 산출물** 작업장입니다.

## 폴더 구조

```
workspace/w04/
├── README.md                                   ← 이 파일
├── supabase/
│   └── migrations/
│       └── 0001_initial_schema.sql             ← 25 테이블 + 46 ENUM
├── scripts/
│   ├── generate_synthetic.py                   ← (다음 단계) Ahmad 12개월 합성
│   └── load_catalog.py                         ← (다음 단계) products.json → DB
└── web/                                        ← Next.js 앱
    ├── package.json
    ├── tsconfig.json
    ├── next.config.js
    ├── .env.local.example
    ├── app/                                    ← Next.js App Router 페이지
    │   ├── layout.tsx
    │   ├── page.tsx                            ← 데모 메인 (좌측 phone + 우측 context)
    │   └── api/
    │       ├── chat/route.ts                   ← LLM + tool 호출
    │       ├── triggers/route.ts               ← Monday/FX/FlexiCash 트리거 평가
    │       └── action/route.ts                 ← Lock/Apply/Decline 처리
    └── lib/
        ├── supabase.ts                         ← DB 클라이언트
        ├── anthropic.ts                        ← LLM 클라이언트 (with caching)
        ├── tools/                              ← 22개 tool 함수 정의
        │   ├── index.ts                        ← tool 카탈로그 export
        │   ├── balance.ts                      ← get_current_balance, get_account_list
        │   ├── transactions.ts                 ← get_recent_transactions
        │   ├── scheduled.ts                    ← get_scheduled_payments
        │   ├── forecasts.ts                    ← get_forecasted_payments, get_expected_inflows, get_cashflow_projection
        │   ├── credit.ts                       ← get_credit_limits, get_preapproved_offers
        │   ├── products.ts                     ← get_products_held, list_products_by_category, find_products_by_use_case, get_product_details, get_product_pricing
        │   ├── company.ts                      ← get_company_profile, get_seasonality, get_top_counterparties
        │   ├── triggers.ts                     ← check_monday_brief, check_fx_opportunity, check_flexicash_opportunity
        │   └── actions.ts                      ← record_user_action, record_learning_event
        ├── persona.ts                          ← System prompt 페르소나
        └── demo_state.ts                       ← 시연 시간/state 관리
```

## 인프라 설정 단계

### 1. Supabase 프로젝트 생성

1. https://supabase.com → New Project
   - Name: `cimb-cfo-agent-poc-v2`
   - Region: `ap-southeast-1` (Singapore) — 말레이시아 latency 최소
   - DB password: 안전한 곳에 보관
2. Project Settings → API
   - `SUPABASE_URL` 복사
   - `SUPABASE_ANON_KEY` 복사
   - `SUPABASE_SERVICE_ROLE_KEY` 복사 (백엔드 전용 — 절대 클라이언트에 노출 금지)

### 2. Schema 적용

```bash
# Supabase CLI 설치 (한 번)
brew install supabase/tap/supabase

# 프로젝트 link
cd workspace/w04
supabase link --project-ref <YOUR_PROJECT_REF>

# Schema 적용
supabase db push
```

또는 Supabase Dashboard SQL Editor에서 `supabase/migrations/0001_initial_schema.sql` 내용을 직접 실행.

### 3. Vercel 프로젝트 생성

1. https://vercel.com → New Project
   - GitHub repo 연결 (또는 Vercel CLI로 직접 deploy)
   - Root Directory: `workspace/w04/web`
   - Framework Preset: Next.js
2. Environment Variables:
   ```
   SUPABASE_URL=...
   SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ANTHROPIC_API_KEY=...
   ```
3. Deploy

### 4. Next.js 로컬 setup

```bash
cd workspace/w04/web
cp .env.local.example .env.local
# .env.local 편집 — 4개 값 채우기
npm install
npm run dev
# → http://localhost:3000
```

### 5. 합성 데이터 로드 (다음 단계 — Step 4)

```bash
cd workspace/w04/scripts
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 load_catalog.py    # products.json → bank_product_catalog + bank_product_pricing_daily
python3 generate_synthetic.py    # Ahmad 12개월치 + infer 결과
```

## 다음 구현 단계 (순서)

| # | 작업 | 산출물 | 위치 |
|---|---|---|---|
| 4 | Synthetic data 생성 | `scripts/generate_synthetic.py` 작성 + DB row 삽입 | `workspace/w04/scripts/` |
| 5 | 백엔드 구현 | tool 함수 22개 + API routes + Anthropic SDK 통합 | `workspace/w04/web/app/api/`, `workspace/w04/web/lib/` |
| 6 | 프론트 구현 | WhatsApp UI + 시연 controls + 우측 컨텍스트 패널 | `workspace/w04/web/app/` |

## 핵심 의존성

- **Node.js**: 20+
- **Python**: 3.11+ (합성 데이터 스크립트)
- **Next.js**: 15+
- **Supabase**: Postgres 15+
- **Anthropic SDK**: `@anthropic-ai/sdk` 0.30+
- **Vercel AI SDK**: `ai` + `@ai-sdk/anthropic` (프론트 useChat 용)

## 보안 노트

- `.env.local`은 절대 commit 금지 (`.gitignore` 처리)
- `SUPABASE_SERVICE_ROLE_KEY`는 백엔드 (API routes) 에서만 사용
- `SUPABASE_ANON_KEY`는 클라이언트 노출 OK (Row Level Security 가정)
- v1=ada 내부 데모이므로 RLS 강제 안 함. v2/vN으로 갈 때 RLS 추가 필수

## v1 (CIMB-01 ws-136) 빌드본과의 차이

`workspace/w03/` 은 v1 빌드 — 본 v2와 무관. 참고용으로만 유지. v2가 메인.
