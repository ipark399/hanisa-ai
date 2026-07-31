-- Shift all timestamps +18 days. Makes demo data current as of 2026-07-31.
-- Fri 2026-07-13 → Thu 2026-07-31 | Fri 2026-07-31 → Tue 2026-08-18
-- REQ: keep demo data feeling current for audience.
--
-- Two-pass shift (same pattern as 0005) to avoid unique constraint violations
-- on time-series tables (bank_balances_daily, etc).
-- Pass 1: +10000 days   Pass 2: -9982 days   Net: +18 days

-- =============================================================================
-- PASS 1: +10000 days
-- =============================================================================

UPDATE bank_customers SET
  incorporation_date = incorporation_date + INTERVAL '10000 days',
  kyc_declared_at = kyc_declared_at + INTERVAL '10000 days',
  onboarded_at = onboarded_at + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days',
  updated_at = updated_at + INTERVAL '10000 days';

UPDATE bank_accounts SET
  opened_date = opened_date + INTERVAL '10000 days',
  closed_date = closed_date + INTERVAL '10000 days',
  maturity_date = maturity_date + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days',
  updated_at = updated_at + INTERVAL '10000 days';

UPDATE bank_balances_daily SET
  balance_date = balance_date + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days';

UPDATE bank_transactions SET
  transaction_date = transaction_date + INTERVAL '10000 days',
  posted_at = posted_at + INTERVAL '10000 days',
  value_date = value_date + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days';

UPDATE bank_scheduled_payments SET
  scheduled_date = scheduled_date + INTERVAL '10000 days',
  executed_at = executed_at + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days',
  updated_at = updated_at + INTERVAL '10000 days';

UPDATE bank_products_held SET
  enrolled_at = enrolled_at + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days',
  updated_at = updated_at + INTERVAL '10000 days';

UPDATE bank_products_history SET
  event_date = event_date + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days';

UPDATE bank_rm_assignments SET
  assigned_at = assigned_at + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days',
  updated_at = updated_at + INTERVAL '10000 days';

UPDATE bank_credit_limits SET
  effective_from = effective_from + INTERVAL '10000 days',
  effective_to = effective_to + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days',
  updated_at = updated_at + INTERVAL '10000 days';

UPDATE bank_credit_drawdowns SET
  event_date = event_date + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days';

UPDATE bank_preapproved_offers SET
  valid_from = valid_from + INTERVAL '10000 days',
  valid_to = valid_to + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days',
  updated_at = updated_at + INTERVAL '10000 days';

UPDATE bank_product_catalog SET
  last_updated_at = last_updated_at + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days',
  updated_at = updated_at + INTERVAL '10000 days';

UPDATE bank_product_pricing_daily SET
  pricing_date = pricing_date + INTERVAL '10000 days',
  effective_until = effective_until + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days';

UPDATE bank_fx_rates SET
  ts = ts + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days';

UPDATE bank_interactions SET
  event_timestamp = event_timestamp + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days';

UPDATE infer_counterparties SET
  relationship_since = relationship_since + INTERVAL '10000 days',
  inferred_at = inferred_at + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days',
  updated_at = updated_at + INTERVAL '10000 days';

UPDATE infer_transaction_enrichment SET
  inferred_at = inferred_at + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days',
  updated_at = updated_at + INTERVAL '10000 days';

UPDATE infer_forecasted_payments SET
  expected_date = expected_date + INTERVAL '10000 days',
  inferred_at = inferred_at + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days',
  updated_at = updated_at + INTERVAL '10000 days';

UPDATE infer_expected_inflows SET
  expected_date = expected_date + INTERVAL '10000 days',
  inferred_at = inferred_at + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days',
  updated_at = updated_at + INTERVAL '10000 days';

UPDATE infer_cashflow_projection SET
  projection_date = projection_date + INTERVAL '10000 days',
  horizon_date = horizon_date + INTERVAL '10000 days',
  inferred_at = inferred_at + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days';

UPDATE infer_company_profile SET
  inferred_at = inferred_at + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days',
  updated_at = updated_at + INTERVAL '10000 days';

UPDATE infer_seasonality SET
  inferred_at = inferred_at + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days';

UPDATE bloomberg_market_snapshots SET
  as_of_timestamp = as_of_timestamp + INTERVAL '10000 days',
  news_published_at = news_published_at + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days';

UPDATE infer_user_preferences SET
  valid_from = valid_from + INTERVAL '10000 days',
  inferred_at = inferred_at + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days';

UPDATE infer_learning_events SET
  inferred_at = inferred_at + INTERVAL '10000 days',
  created_at = created_at + INTERVAL '10000 days';

-- =============================================================================
-- PASS 2: -9982 days (net = +18 days)
-- =============================================================================

UPDATE bank_customers SET
  incorporation_date = incorporation_date - INTERVAL '9982 days',
  kyc_declared_at = kyc_declared_at - INTERVAL '9982 days',
  onboarded_at = onboarded_at - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days',
  updated_at = updated_at - INTERVAL '9982 days';

UPDATE bank_accounts SET
  opened_date = opened_date - INTERVAL '9982 days',
  closed_date = closed_date - INTERVAL '9982 days',
  maturity_date = maturity_date - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days',
  updated_at = updated_at - INTERVAL '9982 days';

UPDATE bank_balances_daily SET
  balance_date = balance_date - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days';

UPDATE bank_transactions SET
  transaction_date = transaction_date - INTERVAL '9982 days',
  posted_at = posted_at - INTERVAL '9982 days',
  value_date = value_date - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days';

UPDATE bank_scheduled_payments SET
  scheduled_date = scheduled_date - INTERVAL '9982 days',
  executed_at = executed_at - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days',
  updated_at = updated_at - INTERVAL '9982 days';

UPDATE bank_products_held SET
  enrolled_at = enrolled_at - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days',
  updated_at = updated_at - INTERVAL '9982 days';

UPDATE bank_products_history SET
  event_date = event_date - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days';

UPDATE bank_rm_assignments SET
  assigned_at = assigned_at - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days',
  updated_at = updated_at - INTERVAL '9982 days';

UPDATE bank_credit_limits SET
  effective_from = effective_from - INTERVAL '9982 days',
  effective_to = effective_to - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days',
  updated_at = updated_at - INTERVAL '9982 days';

UPDATE bank_credit_drawdowns SET
  event_date = event_date - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days';

UPDATE bank_preapproved_offers SET
  valid_from = valid_from - INTERVAL '9982 days',
  valid_to = valid_to - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days',
  updated_at = updated_at - INTERVAL '9982 days';

UPDATE bank_product_catalog SET
  last_updated_at = last_updated_at - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days',
  updated_at = updated_at - INTERVAL '9982 days';

UPDATE bank_product_pricing_daily SET
  pricing_date = pricing_date - INTERVAL '9982 days',
  effective_until = effective_until - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days';

UPDATE bank_fx_rates SET
  ts = ts - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days';

UPDATE bank_interactions SET
  event_timestamp = event_timestamp - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days';

UPDATE infer_counterparties SET
  relationship_since = relationship_since - INTERVAL '9982 days',
  inferred_at = inferred_at - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days',
  updated_at = updated_at - INTERVAL '9982 days';

UPDATE infer_transaction_enrichment SET
  inferred_at = inferred_at - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days',
  updated_at = updated_at - INTERVAL '9982 days';

UPDATE infer_forecasted_payments SET
  expected_date = expected_date - INTERVAL '9982 days',
  inferred_at = inferred_at - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days',
  updated_at = updated_at - INTERVAL '9982 days';

UPDATE infer_expected_inflows SET
  expected_date = expected_date - INTERVAL '9982 days',
  inferred_at = inferred_at - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days',
  updated_at = updated_at - INTERVAL '9982 days';

UPDATE infer_cashflow_projection SET
  projection_date = projection_date - INTERVAL '9982 days',
  horizon_date = horizon_date - INTERVAL '9982 days',
  inferred_at = inferred_at - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days';

UPDATE infer_company_profile SET
  inferred_at = inferred_at - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days',
  updated_at = updated_at - INTERVAL '9982 days';

UPDATE infer_seasonality SET
  inferred_at = inferred_at - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days';

UPDATE bloomberg_market_snapshots SET
  as_of_timestamp = as_of_timestamp - INTERVAL '9982 days',
  news_published_at = news_published_at - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days';

UPDATE infer_user_preferences SET
  valid_from = valid_from - INTERVAL '9982 days',
  inferred_at = inferred_at - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days';

UPDATE infer_learning_events SET
  inferred_at = inferred_at - INTERVAL '9982 days',
  created_at = created_at - INTERVAL '9982 days';
