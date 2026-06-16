// 8-step demo storyboard.
// Reference: goals/demo-storyboard-v2.md
//
// Each step accumulates messages onto the chat. step=0 is empty. step=1 adds the
// Monday brief, step=2 adds the FX trigger on top, etc.

export type BubbleSide = 'self' | 'other' | 'system';

export interface DemoMessage {
  id: string;
  side: BubbleSide;
  text: string;
  time: string;          // displayed time stamp (e.g., "09:00")
  intel?: boolean;       // show "From CIMB CFO Agent · INTEL" header
  actions?: { label: string; actionId: string; variant?: 'primary' | 'danger' }[];
  step: number;          // which step introduced this message
}

export interface ContextSection {
  label: string;
  rows?: { k: string; v: string }[];
  lines?: string[];
  pre?: string;
}

export interface DemoStep {
  step: number;
  timeStamp: string;     // displayed in header
  narrative: string;     // presenter narration / context
  newMessages: DemoMessage[];
  context: ContextSection[];
}

export const STEPS: DemoStep[] = [
  {
    step: 0,
    timeStamp: 'Sun 7 Jun · 22:00',
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
    timeStamp: 'Mon 8 Jun · 09:00',
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
    ]
  },
  {
    step: 2,
    timeStamp: 'Mon 8 Jun · 10:30',
    narrative: 'FX trigger fires. EUR payment forecasted, rate is favourable.',
    newMessages: [
      {
        id: 'msg_002',
        side: 'other',
        intel: true,
        time: '10:30',
        text:
`Based on your monthly pattern, an EUR payment of about MYR 38K looks due in the next 9 days. EUR/MYR is currently 2.8% better than your 90-day average. Lock the rate now?`,
        actions: [
          { label: 'Lock now', actionId: 'lock_fx_forward', variant: 'primary' },
          { label: 'Not now', actionId: 'decline_fx', variant: 'danger' }
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
          { k: 'Expected date', v: '2026-06-17 (D+9)' },
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
    ]
  },
  {
    step: 3,
    timeStamp: 'Mon 8 Jun · 10:31',
    narrative: 'Mr. Bakri asks for hedging product comparison.',
    newMessages: [
      {
        id: 'msg_003',
        side: 'self',
        time: '10:31',
        text: 'Recommend a hedging product.',
        step: 3
      },
      {
        id: 'msg_004',
        side: 'other',
        time: '10:31',
        text:
`Three CIMB options that fit your monthly EUR pattern:

**FX Forward Contract** — lock the rate today for delivery on your payment date. Best for: your usual 30-day-ahead visibility. Indicative pricing: spot + 25 bps forward points.

**FX Limit Order** — auto-lock when EUR/MYR hits a target rate. Best for: when you can wait a few days for a better rate. No upfront cost.

**EUR Currency Account** — hold a EUR balance for predictable monthly drawdowns. Best for: smoothing timing risk. Earns ~0.5% p.a.

Given your pattern, an FX Forward typically saves 0.5–1.5% vs. spot. Want me to walk through the forward terms?

_Informational. Subject to product terms and approval._`,
        step: 3
      }
    ],
    context: [
      {
        label: 'Intent classification',
        rows: [
          { k: 'Intent', v: 'request_hedging_recommendation' },
          { k: 'Confidence', v: '0.94' },
          { k: 'Topic', v: 'fx' }
        ]
      },
      {
        label: 'Recommendation query',
        lines: [
          "find_products_by_use_case(use_case_tag='fx_hedging', complexity_level=4)",
          'Matched: fx_forward_v1 / fx_limit_order / eur_currency_account',
          'Filtered out: fx_hedging_program (Level 5 only)'
        ]
      },
      {
        label: 'Per-product pricing (2026-06-08)',
        rows: [
          { k: 'FX Forward 30d', v: '25 bps' },
          { k: 'FX Forward 7d', v: '18 bps' },
          { k: 'FX Limit Order', v: '0 bps upfront' },
          { k: 'EUR FCD 90d', v: '0.5% p.a.' }
        ]
      }
    ]
  },
  {
    step: 4,
    timeStamp: 'Mon 8 Jun · 10:33',
    narrative: 'Mr. Bakri taps "Lock now" → FX Forward booked.',
    newMessages: [
      {
        id: 'msg_005',
        side: 'system',
        time: '10:33',
        text: '✓ You tapped: Lock now',
        step: 4
      },
      {
        id: 'msg_006',
        side: 'other',
        time: '10:33',
        text:
`Locked at **4.95 EUR/MYR** for value date **17 June 2026**, amount **EUR 8,200**. Trade reference: **FXFW-2026-7142**.

Estimated saving vs your 90-day average: **MYR 1,064**.

Confirmation sent to ahmad@sunrisetrading.my.`,
        step: 4
      }
    ],
    context: [
      {
        label: 'Action',
        rows: [
          { k: 'Type', v: 'lock_fx_forward' },
          { k: 'Trade ref', v: 'FXFW-2026-7142' },
          { k: 'Locked rate', v: '4.95' },
          { k: 'Amount EUR', v: '8,200' },
          { k: 'Value date', v: '2026-06-17' }
        ]
      },
      {
        label: 'DB writes',
        lines: [
          'bank_interactions: user_action="locked"',
          'bank_scheduled_payments: NEW row (EUR 8,200 on 2026-06-17)',
          'bank_products_held: fx_forward enrolled',
          'infer_forecasted_payments: status → actualized'
        ]
      }
    ]
  },
  {
    step: 5,
    timeStamp: 'Fri 26 Jun · 15:00',
    narrative: 'Time-jump 3 weeks. FlexiCash trigger fires — cash dip predicted.',
    newMessages: [
      {
        id: 'msg_007',
        side: 'system',
        time: '⤵',
        text: '— 3 weeks later —',
        step: 5
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
          { label: 'Show me options', actionId: 'show_loan_options' },
          { label: 'Not now', actionId: 'decline_flx', variant: 'danger' }
        ],
        step: 5
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
          { k: 'Projection date', v: '2026-06-26' },
          { k: 'Horizon date', v: '2026-07-17' },
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
          { k: 'Rate', v: '8.5% p.a.' },
          { k: 'Valid until', v: '2026-08-31' }
        ]
      }
    ]
  },
  {
    step: 6,
    timeStamp: 'Fri 26 Jun · 15:01',
    narrative: 'Mr. Bakri asks for cheapest loan comparison.',
    newMessages: [
      {
        id: 'msg_009',
        side: 'self',
        time: '15:01',
        text: 'Show me the cheapest loan for the shortfall.',
        step: 6
      },
      {
        id: 'msg_010',
        side: 'other',
        time: '15:01',
        text:
`For a 3-week shortfall of about MYR 65K, three CIMB options ranked by cost:

**Working Capital Facility top-up** — your existing line has MYR 40K unused at **7.2% p.a.** Cheapest, but capped at MYR 40K.

**FlexiCash (pre-approved)** — MYR 65K available, **8.5% p.a.**, draw what you need, no setup. Covers full gap.

**Trade Bridging Loan** — **6.8% p.a.** but requires documentary support and is for trade-linked needs only.

Combining Working Capital MYR 40K + FlexiCash MYR 25K would cost roughly **MYR 320** in interest for 3 weeks vs. **MYR 460** if you take FlexiCash for the full MYR 65K. Want me to map this against your projected dates?

_Informational. Subject to product terms and approval._`,
        step: 6
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
          'working_capital_facility — 7.2% p.a. (capped at unused 40K)',
          'flexicash — 8.5% p.a. (pre-approved 65K)',
          'trade_bridging_loan — 6.8% p.a. (eligibility: trade-linked only)'
        ]
      },
      {
        label: 'User context applied',
        lines: [
          'get_credit_limits → WC unused MYR 40K',
          'system prompt rule: existing unused 한도 우선'
        ]
      }
    ]
  },
  {
    step: 7,
    timeStamp: 'Fri 26 Jun · 15:03',
    narrative: 'Mr. Bakri taps Apply → FlexiCash activated.',
    newMessages: [
      {
        id: 'msg_011',
        side: 'system',
        time: '15:03',
        text: '✓ You tapped: Apply',
        step: 7
      },
      {
        id: 'msg_012',
        side: 'other',
        time: '15:03',
        text:
`FlexiCash **MYR 65,000** line activated. **8.5% p.a.** drawdowns on demand. Available immediately. Reference: **FLX-2026-2284**.

You can draw any amount up to MYR 65K through OCTO Biz app or by replying here.

Confirmation sent to ahmad@sunrisetrading.my.`,
        step: 7
      }
    ],
    context: [
      {
        label: 'Action',
        rows: [
          { k: 'Type', v: 'accept_preapproved_offer' },
          { k: 'Reference', v: 'FLX-2026-2284' },
          { k: 'Limit', v: 'MYR 65,000' },
          { k: 'Rate', v: '8.5% p.a.' }
        ]
      },
      {
        label: 'DB writes',
        lines: [
          'bank_preapproved_offers: status → accepted',
          'bank_products_held: flexicash NEW row',
          'bank_credit_limits: flexicash 65K NEW',
          'infer_cashflow_projection: dip_below_threshold → FALSE (recompute)'
        ]
      }
    ]
  },
  {
    step: 8,
    timeStamp: 'Fri 26 Jun · 15:05',
    narrative: 'Learning moment — user requests Tuesday FX brief; agent confirms and commits.',
    newMessages: [
      {
        id: 'msg_013',
        side: 'self',
        time: '15:05',
        text: 'Actually, can you remind me of FX trends every Tuesday morning?',
        step: 8
      },
      {
        id: 'msg_014',
        side: 'other',
        time: '15:05',
        text:
`Sure, Mr. Bakri. I'll send a brief FX summary every Tuesday at 8 AM. Anything specific you want included beyond EUR/MYR and AUD/MYR?`,
        step: 8
      },
      {
        id: 'msg_015',
        side: 'self',
        time: '15:06',
        text: 'Add USD/MYR too.',
        step: 8
      },
      {
        id: 'msg_016',
        side: 'other',
        time: '15:06',
        text:
`Got it. Tuesday FX brief covers EUR, AUD, USD vs MYR. Starting tomorrow at 08:00.`,
        step: 8
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
    ]
  }
];
