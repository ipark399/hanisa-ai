// LLM tool-use loop. Handles multi-turn tool calls until the model returns final text.
// Reference: architecture-v2.md §6 (Hybrid pattern — backend uses Anthropic SDK directly).

import { anthropic, MODEL_ID, cacheControl } from './anthropic';
import { SYSTEM_PERSONA } from './persona';
import { TOOL_SCHEMAS } from './tool_schemas';
import { dispatchTool } from './tools';
import { getDemoCurrentTimestamp } from './supabase';

import type Anthropic from '@anthropic-ai/sdk';

const MAX_TOOL_LOOPS = 6;

export type ChatTurn =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string };

export interface ChatResult {
  reply: string;
  tool_calls: Array<{ name: string; input: unknown; result: unknown }>;
  stop_reason: string;
}

function buildSystemBlocks(): Anthropic.TextBlockParam[] {
  const demoTime = getDemoCurrentTimestamp();
  return [
    cacheControl(SYSTEM_PERSONA),
    {
      type: 'text',
      text: `\n\nDemo current timestamp: ${demoTime}\nUse this as "now" for all date calculations and SQL filters.`
    }
  ];
}

export async function runChat(history: ChatTurn[]): Promise<ChatResult> {
  const messages: Anthropic.MessageParam[] = history.map((t) => ({
    role: t.role,
    content: t.content
  }));

  const toolCalls: ChatResult['tool_calls'] = [];

  for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL_ID,
      max_tokens: 1024,
      system: buildSystemBlocks(),
      tools: TOOL_SCHEMAS,
      messages
    });

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return { reply: text, tool_calls: toolCalls, stop_reason: response.stop_reason ?? 'end_turn' };
    }

    // Append assistant's tool_use blocks to message history
    messages.push({ role: 'assistant', content: response.content });

    // Execute tools in parallel
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => {
        const result = await dispatchTool(tu.name, tu.input);
        toolCalls.push({ name: tu.name, input: tu.input, result });
        return {
          type: 'tool_result' as const,
          tool_use_id: tu.id,
          content: JSON.stringify(result)
        };
      })
    );

    // Append tool_result blocks
    messages.push({ role: 'user', content: toolResults });
  }

  return { reply: '(max tool loops reached)', tool_calls: toolCalls, stop_reason: 'max_iterations' };
}
