// Tools: transactions (recent) + scheduled payments.

import { supabase, getDemoCurrentTimestamp, DEMO_CUSTOMER_ID } from '../supabase';

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function get_recent_transactions(args: { days?: number; currency?: string } = {}) {
  const days = args.days ?? 30;
  const asOf = getDemoCurrentTimestamp().slice(0, 10);
  const from = addDays(asOf, -days);

  let q = supabase
    .from('bank_transactions')
    .select('transaction_id, transaction_date, amount, currency, direction, transaction_type, counterparty_raw_text, description, channel, fx_pair, fx_rate')
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .gte('transaction_date', from)
    .lte('transaction_date', asOf)
    .order('transaction_date', { ascending: false })
    .limit(200);

  if (args.currency) q = q.eq('currency', args.currency);

  const { data } = await q;

  // Attach inferred enrichment
  const ids = (data ?? []).map((t) => t.transaction_id);
  const { data: enrich } = ids.length
    ? await supabase
        .from('infer_transaction_enrichment')
        .select('transaction_id, inferred_counterparty_id, inferred_category')
        .in('transaction_id', ids)
    : { data: [] };
  const enrichMap = new Map((enrich ?? []).map((e) => [e.transaction_id, e]));
  return {
    window: { from, to: asOf, days },
    count: (data ?? []).length,
    transactions: (data ?? []).map((t) => ({
      ...t,
      inferred_counterparty_id: enrichMap.get(t.transaction_id)?.inferred_counterparty_id ?? null,
      inferred_category: enrichMap.get(t.transaction_id)?.inferred_category ?? null
    }))
  };
}

export async function get_scheduled_payments(args: { from_date?: string; to_date?: string } = {}) {
  const asOf = getDemoCurrentTimestamp().slice(0, 10);
  const from = args.from_date ?? asOf;
  const to = args.to_date ?? addDays(asOf, 30);
  const { data } = await supabase
    .from('bank_scheduled_payments')
    .select('scheduled_payment_id, schedule_type, scheduled_date, amount, currency, counterparty_raw_text, fx_pair, fx_amount_local, payment_method, reference, recurrence, status')
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
    .neq('status', 'cancelled')
    .order('scheduled_date', { ascending: true });
  return {
    window: { from, to },
    count: (data ?? []).length,
    scheduled_payments: data ?? []
  };
}
