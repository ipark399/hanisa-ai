-- Migration 0008 — Act 2 loan comparison scenario updates (ws-174, 2026-07-15)
--
-- Changes:
--   1. FlexiCash rate: 8.5% → 6.5% (positioned as cheapest applicable option)
--   2. Working Capital Facility rate: 7.2% → 8.0%, repositioned as auto-revolving
--   3. Trade Bridging Loan: DELETE from catalog (out of scope for Act 2 loan comparison)
--
-- Impact: Act 2 Step 2 loan comparison now shows 2 products, FlexiCash as cheapest.
-- Storyboard text updated in the same commit.

BEGIN;

-- 1. FlexiCash rate update (bank_product_pricing_daily.value_decimal)
UPDATE bank_product_pricing_daily
SET value_decimal = 6.5
WHERE product_id = 'flexicash' AND pricing_id = 'price_0001';

-- 2. Working Capital Facility rate update
UPDATE bank_product_pricing_daily
SET value_decimal = 8.0
WHERE product_id = 'working_capital_facility' AND pricing_id = 'price_0002';

-- 3. FlexiCash catalog indicative_pricing text
UPDATE bank_product_catalog
SET indicative_pricing = '6.5% p.a. (variable, indexed to OPR + 3.5%). No setup fee. No annual fee. Interest charged on daily outstanding balance.',
    updated_at = NOW()
WHERE product_id = 'flexicash';

-- 4. Working Capital Facility catalog: repositioned as auto-revolving + rate 8.0%
UPDATE bank_product_catalog
SET short_description = 'Auto-revolving annual credit line that re-establishes each cycle for ongoing working capital needs.',
    long_description = 'A revolving credit facility with a fixed annual limit that automatically renews without manual reapplication. Supports inventory financing, supplier payments, and operating cashflow gaps on a continuous basis. Typically secured by personal/corporate guarantee or collateral depending on amount. Higher rate than FlexiCash but broader eligibility for larger limits. Limit usually MYR 100K to MYR 5M for SMEs.',
    indicative_pricing = '8.0% p.a. (variable, OPR + 5.0%). Setup fee 1% of limit (one-time). Annual review fee MYR 500.',
    updated_at = NOW()
WHERE product_id = 'working_capital_facility';

-- 5. Pre-approved FlexiCash offer terms: interest_rate_pa 8.5 → 6.5
UPDATE bank_preapproved_offers
SET offer_terms = jsonb_set(offer_terms, '{interest_rate_pa}', '6.5'::jsonb),
    updated_at = NOW()
WHERE offer_id = 'offer_flx_001';

-- 6. Working Capital credit limit rate: 7.2 → 8.0
UPDATE bank_credit_limits
SET interest_rate = 8.0,
    updated_at = NOW()
WHERE credit_limit_id = 'cl_wc_001';

-- 7. Delete Trade Bridging Loan (pricing first for FK order)
DELETE FROM bank_product_pricing_daily
WHERE product_id = 'trade_bridging_loan';

DELETE FROM bank_product_catalog
WHERE product_id = 'trade_bridging_loan';

COMMIT;
