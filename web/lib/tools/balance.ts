// Tools: balance + account list.
// Reference: tool_schemas.ts §A

import { supabase, getDemoCurrentTimestamp, DEMO_CUSTOMER_ID } from '../supabase';

export async function get_current_balance() {
  const asOf = getDemoCurrentTimestamp().slice(0, 10); // YYYY-MM-DD
  // For each account, find the most recent balance row at or before demo date
  const { data: accounts } = await supabase
    .from('bank_accounts')
    .select('account_id, currency, account_type, product_name, is_primary')
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .neq('status', 'closed');

  if (!accounts) return { balances: [] };

  const balances = await Promise.all(accounts.map(async (acc) => {
    const { data: latest } = await supabase
      .from('bank_balances_daily')
      .select('closing_balance, balance_date')
      .eq('account_id', acc.account_id)
      .lte('balance_date', asOf)
      .order('balance_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      account_id: acc.account_id,
      currency: acc.currency,
      account_type: acc.account_type,
      product_name: acc.product_name,
      is_primary: acc.is_primary,
      closing_balance: latest?.closing_balance ?? null,
      as_of_date: latest?.balance_date ?? null
    };
  }));

  return { as_of: asOf, balances };
}

export async function get_account_list() {
  const { data } = await supabase
    .from('bank_accounts')
    .select('account_id, account_number_masked, currency, account_type, product_name, opened_date, status, is_primary, maturity_date')
    .eq('customer_id', DEMO_CUSTOMER_ID)
    .neq('status', 'closed')
    .order('is_primary', { ascending: false });
  return { accounts: data ?? [] };
}
