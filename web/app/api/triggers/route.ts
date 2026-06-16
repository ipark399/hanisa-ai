// POST /api/triggers — evaluate one of the 3 hero-moment triggers.
// Returns trigger evaluation + (optionally) pre-formatted message that the agent would push.
//
// Body: { trigger: 'monday_brief' | 'fx' | 'flexicash' }
// Response: { fires, payload, message? }

import { NextResponse } from 'next/server';
import { check_monday_brief, check_fx_opportunity, check_flexicash_opportunity } from '@/lib/tools/triggers';
import { anthropic, MODEL_ID, cacheControl } from '@/lib/anthropic';
import { SYSTEM_PERSONA } from '@/lib/persona';
import { getDemoCurrentTimestamp, supabase, DEMO_CUSTOMER_ID } from '@/lib/supabase';

function rid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const TRIGGER_PROMPTS: Record<string, string> = {
  monday_brief: `Write the Monday weekly brief message for Mr. Bakri. Open with "Good morning, Mr. Bakri." Then summarise this week's snapshot in 1–3 sentences from the payload. Mention overdue receivables if any, FX delta if material. Keep concise. No greeting elements other than the opener.`,
  fx: `Write the FX trigger message. No greeting. State the predicted EUR payment ("Based on your monthly pattern..."), the rate advantage vs the 90-day average ("X% better than your 90-day average"), and end with "Lock the rate now?". Concise.`,
  flexicash: `Write the FlexiCash trigger message. No greeting. State the projected balance dip ("Your projected balance dips below ... in N weeks"), the pre-approved offer ("A pre-approved FlexiCash line of MYR XX,XXX is available"), and end with "Want to apply?". Concise.`
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { trigger: string; session_id?: string };
    const trig = body.trigger;
    const sessionId = body.session_id ?? 'demo_session_001';

    let evalResult: any;
    if (trig === 'monday_brief') evalResult = await check_monday_brief();
    else if (trig === 'fx') evalResult = await check_fx_opportunity();
    else if (trig === 'flexicash') evalResult = await check_flexicash_opportunity();
    else return NextResponse.json({ error: 'unknown trigger' }, { status: 400 });

    if (!evalResult.trigger_fires) {
      return NextResponse.json({ fires: false, ...evalResult });
    }

    // Ask LLM to produce the user-facing message text for the trigger
    const userInstr = TRIGGER_PROMPTS[trig];
    const messageResp = await anthropic.messages.create({
      model: MODEL_ID,
      max_tokens: 280,
      system: [cacheControl(SYSTEM_PERSONA)],
      messages: [
        {
          role: 'user',
          content: `${userInstr}\n\nPayload:\n${JSON.stringify(evalResult.payload, null, 2)}\n\nReturn only the message text. No preamble.`
        }
      ]
    });

    const text = messageResp.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim();

    // Log to bank_interactions
    await supabase.from('bank_interactions').insert({
      interaction_id: rid('int_trig'),
      customer_id: DEMO_CUSTOMER_ID,
      session_id: sessionId,
      channel: 'whatsapp',
      direction: 'agent_to_user',
      interaction_type: 'trigger_alert',
      event_timestamp: getDemoCurrentTimestamp(),
      content: text,
      referenced_entity_type: trig === 'monday_brief' ? 'monday_brief' : trig === 'fx' ? 'fx_opportunity' : 'flexicash_opportunity',
      referenced_entity_id: null,
      source: 'agent_chat'
    });

    return NextResponse.json({
      fires: true,
      trigger: trig,
      message: text,
      payload: evalResult.payload
    });
  } catch (err) {
    console.error('[/api/triggers] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
