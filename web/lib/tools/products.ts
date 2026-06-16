// Tools: product catalog + pricing + products held.

import { supabase, getDemoCurrentTimestamp, DEMO_CUSTOMER_ID } from '../supabase';

const DEFAULT_COMPLEXITY = 4; // Mr. Bakri

export async function get_products_held() {
  const { data } = await supabase
    .from('bank_products_held')
    .select('product_holding_id, product_id, product_name, product_type, account_id, enrolled_at, status, principal_amount, outstanding_amount, currency')
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .eq('status', 'active');
  return { count: (data ?? []).length, products_held: data ?? [] };
}

export async function list_products_by_category(args: { category: string }) {
  const { data } = await supabase
    .from('bank_product_catalog')
    .select('product_id, product_name, category, subcategory, short_description, indicative_pricing, min_complexity_level, max_complexity_level, use_case_tags')
    .eq('category', args.category)
    .order('product_id', { ascending: true });
  return { category: args.category, count: (data ?? []).length, products: data ?? [] };
}

export async function find_products_by_use_case(args: { use_case_tag: string; complexity_level?: number }) {
  const level = args.complexity_level ?? DEFAULT_COMPLEXITY;
  const { data } = await supabase
    .from('bank_product_catalog')
    .select('product_id, product_name, category, subcategory, short_description, long_description, indicative_pricing, use_case_tags, min_complexity_level, max_complexity_level, eligibility_criteria, typical_use_examples, tenor_min_days, tenor_max_days, currency_options, is_pre_approvable, compliance_disclaimer')
    .contains('use_case_tags', [args.use_case_tag])
    .lte('min_complexity_level', level)
    .gte('max_complexity_level', level);
  return {
    use_case_tag: args.use_case_tag,
    complexity_level: level,
    count: (data ?? []).length,
    products: data ?? []
  };
}

export async function get_product_details(args: { product_id: string }) {
  const { data } = await supabase
    .from('bank_product_catalog')
    .select('*')
    .eq('product_id', args.product_id)
    .maybeSingle();
  return { product: data ?? null };
}

export async function get_product_pricing(args: { product_id: string; tenor?: string }) {
  const asOf = getDemoCurrentTimestamp().slice(0, 10);
  let q = supabase
    .from('bank_product_pricing_daily')
    .select('pricing_type, value_decimal, value_currency, tenor_label, customer_tier, pricing_date')
    .eq('product_id', args.product_id)
    .lte('pricing_date', asOf)
    .order('pricing_date', { ascending: false })
    .limit(20);
  if (args.tenor) q = q.eq('tenor_label', args.tenor);
  const { data } = await q;
  return {
    product_id: args.product_id,
    requested_tenor: args.tenor ?? null,
    as_of: asOf,
    pricing: data ?? []
  };
}
