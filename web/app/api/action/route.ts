// POST /api/action — handle Lock / Apply / Decline button clicks.
// Body: { action_type, referenced_entity_type, referenced_entity_id, details, session_id }
// Response: { recorded, confirmation_message }

import { NextResponse } from 'next/server';
import { record_user_action } from '@/lib/tools/actions';
import { anthropic, MODEL_ID, cacheControl } from '@/lib/anthropic';
import { SYSTEM_PERSONA } from '@/lib/persona';
import { runWithDemoAsOf } from '@/lib/supabase';

const CONFIRM_PROMPTS: Record<string, string> = {
  lock_fx_forward: `Confirm FX Forward request received (pending RM review). Use these facts: locked_rate, value_date, amount_eur, trade_ref (prepend "REQ-" to trade_ref). State: "Request received. Reference: REQ-{trade_ref}. Your RM will contact you within 24 hours to finalize. Estimated saving MYR 1,064 vs spot." Keep concise. Do NOT say "activated" or "completed".`,
  accept_preapproved_offer: `Confirm FlexiCash request received (pending RM review). State: "Request received. Reference: REQ-{activation_ref}. Your RM will contact you within 24 hours to finalize. MYR 65,000 credit line at 8.5% p.a. once activated." Keep concise. Do NOT say "activated" or "available immediately".`,
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
      as_of_iso?: string;
    };

    // ws-160: wrap so record_user_action's getDemoCurrentTimestamp picks up
    // the active step's asOfIso. Without this, Apply taps during Act 2 stamp
    // bank_interactions/products_held/credit_limits with the Act 1 timestamp.
    return await runWithDemoAsOf(body.as_of_iso, async () => {
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
    });
  } catch (err) {
    console.error('[/api/action] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
