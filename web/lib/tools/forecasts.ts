// Tools: agent-inferred forecasts (forecasted_payments, expected_inflows, cashflow_projection).

import { supabase, getDemoCurrentTimestamp, DEMO_CUSTOMER_ID } from '../supabase';

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function get_forecasted_payments(args: { days_ahead?: number; currency?: string } = {}) {
  const days = args.days_ahead ?? 30;
  const asOf = getDemoCurrentTimestamp().slice(0, 10);
  const to = addDays(asOf, days);

  let q = supabase
    .from('infer_forecasted_payments')
    .select('forecast_id, forecast_method, based_on_counterparty_id, expected_date, expected_amount_min, expected_amount_max, expected_amount_mean, currency, fx_pair, evidence_transaction_ids, status, confidence')
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .gte('expected_date', asOf)
    .lte('expected_date', to)
    .eq('status', 'active')
    .order('expected_date', { ascending: true });

  if (args.currency) q = q.eq('currency', args.currency);

  const { data } = await q;

  // Enrich with counterparty names
  const cpIds = [...new Set((data ?? []).map((r) => r.based_on_counterparty_id).filter(Boolean) as string[])];
  const { data: cps } = cpIds.length
    ? await supabase
        .from('infer_counterparties')
        .select('counterparty_id, resolved_name, inferred_country, inferred_industry')
        .in('counterparty_id', cpIds)
    : { data: [] };
  const cpMap = new Map((cps ?? []).map((c) => [c.counterparty_id, c]));

  return {
    window: { from: asOf, to, days_ahead: days },
    count: (data ?? []).length,
    forecasts: (data ?? []).map((f) => ({
      ...f,
      counterparty: f.based_on_counterparty_id ? cpMap.get(f.based_on_counterparty_id) : null
    }))
  };
}

export async function get_expected_inflows(args: { days_ahead?: number; include_overdue?: boolean } = {}) {
  const days = args.days_ahead ?? 30;
  const includeOverdue = args.include_overdue ?? true;
  const asOf = getDemoCurrentTimestamp().slice(0, 10);
  const to = addDays(asOf, days);

  let q = supabase
    .from('infer_expected_inflows')
    .select('inflow_id, based_on_counterparty_id, expected_date, expected_amount_min, expected_amount_max, expected_amount_mean, currency, status, days_overdue, confidence, evidence_transaction_ids')
    .eq('customer_id', DEMO_CUSTOMER_ID);

  if (includeOverdue) {
    q = q.or(`status.eq.overdue,and(expected_date.gte.${asOf},expected_date.lte.${to})`);
  } else {
    q = q.gte('expected_date', asOf).lte('expected_date', to);
  }

  const { data } = await q.order('expected_date', { ascending: true });

  const cpIds = [...new Set((data ?? []).map((r) => r.based_on_counterparty_id).filter(Boolean) as string[])];
  const { data: cps } = cpIds.length
    ? await supabase
        .from('infer_counterparties')
        .select('counterparty_id, resolved_name')
        .in('counterparty_id', cpIds)
    : { data: [] };
  const cpMap = new Map((cps ?? []).map((c) => [c.counterparty_id, c.resolved_name]));

  return {
    window: { from: asOf, to, days_ahead: days },
    count: (data ?? []).length,
    inflows: (data ?? []).map((i) => ({
      ...i,
      counterparty_name: i.based_on_counterparty_id ? cpMap.get(i.based_on_counterparty_id) : null
    }))
  };
}

export async function get_cashflow_projection(args: { horizon_days?: number } = {}) {
  const horizon = args.horizon_days ?? 7;
  const asOf = getDemoCurrentTimestamp().slice(0, 10);

  // Find best matching pre-batched projection (PoC: hard-coded snapshots)
  const { data: snapshots } = await supabase
    .from('infer_cashflow_projection')
    .select('*')
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .lte('projection_date', asOf)
    .order('projection_date', { ascending: false })
    .limit(20);

  // Choose snapshot whose horizon_days matches closest
  const ranked = (snapshots ?? []).map((s) => {
    const projDays = Math.round(
      (new Date(s.horizon_date).getTime() - new Date(s.projection_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    return { snapshot: s, projDays, diff: Math.abs(projDays - horizon) };
  });
  ranked.sort((a, b) => a.diff - b.diff);

  const best = ranked[0]?.snapshot ?? null;
  return {
    requested_horizon_days: horizon,
    projection: best,
    note: best
      ? `Matched pre-computed projection (horizon ${ranked[0].projDays} days vs requested ${horizon}).`
      : 'No cached projection found; would compute on-demand in production.'
  };
}
