# CIMB CFO Agent — Code Map and Integration Seams

**Audience.** The engineering team that will host this demo on its own platform, replace the front end, and possibly reconfigure the agent.
**Scope.** Where every file lives, what each one does, and exactly which contracts and seams you touch for (a) a new front end and (b) a changed agent.
**Ground truth.** Line counts and contracts were read from the code on 2026-09-17 at commit `1b5916a`. When this document and the code disagree, the code wins — then fix the document.

---

## 1. Repository map

```
w04/                                   lines  role
├── web/                                      Next.js 15 app (App Router). Everything runs here.
│   ├── app/
│   │   ├── page.tsx                    510   THE FRONT END. All UI state, storyboard driver,
│   │   │                                     Free-QA sender, button handler. Replace this.
│   │   ├── layout.tsx                   14   HTML shell.
│   │   ├── globals.css                 636   WhatsApp-style theme.
│   │   └── api/                              SERVER. Keep these; they are your integration surface.
│   │       ├── chat/route.ts            81   POST /api/chat     — the agent (LLM loop)
│   │       ├── action/route.ts          73   POST /api/action   — button side-effects (DB writes)
│   │       ├── reset-demo/route.ts      91   POST /api/reset-demo — wipe demo residue
│   │       └── triggers/route.ts        84   POST /api/triggers — debug only, UI never calls it
│   ├── components/                           Presentational pieces used by page.tsx only.
│   │   ├── Phone.tsx                    70   Chat column container
│   │   ├── MessageBubble.tsx            67   One bubble; renders `actions[]` as buttons
│   │   ├── FreeQAHistory.tsx            43   Free-QA turns list
│   │   ├── ContextPanel.tsx            134   Right panel, 3 zones
│   │   ├── SankeyTrace.tsx             265   Zone 3 — draws the step's SCRIPTED toolTrace
│   │   ├── ScenarioTabs.tsx             90   Act1 / Act2 / Free tabs
│   │   └── DemoControls.tsx             88   Next ▶, Jump, Reset Act, Reset All, Reset DB
│   ├── lib/                                  Server-side agent core (except demo_storyboard.ts)
│   │   ├── chat_loop.ts                272   runChat(): system prompt assembly, tool loop,
│   │   │                                     suggest_action whitelist, RM gate
│   │   ├── persona.ts                   56   System prompt text (tone, modes, rules)
│   │   ├── tool_schemas.ts             255   The 24 tool definitions the LLM sees
│   │   ├── anthropic.ts                 27   SDK client, MODEL_ID, prompt-cache helper
│   │   ├── supabase.ts                  39   DB client (service role) + the demo clock
│   │   ├── demo_storyboard.ts          576   CLIENT data: 8 scripted steps, per-step asOfIso
│   │   └── tools/                            23 handlers = what the LLM can actually do
│   │       ├── index.ts                 58   TOOL_HANDLERS registry + dispatchTool()
│   │       ├── balance.ts               48   get_current_balance, get_account_list
│   │       ├── transactions.ts          66   get_recent_transactions, get_scheduled_payments
│   │       ├── forecasts.ts            117   get_forecasted_payments, get_expected_inflows,
│   │       │                                 get_cashflow_projection
│   │       ├── credit.ts                46   get_credit_limits, get_preapproved_offers
│   │       ├── products.ts              67   5 catalog/pricing lookups
│   │       ├── company.ts               52   get_company_profile, get_seasonality, get_top_counterparties
│   │       ├── bloomberg.ts             69   get_bloomberg_market_context
│   │       ├── triggers.ts             153   check_monday_brief, check_fx_opportunity,
│   │       │                                 check_flexicash_opportunity
│   │       └── actions.ts              191   record_user_action, record_learning_event  (WRITE)
│   ├── tests/e2e/cimb-cfo-agent.spec.ts 210  Playwright, runs against the deployed URL
│   ├── playwright.config.ts             23
│   ├── package.json                     37
│   ├── next.config.js                   11
│   ├── tsconfig.json                    23
│   └── .env.local.example               12   Copy to .env.local
├── supabase/migrations/                      Postgres schema + data. Apply in number order.
│   ├── 0001_initial_schema.sql         728   25 tables, 33 enums
│   ├── 0002_seed_data.sql             2077   Synthetic 12-month history for one customer
│   ├── 0003_pending_rm_review_status.sql  5  Adds enum value pending_rm_review to 3 status types
│   ├── 0004_bloomberg_market_snapshots.sql 25  26th table + 2 seed snapshots (external market feed)
│   ├── 0005_shift_seed_timestamps.sql  294   Date shift +35 days, two-pass (park +10000, pull back)
│   ├── 0006_lafont_eur_currency_fix.sql 31   Domaine Lafont rows: currency MYR → EUR, amounts recomputed via fx_rate
│   ├── 0007_bloomberg_article_metadata.sql 26  Adds news_article_url, news_summary, news_published_at
│   ├── 0008_product_rate_updates.sql    56   FlexiCash 8.5 → 6.5, Working Capital 7.2 → 8.0,
│   │                                         Trade Bridging Loan removed, offer_terms updated
│   ├── 0009_wcf_rename_to_revolving_credit.sql 24  Display name "Working Capital Facility" →
│   │                                         "Revolving Credit (auto-enrollment)"; product_id unchanged
│   ├── 0010_shift_timestamps_plus_18d.sql 275  Date shift +18 days, two-pass
│   └── 0011_shift_timestamps_plus_14d.sql 282  Date shift +14 days, two-pass (current anchor: 2026-08-14)
└── scripts/
    ├── shift_demo_dates.mjs            160   Move every date in the DB by N days (two-pass)
    └── generate_synthetic.py          1532   Regenerate the seed from scratch
```

**Three facts that shape everything else**

1. `page.tsx` is the only file that knows the storyboard. The server does not know which step the demo is on unless the client tells it (`step_context`).
2. The server has no session store. `SESSION_ID` is a constant string in `page.tsx`; the DB holds exactly one customer's state.
3. Every DB read is filtered by a "demo clock" (`asOfIso`) that the client sends per request. Send the wrong clock and the agent reads the wrong month.

---

## 2. Runtime topology

```
 BROWSER (page.tsx)                          SERVER (web/app/api + web/lib)
 ─────────────────────────────               ─────────────────────────────────────────────
 [Next ▶]  ──renders STEPS[n]──────────────►  nothing. Scripted text never touches the server.
 [button]  ──STORYBOARD_ACTION_MAP──────────►  POST /api/action ─► record_user_action() ─► DB
 [text]    ──freeQAHistory + step_context──►  POST /api/chat   ─► runChat() ─► Claude ⇄ tools ⇄ DB
 [Reset DB]────────────────────────────────►  POST /api/reset-demo ─► DB
                                              DB = Supabase Postgres, 26 tables, service-role key
                                              LLM = Anthropic API, claude-opus-4-8, prompt cache
```

---

## 3. Server API contracts

All four are `POST`, JSON in, JSON out, no auth, no session. Errors return `{ "error": string }` with HTTP 400/500; in production builds `/api/chat` masks the message as `"internal_error"`.

### 3.1 `POST /api/chat` — talk to the agent

Request:

```jsonc
{
  "messages": [                       // REQUIRED. The conversation so far, oldest first.
    { "role": "user",      "content": "Has Café Lumière been late before?" },
    { "role": "assistant", "content": "…previous agent reply…" },
    { "role": "user",      "content": "show me their transactions" }
  ],
  "session_id": "demo_session_001",  // optional; only stamped onto bank_interactions rows
  "step_context": {                   // optional but in practice REQUIRED for correct answers
    "activeMode": "act1",             // "intro" | "act1" | "act2" | "free"
    "stepWithinAct": 1,               // omit in free mode
    "timeStamp": "Fri 14 Aug · 09:00",// display label; goes into the system prompt as-is
    "narrative": "Monday morning brief fires automatically.",
    "recentPushText": "Good morning, Mr. Bakri. …",   // the push currently on screen
    "asOfIso": "2026-08-14T01:00:00Z" // THE DEMO CLOCK. Tools filter lte(this date).
  }
}
```

Response:

```jsonc
{
  "reply": "Looking at Café Lumière's history, Mr. Bakri: …",   // final text. May be a canned RM-gate string.
  "tool_calls": [                                                // every tool the model ran, in order
    { "name": "get_expected_inflows", "input": { "days_ahead": 14 }, "result": { … } }
  ],
  "stop_reason": "end_turn",         // "end_turn" | "max_iterations"
  "actions": [                       // buttons the model asked for, ALREADY whitelisted server-side
    { "label": "Compare with limit order", "action_id": "show_alternatives", "variant": "secondary", "payload": null }
  ]
}
```

What the server does with it, in order (`chat/route.ts` → `chat_loop.ts`):

1. Pins `step_context.asOfIso` for the whole request (`runWithDemoAsOf`, `AsyncLocalStorage`). Absent → falls back to `DEMO_INITIAL_TIMESTAMP` env, then to a constant.
2. Inserts the last user message into `bank_interactions`.
3. Builds the system prompt: persona (cached) + demo timestamp + scenario block (if `step_context`) + "most recent push" block (if `recentPushText`).
4. Runs up to 6 model turns. `suggest_action` tool calls are intercepted and filtered against `ALLOWED_LLM_ACTIONS`; all other tools dispatch to `TOOL_HANDLERS` in parallel; results go back to the model as `tool_result` JSON.
5. On the final text, applies the RM gate: if a gated action (`accept_preapproved_offer`, `lock_fx_forward`) was emitted **and** the text claims completion or is boilerplate-only, the text is replaced by a fixed "tap the button, your RM will contact you" sentence.
6. Inserts the reply into `bank_interactions` and returns.

**Two rules the current client follows that a new client must keep**

- **History = Free-QA turns only.** Scripted push messages (rendered from `STEPS[n].newMessages`) are **not** included in `messages`. Including them made the model "remember" saying things it never generated. Instead, send the current push as `recentPushText`.
- **`asOfIso` = the active step's clock, every time.** Act 2 questions with an Act 1 clock read the wrong cashflow snapshot and contradict the storyboard.

### 3.2 `POST /api/action` — a button was tapped

Request:

```jsonc
{
  "action_type": "accept_preapproved_offer",   // "lock_fx_forward" | "accept_preapproved_offer" | "decline_offer" | other
  "referenced_entity_type": "preapproved_offer",
  "referenced_entity_id": "offer_flx_001",
  "details": { "product": "flexicash", "amount": 65000 },   // free-form; see per-action keys below
  "session_id": "demo_session_001",
  "as_of_iso": "2026-09-01T07:03:00Z"           // demo clock for the rows this writes
}
```

Response:

```jsonc
{
  "recorded": true,
  "action": {                                   // record_user_action() return value
    "recorded": true, "interaction_id": "int_…", "action_type": "accept_preapproved_offer",
    "activation_ref": "FLX-2026-9285", "approved_amount": 65000, "currency": "MYR", "interest_rate_pa": 6.5
  },
  "confirmation_message": "Request received. Reference: REQ-FLX-2026-9285. …"   // LLM-written; the current UI IGNORES it
}
```

Side effects by `action_type` (`lib/tools/actions.ts`):

| action_type | writes | notes |
|---|---|---|
| any | `bank_interactions` (1 row, `interaction_type` lock/apply/click) | always |
| `lock_fx_forward` | `bank_scheduled_payments` (1 row, `status = pending_rm_review`) | `details.amount_eur`, `details.rate`, `details.value_date` — defaults 8200 / 4.95 / 2026-08-23 |
| `accept_preapproved_offer` | `bank_preapproved_offers` → `accepted`; `bank_products_held` + `bank_credit_limits` (1 row each, `pending_rm_review`) | amount, currency and rate are read from the offer row (`offer_terms.interest_rate_pa`) |
| `decline_offer` | interaction row only | `confirmation_message` = one-sentence acknowledgement |

Nothing here is "activated". Every business row lands as `pending_rm_review`; the narrative is that a relationship manager finalises it.

### 3.3 `POST /api/reset-demo` — clean up between runs

No body. Response:

```jsonc
{ "reset": true, "offer_status_restored": true,
  "deleted": { "bank_products_held": 0, "bank_credit_limits": 1, "bank_scheduled_payments": 0,
               "bank_interactions": 21, "infer_user_preferences": 3, "infer_learning_events": 3 } }
```

Deletes rows whose ids start with `ph_flx_`, `cl_flx_`, `sched_fx_`, `int_`, `pref_`, `le_`; deletes any `pending_rm_review` row in three tables; sets `offer_flx_001` back to `open`. Seed rows (non-prefixed ids) are untouched. Idempotent — call it before every run.

### 3.4 `POST /api/triggers` — debug

`{ "trigger": "monday_brief" | "fx" | "flexicash" }` → `{ "fires": bool, "payload": {…}, "message": "…" }`. Evaluates one trigger and asks the model to phrase the push. **The UI does not call this**; the storyboard hard-codes the push text. It has no `asOfIso` plumbing, so it evaluates at the env-default clock. Useful for checking trigger logic, not for the demo.

---

## 4. What the front end owns today — reproduce or consciously drop

If you replace `page.tsx`, this is the behaviour that lives there and nowhere else:

| # | Behaviour | Where | Keep? |
|---|---|---|---|
| F1 | The 8-step script: text, timestamps, `asOfIso`, action buttons, right-panel content | `lib/demo_storyboard.ts` `STEPS[]` | Yes — this **is** the demo. Port the data, not the React. |
| F2 | Clock threading: send `STEPS[n].asOfIso` as `step_context.asOfIso` on every `/api/chat`, and as `as_of_iso` on `/api/action` | `page.tsx` `handleSendMessage`, `STORYBOARD_ACTION_MAP.apiCall` | Yes, non-negotiable |
| F3 | History policy: `messages` = Free-QA turns only; current push goes in `recentPushText` | `page.tsx` `freeQAHistory` | Yes |
| F4 | Button routing: `STORYBOARD_ACTION_MAP` maps 3 ids to (act, step, optional API call); any other `action_id` (i.e. model-suggested) becomes a Free-QA message `"Please walk me through: <label>."` | `page.tsx` `handleAction` | Yes for the 3 mapped ids; the fallback phrasing is yours to improve |
| F5 | Rendering `actions[]` from `/api/chat` as tappable buttons inside the reply bubble | `MessageBubble.tsx` | Yes, or model-suggested buttons vanish |
| F6 | Disabling a button after one tap | `page.tsx` `disabledActions` | Recommended; the server does not de-duplicate |
| F7 | Reset Act / Reset All (client state) and Reset DB (`/api/reset-demo`) | `DemoControls.tsx` | Reset DB yes; the other two are client concerns |
| F8 | Right panel Zone 3 "Tool & DB Trace" — drawn from `STEPS[n].toolTrace`, a **scripted** array. The real `tool_calls[]` from `/api/chat` is not used | `SankeyTrace.tsx` | Your call. Wiring it to the real `tool_calls[]` would make it honest. |
| F9 | `SESSION_ID = "demo_session_001"` constant | `page.tsx` | Replace with a per-viewer id if two people may demo at once — but note the DB still holds one customer's state, so concurrent runs will still collide on `reset-demo` and pending rows |

The storyboard action map, verbatim:

```ts
lock_fx_forward          → act1, step 3, POST /api/action { action_type, referenced_entity_id: "fx_opp_eval_2026-08-14",
                                                             details: { amount_eur: 8200, rate: 4.95, value_date: "2026-08-23" } }
accept_preapproved_offer → act2, step 3, POST /api/action { referenced_entity_id: "offer_flx_001", details: { product: "flexicash", amount: 65000 } }
show_loan_options        → act2, step 2, no API call
```

---

## 5. Agent configuration seams (server side)

Everything the agent *is* sits in five files under `web/lib/`. They are deliberately plain: no framework, no abstraction layer, one SDK call.

### 5.1 `persona.ts` — what the agent is like

One exported string, 56 lines, cached as a prompt prefix. Sections: Tone and Style · Push vs Pull · Tool Use · Recommendation Rules · Compliance · Learning Behaviour · Identity. Edit text, redeploy.

Caution: several behaviours the demo relies on are enforced **only** here — "paraphrase, ask, commit only after the user confirms", the "Informational. Subject to product terms and approval." footer, "do not invent figures". Five attempts to add stricter rules regressed other answers and were rolled back; change one rule at a time and re-run the scripted questions in `docs/demo/`.

### 5.2 `tool_schemas.ts` + `tools/index.ts` + `tools/*.ts` — what the agent can do

Three places must agree on a tool's name:

```
tool_schemas.ts   { name: 'get_x', description, input_schema }   ← the model sees this
tools/index.ts    TOOL_HANDLERS = { get_x, … }                    ← name → function
tools/<file>.ts   export async function get_x(args) { … }         ← does the work
```

**Recipe — add a tool.** (1) Write the handler in the right `tools/*.ts`; read the clock with `getDemoCurrentTimestamp()` and filter `lte(asOf)`. (2) Register it in `TOOL_HANDLERS`. (3) Add its schema to `TOOL_SCHEMAS`. Return plain JSON; the loop serialises it for the model. Throwing is safe — `dispatchTool` returns `{ error: "tool_execution_failed" }` to the model instead of crashing the request.

**Recipe — remove a tool.** Delete the schema entry. The handler can stay; the model cannot call what it cannot see.

Special cases: `suggest_action` has a schema but no handler — `chat_loop.ts` intercepts it. `record_user_action` and `record_learning_event` **write**; the model can call them. If your platform must not let the model write, remove their schemas and keep the writes behind `/api/action`.

### 5.3 `chat_loop.ts` — how a turn runs

Knobs, with current values:

| knob | value | line |
|---|---|---|
| `MAX_TOOL_LOOPS` | 6 | 12 |
| `max_tokens` per model call | 2048 | 161 |
| `ALLOWED_LLM_ACTIONS` — action ids the model may put on a button | 12 ids | 56 |
| `GATED_ACTIONS` — ids that trigger the RM gate | `accept_preapproved_offer`, `lock_fx_forward` | 186 |
| `COMPLIANCE_ONLY`, `DANGEROUS_COMPLETION` — the gate's regexes | tuned to Claude's phrasing | 190–191 |
| canned RM reply | "Sure, Mr. Bakri — tap **{label}** below …" | 196 |
| system block assembly | `buildSystemBlocks()` | 94 |

**Recipe — allow a new model-suggested button.** Add the id to `ALLOWED_LLM_ACTIONS`; teach the front end what tapping it does (F4). Nothing else.

**Recipe — change what the model is told about the scenario.** Edit `buildSystemBlocks()`. The "Demo Scenario Context" and "Most Recent Push" blocks are built from `step_context`, so the front end controls their content without a server change.

### 5.4 `anthropic.ts` — which model, which provider

`MODEL_ID = 'claude-opus-4-8'`, `cacheControl()` marks the persona block for prompt caching. Five files import the SDK: this one, `chat_loop.ts`, `tool_schemas.ts` (types only), `api/action/route.ts`, `api/triggers/route.ts`.

**Recipe — move to Bedrock or another provider.** Two layers. Layer 1 is mechanical (~1 day): replace the client, map `system`/`tools`/`tool_use`/`tool_result` to the target's shapes, drop `cache_control`. Layer 2 is behavioural and open-ended: the persona and the two gate regexes were tuned against Claude's output. Re-run every scripted question in `docs/demo/` and expect to re-tune.

### 5.5 `supabase.ts` — where data lives, what time it is

Creates the `@supabase/supabase-js` client with the **service-role** key (bypasses RLS — server only). Exposes `runWithDemoAsOf()` / `getDemoCurrentTimestamp()` — the demo clock — and `DEMO_CUSTOMER_ID` (`ahmad_01`).

**Recipe — move to your own Postgres.** 14 files import this client and use the PostgREST query builder (`.from().select().eq().lte().order()`). Options: (a) run PostgREST in front of your Postgres and keep the code; (b) rewrite the 23 handlers against `pg`/Prisma — they are short and uniform (read clock → filter → return JSON). Keep `runWithDemoAsOf` regardless; it is the mechanism that makes a scripted demo consistent.

**Known defect here.** Line 36 uses `??`, so an env var set to an empty string is *not* treated as missing and the clock becomes `""`. Either unset the var or change `??` to `||`.

---

## 6. Environment

| variable | required | used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `supabase.ts` (throws if missing) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | `supabase.ts` (throws if missing) |
| `ANTHROPIC_API_KEY` | yes | `anthropic.ts` (throws if missing) |
| `DEMO_CUSTOMER_ID` | no, default `ahmad_01` | `supabase.ts` |
| `DEMO_INITIAL_TIMESTAMP` | no, default in code | `supabase.ts` — fallback clock when the client sends none |
| `NEXT_PUBLIC_DEMO_MODE` | no | not read by the app |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | not read by the app |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | no | `scripts/` only, never the app |

---

## 7. Gotchas you will hit in the first week

1. **The Sankey panel is scripted** (F8). Don't demo it as "live tool calls" unless you wire it to `tool_calls[]`.
2. **The model can write.** `record_user_action` is callable by the model; the RM gate changes the reply text, not the tool call. Rows land as `pending_rm_review`, so nothing is "executed", but audit it.
3. **The RM gate regexes are Claude-specific.** A different model's phrasing may slip past or trip them.
4. **One shared session, one customer.** Two simultaneous demos overwrite each other's pending rows and reset each other.
5. **Playwright asserts display dates** (`Jul …`) from an earlier data shift; 6 of 9 tests fail until the assertions read from `STEPS[]`.
6. **Data is dated.** Every table is anchored to Act 1 = 2026-08-14 / Act 2 = 2026-09-01. `scripts/shift_demo_dates.mjs <days>` moves it; the four code files that carry literal dates are listed in `docs/04-runbook.md`.
7. **The `/api/action` confirmation text costs one model call the UI throws away.** Delete the call or use the text.
