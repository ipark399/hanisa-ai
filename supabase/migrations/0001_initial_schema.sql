-- CIMB CFO Agent for SMEs — PoC v2 Initial Schema
-- Reference: goals/architecture-v2.md §4 (25 tables: bank 15 + infer 10)
-- Target: Supabase Postgres
-- Convention: snake_case, UTC timestamps (TIMESTAMPTZ), JSONB for JSON

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE source_type AS ENUM (
  'core_banking', 'agent_derived', 'external_feed', 'treasury_rate_sheet', 'agent_chat', 'system'
);

CREATE TYPE business_type AS ENUM (
  'food_beverage_importer', 'tech_data_services', 'manufacturing', 'wholesale_distribution',
  'professional_services', 'retail', 'construction', 'other'
);

CREATE TYPE employee_count_bucket AS ENUM (
  'lt_10', '10_to_30', '30_to_100', '100_to_300', 'gt_300'
);

CREATE TYPE revenue_bucket AS ENUM (
  'lt_1m', '1m_to_3m', '3m_to_8m', '8m_to_30m', '30m_to_100m', 'gt_100m'
);

CREATE TYPE language_code AS ENUM ('en', 'ms', 'zh');

CREATE TYPE kyc_status AS ENUM ('verified', 'pending', 'expired');

CREATE TYPE account_type AS ENUM ('current', 'savings', 'fd', 'loan');

CREATE TYPE account_status AS ENUM ('active', 'dormant', 'closed');

CREATE TYPE transaction_direction AS ENUM ('debit', 'credit');

CREATE TYPE transaction_type AS ENUM (
  'payment', 'transfer', 'fx_conversion', 'fee', 'interest', 'loan_drawdown',
  'loan_repayment', 'dividend', 'reversal'
);

CREATE TYPE transaction_channel AS ENUM (
  'branch', 'online', 'mobile', 'standing_order', 'api', 'direct_debit'
);

CREATE TYPE schedule_type AS ENUM (
  'standing_order', 'one_off_scheduled', 'direct_debit', 'loan_repayment_scheduled', 'fd_maturity'
);

CREATE TYPE scheduled_payment_status AS ENUM ('pending', 'executed', 'cancelled', 'failed');

CREATE TYPE payment_method AS ENUM ('bank_transfer', 'wire', 'swift', 'standing_order');

CREATE TYPE recurrence AS ENUM ('one_off', 'weekly', 'monthly', 'quarterly');

CREATE TYPE credit_limit_type AS ENUM (
  'working_capital', 'overdraft', 'credit_card', 'flexicash', 'lc_facility'
);

CREATE TYPE credit_limit_status AS ENUM ('active', 'suspended', 'closed');

CREATE TYPE drawdown_event_type AS ENUM ('drawdown', 'repayment');

CREATE TYPE offer_status AS ENUM ('open', 'accepted', 'declined', 'expired');

CREATE TYPE offer_acceptance_channel AS ENUM ('agent_chat', 'branch', 'app');

CREATE TYPE offer_generator AS ENUM ('rule_engine', 'agent', 'manual');

CREATE TYPE product_holding_type AS ENUM (
  'current_account', 'savings', 'fd', 'working_capital', 'lc', 'fx_forward',
  'flexicash', 'merchant_services', 'business_credit_card'
);

CREATE TYPE product_holding_status AS ENUM ('active', 'suspended');

CREATE TYPE product_history_event_type AS ENUM (
  'enrolled', 'upgraded', 'suspended', 'terminated', 'renewed'
);

CREATE TYPE fx_granularity AS ENUM ('tick', '1min', '5min', 'hourly', 'daily', 'eod');

CREATE TYPE chat_channel AS ENUM ('whatsapp', 'octo_biz_app', 'email', 'phone', 'system');

CREATE TYPE chat_direction AS ENUM ('agent_to_user', 'user_to_agent', 'system_event');

CREATE TYPE chat_interaction_type AS ENUM (
  'chat_message', 'trigger_alert', 'click', 'lock_action', 'apply_action', 'system_action'
);

CREATE TYPE product_category AS ENUM (
  'cash_management', 'lending', 'fx', 'trade_finance', 'deposits'
);

CREATE TYPE pricing_type AS ENUM (
  'interest_rate', 'fx_spread_bps', 'commission_pct', 'fee_flat', 'dealer_quote'
);

CREATE TYPE pricing_tenor AS ENUM (
  'spot', '7d', '30d', '60d', '90d', '180d', '365d'
);

CREATE TYPE customer_tier AS ENUM ('retail', 'sme', 'premium');

CREATE TYPE balance_snapshot_type AS ENUM ('eod', 'intraday');

CREATE TYPE counterparty_type AS ENUM (
  'supplier', 'customer', 'employee', 'tax_authority', 'utility', 'other'
);

CREATE TYPE counterparty_status AS ENUM ('active', 'inactive');

CREATE TYPE forecast_method AS ENUM ('recurring_pattern', 'seasonal', 'manual_hint');

CREATE TYPE forecast_status AS ENUM ('active', 'superseded', 'actualized');

CREATE TYPE inflow_status AS ENUM ('expected', 'received', 'overdue', 'superseded');

CREATE TYPE intent_type AS ENUM (
  'ask_balance', 'ask_forecast', 'accept_offer', 'decline_offer', 'complain',
  'request_loan_recommendation', 'request_hedging_recommendation', 'confirm_action',
  'change_preference', 'add_to_pending_preference', 'chitchat', 'other'
);

CREATE TYPE sentiment_type AS ENUM ('positive', 'neutral', 'negative', 'frustrated');

CREATE TYPE topic_type AS ENUM (
  'cash_flow', 'fx', 'credit', 'receivables', 'product', 'general'
);

CREATE TYPE satisfaction_signal AS ENUM (
  'explicit_confirm', 'repeat_question', 'abandonment', 'silence', 'explicit_complaint'
);

CREATE TYPE preference_assertion AS ENUM ('user_explicit', 'agent_inferred');

CREATE TYPE learning_event_type AS ENUM (
  'fact_added', 'preference_changed', 'counterparty_updated', 'feedback_recorded'
);

CREATE TYPE seasonality_pattern_type AS ENUM ('weekly', 'monthly', 'annual', 'event_based');

CREATE TYPE seasonality_metric AS ENUM ('inflow', 'outflow', 'net');

-- =============================================================================
-- BANK-OWNED TABLES (15)
-- =============================================================================

-- 1. bank_customers (KYC)
CREATE TABLE bank_customers (
  customer_id                        TEXT PRIMARY KEY,
  legal_name                         TEXT NOT NULL,
  trade_name                         TEXT,
  business_type_declared             business_type NOT NULL,
  msic_code                          TEXT,
  incorporation_date                 DATE NOT NULL,
  employee_count_bucket_declared     employee_count_bucket NOT NULL,
  annual_revenue_bucket_declared     revenue_bucket NOT NULL,
  registered_address                 TEXT NOT NULL,
  primary_contact_name               TEXT NOT NULL,
  primary_contact_role_declared      TEXT,
  primary_contact_phone              TEXT NOT NULL,
  primary_contact_email              TEXT,
  preferred_language                 language_code NOT NULL DEFAULT 'en',
  timezone                           TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  kyc_status                         kyc_status NOT NULL,
  kyc_declared_at                    DATE NOT NULL,
  onboarded_at                       TIMESTAMPTZ NOT NULL,
  source                             source_type NOT NULL DEFAULT 'core_banking',
  schema_version                     INTEGER NOT NULL DEFAULT 1,
  created_at                         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                         TIMESTAMPTZ
);
COMMENT ON TABLE bank_customers IS 'KYC and registered company info. Declared fields (suffix _declared) are user-reported at onboarding and may be stale.';

-- 2. bank_accounts
CREATE TABLE bank_accounts (
  account_id                TEXT PRIMARY KEY,
  customer_id               TEXT NOT NULL REFERENCES bank_customers(customer_id),
  account_number_masked     TEXT NOT NULL,
  currency                  TEXT NOT NULL,
  account_type              account_type NOT NULL,
  product_name              TEXT,
  opened_date               DATE NOT NULL,
  closed_date               DATE,
  status                    account_status NOT NULL DEFAULT 'active',
  is_primary                BOOLEAN NOT NULL DEFAULT FALSE,
  maturity_date             DATE,
  interest_rate             DECIMAL(8,4),
  source                    source_type NOT NULL DEFAULT 'core_banking',
  schema_version            INTEGER NOT NULL DEFAULT 1,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                TIMESTAMPTZ
);
CREATE INDEX idx_bank_accounts_customer ON bank_accounts(customer_id);
COMMENT ON TABLE bank_accounts IS 'Account master. One row per account per customer.';

-- 3. bank_balances_daily
CREATE TABLE bank_balances_daily (
  balance_id           TEXT PRIMARY KEY,
  customer_id          TEXT NOT NULL REFERENCES bank_customers(customer_id),
  account_id           TEXT NOT NULL REFERENCES bank_accounts(account_id),
  balance_date         DATE NOT NULL,
  opening_balance      DECIMAL(18,2) NOT NULL,
  closing_balance      DECIMAL(18,2) NOT NULL,
  currency             TEXT NOT NULL,
  total_inflow         DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_outflow        DECIMAL(18,2) NOT NULL DEFAULT 0,
  inflow_count         INTEGER NOT NULL DEFAULT 0,
  outflow_count        INTEGER NOT NULL DEFAULT 0,
  snapshot_type        balance_snapshot_type NOT NULL DEFAULT 'eod',
  source               source_type NOT NULL DEFAULT 'core_banking',
  schema_version       INTEGER NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, balance_date, snapshot_type)
);
CREATE INDEX idx_bank_balances_daily_customer_date ON bank_balances_daily(customer_id, balance_date);
CREATE INDEX idx_bank_balances_daily_account_date ON bank_balances_daily(account_id, balance_date);
COMMENT ON TABLE bank_balances_daily IS 'EOD balance snapshots per account per day.';

-- 4. bank_transactions (immutable)
CREATE TABLE bank_transactions (
  transaction_id              TEXT PRIMARY KEY,
  customer_id                 TEXT NOT NULL REFERENCES bank_customers(customer_id),
  account_id                  TEXT NOT NULL REFERENCES bank_accounts(account_id),
  transaction_date            DATE NOT NULL,
  posted_at                   TIMESTAMPTZ NOT NULL,
  value_date                  DATE NOT NULL,
  amount                      DECIMAL(18,2) NOT NULL,
  currency                    TEXT NOT NULL,
  direction                   transaction_direction NOT NULL,
  transaction_type            transaction_type NOT NULL,
  counterparty_raw_text       TEXT NOT NULL,
  description                 TEXT,
  channel                     transaction_channel NOT NULL,
  reference                   TEXT,
  fx_pair                     TEXT,
  fx_rate                     DECIMAL(18,6),
  source                      source_type NOT NULL DEFAULT 'core_banking',
  schema_version              INTEGER NOT NULL DEFAULT 1,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bank_transactions_customer_date ON bank_transactions(customer_id, transaction_date DESC);
CREATE INDEX idx_bank_transactions_account_date ON bank_transactions(account_id, transaction_date DESC);
CREATE INDEX idx_bank_transactions_counterparty_raw ON bank_transactions(customer_id, counterparty_raw_text);
COMMENT ON TABLE bank_transactions IS 'Immutable transaction log. UPDATEs not allowed — corrections via reversal rows.';

-- 5. bank_scheduled_payments
CREATE TABLE bank_scheduled_payments (
  scheduled_payment_id        TEXT PRIMARY KEY,
  customer_id                 TEXT NOT NULL REFERENCES bank_customers(customer_id),
  account_id                  TEXT NOT NULL REFERENCES bank_accounts(account_id),
  schedule_type               schedule_type NOT NULL,
  scheduled_date              DATE NOT NULL,
  amount                      DECIMAL(18,2) NOT NULL,
  currency                    TEXT NOT NULL,
  counterparty_raw_text       TEXT,
  fx_pair                     TEXT,
  fx_amount_local             DECIMAL(18,2),
  payment_method              payment_method NOT NULL,
  reference                   TEXT,
  recurrence                  recurrence NOT NULL DEFAULT 'one_off',
  status                      scheduled_payment_status NOT NULL DEFAULT 'pending',
  executed_at                 TIMESTAMPTZ,
  linked_transaction_id       TEXT REFERENCES bank_transactions(transaction_id),
  source                      source_type NOT NULL DEFAULT 'core_banking',
  schema_version              INTEGER NOT NULL DEFAULT 1,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bank_sched_pmt_customer_date ON bank_scheduled_payments(customer_id, scheduled_date);
CREATE INDEX idx_bank_sched_pmt_status ON bank_scheduled_payments(customer_id, status);
COMMENT ON TABLE bank_scheduled_payments IS 'User-registered future payments only. Wine supplier ad-hoc payments live in infer_forecasted_payments.';

-- 6. bank_credit_limits
CREATE TABLE bank_credit_limits (
  credit_limit_id        TEXT PRIMARY KEY,
  customer_id            TEXT NOT NULL REFERENCES bank_customers(customer_id),
  product_holding_id     TEXT NOT NULL,
  limit_type             credit_limit_type NOT NULL,
  limit_amount           DECIMAL(18,2) NOT NULL,
  outstanding_amount     DECIMAL(18,2) NOT NULL DEFAULT 0,
  available_amount       DECIMAL(18,2) NOT NULL,
  currency               TEXT NOT NULL,
  interest_rate          DECIMAL(8,4),
  effective_from         DATE NOT NULL,
  effective_to           DATE,
  status                 credit_limit_status NOT NULL DEFAULT 'active',
  source                 source_type NOT NULL DEFAULT 'core_banking',
  schema_version         INTEGER NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ
);
CREATE INDEX idx_bank_credit_limits_customer ON bank_credit_limits(customer_id);

-- 7. bank_credit_drawdowns
CREATE TABLE bank_credit_drawdowns (
  drawdown_id            TEXT PRIMARY KEY,
  customer_id            TEXT NOT NULL REFERENCES bank_customers(customer_id),
  credit_limit_id        TEXT NOT NULL REFERENCES bank_credit_limits(credit_limit_id),
  event_type             drawdown_event_type NOT NULL,
  amount                 DECIMAL(18,2) NOT NULL,
  currency               TEXT NOT NULL,
  event_date             DATE NOT NULL,
  linked_transaction_id  TEXT REFERENCES bank_transactions(transaction_id),
  source                 source_type NOT NULL DEFAULT 'core_banking',
  schema_version         INTEGER NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bank_drawdowns_customer_date ON bank_credit_drawdowns(customer_id, event_date DESC);

-- 8. bank_preapproved_offers
CREATE TABLE bank_preapproved_offers (
  offer_id              TEXT PRIMARY KEY,
  customer_id           TEXT NOT NULL REFERENCES bank_customers(customer_id),
  product_type          credit_limit_type NOT NULL,
  approved_amount       DECIMAL(18,2) NOT NULL,
  currency              TEXT NOT NULL,
  offer_terms           JSONB NOT NULL,
  valid_from            DATE NOT NULL,
  valid_to              DATE NOT NULL,
  status                offer_status NOT NULL DEFAULT 'open',
  accepted_at           TIMESTAMPTZ,
  accepted_via          offer_acceptance_channel,
  generated_by          offer_generator NOT NULL DEFAULT 'rule_engine',
  source                source_type NOT NULL DEFAULT 'core_banking',
  schema_version        INTEGER NOT NULL DEFAULT 1,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bank_preapproved_customer_status ON bank_preapproved_offers(customer_id, status);

-- 14. bank_product_catalog (master)
CREATE TABLE bank_product_catalog (
  product_id                TEXT PRIMARY KEY,
  product_name              TEXT NOT NULL,
  category                  product_category NOT NULL,
  subcategory               TEXT NOT NULL,
  short_description         TEXT NOT NULL,
  long_description          TEXT NOT NULL,
  use_case_tags             TEXT[] NOT NULL DEFAULT '{}',
  indicative_pricing        TEXT NOT NULL,
  min_complexity_level      INTEGER NOT NULL CHECK (min_complexity_level BETWEEN 1 AND 5),
  max_complexity_level      INTEGER NOT NULL CHECK (max_complexity_level BETWEEN 1 AND 5),
  eligibility_criteria      TEXT NOT NULL,
  prerequisite_products     TEXT[] NOT NULL DEFAULT '{}',
  typical_use_examples      TEXT NOT NULL,
  tenor_min_days            INTEGER,
  tenor_max_days            INTEGER,
  currency_options          TEXT[] NOT NULL,
  is_pre_approvable         BOOLEAN NOT NULL DEFAULT FALSE,
  compliance_disclaimer     TEXT NOT NULL,
  catalog_version           TEXT NOT NULL,
  last_updated_at           TIMESTAMPTZ NOT NULL,
  source                    source_type NOT NULL DEFAULT 'core_banking',
  schema_version            INTEGER NOT NULL DEFAULT 1,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                TIMESTAMPTZ
);
CREATE INDEX idx_bank_product_catalog_category ON bank_product_catalog(category);
CREATE INDEX idx_bank_product_catalog_tags ON bank_product_catalog USING GIN(use_case_tags);
COMMENT ON TABLE bank_product_catalog IS 'CIMB product master. Static info — pricing is dynamic in bank_product_pricing_daily.';

-- 15. bank_product_pricing_daily
CREATE TABLE bank_product_pricing_daily (
  pricing_id             TEXT PRIMARY KEY,
  product_id             TEXT NOT NULL REFERENCES bank_product_catalog(product_id),
  pricing_date           DATE NOT NULL,
  pricing_type           pricing_type NOT NULL,
  value_decimal          DECIMAL(18,6) NOT NULL,
  value_currency         TEXT,
  tenor_label            pricing_tenor,
  min_threshold          DECIMAL(18,2),
  max_threshold          DECIMAL(18,2),
  customer_tier          customer_tier,
  effective_until        DATE,
  source                 source_type NOT NULL DEFAULT 'treasury_rate_sheet',
  schema_version         INTEGER NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bank_pricing_daily_product_date ON bank_product_pricing_daily(product_id, pricing_date DESC);

-- 9. bank_products_held
CREATE TABLE bank_products_held (
  product_holding_id     TEXT PRIMARY KEY,
  customer_id            TEXT NOT NULL REFERENCES bank_customers(customer_id),
  product_id             TEXT NOT NULL REFERENCES bank_product_catalog(product_id),
  product_name           TEXT NOT NULL,
  product_type           product_holding_type NOT NULL,
  account_id             TEXT REFERENCES bank_accounts(account_id),
  enrolled_at            DATE NOT NULL,
  status                 product_holding_status NOT NULL DEFAULT 'active',
  principal_amount       DECIMAL(18,2),
  outstanding_amount     DECIMAL(18,2),
  currency               TEXT,
  source                 source_type NOT NULL DEFAULT 'core_banking',
  schema_version         INTEGER NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ
);
CREATE INDEX idx_bank_products_held_customer ON bank_products_held(customer_id);

-- 10. bank_products_history
CREATE TABLE bank_products_history (
  product_history_id     TEXT PRIMARY KEY,
  customer_id            TEXT NOT NULL REFERENCES bank_customers(customer_id),
  product_holding_id     TEXT REFERENCES bank_products_held(product_holding_id),
  product_id             TEXT NOT NULL REFERENCES bank_product_catalog(product_id),
  event_type             product_history_event_type NOT NULL,
  event_date             DATE NOT NULL,
  event_details          JSONB,
  source                 source_type NOT NULL DEFAULT 'core_banking',
  schema_version         INTEGER NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bank_products_history_customer_date ON bank_products_history(customer_id, event_date DESC);

-- 11. bank_rm_assignments
CREATE TABLE bank_rm_assignments (
  assignment_id          TEXT PRIMARY KEY,
  customer_id            TEXT NOT NULL REFERENCES bank_customers(customer_id),
  rm_id                  TEXT NOT NULL,
  rm_name                TEXT NOT NULL,
  rm_branch              TEXT,
  rm_contact_email       TEXT,
  rm_contact_phone       TEXT,
  assigned_at            DATE NOT NULL,
  source                 source_type NOT NULL DEFAULT 'core_banking',
  schema_version         INTEGER NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ
);
CREATE INDEX idx_bank_rm_assignments_customer ON bank_rm_assignments(customer_id);

-- 12. bank_fx_rates
CREATE TABLE bank_fx_rates (
  fx_rate_id             TEXT PRIMARY KEY,
  pair                   TEXT NOT NULL,
  ts                     TIMESTAMPTZ NOT NULL,
  bid                    DECIMAL(18,6) NOT NULL,
  ask                    DECIMAL(18,6) NOT NULL,
  mid                    DECIMAL(18,6) NOT NULL,
  spread_bps             DECIMAL(10,4) NOT NULL,
  granularity            fx_granularity NOT NULL,
  source_provider        TEXT NOT NULL DEFAULT 'cimb_treasury',
  source                 source_type NOT NULL DEFAULT 'external_feed',
  schema_version         INTEGER NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bank_fx_rates_pair_ts ON bank_fx_rates(pair, ts DESC);
COMMENT ON TABLE bank_fx_rates IS 'Treasury FX time series. customer_id absent — firm-wide market data.';

-- 13. bank_interactions
CREATE TABLE bank_interactions (
  interaction_id              TEXT PRIMARY KEY,
  customer_id                 TEXT NOT NULL REFERENCES bank_customers(customer_id),
  session_id                  TEXT NOT NULL,
  channel                     chat_channel NOT NULL,
  direction                   chat_direction NOT NULL,
  interaction_type            chat_interaction_type NOT NULL,
  event_timestamp             TIMESTAMPTZ NOT NULL,
  content                     TEXT,
  referenced_entity_type      TEXT,
  referenced_entity_id        TEXT,
  user_action                 TEXT,
  source                      source_type NOT NULL DEFAULT 'agent_chat',
  schema_version              INTEGER NOT NULL DEFAULT 1,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bank_interactions_customer_ts ON bank_interactions(customer_id, event_timestamp DESC);
CREATE INDEX idx_bank_interactions_session ON bank_interactions(session_id);

-- =============================================================================
-- INFERRED TABLES (10)
-- =============================================================================

-- I-1. infer_counterparties
CREATE TABLE infer_counterparties (
  counterparty_id            TEXT PRIMARY KEY,
  customer_id                TEXT NOT NULL REFERENCES bank_customers(customer_id),
  resolved_name              TEXT NOT NULL,
  aliases                    TEXT[] NOT NULL DEFAULT '{}',
  inferred_type              counterparty_type NOT NULL,
  inferred_country           TEXT,
  inferred_currency_used     TEXT,
  inferred_industry          TEXT,
  payment_frequency          recurrence,
  avg_amount                 DECIMAL(18,2),
  relationship_since         DATE,
  relationship_status        counterparty_status NOT NULL DEFAULT 'active',
  learned_notes              JSONB,
  confidence                 DECIMAL(4,3) NOT NULL DEFAULT 0.0,
  inferred_by                TEXT NOT NULL,
  inferred_at                TIMESTAMPTZ NOT NULL,
  evidence_source            JSONB,
  source                     source_type NOT NULL DEFAULT 'agent_derived',
  schema_version             INTEGER NOT NULL DEFAULT 1,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                 TIMESTAMPTZ
);
CREATE INDEX idx_infer_counterparties_customer ON infer_counterparties(customer_id);
CREATE INDEX idx_infer_counterparties_aliases ON infer_counterparties USING GIN(aliases);

-- I-2. infer_transaction_enrichment
CREATE TABLE infer_transaction_enrichment (
  transaction_id                TEXT PRIMARY KEY REFERENCES bank_transactions(transaction_id),
  customer_id                   TEXT NOT NULL REFERENCES bank_customers(customer_id),
  inferred_counterparty_id      TEXT REFERENCES infer_counterparties(counterparty_id),
  inferred_category             TEXT,
  inferred_subcategory          TEXT,
  confidence                    DECIMAL(4,3) NOT NULL DEFAULT 0.0,
  inferred_by                   TEXT NOT NULL,
  inferred_at                   TIMESTAMPTZ NOT NULL,
  evidence_source               JSONB,
  source                        source_type NOT NULL DEFAULT 'agent_derived',
  schema_version                INTEGER NOT NULL DEFAULT 1,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- I-3. infer_forecasted_payments
CREATE TABLE infer_forecasted_payments (
  forecast_id                   TEXT PRIMARY KEY,
  customer_id                   TEXT NOT NULL REFERENCES bank_customers(customer_id),
  account_id                    TEXT NOT NULL REFERENCES bank_accounts(account_id),
  forecast_method               forecast_method NOT NULL,
  based_on_counterparty_id      TEXT REFERENCES infer_counterparties(counterparty_id),
  expected_date                 DATE NOT NULL,
  expected_amount_min           DECIMAL(18,2) NOT NULL,
  expected_amount_max           DECIMAL(18,2) NOT NULL,
  expected_amount_mean          DECIMAL(18,2) NOT NULL,
  currency                      TEXT NOT NULL,
  fx_pair                       TEXT,
  evidence_transaction_ids      TEXT[],
  status                        forecast_status NOT NULL DEFAULT 'active',
  actualized_transaction_id     TEXT REFERENCES bank_transactions(transaction_id),
  confidence                    DECIMAL(4,3) NOT NULL DEFAULT 0.0,
  inferred_by                   TEXT NOT NULL,
  inferred_at                   TIMESTAMPTZ NOT NULL,
  evidence_source               JSONB,
  source                        source_type NOT NULL DEFAULT 'agent_derived',
  schema_version                INTEGER NOT NULL DEFAULT 1,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_infer_forecasted_customer_date ON infer_forecasted_payments(customer_id, expected_date);

-- I-4. infer_expected_inflows
CREATE TABLE infer_expected_inflows (
  inflow_id                     TEXT PRIMARY KEY,
  customer_id                   TEXT NOT NULL REFERENCES bank_customers(customer_id),
  account_id                    TEXT NOT NULL REFERENCES bank_accounts(account_id),
  based_on_counterparty_id      TEXT REFERENCES infer_counterparties(counterparty_id),
  expected_date                 DATE NOT NULL,
  expected_amount_min           DECIMAL(18,2) NOT NULL,
  expected_amount_max           DECIMAL(18,2) NOT NULL,
  expected_amount_mean          DECIMAL(18,2) NOT NULL,
  currency                      TEXT NOT NULL,
  evidence_transaction_ids      TEXT[],
  status                        inflow_status NOT NULL DEFAULT 'expected',
  days_overdue                  INTEGER,
  actualized_transaction_id     TEXT REFERENCES bank_transactions(transaction_id),
  confidence                    DECIMAL(4,3) NOT NULL DEFAULT 0.0,
  inferred_by                   TEXT NOT NULL,
  inferred_at                   TIMESTAMPTZ NOT NULL,
  evidence_source               JSONB,
  source                        source_type NOT NULL DEFAULT 'agent_derived',
  schema_version                INTEGER NOT NULL DEFAULT 1,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_infer_expected_inflows_customer_status ON infer_expected_inflows(customer_id, status);
CREATE INDEX idx_infer_expected_inflows_customer_date ON infer_expected_inflows(customer_id, expected_date);

-- I-5. infer_cashflow_projection
CREATE TABLE infer_cashflow_projection (
  projection_id                       TEXT PRIMARY KEY,
  customer_id                         TEXT NOT NULL REFERENCES bank_customers(customer_id),
  account_id                          TEXT REFERENCES bank_accounts(account_id),
  projection_date                     DATE NOT NULL,
  horizon_date                        DATE NOT NULL,
  projected_balance_mean              DECIMAL(18,2) NOT NULL,
  projected_balance_p25               DECIMAL(18,2),
  projected_balance_p75               DECIMAL(18,2),
  projected_inflow_total              DECIMAL(18,2),
  projected_outflow_total             DECIMAL(18,2),
  projected_dip_below_threshold       BOOLEAN NOT NULL DEFAULT FALSE,
  dip_threshold                       DECIMAL(18,2),
  evidence                            JSONB,
  confidence                          DECIMAL(4,3) NOT NULL DEFAULT 0.0,
  inferred_by                         TEXT NOT NULL,
  inferred_at                         TIMESTAMPTZ NOT NULL,
  evidence_source                     JSONB,
  source                              source_type NOT NULL DEFAULT 'agent_derived',
  schema_version                      INTEGER NOT NULL DEFAULT 1,
  created_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_infer_cashflow_proj_customer_date ON infer_cashflow_projection(customer_id, projection_date DESC);

-- I-6. infer_company_profile
CREATE TABLE infer_company_profile (
  profile_id                                TEXT PRIMARY KEY,
  customer_id                               TEXT NOT NULL REFERENCES bank_customers(customer_id),
  version                                   INTEGER NOT NULL DEFAULT 1,
  inferred_complexity_level                 INTEGER CHECK (inferred_complexity_level BETWEEN 1 AND 5),
  inferred_complexity_reasoning             TEXT,
  inferred_subindustry                      TEXT,
  inferred_inventory_cycle_days             INTEGER,
  inferred_seasonality_summary              TEXT,
  inferred_primary_bank                     TEXT,
  inferred_wallet_share_at_cimb             DECIMAL(4,3),
  inferred_business_type                    business_type,
  inferred_business_type_confidence         DECIMAL(4,3),
  inferred_revenue_bucket                   revenue_bucket,
  inferred_revenue_bucket_confidence        DECIMAL(4,3),
  inferred_employee_count_bucket            employee_count_bucket,
  inferred_employee_count_confidence        DECIMAL(4,3),
  learned_facts                             JSONB,
  confidence                                DECIMAL(4,3) NOT NULL DEFAULT 0.0,
  inferred_by                               TEXT NOT NULL,
  inferred_at                               TIMESTAMPTZ NOT NULL,
  evidence_source                           JSONB,
  source                                    source_type NOT NULL DEFAULT 'agent_derived',
  schema_version                            INTEGER NOT NULL DEFAULT 1,
  created_at                                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_infer_company_profile_customer ON infer_company_profile(customer_id);

-- I-7. infer_seasonality
CREATE TABLE infer_seasonality (
  pattern_id              TEXT PRIMARY KEY,
  customer_id             TEXT NOT NULL REFERENCES bank_customers(customer_id),
  pattern_type            seasonality_pattern_type NOT NULL,
  pattern_label           TEXT NOT NULL,
  peak_periods            JSONB,
  metric                  seasonality_metric NOT NULL,
  amplitude               DECIMAL(8,4),
  evidence_window         TEXT,
  confidence              DECIMAL(4,3) NOT NULL DEFAULT 0.0,
  inferred_by             TEXT NOT NULL,
  inferred_at             TIMESTAMPTZ NOT NULL,
  evidence_source         JSONB,
  source                  source_type NOT NULL DEFAULT 'agent_derived',
  schema_version          INTEGER NOT NULL DEFAULT 1,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_infer_seasonality_customer ON infer_seasonality(customer_id);

-- I-8. infer_user_preferences
CREATE TABLE infer_user_preferences (
  preference_id              TEXT PRIMARY KEY,
  customer_id                TEXT NOT NULL REFERENCES bank_customers(customer_id),
  preference_type            TEXT NOT NULL,
  preference_key             TEXT NOT NULL,
  preference_value           JSONB NOT NULL,
  evidence_interaction_ids   TEXT[],
  asserted_by                preference_assertion NOT NULL,
  valid_from                 TIMESTAMPTZ NOT NULL,
  superseded_at              TIMESTAMPTZ,
  confidence                 DECIMAL(4,3) NOT NULL DEFAULT 0.0,
  inferred_by                TEXT,
  inferred_at                TIMESTAMPTZ NOT NULL,
  source                     source_type NOT NULL DEFAULT 'agent_chat',
  schema_version             INTEGER NOT NULL DEFAULT 1,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_infer_user_pref_customer_key ON infer_user_preferences(customer_id, preference_key);

-- I-9. infer_interaction_enrichment
CREATE TABLE infer_interaction_enrichment (
  interaction_id                  TEXT PRIMARY KEY REFERENCES bank_interactions(interaction_id),
  customer_id                     TEXT NOT NULL REFERENCES bank_customers(customer_id),
  inferred_intent                 intent_type,
  intent_confidence               DECIMAL(4,3),
  inferred_sentiment              sentiment_type,
  sentiment_confidence            DECIMAL(4,3),
  inferred_topic                  topic_type,
  extracted_entities              JSONB,
  user_satisfaction_signal        satisfaction_signal,
  referenced_bank_entities        JSONB,
  inferred_by                     TEXT NOT NULL,
  inferred_at                     TIMESTAMPTZ NOT NULL,
  evidence_source                 JSONB,
  source                          source_type NOT NULL DEFAULT 'agent_derived',
  schema_version                  INTEGER NOT NULL DEFAULT 1,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- I-10. infer_learning_events (audit trail)
CREATE TABLE infer_learning_events (
  event_id                   TEXT PRIMARY KEY,
  customer_id                TEXT NOT NULL REFERENCES bank_customers(customer_id),
  event_type                 learning_event_type NOT NULL,
  target_table               TEXT NOT NULL,
  target_id                  TEXT NOT NULL,
  before_value               JSONB,
  after_value                JSONB,
  source_interaction_id      TEXT REFERENCES bank_interactions(interaction_id),
  confirmed_by_user          BOOLEAN NOT NULL DEFAULT FALSE,
  reverted_at                TIMESTAMPTZ,
  inferred_by                TEXT NOT NULL,
  inferred_at                TIMESTAMPTZ NOT NULL,
  source                     source_type NOT NULL DEFAULT 'agent_chat',
  schema_version             INTEGER NOT NULL DEFAULT 1,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_infer_learning_events_customer ON infer_learning_events(customer_id, created_at DESC);

-- =============================================================================
-- BACKFILL: bank_credit_limits.product_holding_id FK (after bank_products_held exists)
-- =============================================================================
ALTER TABLE bank_credit_limits
  ADD CONSTRAINT fk_bank_credit_limits_product_holding
  FOREIGN KEY (product_holding_id) REFERENCES bank_products_held(product_holding_id);

-- =============================================================================
-- FINISHED
-- =============================================================================
-- Total tables: 25 (bank 15 + infer 10)
-- Total ENUMs: 33
