// Anthropic SDK client with prompt caching for system + tool definitions.
// Reference: goals/architecture-v2.md §6.3
//
// SERVER-SIDE ONLY (used inside API routes).

import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('Missing ANTHROPIC_API_KEY env var.');
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Model id — see CLAUDE.md (knowledge cutoff 2026-01). Use opus-4-8 for v2.
export const MODEL_ID = 'claude-opus-4-8';

// Prompt caching: wrap large system prompt + tool defs to use ephemeral cache (5 min TTL).
// Cuts input cost by ~90% on repeat calls.
export function cacheControl(text: string) {
  return {
    type: 'text' as const,
    text,
    cache_control: { type: 'ephemeral' as const }
  };
}
