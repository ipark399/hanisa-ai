// Tools: credit limits + preapproved offers.

import { supabase, DEMO_CUSTOMER_ID } from '../supabase';

export async function get_credit_limits() {
  const { data } = await supabase
    .from('bank_credit_limits')
    .select('credit_limit_id, product_holding_id, limit_type, limit_amount, outstanding_amount, available_amount, currency, interest_rate, effective_from, effective_to, status')
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .eq('status', 'active');
  return { count: (data ?? []).length, limits: data ?? [] };
}

export async function get_preapproved_offers() {
  const { data } = await supabase
    .from('bank_preapproved_offers')
    .select('offer_id, product_type, approved_amount, currency, offer_terms, valid_from, valid_to, status, generated_by, accepted_at, accepted_via')
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .eq('status', 'open');
  return { count: (data ?? []).length, offers: data ?? [] };
}
