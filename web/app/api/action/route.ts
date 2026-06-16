// POST /api/action — handle Lock / Apply / Decline button clicks.
// Body: { action_type, referenced_entity_type, referenced_entity_id, details, session_id }
// Response: { recorded, confirmation_message }

import { NextResponse } from 'next/server';
import { record_user_action } from '@/lib/tools/actions';
import { anthropic, MODEL_ID, cacheControl } from '@/lib/anthropic';
import { SYSTEM_PERSONA } from '@/lib/persona';

const CONFIRM_PROMPTS: Record<string, string> = {
  lock_fx_forward: `Confirm an FX Forward lock to Mr. Bakri. Use these facts from the action result: locked_rate, value_date, amount_eur, trade_ref. Include estimated saving vs 90-day average (use payload). End with "Confirmation sent to ahmad@sunrisetrading.my." Keep concise.`,
  accept_preapproved_offer: `Confirm FlexiCash activation. Mention: line size MYR 65,000 active, rate 8.5% p.a., available immediately. Include activation_ref. Mention draws can be done via OCTO Biz app or by replying. End with "Confirmation sent to ahmad@sunrisetrading.my."`,
  decline_offer: `Acknowledge politely that Mr. Bakri declined. One sentence.`
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action_type: string;
      referenced_entity_type?: string;
      referenced_entity_id?: string;
      details?: Record<string, unknown>;
      session_id?: string;
    };

    const result = await record_user_action({
      action_type: body.action_type,
      referenced_entity_type: body.referenced_entity_type,
      referenced_entity_id: body.referenced_entity_id,
      details: body.details,
      session_id: body.session_id
    });

    const prompt = CONFIRM_PROMPTS[body.action_type];
    let confirmationMessage: string | null = null;
    if (prompt) {
      const llm = await anthropic.messages.create({
        model: MODEL_ID,
        max_tokens: 200,
        system: [cacheControl(SYSTEM_PERSONA)],
        messages: [
          {
            role: 'user',
            content: `${prompt}\n\nAction result: ${JSON.stringify(result)}\nDetails: ${JSON.stringify(body.details ?? {})}\n\nReturn the message text only.`
          }
        ]
      });
      confirmationMessage = llm.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n')
        .trim();
    }

    return NextResponse.json({
      recorded: true,
      action: result,
      confirmation_message: confirmationMessage
    });
  } catch (err) {
    console.error('[/api/action] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
