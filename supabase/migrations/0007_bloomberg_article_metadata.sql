-- Migration 0007 — Extend bloomberg_market_snapshots with article metadata (ws-173 FX-M1 fix)
--
-- WHY: FX-M1 test asked "Where's the ECB dovish news from? Which article, what time?"
-- Original schema exposed only headline + source name; no URL, no summary, no
-- publication timestamp. LLM returned an empty response because it had nothing
-- concrete to cite. Adding fake-but-realistic article metadata lets the agent
-- point Mr. Bakri to a specific source when he probes the news claim.

ALTER TABLE bloomberg_market_snapshots
  ADD COLUMN IF NOT EXISTS news_article_url  TEXT,
  ADD COLUMN IF NOT EXISTS news_summary      TEXT,
  ADD COLUMN IF NOT EXISTS news_published_at TIMESTAMPTZ;

-- Act 1 Step 2 snapshot (Mon 13 Jul 10:30) — ECB dovish, story published Fri
UPDATE bloomberg_market_snapshots
SET news_article_url  = 'https://www.bloomberg.com/news/articles/2026-07-11/ecb-signals-extended-accommodation-eur-softens-across-asian-fx',
    news_summary      = 'The European Central Bank signaled a more dovish stance at Friday''s press conference, hinting at extended accommodative policy through year-end. EUR weakened 0.3% against major Asian currencies including MYR, with traders pricing in reduced rate hike probability for September. ING and BNP Paribas strategists expect continued softness through Q3 barring inflation surprises.',
    news_published_at = '2026-07-11T14:30:00Z'
WHERE snapshot_id = 'bbg_20260713_eurmyr';

-- Act 2 Step 5 snapshot (Fri 31 Jul 15:00) — MYR steady on July close
UPDATE bloomberg_market_snapshots
SET news_article_url  = 'https://www.bloomberg.com/news/articles/2026-07-31/myr-holds-ground-asian-fx-flows-july-close',
    news_summary      = 'MYR held its ground against major currencies on the final trading day of July, supported by end-month exporter demand and stable palm oil futures. EUR/MYR traded in a narrow 4.955-4.965 range through the Asian session. Traders await Bank Negara Malaysia''s August monetary policy decision for direction.',
    news_published_at = '2026-07-31T02:15:00Z'
WHERE snapshot_id = 'bbg_20260731_eurmyr';
