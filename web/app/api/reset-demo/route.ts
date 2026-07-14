// POST /api/reset-demo — clears prod DB residue from prior demo runs so the
// next session starts from the seeded baseline.
//
// What this undoes (ws-160 F3):
//   • bank_preapproved_offers offer_flx_001: status → 'open', clear accepted_*
//   • bank_products_held rows whose product_holding_id starts with 'ph_flx_'
//     (FlexiCash holdings created by Apply taps).
//   • bank_credit_limits rows whose credit_limit_id starts with 'cl_flx_'
//     (FlexiCash limits created by Apply taps).
//   • bank_scheduled_payments rows whose scheduled_payment_id starts with
//     'sched_fx_' (FX forwards created by Lock taps).
//   • bank_interactions rows whose interaction_id starts with 'int_' (chat
//     turns + click events from prior demos — audit log, safe to clear).
//   • infer_user_preferences rows whose preference_id starts with 'pref_'.
//   • infer_learning_events rows whose event_id starts with 'le_'.
//
// What this preserves: all seeded baseline rows (numeric / non-`_`-prefixed
// ids from 0002_seed_data.sql).
//
// Response: { reset: true, deleted: { ...counts } }

import { NextResponse } from 'next/server';
import { supabase, DEMO_CUSTOMER_ID } from '@/lib/supabase';

async function delByPrefix(
  table: string,
  column: string,
  prefix: string
): Promise<number> {
  // PostgREST LIKE: use ilike with % wildcard for prefix match.
  const { data, error } = await supabase
    .from(table)
    .delete()
    .ilike(column, `${prefix}%`)
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .select(column);
  if (error) {
    console.error(`[reset-demo] ${table} delete failed:`, error);
    return 0;
  }
  return (data ?? []).length;
}

export async function POST() {
  try {
    // 1. Reset the pre-approved FlexiCash offer to 'open'.
    const { error: offerErr } = await supabase
      .from('bank_preapproved_offers')
      .update({ status: 'open', accepted_at: null, accepted_via: null })
      .eq('offer_id', 'offer_flx_001');
    if (offerErr) console.error('[reset-demo] offer reset failed:', offerErr);

    // 2-7. Drop Apply / Lock / chat / learning residue by id prefix.
    const counts = {
      bank_products_held: await delByPrefix('bank_products_held', 'product_holding_id', 'ph_flx_'),
      bank_credit_limits: await delByPrefix('bank_credit_limits', 'credit_limit_id', 'cl_flx_'),
      bank_scheduled_payments: await delByPrefix(
        'bank_scheduled_payments',
        'scheduled_payment_id',
        'sched_fx_'
      ),
      bank_interactions: await delByPrefix('bank_interactions', 'interaction_id', 'int_'),
      infer_user_preferences: await delByPrefix(
        'infer_user_preferences',
        'preference_id',
        'pref_'
      ),
      infer_learning_events: await delByPrefix('infer_learning_events', 'event_id', 'le_')
    };

    // 8. Defense-in-depth: also delete any pending_rm_review rows by status
    // (catches rows regardless of id prefix pattern).
    for (const table of ['bank_scheduled_payments', 'bank_products_held', 'bank_credit_limits'] as const) {
      const { error: statusErr } = await supabase
        .from(table)
        .delete()
        .eq('status', 'pending_rm_review')
        .eq('customer_id', DEMO_CUSTOMER_ID);
      if (statusErr) console.error(`[reset-demo] ${table} pending_rm_review delete failed:`, statusErr);
    }

    return NextResponse.json({
      reset: true,
      offer_status_restored: offerErr ? false : true,
      deleted: counts
    });
  } catch (err) {
    console.error('[/api/reset-demo] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
