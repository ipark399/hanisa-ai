// POST /api/chat — accept user message + prior history + optional step context,
// return agent reply + tool trace.
//
// Body: { messages: ChatTurn[], session_id?: string, step_context?: StepContext }
// Response: { reply: string, tool_calls: [...], stop_reason: string }

import { NextResponse } from 'next/server';
import type { ChatTurn, StepContext } from '@/lib/chat_loop';
import { runChat } from '@/lib/chat_loop';
import { supabase, getDemoCurrentTimestamp, runWithDemoAsOf, DEMO_CUSTOMER_ID } from '@/lib/supabase';

function rid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      messages: ChatTurn[];
      session_id?: string;
      step_context?: StepContext;
    };
    const messages = body.messages ?? [];
    const sessionId = body.session_id ?? 'demo_session_001';
    const stepContext = body.step_context;

    if (messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 });
    }

    // ws-160: wrap the entire chat handling — interaction logs + tool calls
    // through runChat — in a single AsyncLocalStorage scope so every
    // getDemoCurrentTimestamp() sees the active step's asOfIso. Without this,
    // Act 2 Free QA reads Act 1 (Mon 8 Jun) snapshots and contradicts the
    // storyboard premise.
    return await runWithDemoAsOf(stepContext?.asOfIso, async () => {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');

      // Log user message to bank_interactions
      if (lastUser) {
        await supabase.from('bank_interactions').insert({
          interaction_id: rid('int_user'),
          customer_id: DEMO_CUSTOMER_ID,
          session_id: sessionId,
          channel: 'whatsapp',
          direction: 'user_to_agent',
          interaction_type: 'chat_message',
          event_timestamp: getDemoCurrentTimestamp(),
          content: lastUser.content,
          source: 'agent_chat'
        });
      }

      const result = await runChat(messages, stepContext);

      // Log assistant reply
      if (result.reply) {
        await supabase.from('bank_interactions').insert({
          interaction_id: rid('int_agent'),
          customer_id: DEMO_CUSTOMER_ID,
          session_id: sessionId,
          channel: 'whatsapp',
          direction: 'agent_to_user',
          interaction_type: 'chat_message',
          event_timestamp: getDemoCurrentTimestamp(),
          content: result.reply,
          source: 'agent_chat'
        });
      }

      return NextResponse.json(result);
    });
  } catch (err) {
    console.error('[/api/chat] internal error:', err);
    // Internal demo, but the deployed Vercel URL is public — do not echo raw
    // error text to the client in production builds.
    const message =
      process.env.NODE_ENV === 'production' ? 'internal_error' : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
