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

// Step context the chat layer injects into the system prompt so the LLM
// stays aware of the current scenario (REQ-CIMB-02 area 3 / #10 (β)).
// recentPushText (ws-160): agent-side storyboard messages of the current step,
// concatenated. Storyboard messages are intentionally kept out of LLM history
// (Bug #4-b) to prevent the LLM from "remembering" text it never said — but
// that exclusion also blinds the LLM to pushes the user just saw on screen,
// causing topic drift on follow-ups like "any other options?". Threading the
// current push as a system-prompt anchor restores topic awareness without
// re-introducing the #4-b false-memory risk.
export interface StepContext {
  activeMode: 'intro' | 'act1' | 'act2' | 'free';
  stepWithinAct?: number;
  timeStamp?: string;
  narrative?: string;
  recentPushText?: string;
  // asOfIso (ws-160): UTC ISO timestamp the tools should treat as "now" for
  // this step. Threaded into the tool layer via AsyncLocalStorage in
  // /api/chat/route.ts so Act 2 (Fri 26 Jun) reads the 21-day cashflow snapshot
  // instead of always falling back to Act 1 (Mon 8 Jun) data.
  asOfIso?: string;
}

// LLM dynamic action — REQ-CIMB-02 area 4 / #13.
// LLM emits `suggest_action` tool_use blocks; the chat layer intercepts them,
// validates the action_id against ALLOWED_LLM_ACTIONS, and returns the
// surviving actions in ChatResult.actions for the frontend to render as buttons
// inside the LLM's reply bubble. Storyboard hardcoded actions go through the
// same downstream handleAction path (#12 (α) — single handler).
export interface SuggestedAction {
  label: string;
  action_id: string;
  variant?: 'primary' | 'secondary' | 'danger';
  payload?: unknown;
}

// Allow-list of action_ids the backend will surface to the UI. Storyboard
// hardcoded actions + LLM-allowed dynamic actions. To add a new dynamic action,
// register it here AND verify it during dry-run (PRD §10 VQ-05).
export const ALLOWED_LLM_ACTIONS: ReadonlySet<string> = new Set([
  // Storyboard hardcoded
  'lock_fx_forward',
  'accept_preapproved_offer',
  'show_loan_options',
  'decline_fx',
  'decline_flx',
  // LLM-allowed dynamic (REQ-CIMB-02 D6.5)
  'show_fx_option',
  'show_fwd_details',
  'compare_hedges',
  'show_rate_history',
  'show_alternatives',
  'show_installment_loan',
  'show_gbp_exposure'
]);

export interface ChatResult {
  reply: string;
  tool_calls: Array<{ name: string; input: unknown; result: unknown }>;
  stop_reason: string;
  actions: SuggestedAction[];
}

function describeScope(ctx: StepContext): string {
  switch (ctx.activeMode) {
    case 'act1':
      return 'Act 1: FX Hero — Monday Brief → FX Trigger → Hedge Pull → Lock FX Forward';
    case 'act2':
      return 'Act 2: FlexiCash + Learning — Cash dip Trigger → Loan Pull → Apply FlexiCash → Learning';
    case 'free':
      return 'Free QA — open chat without scripted storyboard progression';
    case 'intro':
    default:
      return 'Intro — pre-demo setup; no scenario active yet';
  }
}

function buildSystemBlocks(stepContext?: StepContext): Anthropic.TextBlockParam[] {
  const demoTime = getDemoCurrentTimestamp();
  const blocks: Anthropic.TextBlockParam[] = [
    cacheControl(SYSTEM_PERSONA),
    {
      type: 'text',
      text: `\n\nDemo current timestamp: ${demoTime}\nUse this as "now" for all date calculations and SQL filters.`
    }
  ];
  if (stepContext) {
    const scope = describeScope(stepContext);
    const stepLine =
      stepContext.stepWithinAct != null
        ? `Step ${stepContext.stepWithinAct} of 4`
        : 'no scripted step';
    const narrative = stepContext.narrative
      ? `Step narrative: ${stepContext.narrative}`
      : 'Step narrative: (none)';
    const timeLine = stepContext.timeStamp ? `Display time: ${stepContext.timeStamp}` : '';
    blocks.push({
      type: 'text',
      text:
        `\n\n## Demo Scenario Context\n` +
        `Current scope: ${scope}\n` +
        `Progression: ${stepLine}\n` +
        `${narrative}\n` +
        (timeLine ? `${timeLine}\n` : '') +
        `\nGuidance: When a user message is unrelated to the active CIMB banking scenario ` +
        `(FX hedging / cashflow projection / SME lending / preference learning), ` +
        `politely redirect rather than fabricating banking actions. ` +
        `Report only observed market facts, do not forecast. ` +
        `Stay inside the demo's narrative and the tables you have read access to.`
    });
    if (stepContext.recentPushText && stepContext.recentPushText.trim().length > 0) {
      blocks.push({
        type: 'text',
        text:
          `\n\n## Most Recent Push to User\n` +
          `At the current step you (the agent) just pushed the message below to Mr. Bakri. ` +
          `It is on his screen above his latest question:\n\n` +
          `---\n${stepContext.recentPushText}\n---\n\n` +
          `When his question is ambiguous or open-ended ` +
          `(e.g. "any other options?", "tell me more", "what about that?", "explain"), ` +
          `interpret it as a follow-up to THIS push, not to earlier conversation topics. ` +
          `The user is reacting to what you just sent, not to what was discussed before it.`
      });
    }
  }
  return blocks;
}

export async function runChat(
  history: ChatTurn[],
  stepContext?: StepContext
): Promise<ChatResult> {
  const messages: Anthropic.MessageParam[] = history.map((t) => ({
    role: t.role,
    content: t.content
  }));

  const toolCalls: ChatResult['tool_calls'] = [];
  // Accumulated suggest_action results — surfaced to the UI as buttons.
  const actions: SuggestedAction[] = [];

  for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL_ID,
      max_tokens: 2048,
      system: buildSystemBlocks(stepContext),
      tools: TOOL_SCHEMAS,
      messages
    });

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      // ws-174 fix (RM approval gate for Free-QA apply intent):
      // If the LLM emitted a gated action (`accept_preapproved_offer` or
      // `lock_fx_forward`) via suggest_action AND its reply is EITHER
      // compliance-boilerplate-only OR fabricates completion ("activated",
      // fake reference numbers), replace the reply with a canned RM-review
      // template. Substantive replies (data tables, reasoning) are kept —
      // the emitted button remains available in both paths, so clicking it
      // still routes through STORYBOARD_ACTION_MAP → /api/action →
      // storyboard Step 3 hardcoded confirmation (real reference number).
      // Narrow triggers preserve hero-moment replies (FX-P1 4-row table,
      // FX-M1 Bloomberg citation) that emit `lock_fx_forward` as a follow-up
      // suggestion but produce rich data text.
      const GATED_ACTIONS: ReadonlySet<string> = new Set([
        'accept_preapproved_offer',
        'lock_fx_forward'
      ]);
      const COMPLIANCE_ONLY = /^\s*informational\.?\s*subject to product terms and approval\.?\s*$/i;
      const DANGEROUS_COMPLETION = /\b(activated?|completed?|line is (now )?(open|active|available|set)|approved and (set|open)|it'?s all set|you'?re all set|all set,?\s+(?:mr\.?|ms\.?|dr\.?)|reference\s+(?:REQ-|FLX-|FXFW-|FX-)\w+|ref\.?\s+(?:REQ-|FLX-|FXFW-|FX-)\w+)/i;
      const gateAction = actions.find((a) => GATED_ACTIONS.has(a.action_id));
      const needsCannedReply =
        gateAction && (COMPLIANCE_ONLY.test(text) || DANGEROUS_COMPLETION.test(text));
      const finalReply = needsCannedReply
        ? `Sure, Mr. Bakri — tap **${gateAction!.label}** below to submit this request. Your RM will contact you within 24 hours to finalize.`
        : text;

      return {
        reply: finalReply,
        tool_calls: toolCalls,
        stop_reason: response.stop_reason ?? 'end_turn',
        actions
      };
    }

    // Append assistant's tool_use blocks to message history
    messages.push({ role: 'assistant', content: response.content });

    // Execute tools in parallel. `suggest_action` is intercepted here and
    // converted to a SuggestedAction (whitelisted) instead of dispatched to a
    // real handler.
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => {
        if (tu.name === 'suggest_action') {
          const input = (tu.input ?? {}) as {
            label?: string;
            action_id?: string;
            variant?: SuggestedAction['variant'];
            payload?: unknown;
          };
          const actionId = String(input.action_id ?? '').trim();
          const rawLabel = String(input.label ?? '').trim();
          let result: unknown;
          if (!actionId || !ALLOWED_LLM_ACTIONS.has(actionId)) {
            result = {
              ok: false,
              reason: 'action_id not whitelisted',
              action_id: actionId || null
            };
            console.warn(`[suggest_action] dropped: action_id="${actionId}" not in whitelist`);
          } else if (!rawLabel) {
            result = { ok: false, reason: 'label required', action_id: actionId };
          } else {
            actions.push({
              label: rawLabel.slice(0, 30),
              action_id: actionId,
              variant: input.variant ?? 'secondary',
              payload: input.payload
            });
            result = { ok: true, action_id: actionId, label: rawLabel.slice(0, 30) };
          }
          toolCalls.push({ name: tu.name, input: tu.input, result });
          return {
            type: 'tool_result' as const,
            tool_use_id: tu.id,
            content: JSON.stringify(result)
          };
        }
        // Default dispatch for everything else.
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

  return {
    reply: '(max tool loops reached)',
    tool_calls: toolCalls,
    stop_reason: 'max_iterations',
    actions
  };
}
