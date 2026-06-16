// Tools: trigger evaluators for the 3 PPT hero moments.
// Each returns: { trigger_fires: bool, payload: { ...evidence } }

import { supabase, getDemoCurrentTimestamp, DEMO_CUSTOMER_ID } from '../supabase';
import { get_cashflow_projection, get_expected_inflows, get_forecasted_payments } from './forecasts';
import { get_preapproved_offers } from './credit';

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function check_monday_brief() {
  const asOf = getDemoCurrentTimestamp().slice(0, 10);

  // Demo PoC: always fires on a Monday or if user is hitting Step 1. In production this would check last brief timestamp.
  const proj = await get_cashflow_projection({ horizon_days: 7 });
  const inflows = await get_expected_inflows({ days_ahead: 14, include_overdue: true });
  const overdue = inflows.inflows.filter((i: any) => i.status === 'overdue');

  // Weekend FX move on EUR/MYR (last 3 days)
  const { data: fxRecent } = await supabase
    .from('bank_fx_rates')
    .select('mid, ts')
    .eq('pair', 'EUR/MYR')
    .eq('granularity', 'eod')
    .lte('ts', `${asOf}T23:59:59+08:00`)
    .order('ts', { ascending: false })
    .limit(4);
  const fxDelta = fxRecent && fxRecent.length >= 2
    ? Number(fxRecent[0].mid) - Number(fxRecent[fxRecent.length - 1].mid)
    : 0;
  const fxDeltaPct = fxRecent && fxRecent[0].mid ? (fxDelta / Number(fxRecent[0].mid)) * 100 : 0;

  return {
    trigger_fires: true,
    as_of: asOf,
    payload: {
      net_inflow_myr: proj.projection?.projected_inflow_total ?? null,
      net_outflow_myr: proj.projection?.projected_outflow_total ?? null,
      overdue_receivables: overdue.map((o: any) => ({
        counterparty_name: o.counterparty_name,
        amount_myr: o.expected_amount_mean,
        days_overdue: o.days_overdue
      })),
      fx_delta_eur_myr_pct: Math.round(fxDeltaPct * 10) / 10
    }
  };
}

export async function check_fx_opportunity() {
  const asOf = getDemoCurrentTimestamp().slice(0, 10);

  // Find forecasted FX payments within 14 days
  const forecasts = await get_forecasted_payments({ days_ahead: 14 });
  const fxForecasts = forecasts.forecasts.filter((f: any) => f.fx_pair && f.fx_pair.includes('EUR'));
  if (fxForecasts.length === 0) {
    return { trigger_fires: false, reason: 'no_forecasted_fx_payments' };
  }
  const next = fxForecasts[0];

  // Get current EUR/MYR mid
  const { data: currentRate } = await supabase
    .from('bank_fx_rates')
    .select('mid, ts')
    .eq('pair', 'EUR/MYR')
    .eq('granularity', 'eod')
    .lte('ts', `${asOf}T23:59:59+08:00`)
    .order('ts', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get 90-day average
  const ninetyAgo = addDays(asOf, -90);
  const { data: window90 } = await supabase
    .from('bank_fx_rates')
    .select('mid')
    .eq('pair', 'EUR/MYR')
    .eq('granularity', 'eod')
    .gte('ts', `${ninetyAgo}T00:00:00+08:00`)
    .lte('ts', `${asOf}T23:59:59+08:00`);
  const avg = window90 && window90.length
    ? window90.reduce((s, r) => s + Number(r.mid), 0) / window90.length
    : 0;
  const current = currentRate ? Number(currentRate.mid) : 0;
  const pctBetter = avg > 0 ? ((current - avg) / avg) * 100 : 0;

  const fires = pctBetter >= 2.0;
  const daysAhead = Math.round(
    (new Date(next.expected_date).getTime() - new Date(asOf).getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    trigger_fires: fires,
    reason: fires ? 'rate_favourable_and_forecast_near' : 'rate_not_sufficiently_better',
    payload: {
      forecast: {
        expected_date: next.expected_date,
        days_ahead: daysAhead,
        expected_amount_mean_eur: next.expected_amount_mean,
        currency: next.currency,
        counterparty_name: next.counterparty?.resolved_name ?? null,
        confidence: next.confidence
      },
      fx: {
        pair: 'EUR/MYR',
        current_mid: current,
        ninety_day_avg: Math.round(avg * 10000) / 10000,
        pct_better_than_avg: Math.round(pctBetter * 10) / 10
      }
    }
  };
}

export async function check_flexicash_opportunity() {
  const proj = await get_cashflow_projection({ horizon_days: 21 });
  const offers = await get_preapproved_offers();

  const dipFlag = proj.projection?.projected_dip_below_threshold ?? false;
  const flexOffer = offers.offers.find((o: any) => o.product_type === 'flexicash');

  const fires = dipFlag && Boolean(flexOffer);

  return {
    trigger_fires: fires,
    reason: !dipFlag
      ? 'no_projected_dip'
      : !flexOffer
        ? 'no_open_flexicash_offer'
        : 'dip_predicted_and_offer_available',
    payload: {
      projection: proj.projection
        ? {
            projection_date: proj.projection.projection_date,
            horizon_date: proj.projection.horizon_date,
            projected_balance_mean: proj.projection.projected_balance_mean,
            dip_threshold: proj.projection.dip_threshold,
            confidence: proj.projection.confidence
          }
        : null,
      offer: flexOffer
        ? {
            offer_id: flexOffer.offer_id,
            approved_amount: flexOffer.approved_amount,
            currency: flexOffer.currency,
            valid_to: flexOffer.valid_to,
            terms: flexOffer.offer_terms
          }
        : null
    }
  };
}
