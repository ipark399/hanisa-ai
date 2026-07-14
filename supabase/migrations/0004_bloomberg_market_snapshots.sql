-- Bloomberg market context snapshots for judgment-assist layer.
-- REQ-CIMB-03-05: Seed table + 2 snapshot rows (Act 1 / Act 2 dates).
-- No forecast/prediction fields — observed market facts only.

CREATE TABLE IF NOT EXISTS bloomberg_market_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  as_of_timestamp TIMESTAMPTZ NOT NULL,
  fx_pair TEXT NOT NULL,
  fx_rate_mid NUMERIC(10, 4),
  fx_rate_24h_delta_pct NUMERIC(5, 2),
  historical_percentile_90d NUMERIC(5, 2),
  historical_range_position TEXT,
  news_headline TEXT,
  news_source TEXT DEFAULT 'Bloomberg',
  news_event_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO bloomberg_market_snapshots VALUES
  ('bbg_20260713_eurmyr', '2026-07-13T02:30:00Z', 'EUR/MYR',
   4.9528, 0.32, 85, 'top 15%',
   'EUR softens after ECB dovish remarks', 'Bloomberg', 'central_bank', NOW()),
  ('bbg_20260731_eurmyr', '2026-07-31T07:00:00Z', 'EUR/MYR',
   4.9612, -0.18, 78, 'top 22%',
   'MYR steady amid Asian market flows', 'Bloomberg', 'macro_indicator', NOW());
