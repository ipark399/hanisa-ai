// Tool dispatch: maps tool name → handler function.
// LLM emits tool_use blocks; we look up the handler here.

import { get_current_balance, get_account_list } from './balance';
import { get_recent_transactions, get_scheduled_payments } from './transactions';
import { get_forecasted_payments, get_expected_inflows, get_cashflow_projection } from './forecasts';
import { get_credit_limits, get_preapproved_offers } from './credit';
import {
  get_products_held,
  list_products_by_category,
  find_products_by_use_case,
  get_product_details,
  get_product_pricing
} from './products';
import { get_company_profile, get_seasonality, get_top_counterparties } from './company';
import { check_monday_brief, check_fx_opportunity, check_flexicash_opportunity } from './triggers';
import { record_user_action, record_learning_event } from './actions';

type ToolHandler = (args: any) => Promise<unknown>;

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  get_current_balance,
  get_account_list,
  get_recent_transactions,
  get_scheduled_payments,
  get_products_held,
  get_forecasted_payments,
  get_expected_inflows,
  get_cashflow_projection,
  get_company_profile,
  get_seasonality,
  get_top_counterparties,
  get_credit_limits,
  get_preapproved_offers,
  check_monday_brief,
  check_fx_opportunity,
  check_flexicash_opportunity,
  list_products_by_category,
  find_products_by_use_case,
  get_product_details,
  get_product_pricing,
  record_user_action,
  record_learning_event
};

export async function dispatchTool(name: string, args: unknown): Promise<unknown> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return { error: `Unknown tool: ${name}` };
  }
  try {
    return await handler(args ?? {});
  } catch (err) {
    return { error: 'tool_execution_failed', detail: String(err) };
  }
}
