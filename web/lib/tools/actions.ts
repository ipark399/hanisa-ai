// Tools: user action + learning event recording.

import { supabase, getDemoCurrentTimestamp, DEMO_CUSTOMER_ID } from '../supabase';

function rid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function record_user_action(args: {
  action_type: string;
  referenced_entity_type?: string;
  referenced_entity_id?: string;
  details?: Record<string, unknown>;
  session_id?: string;
}) {
  const id = rid('int');
  const now = getDemoCurrentTimestamp();
  const sessionId = args.session_id ?? 'demo_session_001';

  // Side effect 1: bank_interactions
  await supabase.from('bank_interactions').insert({
    interaction_id: id,
    customer_id: DEMO_CUSTOMER_ID,
    session_id: sessionId,
    channel: 'whatsapp',
    direction: 'system_event',
    interaction_type: args.action_type.startsWith('lock')
      ? 'lock_action'
      : args.action_type.startsWith('accept') || args.action_type.startsWith('apply')
        ? 'apply_action'
        : 'click',
    event_timestamp: now,
    content: `User tapped: ${args.action_type}`,
    referenced_entity_type: args.referenced_entity_type ?? null,
    referenced_entity_id: args.referenced_entity_id ?? null,
    user_action: args.action_type,
    source: 'agent_chat'
  });

  // Side effect 2: domain-specific tables based on action type
  let domainResult: Record<string, unknown> = {};
  if (args.action_type === 'lock_fx_forward') {
    const detailsObj = args.details ?? {};
    const eurAmount = Number(detailsObj.amount_eur ?? 8200);
    const rate = Number(detailsObj.rate ?? 4.95);
    const valueDate = (detailsObj.value_date as string) ?? '2026-07-22';
    const tradeRef = (detailsObj.trade_ref as string) ?? `FXFW-${new Date().getFullYear()}-${Math.floor(Math.random() * 9999)}`;
    await supabase.from('bank_scheduled_payments').insert({
      scheduled_payment_id: rid('sched_fx'),
      customer_id: DEMO_CUSTOMER_ID,
      account_id: 'acc_myr_current',
      schedule_type: 'one_off_scheduled',
      scheduled_date: valueDate,
      amount: -eurAmount,
      currency: 'EUR',
      counterparty_raw_text: 'CIMB FX FORWARD',
      fx_pair: 'EUR/MYR',
      fx_amount_local: -eurAmount * rate,
      payment_method: 'wire',
      reference: tradeRef,
      recurrence: 'one_off',
      status: 'pending_rm_review',
      source: 'core_banking'
    });
    domainResult = { trade_ref: tradeRef, value_date: valueDate, locked_rate: rate, amount_eur: eurAmount };
  } else if (args.action_type === 'accept_preapproved_offer') {
    const offerId = args.referenced_entity_id;
    if (offerId) {
      await supabase
        .from('bank_preapproved_offers')
        .update({ status: 'accepted', accepted_at: now, accepted_via: 'agent_chat' })
        .eq('offer_id', offerId);
      const phId = rid('ph_flx');
      await supabase.from('bank_products_held').insert({
        product_holding_id: phId,
        customer_id: DEMO_CUSTOMER_ID,
        product_id: 'flexicash',
        product_name: 'FlexiCash',
        product_type: 'flexicash',
        account_id: null,
        enrolled_at: now.slice(0, 10),
        status: 'pending_rm_review',
        principal_amount: 65000,
        outstanding_amount: 0,
        currency: 'MYR',
        source: 'core_banking'
      });
      await supabase.from('bank_credit_limits').insert({
        credit_limit_id: rid('cl_flx'),
        customer_id: DEMO_CUSTOMER_ID,
        product_holding_id: phId,
        limit_type: 'flexicash',
        limit_amount: 65000,
        outstanding_amount: 0,
        available_amount: 65000,
        currency: 'MYR',
        interest_rate: 8.5,
        effective_from: now.slice(0, 10),
        status: 'pending_rm_review',
        source: 'core_banking'
      });
      domainResult = { activation_ref: `FLX-${new Date().getFullYear()}-${Math.floor(Math.random() * 9999)}`, approved_amount: 65000 };
    }
  }

  return { recorded: true, interaction_id: id, action_type: args.action_type, ...domainResult };
}

export async function record_learning_event(args: {
  event_type: string;
  target_table?: string;
  preference_key?: string;
  preference_value?: Record<string, unknown>;
  before_value?: Record<string, unknown>;
  after_value?: Record<string, unknown>;
  source_interaction_id?: string;
}) {
  const now = getDemoCurrentTimestamp();
  const eventId = rid('le');

  if (args.event_type === 'preference_changed' && args.preference_key) {
    const prefId = rid('pref');
    await supabase.from('infer_user_preferences').insert({
      preference_id: prefId,
      customer_id: DEMO_CUSTOMER_ID,
      preference_type: 'weekly_brief_settings',
      preference_key: args.preference_key,
      preference_value: args.preference_value ?? {},
      evidence_interaction_ids: args.source_interaction_id ? [args.source_interaction_id] : [],
      asserted_by: 'user_explicit',
      valid_from: now,
      confidence: 0.95,
      inferred_at: now,
      source: 'agent_chat'
    });
    await supabase.from('infer_learning_events').insert({
      event_id: eventId,
      customer_id: DEMO_CUSTOMER_ID,
      event_type: args.event_type,
      target_table: 'infer_user_preferences',
      target_id: prefId,
      before_value: args.before_value ?? null,
      after_value: args.after_value ?? args.preference_value ?? null,
      source_interaction_id: args.source_interaction_id ?? null,
      confirmed_by_user: true,
      inferred_by: 'agent_learning_loop',
      inferred_at: now,
      source: 'agent_chat'
    });
    return { recorded: true, event_id: eventId, preference_id: prefId };
  }

  // Generic learning event audit (fact_added etc.)
  await supabase.from('infer_learning_events').insert({
    event_id: eventId,
    customer_id: DEMO_CUSTOMER_ID,
    event_type: args.event_type,
    target_table: args.target_table ?? 'infer_company_profile',
    target_id: 'profile_ahmad_v1',
    before_value: args.before_value ?? null,
    after_value: args.after_value ?? null,
    source_interaction_id: args.source_interaction_id ?? null,
    confirmed_by_user: true,
    inferred_by: 'agent_learning_loop',
    inferred_at: now,
    source: 'agent_chat'
  });
  return { recorded: true, event_id: eventId };
}
