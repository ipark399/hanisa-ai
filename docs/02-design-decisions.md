# CIMB CFO Agent — Design Decisions

---

## 1. Why this shape fits a bank

The one-line version: **the model does the talking, the code enforces the rules, and a person makes the decision.** Banks do not ask an AI system to be clever; they ask where a number came from, what stops it from acting alone, and who is accountable when it speaks. This build answers those three questions in its structure, not in its prompt.

| What a bank requires | How the build answers | Where to look |
|---|---|---|
| **Every figure traces to a system of record** | The model never produces a number itself. All 23 tool handlers read rows from the database and return them; the model reasons over what it was handed. Each turn returns `tool_calls[]` — the tools it ran, with inputs and results — so the chain from answer back to data is visible. | `lib/tools/*.ts` · persona "Do not invent figures" · `/api/chat` response |
| **Bank-owned facts and machine inferences are kept apart** | Fifteen `bank_*` tables hold what core banking would own (transactions are immutable; corrections are reversal rows). Ten `infer_*` tables hold what the agent derived, and every derived row carries `confidence`, `inferred_by`, `inferred_at` and `evidence_source`. An auditor can ask "where did this come from" of any figure and get a column, not a conversation. | `supabase/migrations/0001_initial_schema.sql` |
| **The system cannot execute a transaction** | There is no execution path. A Lock or an Apply writes a row whose status is `pending_rm_review`; a relationship manager finalises it outside the agent. If the model's reply claims completion ("activated", an invented reference number), a code gate replaces the sentence with a fixed "your RM will contact you" message. The build removed a model-written confirmation for FX locks after it fabricated reference numbers. | `lib/tools/actions.ts` · `lib/chat_loop.ts` RM gate · `app/api/action/route.ts` |
| **It informs; it does not advise** | The persona forbids definitive language ("you should", "the best product"), frames every recommendation as an option for consideration, and closes product messages with "Informational. Subject to product terms and approval." This follows Bank Negara Malaysia's informational-guidance norms. | `lib/persona.ts` §Compliance, §Recommendation Rules |
| **Products are matched to the customer's tier** | Each catalogue product carries the SME maturity tier range it is designed for (1–5, CIMB's SME maturity model). The customer's inferred tier (4) filters the recommendation set before the model sees it, so a product outside the band is never offered. This is a suitability control implemented as a query filter, not as a prompt instruction. | `bank_product_catalog.min/max_complexity_level` · `find_products_by_use_case` |
| **Learning about the customer leaves a consent trail** | When the customer states a preference, the agent paraphrases, asks, and records only after confirmation. The record lands in an audit table with a `confirmed_by_user` flag and the interaction it came from, and the schema carries a `reverted_at` for withdrawal. | `infer_learning_events` · `infer_user_preferences` · persona §Learning Behaviour |
| **The bank decides when the agent speaks first** | Proactive messages fire on thresholds written in code, not on the model's judgement: an FX alert needs a forecast within 14 days *and* a rate at least 2.0 % better than the 90-day average; a credit alert needs a projected balance dip *and* an open pre-approved offer. Conduct rules about unsolicited contact live where compliance can read them. | `lib/tools/triggers.ts` |
| **Model risk can be reviewed** | No framework, no abstraction layer. The agent's behaviour is 610 lines across five files — persona, tool definitions, the loop, the model client, the data client. A risk function can read all of it. Changing the model touches five files; changing what the agent may say touches one. | `lib/persona.ts`, `tool_schemas.ts`, `chat_loop.ts`, `anthropic.ts`, `supabase.ts` |
| **Behaviour can be replayed** | Every scripted step carries its own timestamp, and the server pins that timestamp for the whole request. The same question on the same step reads the same data, today or in six months, which is what a reviewer needs to reproduce an answer. | `demo_storyboard.ts` `asOfIso` · `supabase.ts` `runWithDemoAsOf` |

### The principle

> **Tone belongs in the prompt. Rules belong in code.**

Concretely: the persona decides how the agent addresses the customer and how it phrases an option; the code decides which buttons may appear (an allow-list of twelve action ids), what a completion claim looks like (two regular expressions), what time it is (a per-request clock), and what status a written row may have (`pending_rm_review`, always). A probabilistic layer is never the last line of defence for a regulated behaviour. This is the first decision to carry into any re-implementation.
