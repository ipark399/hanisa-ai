// POST /api/chat — accept user message + prior history, return agent reply + tool trace.
//
// Body: { messages: ChatTurn[] }
// Response: { reply: string, tool_calls: [...] }

import { NextResponse } from 'next/server';
import type { ChatTurn } from '@/lib/chat_loop';
import { runChat } from '@/lib/chat_loop';
import { supabase, getDemoCurrentTimestamp, DEMO_CUSTOMER_ID } from '@/lib/supabase';

function rid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { messages: ChatTurn[]; session_id?: string };
    const messages = body.messages ?? [];
    const sessionId = body.session_id ?? 'demo_session_001';

    if (messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 });
    }
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

    const result = await runChat(messages);

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
  } catch (err) {
    console.error('[/api/chat] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
