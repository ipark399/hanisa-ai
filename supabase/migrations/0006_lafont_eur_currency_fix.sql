-- Migration 0006 — Fix Domaine Lafont seed inconsistency (ws-173 Step 2 case testing finding)
--
-- WHY: Push message at Act 1 Step 2 claims "EUR payment ~MYR 38K based on your
-- monthly pattern". Original seed stored Domaine Lafont's 12 monthly payments
-- with currency='MYR' (settlement currency), and the forecast row also had
-- currency='MYR' with amount 38,400. When the LLM calls
-- get_recent_transactions({currency: 'EUR'}) or get_forecasted_payments({currency: 'EUR'}),
-- neither returned any rows -> LLM answered "no EUR payment history" and even
-- contradicted its own push message ("please disregard the MYR 38K figure").
-- 7/8 Step 2 case tests failed as a result (see ws-173 handoff).
--
-- FIX: Store Domaine Lafont payments in their source currency (EUR) with
-- fx_pair/fx_rate metadata already present. Convert amount using the recorded
-- fx_rate. Update the forecast row to EUR 8,200 mean (matches the MYR 38K
-- narrative at the current EUR/MYR mid of 4.9528).

-- 1. Convert Lafont bank transactions from MYR (settlement) to EUR (source)
UPDATE bank_transactions
SET currency = 'EUR',
    amount   = ROUND((amount / fx_rate)::numeric, 2)
WHERE customer_id = 'ahmad_01'
  AND fx_pair = 'EUR/MYR'
  AND counterparty_raw_text ILIKE '%LAFONT%';

-- 2. Fix the forecast currency + amounts (EUR native, not MYR settlement)
UPDATE infer_forecasted_payments
SET currency            = 'EUR',
    expected_amount_min = 7800,
    expected_amount_max = 8500,
    expected_amount_mean = 8200
WHERE forecast_id = 'fcst_eur_lafont_07';
