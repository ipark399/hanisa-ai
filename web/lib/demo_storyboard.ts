// 8-step demo storyboard split into 2 Acts.
// Reference: goals/demo-storyboard-v2.md + REQ-CIMB-02 (ws-152) area 1.
//
// Acts:
//   intro (Step 0)         — Pre-demo setup. Shared.
//   act1  (Step 1–4)       — FX Hero: Monday Brief → FX Trigger → Hedge Pull → Lock FX Forward
//   act2  (Step 5–8)       — FlexiCash + Learning: 3-week jump → Trigger → Loan Pull → Apply → Learning
//
// Message accumulation policy (REQ-CIMB-02 #2 dependant):
//   - Act 1 in progress  → Act 1 step messages up to current stepWithinAct
//   - Act 2 in progress  → Act 1 ALL messages + Act 2 step messages up to current stepWithinAct
//   - "Reset All" clears everything; "Reset Act" only rewinds the current Act
//   - Free mode does not consume storyboard messages

export type BubbleSide = 'self' | 'other' | 'system';
export type ActId = 'intro' | 'act1' | 'act2';
export type ActiveMode = ActId | 'free';

export interface DemoMessage {
  id: string;
  side: BubbleSide;
  text: string;
  time: string;
  intel?: boolean;
  actions?: { label: string; actionId: string; variant?: 'primary' | 'secondary' | 'danger' }[];
  step: number;
}

export interface ContextSection {
  label: string;
  rows?: { k: string; v: string }[];
  lines?: string[];
  pre?: string;
}

// Tool & DB Trace (REQ-CIMB-02 area 2 — Sankey visualization).
// Each step describes the LLM's "Read → Reason → Write" sequence so the
// SankeyTrace component can render it as a left-to-right flow.
export interface ToolTraceEntry {
  phase: 'read' | 'reason' | 'write';
  table?: string;           // for read/write phases — bank_/infer_ prefix
  rowsRead?: number;        // for read phase
  rowsWritten?: number;     // for write phase
  reasoning?: string;       // for reason phase — short description
  toolCall?: string;        // optional — tool function signature for context
  rowPreview?: Record<string, unknown>[]; // top-3 sample rows for Row Preview toggle (PRD §7 D6.5 정합)
}

export interface DemoStep {
  step: number;
  act: ActId;
  stepWithinAct: number;
  timeStamp: string;
  // asOfIso (ws-160): UTC ISO timestamp the chat backend should treat as "now"
  // when this step is active. Threads into tools via AsyncLocalStorage so that
  // get_cashflow_projection, check_flexicash_opportunity, etc. see the right
  // snapshot for Act 2 (Fri 31 Jul) instead of always reading Act 1 (Mon 13 Jul)
  // data. KL is UTC+8 — Mon 13 Jul 09:00 KL = 2026-07-13T01:00:00Z.
  asOfIso: string;
  narrative: string;
  newMessages: DemoMessage[];
  context: ContextSection[];
  toolTrace?: ToolTraceEntry[]; // Sankey input — undefined/empty = no trace this step
}

export function getMaxStepForAct(act: ActId): number {
  if (act === 'intro') return 0;
  const stepsInAct = STEPS.filter((s) => s.act === act).map((s) => s.stepWithinAct);
  return stepsInAct.length > 0 ? Math.max(...stepsInAct) : 0;
}

export const STEPS: DemoStep[] = [
  {
    step: 0,
    act: 'intro',
    stepWithinAct: 0,
    timeStamp: 'Sun 12 Jul · 22:00',
    asOfIso: '2026-07-13T01:00:00Z',
    narrative: 'Pre-demo setup. Ahmad about to start his Monday morning.',
    newMessages: [],
    context: [
      {
        label: 'Demo state',
        rows: [
          { k: 'Customer', v: 'ahmad_01' },
          { k: 'Persona', v: 'Mr. Ahmad Bakri' },
          { k: 'Company', v: 'Sunrise Trading Sdn Bhd' },
          { k: 'Complexity', v: 'Level 3-4' },
          { k: 'Current balance (MYR)', v: '52,300' }
        ]
      }
    ]
  },
  {
    step: 1,
    act: 'act1',
    stepWithinAct: 1,
    timeStamp: 'Mon 13 Jul · 09:00',
    asOfIso: '2026-07-13T01:00:00Z',
    narrative: 'Monday morning brief fires automatically.',
    newMessages: [
      {
        id: 'msg_001',
        side: 'other',
        intel: true,
        time: '09:00',
        text:
`Good morning, Mr. Bakri.

This week's snapshot: net inflow MYR 42K, outflow MYR 38K. One invoice (Café Lumière, MYR 8.5K) is 4 days overdue. EUR/MYR moved 1.3% in your favour over the weekend.`,
        step: 1
      }
    ],
    context: [
      {
        label: 'Trigger evaluation',
        rows: [
          { k: 'Tool', v: 'check_monday_brief()' },
          { k: 'Result', v: 'TRUE' },
          { k: 'Last brief', v: '7 days ago' }
        ]
      },
      {
        label: 'Data sources',
        lines: [
          'get_cashflow_projection(horizon_days=7) → inflow 42K / outflow 38K',
          'get_expected_inflows(days_ahead=14) → 1 overdue: Café Lumière MYR 8.5K (4d)',
          'bank_fx_rates EUR/MYR last 3 days → +1.3%'
        ]
      },
      {
        label: 'Confidence',
        rows: [
          { k: 'Cashflow forecast', v: '0.84' },
          { k: 'Overdue inflow', v: '0.91' }
        ]
      }
    ],
    toolTrace: [
      { phase: 'read', table: 'bank_interactions', rowsRead: 1, toolCall: 'check_monday_brief()', rowPreview: [{ last_brief_at: '2026-07-06', customer_id: 'ahmad_01' }] },
      { phase: 'read', table: 'infer_cashflow_projection', rowsRead: 1, toolCall: 'get_cashflow_projection(horizon_days=7)', rowPreview: [{ inflow_myr: 42000, outflow_myr: 38000, horizon_days: 7 }] },
      { phase: 'read', table: 'infer_expected_inflows', rowsRead: 1, toolCall: 'get_expected_inflows(days_ahead=14)', rowPreview: [{ counterparty: 'Cafe Lumiere', amount_myr: 8500, days_overdue: 4 }] },
      { phase: 'read', table: 'bank_fx_rates', rowsRead: 3, toolCall: 'get_fx_rate_history(pair=EUR/MYR, days=3)', rowPreview: [{ pair: 'EUR/MYR', delta_pct: 1.3, period: '3d' }] },
      { phase: 'reason', reasoning: 'Weekly brief composer — combine net flow + overdue + FX summary into a single intel message.' },
      { phase: 'write', table: 'bank_interactions', rowsWritten: 1, reasoning: 'brief sent (direction=agent_to_user, type=brief_intel)' }
    ]
  },
  {
    step: 2,
    act: 'act1',
    stepWithinAct: 2,
    timeStamp: 'Mon 13 Jul · 10:30',
    asOfIso: '2026-07-13T02:30:00Z',
    narrative: 'FX trigger fires. EUR payment forecasted, rate is favourable.',
    newMessages: [
      {
        id: 'msg_002',
        side: 'other',
        intel: true,
        time: '10:30',
        text:
`Based on your monthly pattern, an EUR payment of about MYR 38K looks due in the next 9 days. EUR/MYR is currently 2.8% better than your 90-day average.

Market context: EUR softened after ECB dovish remarks (Bloomberg). Current rate sits in the top 15% of the 90-day range.

Lock the rate now?`,
        actions: [
          { label: 'Lock now', actionId: 'lock_fx_forward', variant: 'primary' }
        ],
        step: 2
      }
    ],
    context: [
      {
        label: 'Trigger evaluation',
        rows: [
          { k: 'Tool', v: 'check_fx_opportunity()' },
          { k: 'Result', v: 'TRUE' },
          { k: 'Reason', v: 'rate_favourable_and_forecast_near' }
        ]
      },
      {
        label: 'Forecast (from infer_forecasted_payments)',
        rows: [
          { k: 'Counterparty', v: 'Domaine Lafont (FR, wine)' },
          { k: 'Expected date', v: '2026-07-22 (D+9)' },
          { k: 'Amount mean', v: 'EUR 8,200' },
          { k: 'Method', v: 'recurring_pattern' },
          { k: 'Confidence', v: '0.89' }
        ]
      },
      {
        label: 'FX (from bank_fx_rates)',
        rows: [
          { k: 'Pair', v: 'EUR/MYR' },
          { k: 'Current mid', v: '4.9528' },
          { k: '90-day avg', v: '4.8194' },
          { k: 'Δ', v: '+2.8%' }
        ]
      },
      {
        label: 'Computation',
        pre: 'saving ≈ 8200 × (4.9528 - 4.8194) = MYR 1,094\n(less forward spread ≈ MYR 79)\nnet saving ≈ MYR 1,015'
      }
    ],
    toolTrace: [
      { phase: 'read', table: 'infer_forecasted_payments', rowsRead: 1, toolCall: 'get_forecasted_payments(currency=EUR, days_ahead=30)', rowPreview: [{ counterparty: 'Domaine Lafont', amount_eur: 8200, due_date: '2026-07-22', confidence: 0.89 }] },
      { phase: 'read', table: 'bank_fx_rates', rowsRead: 90, toolCall: 'get_fx_rate_history(pair=EUR/MYR, days=90)', rowPreview: [{ pair: 'EUR/MYR', mid: 4.9528, ninety_day_avg: 4.8194, delta_pct: 2.8 }] },
      { phase: 'read', table: 'bank_product_pricing_daily', rowsRead: 1, toolCall: 'get_product_pricing(product=fx_forward_v1, days=30)', rowPreview: [{ product_id: 'fx_forward_v1', forward_bps: 25, tenor_days: 30 }] },
      { phase: 'read', table: 'bloomberg_market_snapshots', rowsRead: 1, toolCall: "get_bloomberg_market_context(fx_pair='EUR/MYR')", rowPreview: [{ headline: 'EUR softens after ECB dovish remarks', percentile_90d: 85, range_position: 'top 15%' }] },
      { phase: 'reason', reasoning: 'check_fx_opportunity → TRUE: rate +2.8% vs 90d avg AND payment within 9 days; Bloomberg: ECB dovish, top 15% of 90d range. Net saving ≈ MYR 1,015.' },
      { phase: 'write', table: 'bank_interactions', rowsWritten: 1, reasoning: 'trigger event (type=fx_trigger_eval, result=fired)' }
    ]
  },
  {
    step: 3,
    act: 'act1',
    stepWithinAct: 3,
    timeStamp: 'Mon 13 Jul · 10:33',
    asOfIso: '2026-07-13T02:33:00Z',
    narrative: 'Mr. Bakri taps "Lock now" → FX Forward request submitted for RM review.',
    newMessages: [
      {
        id: 'msg_005',
        side: 'system',
        time: '10:33',
        text: '✓ You tapped: Lock now',
        step: 3
      },
      {
        id: 'msg_006',
        side: 'other',
        time: '10:33',
        text:
`Request received. Reference: **REQ-FXFW-2026-7142**. Your RM will contact you within 24 hours to finalize.

Estimated saving **MYR 1,064** vs spot.`,
        step: 3
      }
    ],
    context: [
      {
        label: 'Action',
        rows: [
          { k: 'Type', v: 'lock_fx_forward' },
          { k: 'Reference', v: 'REQ-FXFW-2026-7142' },
          { k: 'Locked rate', v: '4.95' },
          { k: 'Amount EUR', v: '8,200' },
          { k: 'Value date', v: '2026-07-22' },
          { k: 'Status', v: 'pending_rm_review' }
        ]
      },
      {
        label: 'DB writes',
        lines: [
          'bank_interactions: user_action="lock_fx_forward"',
          'bank_scheduled_payments: NEW row (EUR 8,200 on 2026-07-22, status=pending_rm_review)'
        ]
      }
    ],
    toolTrace: [
      { phase: 'read', table: 'infer_forecasted_payments', rowsRead: 1, toolCall: 'get_forecast(id=fp_eur_001)', rowPreview: [{ counterparty: 'Domaine Lafont', amount_eur: 8200, due_date: '2026-07-22' }] },
      { phase: 'read', table: 'bank_fx_rates', rowsRead: 1, toolCall: 'get_fx_rate_now(pair=EUR/MYR)', rowPreview: [{ pair: 'EUR/MYR', mid: 4.9528, lock_rate: 4.95 }] },
      { phase: 'reason', reasoning: 'lock_fx_forward action — submit FX Forward request at 4.95 EUR/MYR for 2026-07-22, EUR 8,200; ref REQ-FXFW-2026-7142. Pending RM review.' },
      { phase: 'write', table: 'bank_scheduled_payments', rowsWritten: 1, reasoning: 'NEW row (EUR 8,200, value_date 2026-07-22, status=pending_rm_review)', rowPreview: [{ id: 'sp_eur_001', amount_eur: 8200, value_date: '2026-07-22', rate: 4.95, status: 'pending_rm_review' }] },
      { phase: 'write', table: 'bank_interactions', rowsWritten: 1, reasoning: 'action confirm (type=lock_fx_forward, status=pending_rm_review)' }
    ]
  },
  {
    step: 4,
    act: 'act2',
    stepWithinAct: 1,
    timeStamp: 'Fri 31 Jul · 15:00',
    asOfIso: '2026-07-31T07:00:00Z',
    narrative: 'Time-jump 3 weeks. FlexiCash trigger fires — cash dip predicted.',
    newMessages: [
      {
        id: 'msg_007',
        side: 'system',
        time: '⤵',
        text: '— 3 weeks later —',
        step: 4
      },
      {
        id: 'msg_008',
        side: 'other',
        intel: true,
        time: '15:00',
        text:
`Your projected balance dips below **MYR 5K** in 3 weeks. A pre-approved **FlexiCash line of MYR 65K** is available. Want to apply?`,
        actions: [
          { label: 'Apply', actionId: 'accept_preapproved_offer', variant: 'primary' },
          { label: 'Show me options', actionId: 'show_loan_options' }
        ],
        step: 4
      }
    ],
    context: [
      {
        label: 'Trigger evaluation',
        rows: [
          { k: 'Tool', v: 'check_flexicash_opportunity()' },
          { k: 'Result', v: 'TRUE' },
          { k: 'Reason', v: 'dip_predicted_and_offer_available' }
        ]
      },
      {
        label: 'Cashflow projection',
        rows: [
          { k: 'Projection date', v: '2026-07-31' },
          { k: 'Horizon date', v: '2026-08-21' },
          { k: 'Projected mean', v: 'MYR 3,200' },
          { k: 'p25 / p75', v: '1,800 / 5,000' },
          { k: 'Confidence', v: '0.81' }
        ]
      },
      {
        label: 'Composition (evidence)',
        pre:
`+ Current balance: MYR 52,300
+ Scheduled inflows (3w): MYR 10,000
+ Forecasted inflows (3w): MYR 38,000
- Scheduled outflows (3w): MYR 95,600
- Forecasted outflows (3w): MYR 18,000
= MYR -13,300 net  (dip ~day 14)`
      },
      {
        label: 'Pre-approved offer',
        rows: [
          { k: 'Offer ID', v: 'offer_flx_001' },
          { k: 'Amount', v: 'MYR 65,000' },
          { k: 'Rate', v: '6.5% p.a.' },
          { k: 'Valid until', v: '2026-10-05' }
        ]
      }
    ],
    toolTrace: [
      { phase: 'read', table: 'infer_cashflow_projection', rowsRead: 1, toolCall: 'get_cashflow_projection(horizon_days=21)', rowPreview: [{ horizon_date: '2026-08-21', projected_mean_myr: 3200, p25: 1800, p75: 5000, confidence: 0.81 }] },
      { phase: 'read', table: 'bank_preapproved_offers', rowsRead: 1, toolCall: "get_preapproved_offers(customer_id='ahmad_01', active_only=true)", rowPreview: [{ offer_id: 'offer_flx_001', amount_myr: 65000, rate_pa: 6.5, valid_until: '2026-10-05' }] },
      { phase: 'read', table: 'bank_credit_limits', rowsRead: 1, toolCall: 'get_credit_limits(customer_id=ahmad_01)', rowPreview: [{ product: 'working_capital', limit: 100000, used: 60000, unused: 40000 }] },
      { phase: 'reason', reasoning: 'check_flexicash_opportunity → TRUE: 21-day projection dips below MYR 5K AND active pre-approved FlexiCash offer.' },
      { phase: 'write', table: 'bank_interactions', rowsWritten: 1, reasoning: 'trigger event (type=flexicash_trigger_eval, result=fired)' }
    ]
  },
  {
    step: 5,
    act: 'act2',
    stepWithinAct: 2,
    timeStamp: 'Fri 31 Jul · 15:01',
    asOfIso: '2026-07-31T07:01:00Z',
    narrative: 'Mr. Bakri asks for cheapest loan comparison.',
    newMessages: [
      {
        id: 'msg_009',
        side: 'self',
        time: '15:01',
        text: 'Show me the cheapest loan for the shortfall.',
        step: 5
      },
      {
        id: 'msg_010',
        side: 'other',
        time: '15:01',
        text:
`For your 3-week cash-management need up to MYR 65K, two options fit:

**FlexiCash (pre-approved)** — MYR 65K available, **6.5% p.a.**, draw what you need, no setup. Covers the full gap in one draw.

**Revolving Credit (auto-enrollment)** — your existing line has MYR 40K unused at **8.0% p.a.**, auto-enrolled based on your account standing. Higher rate than FlexiCash for the same purpose.

A single FlexiCash draw at MYR 65K would cost about **MYR 243** in interest over 3 weeks — cheaper than splitting with the Revolving Credit line (~MYR 278). Want me to walk through applying?

_Informational. Subject to product terms and approval._`,
        step: 5
      }
    ],
    context: [
      {
        label: 'Intent classification',
        rows: [
          { k: 'Intent', v: 'request_loan_recommendation' },
          { k: 'Topic', v: 'credit' }
        ]
      },
      {
        label: 'Products matched (use_case=short_term_shortfall, L4)',
        lines: [
          'flexicash — 6.5% p.a. (pre-approved 65K, no setup)',
          'revolving_credit (Revolving Credit) — 8.0% p.a. (auto-enrollment, unused 40K)'
        ]
      },
      {
        label: 'User context applied',
        lines: [
          'get_credit_limits → WC unused MYR 40K',
          'system prompt rule: cheapest applicable product first'
        ]
      }
    ],
    toolTrace: [
      { phase: 'read', table: 'bank_product_catalog', rowsRead: 2, toolCall: "find_products_by_use_case(tag='short_term_shortfall', complexity_level=4)", rowPreview: [{ product_id: 'flexicash', name: 'FlexiCash' }, { product_id: 'working_capital_facility', name: 'Revolving Credit' }] },
      { phase: 'read', table: 'bank_credit_limits', rowsRead: 1, toolCall: 'get_credit_limits(customer_id=ahmad_01, product=working_capital)', rowPreview: [{ product: 'working_capital', limit: 200000, used: 160000, unused: 40000 }] },
      { phase: 'read', table: 'bank_product_pricing_daily', rowsRead: 2, toolCall: 'get_product_pricing_today(product_ids=[flexicash, working_capital_facility])', rowPreview: [{ product_id: 'flexicash', rate_pa: 6.5 }, { product_id: 'working_capital_facility', rate_pa: 8.0 }] },
      { phase: 'reason', reasoning: 'Rank by cost: FlexiCash 65K @ 6.5% single draw = MYR 243 interest (3w) vs split WC 40K @ 8.0% + FlexiCash 25K @ 6.5% = MYR 278. FlexiCash single is cheaper and covers full gap.' },
      { phase: 'write', table: 'bank_interactions', rowsWritten: 1, reasoning: 'loan recommendation reply' }
    ]
  },
  {
    step: 6,
    act: 'act2',
    stepWithinAct: 3,
    timeStamp: 'Fri 31 Jul · 15:03',
    asOfIso: '2026-07-31T07:03:00Z',
    narrative: 'Mr. Bakri taps Apply → FlexiCash request submitted for RM review.',
    newMessages: [
      {
        id: 'msg_011',
        side: 'system',
        time: '15:03',
        text: '✓ You tapped: Apply',
        step: 6
      },
      {
        id: 'msg_012',
        side: 'other',
        time: '15:03',
        text:
`Request received. Reference: **REQ-FLX-2026-2284**. Your RM will contact you within 24 hours to finalize.

**MYR 65,000** credit line at **6.5% p.a.** once activated.`,
        step: 6
      }
    ],
    context: [
      {
        label: 'Action',
        rows: [
          { k: 'Type', v: 'accept_preapproved_offer' },
          { k: 'Reference', v: 'REQ-FLX-2026-2284' },
          { k: 'Limit', v: 'MYR 65,000' },
          { k: 'Rate', v: '6.5% p.a.' },
          { k: 'Status', v: 'pending_rm_review' }
        ]
      },
      {
        label: 'DB writes',
        lines: [
          'bank_preapproved_offers: status → accepted',
          'bank_products_held: flexicash NEW row (status=pending_rm_review)',
          'bank_credit_limits: flexicash 65K NEW (status=pending_rm_review)'
        ]
      }
    ],
    toolTrace: [
      { phase: 'read', table: 'bank_preapproved_offers', rowsRead: 1, toolCall: "get_preapproved_offer(id='offer_flx_001')", rowPreview: [{ offer_id: 'offer_flx_001', amount_myr: 65000, rate_pa: 6.5 }] },
      { phase: 'reason', reasoning: 'accept_preapproved_offer action — submit FlexiCash request MYR 65K @ 6.5% p.a.; ref REQ-FLX-2026-2284. Pending RM review.' },
      { phase: 'write', table: 'bank_preapproved_offers', rowsWritten: 1, reasoning: 'status → accepted' },
      { phase: 'write', table: 'bank_products_held', rowsWritten: 1, reasoning: 'flexicash enrolled (status=pending_rm_review)', rowPreview: [{ product: 'flexicash', limit_myr: 65000, ref: 'REQ-FLX-2026-2284', status: 'pending_rm_review' }] },
      { phase: 'write', table: 'bank_credit_limits', rowsWritten: 1, reasoning: 'flexicash 65K NEW (status=pending_rm_review)', rowPreview: [{ product: 'flexicash', limit_myr: 65000, used_myr: 0, status: 'pending_rm_review' }] },
      { phase: 'write', table: 'bank_interactions', rowsWritten: 1, reasoning: 'action confirm (type=accept_preapproved_offer, status=pending_rm_review)' }
    ]
  },
  {
    step: 7,
    act: 'act2',
    stepWithinAct: 4,
    timeStamp: 'Fri 31 Jul · 15:05',
    asOfIso: '2026-07-31T07:05:00Z',
    narrative: 'Learning moment — user requests Tuesday FX brief; agent confirms and commits.',
    newMessages: [
      {
        id: 'msg_013',
        side: 'self',
        time: '15:05',
        text: 'Actually, can you remind me of FX trends every Tuesday morning?',
        step: 7
      },
      {
        id: 'msg_014',
        side: 'other',
        time: '15:05',
        text:
`Sure, Mr. Bakri. I'll send a brief FX summary every Tuesday at 8 AM. Anything specific you want included beyond EUR/MYR and AUD/MYR?`,
        step: 7
      },
      {
        id: 'msg_015',
        side: 'self',
        time: '15:06',
        text: 'Add USD/MYR too.',
        step: 7
      },
      {
        id: 'msg_016',
        side: 'other',
        time: '15:06',
        text:
`Got it. Tuesday FX brief covers EUR, AUD, USD vs MYR. Starting tomorrow at 08:00.`,
        step: 7
      }
    ],
    context: [
      {
        label: 'Intent classification',
        rows: [
          { k: 'Intent', v: 'change_preference' },
          { k: 'Topic', v: 'general (alert_timing)' }
        ]
      },
      {
        label: 'Confirm-before-commit',
        lines: [
          'Step A: agent paraphrase + clarifying question',
          'Step B: user adds USD/MYR',
          'Step C: agent commits to DB'
        ]
      },
      {
        label: 'Final preference',
        pre:
`{
  "preference_key": "weekly_fx_brief",
  "value": {
    "day": "Tuesday",
    "time": "08:00",
    "currencies": ["EUR/MYR","AUD/MYR","USD/MYR"]
  }
}`
      },
      {
        label: 'DB writes (Confirmed)',
        lines: [
          'infer_user_preferences: NEW row pref_fxbrief_001',
          'infer_learning_events: NEW row le_001 (confirmed_by_user=true)'
        ]
      }
    ],
    toolTrace: [
      { phase: 'read', table: 'infer_user_preferences', rowsRead: 0, toolCall: "get_user_preferences(customer_id='ahmad_01', key='weekly_fx_brief')", rowPreview: [{ key: 'weekly_fx_brief', value: '(none yet)' }] },
      { phase: 'reason', reasoning: 'Confirm-before-commit pattern: paraphrase Tuesday 08:00 EUR/AUD → user adds USD → commit final pref.' },
      { phase: 'write', table: 'infer_user_preferences', rowsWritten: 1, reasoning: 'NEW pref_fxbrief_001 (EUR/AUD/USD Tue 08:00)', rowPreview: [{ pref_id: 'pref_fxbrief_001', key: 'weekly_fx_brief', currencies: 'EUR/AUD/USD', day: 'Tuesday', time: '08:00' }] },
      { phase: 'write', table: 'infer_learning_events', rowsWritten: 1, reasoning: 'NEW le_001 (confirmed_by_user=true)' },
      { phase: 'write', table: 'bank_interactions', rowsWritten: 1, reasoning: 'preference change confirmed' }
    ]
  }
];

// Helpers — used by page.tsx state model and components

export function getStepIndex(act: ActId, stepWithinAct: number): number {
  const found = STEPS.findIndex((s) => s.act === act && s.stepWithinAct === stepWithinAct);
  if (found < 0) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[demo_storyboard] getStepIndex fallback to 0 for (act=${act}, stepWithinAct=${stepWithinAct})`
      );
    }
    return 0;
  }
  return found;
}

export function getStepsForAct(act: ActId): DemoStep[] {
  return STEPS.filter((s) => s.act === act);
}

export function isLastStepOfAct(act: ActId, stepWithinAct: number): boolean {
  if (act === 'intro') return true;
  return stepWithinAct >= getMaxStepForAct(act);
}

export const ACT_LABELS: Record<ActId, string> = {
  intro: 'Intro',
  act1: 'Act 1 — FX Hero',
  act2: 'Act 2 — FlexiCash + Learning'
};
