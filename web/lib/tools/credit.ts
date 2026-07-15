// Tools: credit limits + preapproved offers.

import { supabase, DEMO_CUSTOMER_ID } from '../supabase';

export async function get_credit_limits() {
  const { data: limits } = await supabase
    .from('bank_credit_limits')
    .select('credit_limit_id, product_holding_id, limit_type, limit_amount, outstanding_amount, available_amount, currency, interest_rate, effective_from, effective_to, status')
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .eq('status', 'active');

  // ws-174: enrich each limit with product_name from bank_products_held so the
  // LLM sees the display name ("Revolving Credit") instead of only the raw
  // limit_type enum ('working_capital'). No FK on product_holding_id so we
  // fetch names in a separate query and merge in memory.
  const holdingIds = (limits ?? [])
    .map((l) => l.product_holding_id)
    .filter((id): id is string => Boolean(id));
  const nameByHoldingId: Record<string, string> = {};
  if (holdingIds.length > 0) {
    const { data: holdings } = await supabase
      .from('bank_products_held')
      .select('product_holding_id, product_name')
      .in('product_holding_id', holdingIds);
    for (const h of holdings ?? []) {
      if (h.product_holding_id && h.product_name) {
        nameByHoldingId[h.product_holding_id] = h.product_name;
      }
    }
  }
  const enriched = (limits ?? []).map((l) => ({
    ...l,
    product_name: (l.product_holding_id && nameByHoldingId[l.product_holding_id]) ?? null
  }));

  return { count: enriched.length, limits: enriched };
}

export async function get_preapproved_offers() {
  const { data } = await supabase
    .from('bank_preapproved_offers')
    .select('offer_id, product_type, approved_amount, currency, offer_terms, valid_from, valid_to, status, generated_by, accepted_at, accepted_via')
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .eq('status', 'open');
  return { count: (data ?? []).length, offers: data ?? [] };
}
