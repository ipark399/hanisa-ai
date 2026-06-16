// Tools: company profile + seasonality + top counterparties.

import { supabase, DEMO_CUSTOMER_ID } from '../supabase';

export async function get_company_profile() {
  const { data } = await supabase
    .from('infer_company_profile')
    .select('*')
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Merge KYC declared (bank) + learned facts (D-axis)
  const { data: customer } = await supabase
    .from('bank_customers')
    .select('legal_name, trade_name, business_type_declared, msic_code, kyc_declared_revenue: annual_revenue_bucket_declared, kyc_declared_employees: employee_count_bucket_declared, incorporation_date, primary_contact_name, primary_contact_role_declared, registered_address')
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .maybeSingle();

  return {
    kyc_declared: customer,
    inferred: data
  };
}

export async function get_seasonality() {
  const { data } = await supabase
    .from('infer_seasonality')
    .select('pattern_id, pattern_type, pattern_label, peak_periods, metric, amplitude, evidence_window, confidence')
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .order('confidence', { ascending: false });
  return { count: (data ?? []).length, patterns: data ?? [] };
}

export async function get_top_counterparties(args: { type?: string; limit?: number } = {}) {
  const limit = args.limit ?? 5;
  let q = supabase
    .from('infer_counterparties')
    .select('counterparty_id, resolved_name, aliases, inferred_type, inferred_country, inferred_currency_used, inferred_industry, payment_frequency, avg_amount, relationship_since, relationship_status')
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .eq('relationship_status', 'active')
    .order('avg_amount', { ascending: false })
    .limit(limit);
  if (args.type) q = q.eq('inferred_type', args.type);
  const { data } = await q;
  return {
    type_filter: args.type ?? 'all',
    count: (data ?? []).length,
    counterparties: data ?? []
  };
}
