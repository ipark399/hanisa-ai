-- Shift all seed timestamps +35 days (5 weeks). Preserves day-of-week.
-- Mon 2026-06-08 → Mon 2026-07-13 | Fri 2026-06-26 → Fri 2026-07-31
-- REQ-CIMB-03-10: Keeps demo data feeling current for audience.
-- Applied as UPDATE on top of 0002_seed_data.sql (original preserved for git blame).

-- bank_customers
UPDATE bank_customers SET
  incorporation_date = incorporation_date + INTERVAL '35 days',
  kyc_declared_at = kyc_declared_at + INTERVAL '35 days',
  onboarded_at = onboarded_at + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days',
  updated_at = updated_at + INTERVAL '35 days';

-- bank_accounts
UPDATE bank_accounts SET
  opened_date = opened_date + INTERVAL '35 days',
  closed_date = closed_date + INTERVAL '35 days',
  maturity_date = maturity_date + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days',
  updated_at = updated_at + INTERVAL '35 days';

-- bank_balances_daily
UPDATE bank_balances_daily SET
  balance_date = balance_date + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days';

-- bank_transactions
UPDATE bank_transactions SET
  transaction_date = transaction_date + INTERVAL '35 days',
  posted_at = posted_at + INTERVAL '35 days',
  value_date = value_date + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days';

-- bank_scheduled_payments
UPDATE bank_scheduled_payments SET
  scheduled_date = scheduled_date + INTERVAL '35 days',
  executed_at = executed_at + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days',
  updated_at = updated_at + INTERVAL '35 days';

-- bank_products_held
UPDATE bank_products_held SET
  enrolled_at = enrolled_at + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days',
  updated_at = updated_at + INTERVAL '35 days';

-- bank_products_history
UPDATE bank_products_history SET
  event_date = event_date + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days';

-- bank_rm_assignments
UPDATE bank_rm_assignments SET
  assigned_at = assigned_at + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days',
  updated_at = updated_at + INTERVAL '35 days';

-- bank_credit_limits
UPDATE bank_credit_limits SET
  effective_from = effective_from + INTERVAL '35 days',
  effective_to = effective_to + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days',
  updated_at = updated_at + INTERVAL '35 days';

-- bank_credit_drawdowns
UPDATE bank_credit_drawdowns SET
  event_date = event_date + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days';

-- bank_preapproved_offers
UPDATE bank_preapproved_offers SET
  valid_from = valid_from + INTERVAL '35 days',
  valid_to = valid_to + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days',
  updated_at = updated_at + INTERVAL '35 days';

-- bank_product_catalog
UPDATE bank_product_catalog SET
  last_updated_at = last_updated_at + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days',
  updated_at = updated_at + INTERVAL '35 days';

-- bank_product_pricing_daily
UPDATE bank_product_pricing_daily SET
  pricing_date = pricing_date + INTERVAL '35 days',
  effective_until = effective_until + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days';

-- bank_fx_rates (1119 rows)
UPDATE bank_fx_rates SET
  ts = ts + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days';

-- bank_interactions
UPDATE bank_interactions SET
  event_timestamp = event_timestamp + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days';

-- infer_counterparties
UPDATE infer_counterparties SET
  relationship_since = relationship_since + INTERVAL '35 days',
  inferred_at = inferred_at + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days',
  updated_at = updated_at + INTERVAL '35 days';

-- infer_transaction_enrichment
UPDATE infer_transaction_enrichment SET
  inferred_at = inferred_at + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days',
  updated_at = updated_at + INTERVAL '35 days';

-- infer_forecasted_payments
UPDATE infer_forecasted_payments SET
  expected_date = expected_date + INTERVAL '35 days',
  inferred_at = inferred_at + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days',
  updated_at = updated_at + INTERVAL '35 days';

-- infer_expected_inflows
UPDATE infer_expected_inflows SET
  expected_date = expected_date + INTERVAL '35 days',
  inferred_at = inferred_at + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days',
  updated_at = updated_at + INTERVAL '35 days';

-- infer_cashflow_projection
UPDATE infer_cashflow_projection SET
  projection_date = projection_date + INTERVAL '35 days',
  horizon_date = horizon_date + INTERVAL '35 days',
  inferred_at = inferred_at + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days';

-- infer_company_profile
UPDATE infer_company_profile SET
  inferred_at = inferred_at + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days',
  updated_at = updated_at + INTERVAL '35 days';

-- infer_seasonality
UPDATE infer_seasonality SET
  inferred_at = inferred_at + INTERVAL '35 days',
  created_at = created_at + INTERVAL '35 days';
