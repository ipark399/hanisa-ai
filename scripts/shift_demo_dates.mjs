#!/usr/bin/env node
// Parallel-shift every demo date/timestamp in the Supabase project by N days.
//
//   node scripts/shift_demo_dates.mjs <days>          # apply
//   node scripts/shift_demo_dates.mjs <days> --dry    # report only
//
// WHY THIS EXISTS (not raw SQL): Supabase Postgres is unreachable from the
// dev network — `db.<ref>.supabase.co` returns NXDOMAIN and the pooler
// rejects the tenant — so `psql`/`supabase db push` cannot apply the shift
// migrations. PostgREST is reachable, so we replay the same UPDATEs here.
// Keep this in lockstep with supabase/migrations/00XX_shift_timestamps_*.sql.
//
// WHY TWO PASSES: time-series tables carry unique constraints (e.g.
// bank_balances_daily on (account_id, balance_date, snapshot_type)). Shifting
// a row directly onto a date another row already occupies raises 23505. So
// pass 1 parks every row +10000 days (far future, no collisions) and pass 2
// pulls back (10000 - days) for the net shift.
//
// WHY PASS 1 IS ALL-OR-NOTHING: a partial pass 1 leaves the table split
// between shifted and unshifted rows; running pass 2 over that mix
// double-shifts the rows that did succeed. That happened on the +18d shift
// and needed a hand-written repair. If pass 1 reports any failure we abort
// before pass 2 so the damage stays reversible by re-running pass 2 alone.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const days = Number(process.argv[2]);
const dryRun = process.argv.includes('--dry');
if (!Number.isInteger(days) || days === 0) {
  console.error('Usage: node scripts/shift_demo_dates.mjs <days> [--dry]');
  process.exit(1);
}

const PARK = 10000; // pass 1 offset — far enough out that nothing collides

const envPath = resolve(import.meta.dirname, '../web/.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const [k, ...v] = l.split('=');
      return [k.trim(), v.join('=').trim()];
    })
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in web/.env.local');
  process.exit(1);
}
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal'
};

// `d` = DATE columns (no time part), `ts` = TIMESTAMPTZ columns.
// Mirrors the UPDATE list in the shift migrations — keep both in sync.
const TABLES = [
  { t: 'bank_customers', pk: 'customer_id', d: ['incorporation_date', 'kyc_declared_at'], ts: ['onboarded_at', 'created_at', 'updated_at'] },
  { t: 'bank_accounts', pk: 'account_id', d: ['opened_date', 'closed_date', 'maturity_date'], ts: ['created_at', 'updated_at'] },
  { t: 'bank_balances_daily', pk: 'balance_id', d: ['balance_date'], ts: ['created_at'] },
  { t: 'bank_transactions', pk: 'transaction_id', d: ['transaction_date', 'value_date'], ts: ['posted_at', 'created_at'] },
  { t: 'bank_scheduled_payments', pk: 'scheduled_payment_id', d: ['scheduled_date'], ts: ['executed_at', 'created_at', 'updated_at'] },
  { t: 'bank_products_held', pk: 'product_holding_id', d: ['enrolled_at'], ts: ['created_at', 'updated_at'] },
  { t: 'bank_products_history', pk: 'product_history_id', d: ['event_date'], ts: ['created_at'] },
  { t: 'bank_rm_assignments', pk: 'assignment_id', d: ['assigned_at'], ts: ['created_at', 'updated_at'] },
  { t: 'bank_credit_limits', pk: 'credit_limit_id', d: ['effective_from', 'effective_to'], ts: ['created_at', 'updated_at'] },
  { t: 'bank_credit_drawdowns', pk: 'drawdown_id', d: ['event_date'], ts: ['created_at'] },
  { t: 'bank_preapproved_offers', pk: 'offer_id', d: ['valid_from', 'valid_to'], ts: ['created_at', 'updated_at'] },
  { t: 'bank_product_catalog', pk: 'product_id', d: [], ts: ['last_updated_at', 'created_at', 'updated_at'] },
  { t: 'bank_product_pricing_daily', pk: 'pricing_id', d: ['pricing_date', 'effective_until'], ts: ['created_at'] },
  { t: 'bank_fx_rates', pk: 'fx_rate_id', d: [], ts: ['ts', 'created_at'] },
  { t: 'bank_interactions', pk: 'interaction_id', d: [], ts: ['event_timestamp', 'created_at'] },
  { t: 'infer_counterparties', pk: 'counterparty_id', d: ['relationship_since'], ts: ['inferred_at', 'created_at', 'updated_at'] },
  { t: 'infer_transaction_enrichment', pk: 'transaction_id', d: [], ts: ['inferred_at', 'created_at', 'updated_at'] },
  { t: 'infer_forecasted_payments', pk: 'forecast_id', d: ['expected_date'], ts: ['inferred_at', 'created_at', 'updated_at'] },
  { t: 'infer_expected_inflows', pk: 'inflow_id', d: ['expected_date'], ts: ['inferred_at', 'created_at', 'updated_at'] },
  { t: 'infer_cashflow_projection', pk: 'projection_id', d: ['projection_date', 'horizon_date'], ts: ['inferred_at', 'created_at'] },
  { t: 'infer_company_profile', pk: 'profile_id', d: [], ts: ['inferred_at', 'created_at', 'updated_at'] },
  { t: 'infer_seasonality', pk: 'pattern_id', d: [], ts: ['inferred_at', 'created_at'] },
  { t: 'bloomberg_market_snapshots', pk: 'snapshot_id', d: [], ts: ['as_of_timestamp', 'news_published_at', 'created_at'] },
  { t: 'infer_user_preferences', pk: 'preference_id', d: [], ts: ['valid_from', 'inferred_at', 'created_at'] },
  { t: 'infer_learning_events', pk: 'event_id', d: [], ts: ['inferred_at', 'created_at'] }
];

const shiftTs = (v, n) => { const x = new Date(v); x.setUTCDate(x.getUTCDate() + n); return x.toISOString(); };
const shiftD = (v, n) => { const x = new Date(`${v}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

async function get(table, cols) {
  const r = await fetch(`${URL}/rest/v1/${table}?select=${cols}`, { headers });
  if (!r.ok) throw new Error(`GET ${table}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function patch(table, pk, id, body) {
  const r = await fetch(`${URL}/rest/v1/${table}?${pk}=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers, body: JSON.stringify(body)
  });
  if (!r.ok) { console.error(`    ✗ ${table}[${id}]: ${r.status} ${(await r.text()).slice(0, 160)}`); return false; }
  return true;
}

async function runPass(offset, label) {
  console.log(`\n=== ${label} (${offset > 0 ? '+' : ''}${offset} days) ===`);
  let ok = 0, failed = 0;
  for (const { t, pk, d, ts } of TABLES) {
    const rows = await get(t, [pk, ...d, ...ts].join(','));
    if (!rows.length) { console.log(`  – ${t}: 0 rows`); continue; }
    let n = 0;
    for (const row of rows) {
      const body = {};
      for (const c of d) if (row[c]) body[c] = shiftD(row[c], offset);
      for (const c of ts) if (row[c]) body[c] = shiftTs(row[c], offset);
      if (!Object.keys(body).length) continue;
      if (await patch(t, pk, row[pk], body)) n++; else failed++;
    }
    ok += n;
    console.log(`  ✓ ${t}: ${n}/${rows.length}`);
  }
  return { ok, failed };
}

async function snapshot(label) {
  const probes = [
    ['bank_product_pricing_daily', 'pricing_date'],
    ['bank_balances_daily', 'balance_date'],
    ['infer_cashflow_projection', 'projection_date'],
    ['bloomberg_market_snapshots', 'as_of_timestamp']
  ];
  console.log(`\n--- ${label} ---`);
  for (const [t, col] of probes) {
    const rows = await get(t, col);
    const vals = rows.map((r) => String(r[col])).sort();
    console.log(`  ${t}.${col}: ${vals[0]?.slice(0, 10)} → ${vals[vals.length - 1]?.slice(0, 10)} (${vals.length} rows)`);
  }
}

await snapshot('BEFORE');

if (dryRun) {
  console.log(`\n[--dry] would shift ${TABLES.length} tables by ${days > 0 ? '+' : ''}${days} days. No writes performed.`);
  process.exit(0);
}

const p1 = await runPass(PARK, 'PASS 1 — park far future');
if (p1.failed > 0) {
  console.error(`\nABORT: pass 1 had ${p1.failed} failure(s). Rows are split between parked and un-parked.`);
  console.error(`Recover by running pass 2 only (-${PARK - days}) against the parked rows before retrying.`);
  process.exit(1);
}

const p2 = await runPass(days - PARK, 'PASS 2 — pull back to net');
if (p2.failed > 0) console.error(`\nWARNING: pass 2 had ${p2.failed} failure(s) — rows may still be parked in the far future.`);

await snapshot('AFTER');
console.log(`\nDone. Net shift ${days > 0 ? '+' : ''}${days} days across ${p2.ok} row-updates.`);
