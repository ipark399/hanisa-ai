# CIMB CFO Agent — 배포 셋업 체크리스트

생성일: 2026-06-16 (Metis ws-140)
Supabase + Vercel 환경은 hanisa-ai 프로젝트 재활용 (Free 플랜 2개 제한).
GitHub 신규 리포: `ipark399/cimb-cfo-agent`

---

## ✅ 자동 처리 완료 (이 세션에서)

- [x] `.gitignore` (workspace/w04/) — node_modules·.env·.next 등 제외
- [x] `web/.env.local` — Supabase 키 hanisa-ai에서 복사 + ANTHROPIC_API_KEY placeholder
- [x] 25 테이블 schema SQL (`supabase/migrations/0001_initial_schema.sql`)
- [x] Seed data SQL (`supabase/migrations/0002_seed_data.sql`)
- [x] Next.js 앱 코드 (web/) — 14 lib + 4 components + 3 API routes + 1 page
- [x] Synthetic data generator (`scripts/generate_synthetic.py`)

---

## 🔲 사용자가 직접 처리해야 할 단계

### 1️⃣ 한의학 데이터 백업 (선택)

Supabase Dashboard → 한의사 프로젝트 → SQL Editor:

```sql
-- 한의사 테이블 목록 확인
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- 각 테이블을 CSV로 export (UI 우측 상단 "Download" 버튼)
SELECT * FROM <한의사_테이블>;
```

또는 Settings → Database → Backups → "Download backup"

### 2️⃣ Supabase 프로젝트 이름 변경 + DB 초기화

**A. 이름 변경**
1. https://supabase.com/dashboard → hanisa-ai 프로젝트 선택
2. Settings → General → Project Name
3. `hanisa-ai` → `cimb-cfo-agent` 저장
4. (URL/키는 그대로 — `dcjwbpsjdxrmkbzsflil.supabase.co`)

**B. 기존 한의사 테이블 DROP**

Dashboard → SQL Editor:
```sql
-- 1) 기존 테이블 목록 확인
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- 2) 한의사 테이블 전부 drop (예시 — 실제 이름은 위 결과 따라)
DROP TABLE IF EXISTS public.qa_pairs CASCADE;
DROP TABLE IF EXISTS public.corrections CASCADE;
DROP TABLE IF EXISTS public.documents CASCADE;
-- ... 기타 모든 한의사 테이블

-- 3) pgvector 확장은 그대로 둬도 됨 (CIMB는 사용 안 하지만 충돌 없음)

-- 4) 확인 — 빈 schema 인지 체크
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

**C. CIMB schema 적용**

Dashboard → SQL Editor에 한 번에 붙여넣기:
```
workspace/w04/supabase/migrations/0001_initial_schema.sql 전체 내용 (728줄)
```
→ Run

**D. Seed data 적용**

```
workspace/w04/supabase/migrations/0002_seed_data.sql 전체 내용 (2077줄, 0.4MB)
```
→ Run

성공하면 25 테이블 + 데이터 (Ahmad, 201 거래, 372 잔액, 1119 fx 등) 모두 적재됨.

검증 SQL:
```sql
SELECT 'bank_transactions' as t, count(*) FROM bank_transactions
UNION ALL SELECT 'bank_balances_daily', count(*) FROM bank_balances_daily
UNION ALL SELECT 'bank_fx_rates', count(*) FROM bank_fx_rates
UNION ALL SELECT 'infer_counterparties', count(*) FROM infer_counterparties
UNION ALL SELECT 'bank_product_catalog', count(*) FROM bank_product_catalog;
```
→ 201 / 372 / 1119 / 16 / 17 나와야 함

### 3️⃣ Anthropic API 키 발급

1. https://console.anthropic.com → API Keys → "Create Key"
2. 키 복사
3. `workspace/w04/web/.env.local` 열어서 `REPLACE_WITH_YOUR_ANTHROPIC_API_KEY` 자리에 붙여넣기

### 4️⃣ GitHub 리포 생성

1. https://github.com/new
2. Repository name: `cimb-cfo-agent`
3. Owner: `ipark399`
4. Visibility: Private (권장 — 내부 PoC)
5. 빈 리포로 생성 (README/license/gitignore 모두 체크 해제)

### 5️⃣ 로컬 git 초기 commit + push

```bash
cd /Users/inkyupark/Documents/ai_project/ada_projects/CIMB/workspace/w04

# Git 초기화 (한 번만)
git init
git branch -M main

# 모든 파일 추가 (.env.local은 .gitignore 처리되어 자동 제외)
git add .
git status   # ← 여기서 .env.local이 없음을 확인 (중요)

# 커밋 (Vercel 배포 위해 이메일 inkyupark7@gmail.com 일치 필요)
git config user.email "inkyupark7@gmail.com"
git config user.name "Inkyu Park"

git commit -m "Initial commit: CIMB CFO Agent PoC v2

- 25 tables (15 bank + 10 infer)
- 22 tool functions for agent
- 8-step demo storyboard
- WhatsApp-style chat UI
- Anthropic Claude opus-4-8 + Supabase + Next.js
"

# Remote 등록 + push
git remote add origin git@github.com:ipark399/cimb-cfo-agent.git
git push -u origin main
```

> SSH 인증 안 되면 HTTPS:
> `git remote add origin https://github.com/ipark399/cimb-cfo-agent.git`

### 6️⃣ Vercel 프로젝트 셋업 (옵션 A — hanisa-ai 재활용 / 옵션 B — 신규)

**옵션 A — hanisa-ai 프로젝트 이름 변경 (재활용)**:
1. https://vercel.com/dashboard → hanisa-ai 프로젝트
2. Settings → General → Project Name → `cimb-cfo-agent`
3. Settings → Git → Connected Git Repository → 기존 ipark399/hanisa-ai 연결 해제 → `ipark399/cimb-cfo-agent` 새로 연결
4. Settings → General → Root Directory → `workspace/w04/web` 로 설정 (ada_projects/CIMB 안에서 빌드)

> ⚠️ **문제**: 이 repo는 ada_projects/CIMB 하위라 GitHub repo 루트가 workspace/w04 입니다. Vercel Root Directory를 `web`으로 설정.

**옵션 B — hanisa-ai 삭제 후 신규 (깔끔)**:
1. hanisa-ai Vercel 프로젝트 Settings → 하단 "Delete Project" → 삭제
2. Vercel Dashboard → "Add New Project" → `ipark399/cimb-cfo-agent` import
3. Root Directory: `web`
4. Framework Preset: Next.js (자동 인식)

### 7️⃣ Vercel 환경변수 등록

Settings → Environment Variables, 4개 추가 (Production + Preview + Development 모두 체크):

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://dcjwbpsjdxrmkbzsflil.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (hanisa-ai .env.local에서 복사) |
| `SUPABASE_SERVICE_ROLE_KEY` | (hanisa-ai .env.local에서 복사) |
| `ANTHROPIC_API_KEY` | (4번에서 발급한 키) |

추가 (선택):
| `DEMO_INITIAL_TIMESTAMP` | `2026-06-08T01:00:00Z` |
| `DEMO_CUSTOMER_ID` | `ahmad_01` |
| `NEXT_PUBLIC_DEMO_MODE` | `true` |

### 8️⃣ 로컬 첫 실행

```bash
cd workspace/w04/web
npm install
npm run dev
# → http://localhost:3000
```

체크:
- [ ] 좌측 phone에 비어있는 채팅 표시
- [ ] 우측 Context Panel 표시
- [ ] 하단 [Next ▶] 버튼 클릭 → Step 1 (Monday brief) 표시
- [ ] [Next] 또 클릭 → Step 2 (FX trigger) 표시
- [ ] [Lock now] 버튼 클릭 → Step 4 (confirmation) 표시
- [ ] 자유 입력 "What's my balance?" → Claude 응답 (LLM 호출)

### 9️⃣ Vercel 배포 검증

main branch push 직후:
- [ ] Vercel build log 성공 확인
- [ ] `https://cimb-cfo-agent.vercel.app` 접속 → 같은 흐름 동작 확인
- [ ] Settings → Functions → Logs에서 LLM 호출 에러 없는지

### 🔟 인프라 문서 갱신

`docs/infra/supabase.md` + `docs/infra/vercel.md`에서:
- `hanisa-ai` → `cimb-cfo-agent` 갱신
- Pages·URL 변경 반영

(이 세션 이후 별도 단계 — 다음 세션에서 핸드오프 시 함께)

---

## 문제 해결 가이드

### Supabase SQL 적용 실패
- 한의사 테이블이 다른 테이블에서 참조될 경우 `CASCADE` 사용
- pgvector 확장이 충돌하면 무시 가능 (CIMB는 사용 안 함)

### Vercel 빌드 실패
- Root Directory 잘못 설정 (`workspace/w04/web` 또는 `web` 둘 중 하나)
- 환경변수 누락 확인 — Vercel → Functions → Logs

### LLM 응답 안 옴
- ANTHROPIC_API_KEY 확인
- Claude opus-4-8 모델 access 확인 (anthropic console)

### Lock/Apply 버튼 효과 없음
- `bank_interactions` 테이블에 row 추가되는지 Supabase Table Editor에서 확인
- 브라우저 콘솔 (F12) Network 탭에서 `/api/action` 응답 확인

---

## 다음 세션 (배포 후)

- 시연 dry-run + ada Solutioning 정렬 콜
- 청중 Q&A 시뮬레이션
- D-Day 2026-07-11 까지 26일 — 시간 여유 있음
