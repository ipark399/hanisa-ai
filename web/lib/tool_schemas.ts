// Claude tool definitions (input schemas) for all 22 tool functions.
// Reference: architecture-v2.md §6.2

import type Anthropic from '@anthropic-ai/sdk';

export const TOOL_SCHEMAS: Anthropic.Tool[] = [
  // A. Simple lookups
  {
    name: 'get_current_balance',
    description: 'Returns Mr. Bakri\'s current account balances across all currencies as of the demo current time.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_account_list',
    description: 'List all of Mr. Bakri\'s CIMB accounts.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_scheduled_payments',
    description: 'List registered future payments (standing orders, direct debits, scheduled wires, loan repayments, FD maturities) within an optional date range.',
    input_schema: {
      type: 'object',
      properties: {
        from_date: { type: 'string', description: 'ISO date YYYY-MM-DD (default: today)' },
        to_date: { type: 'string', description: 'ISO date YYYY-MM-DD (default: today + 30 days)' }
      }
    }
  },
  {
    name: 'get_recent_transactions',
    description: 'Recent executed transactions on Mr. Bakri\'s accounts.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Look-back window in days (default: 30)' },
        currency: { type: 'string', description: 'Filter by currency (optional)' }
      }
    }
  },
  {
    name: 'get_products_held',
    description: 'CIMB products that Mr. Bakri currently holds.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },

  // B. Inferences
  {
    name: 'get_forecasted_payments',
    description: 'Agent-inferred upcoming payments based on transaction patterns (e.g., predicted recurring EUR/AUD supplier payments).',
    input_schema: {
      type: 'object',
      properties: {
        days_ahead: { type: 'number', description: 'Forecast horizon in days (default: 30)' },
        currency: { type: 'string', description: 'Filter by currency (optional)' }
      }
    }
  },
  {
    name: 'get_expected_inflows',
    description: 'Agent-inferred upcoming inflows (customer payments). Includes overdue receivables detected by pattern.',
    input_schema: {
      type: 'object',
      properties: {
        days_ahead: { type: 'number', description: 'Forecast horizon in days (default: 30)' },
        include_overdue: { type: 'boolean', description: 'Default true' }
      }
    }
  },
  {
    name: 'get_cashflow_projection',
    description: 'Composite cashflow projection over a horizon. Combines balances, scheduled, forecasted payments and expected inflows. Returns projected balance distribution and dip warnings.',
    input_schema: {
      type: 'object',
      properties: {
        horizon_days: { type: 'number', description: 'Projection horizon (default: 7 for weekly, 21 for 3-week)' }
      }
    }
  },
  {
    name: 'get_company_profile',
    description: 'Agent\'s inferred profile of Mr. Bakri\'s company: complexity level, subindustry, seasonality, wallet share, plus any learned facts.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_seasonality',
    description: 'Detected seasonal patterns in Mr. Bakri\'s cashflow (CNY peak, year-end, monthly cycles).',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_top_counterparties',
    description: 'Mr. Bakri\'s top counterparties by volume, filtered by type.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['supplier', 'customer', 'employee', 'tax_authority', 'utility', 'other'], description: 'Counterparty type' },
        limit: { type: 'number', description: 'Default 5' }
      }
    }
  },
  {
    name: 'get_credit_limits',
    description: 'Mr. Bakri\'s active credit facilities — limit, outstanding, available, interest rate.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_preapproved_offers',
    description: 'Pre-approved offers currently open for Mr. Bakri (e.g., FlexiCash MYR 65K).',
    input_schema: { type: 'object', properties: {}, required: [] }
  },

  // C. Trigger evaluation
  {
    name: 'check_monday_brief',
    description: 'Evaluate whether the Monday weekly brief should fire and what content it carries.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'check_fx_opportunity',
    description: 'Evaluate whether an FX hedging trigger should fire (forecasted FX payment + rate favourable vs 90-day avg).',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'check_flexicash_opportunity',
    description: 'Evaluate whether the FlexiCash trigger should fire (projected cash dip + open pre-approved offer).',
    input_schema: { type: 'object', properties: {}, required: [] }
  },

  // D. Product catalog
  {
    name: 'list_products_by_category',
    description: 'List all CIMB products in a given category.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['cash_management', 'lending', 'fx', 'trade_finance', 'deposits'] }
      },
      required: ['category']
    }
  },
  {
    name: 'find_products_by_use_case',
    description: 'Find CIMB products matching a use_case_tag and filter by complexity level.',
    input_schema: {
      type: 'object',
      properties: {
        use_case_tag: { type: 'string', description: 'e.g., fx_hedging, short_term_shortfall, fx_monthly_payment' },
        complexity_level: { type: 'number', description: 'Default 4 (Mr. Bakri\'s level)' }
      },
      required: ['use_case_tag']
    }
  },
  {
    name: 'get_product_details',
    description: 'Full details for a specific product.',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string' }
      },
      required: ['product_id']
    }
  },
  {
    name: 'get_product_pricing',
    description: 'Today\'s pricing for a product, optionally for a specific tenor.',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
        tenor: { type: 'string', enum: ['spot', '7d', '30d', '60d', '90d', '180d', '365d'] }
      },
      required: ['product_id']
    }
  },

  // D2. Market context (judgment-assist, no predictions)
  {
    name: 'get_bloomberg_market_context',
    description: 'Retrieve current market context (news, FX rate position, historical percentile) to help user judgment. Does NOT provide predictions.',
    input_schema: {
      type: 'object',
      properties: {
        fx_pair: { type: 'string', enum: ['EUR/MYR', 'USD/MYR', 'AUD/MYR'] },
        as_of_iso: { type: 'string', format: 'date-time', description: 'ISO timestamp for the market snapshot' }
      },
      required: ['fx_pair', 'as_of_iso']
    }
  },

  // E. Actions
  {
    name: 'record_user_action',
    description: 'Record a user action (Lock, Apply, Decline) against a referenced entity.',
    input_schema: {
      type: 'object',
      properties: {
        action_type: { type: 'string', enum: ['lock_fx_forward', 'accept_preapproved_offer', 'decline_offer', 'other'] },
        referenced_entity_type: { type: 'string' },
        referenced_entity_id: { type: 'string' },
        details: { type: 'object' }
      },
      required: ['action_type']
    }
  },
  // F. UI affordance — area 4 (REQ-CIMB-02 #13)
  //   The chat layer intercepts `suggest_action` tool_use blocks and converts
  //   them into ChatResult.actions (whitelisted). It is NOT dispatched as a
  //   real tool — the LLM uses it to attach an interactive button to its reply.
  {
    name: 'suggest_action',
    description:
      'Attach an interactive button to your reply. Use this when the user might want to take a specific next step (e.g., show alternative hedges, compare loans, see rate history). The button label is shown in the chat bubble; clicking it triggers the matching action_id. Only whitelisted action_ids are rendered; unknown action_ids are silently dropped on the backend.',
    input_schema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'Button label (≤ 30 chars, action-oriented verb phrase like "Show FX option" or "Compare hedges").'
        },
        action_id: {
          type: 'string',
          description:
            'Whitelisted action ID. Storyboard actions: lock_fx_forward, accept_preapproved_offer, show_loan_options, decline_fx, decline_flx. LLM-allowed dynamic actions: show_fx_option, show_fwd_details, compare_hedges, show_rate_history, show_alternatives, show_installment_loan, show_gbp_exposure.'
        },
        variant: {
          type: 'string',
          enum: ['primary', 'secondary', 'danger'],
          description: 'Visual style — primary for the main CTA, secondary for alternatives, danger for decline/cancel.'
        },
        payload: {
          type: 'object',
          description: 'Optional action-specific data (e.g., { product_id: "opt_eur_30d" }). Echoed back to the handler.'
        }
      },
      required: ['label', 'action_id']
    }
  },
  {
    name: 'record_learning_event',
    description: 'Record a learning event after user confirmation (preference change, fact added, counterparty updated).',
    input_schema: {
      type: 'object',
      properties: {
        event_type: { type: 'string', enum: ['fact_added', 'preference_changed', 'counterparty_updated', 'feedback_recorded'] },
        target_table: { type: 'string' },
        preference_key: { type: 'string', description: 'For preference_changed events' },
        preference_value: { type: 'object', description: 'For preference_changed events' },
        before_value: { type: 'object' },
        after_value: { type: 'object' },
        source_interaction_id: { type: 'string' }
      },
      required: ['event_type']
    }
  }
];
