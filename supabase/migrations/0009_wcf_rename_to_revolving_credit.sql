-- Migration 0009 — Rename "Working Capital Facility" display to "Revolving Credit"
--                    with "auto-enrollment" positioning (ws-174, 2026-07-15)
--
-- product_id stays 'working_capital_facility' (no cascade through
-- bank_products_held, bank_credit_limits, bank_product_pricing_daily).
-- Only display names and descriptions change.

BEGIN;

-- 1. bank_product_catalog: product_name + short/long descriptions
UPDATE bank_product_catalog
SET product_name = 'Revolving Credit',
    short_description = 'Auto-enrollment revolving credit line for ongoing working capital needs.',
    long_description = 'A revolving credit line that qualified SMEs are automatically enrolled into based on account standing and cashflow activity — no separate application needed. Provides an always-available limit for inventory financing, supplier payments, and operating cashflow gaps. Limit reviewed annually. Higher rate than FlexiCash but broader eligibility for larger amounts. Typical limit MYR 100K to MYR 5M for SMEs.',
    updated_at = NOW()
WHERE product_id = 'working_capital_facility';

-- 2. bank_products_held: display product_name for existing enrolment
UPDATE bank_products_held
SET product_name = 'Revolving Credit',
    updated_at = NOW()
WHERE product_id = 'working_capital_facility';

COMMIT;
