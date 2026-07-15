'use client';

import { useMemo, useState } from 'react';
import Phone from '@/components/Phone';
import ContextPanel from '@/components/ContextPanel';
import DemoControls from '@/components/DemoControls';
import ScenarioTabs from '@/components/ScenarioTabs';
import {
  STEPS,
  getStepIndex,
  getStepsForAct,
  ACT_LABELS,
  type DemoMessage,
  type ActiveMode,
  type ActId,
  getMaxStepForAct
} from '@/lib/demo_storyboard';
import type { StepContext } from '@/lib/chat_loop';

const SESSION_ID = 'demo_session_001';

// Unique adhoc message id — avoid `Date.now() + 1/+2` collisions when multiple
// messages are appended in the same millisecond (cr-area3 / cr-area4 LOW fix).
function newAdhocId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// Stable key for the skippedStepKeys set (dry-run patch ii).
function stepKey(act: ActId, stepWithinAct: number): string {
  return `${act}:${stepWithinAct}`;
}

// State model (REQ-CIMB-02 area 1):
//   activeMode   — 'intro' | 'act1' | 'act2' | 'free'
//   stepWithinAct — 1..MAX inside an act; 0 for intro/free
// The legacy `step` (global STEPS index) is derived for ContextPanel/Phone props.
// Message accumulation honors #2 dependant policy: Reset 전까지 Act 간 누적.

export default function DemoPage() {
  const [activeMode, setActiveMode] = useState<ActiveMode>('intro');
  const [stepWithinAct, setStepWithinAct] = useState<number>(0);
  const [adHocMessages, setAdHocMessages] = useState<DemoMessage[]>([]);
  // Free QA History (REQ-CIMB-02 area 3, #11 (β)) — adhoc 대화를 폰 화면에서
  // 지운 뒤에도 시연자가 디버깅·시연 후 회상을 위해 누적 보존하는 별도 state.
  // Reset All에서만 비우고, Reset Act / Next / Prev / Tab 전환에서는 보존한다.
  const [freeQAHistory, setFreeQAHistory] = useState<DemoMessage[]>([]);
  const [contextVisible, setContextVisible] = useState(true);
  const [disabledActions, setDisabledActions] = useState<Set<string>>(new Set());
  const [isThinking, setIsThinking] = useState(false);
  // dry-run patch (ii): when a storyboard action jumps past intermediate steps
  // (e.g. Step 2 [Lock now] → Step 4 skipping Step 3 Pull), those skipped steps
  // are recorded here so their hardcoded newMessages don't auto-render. Going
  // back with Prev (or any explicit visit) lifts the skip for that step.
  const [skippedStepKeys, setSkippedStepKeys] = useState<Set<string>>(new Set());

  // Derived: global STEPS index for the currently displayed step.
  // Free mode borrows the intro step shell for header/context — until area 2/3
  // gives Free QA its own panel layout.
  const globalStepIndex = useMemo(() => {
    if (activeMode === 'free') return 0;
    const actForLookup: ActId =
      activeMode === 'intro' ? 'intro' : activeMode;
    return getStepIndex(actForLookup, stepWithinAct);
  }, [activeMode, stepWithinAct]);

  const current = STEPS[globalStepIndex] ?? STEPS[0];

  // Messages displayed in the phone screen.
  // Per-Act isolation (supersedes #2 dependant accumulation):
  //   - intro: empty
  //   - free : adhoc only (storyboard suppressed)
  //   - act1 : act1 storyboard up to stepWithinAct, interleaved with adhocs by step
  //   - act2 : same as act1 (no act1 carryover; handleSelectMode clears adhoc on tab switch)
  // Interleave-by-step (ws-160): adhoc messages anchor to the storyboard step
  // they were created at (m.step), so a Free QA exchange at step N keeps its
  // place in chronology when stepWithinAct advances. Replaces the previous
  // "all storyboard, then all adhoc" ordering that put newly revealed steps
  // above pre-existing adhoc bubbles.
  const messages: DemoMessage[] = useMemo(() => {
    if (activeMode === 'intro') return [...adHocMessages];
    if (activeMode === 'free') return [...adHocMessages];

    // dry-run patch (ii): skip steps that the user jumped over via a storyboard
    // action (e.g. Step 2 [Lock now] → Step 4 skips Step 3). The skipped step's
    // hardcoded newMessages are dropped so the phone shows only the path the
    // user actually took. Adhocs anchored to a skipped/out-of-range step are
    // likewise hidden — they re-appear if the user navigates back to that step.
    const visibleSteps = STEPS.filter(
      (s) =>
        s.act === activeMode &&
        s.stepWithinAct <= stepWithinAct &&
        !skippedStepKeys.has(stepKey(activeMode, s.stepWithinAct))
    );

    const out: DemoMessage[] = [];
    for (const s of visibleSteps) {
      out.push(...s.newMessages);
      out.push(...adHocMessages.filter((m) => m.step === s.step));
    }
    return out;
  }, [activeMode, stepWithinAct, adHocMessages, skippedStepKeys]);

  function handleSelectMode(mode: ActiveMode) {
    setActiveMode(mode);
    setStepWithinAct(mode === 'act1' || mode === 'act2' ? 1 : 0);
    // Clear adhoc on tab switch to prevent Act 1 adhoc bleeding into Act 2.
    // The dependant policy (#2) keeps storyboard messages accumulated, not adhoc.
    setAdHocMessages([]);
  }

  function handleResetAct() {
    if (activeMode !== 'act1' && activeMode !== 'act2') {
      setAdHocMessages([]);
      return;
    }
    setStepWithinAct(1);
    // Only re-enable actions defined inside the current Act, preserving the
    // other Act's disabled state (e.g., Act 1 lock stays locked when Act 2 resets).
    const currentActActionIds = new Set(
      getStepsForAct(activeMode).flatMap((s) =>
        s.newMessages.flatMap((m) => (m.actions ?? []).map((a) => a.actionId))
      )
    );
    setDisabledActions((prev) => {
      const next = new Set(prev);
      currentActActionIds.forEach((id) => next.delete(id));
      return next;
    });
    setAdHocMessages([]);
    // Reset Act clears the current Act's skipped steps so a fresh run shows
    // every step's hardcoded messages again.
    setSkippedStepKeys((prev) => {
      const next = new Set<string>();
      for (const k of prev) if (!k.startsWith(`${activeMode}:`)) next.add(k);
      return next;
    });
  }

  function handleResetAll() {
    setActiveMode('intro');
    setStepWithinAct(0);
    setAdHocMessages([]);
    setFreeQAHistory([]); // Reset All clears history; Reset Act preserves.
    setDisabledActions(new Set());
    setSkippedStepKeys(new Set());
  }

  // ws-160 F3: Reset DB clears Apply/Lock side-effects accumulated in the
  // prod Supabase tables from prior demo runs. Without this, the FlexiCash
  // pre-approved offer stays 'accepted' after the first Apply tap, breaking
  // Act 2 for every subsequent session.
  const [isResettingDb, setIsResettingDb] = useState(false);
  async function handleResetDb() {
    if (isResettingDb) return;
    setIsResettingDb(true);
    try {
      const resp = await fetch('/api/reset-demo', { method: 'POST' });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        console.error('[Reset DB] failed:', data);
        alert(`Reset DB failed: ${data.error ?? resp.statusText}`);
      } else {
        console.info('[Reset DB] OK:', data);
        // After DB reset, also clear UI state so the demo starts clean.
        handleResetAll();
      }
    } catch (err) {
      console.error('[Reset DB] network error:', err);
      alert(`Reset DB network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsResettingDb(false);
    }
  }

  function handleNext() {
    if (activeMode !== 'act1' && activeMode !== 'act2') return;
    if (stepWithinAct < getMaxStepForAct(activeMode)) {
      const newStep = stepWithinAct + 1;
      setStepWithinAct(newStep);
      // dry-run patch (ii): explicit visit lifts the skip.
      setSkippedStepKeys((prev) => {
        if (!prev.has(stepKey(activeMode, newStep))) return prev;
        const next = new Set(prev);
        next.delete(stepKey(activeMode, newStep));
        return next;
      });
      // dry-run patch (γ hybrid): same-Act Step transitions preserve adhoc.
    }
  }

  function handlePrev() {
    if (activeMode !== 'act1' && activeMode !== 'act2') return;
    if (stepWithinAct > 1) {
      const newStep = stepWithinAct - 1;
      setStepWithinAct(newStep);
      setSkippedStepKeys((prev) => {
        if (!prev.has(stepKey(activeMode, newStep))) return prev;
        const next = new Set(prev);
        next.delete(stepKey(activeMode, newStep));
        return next;
      });
    }
  }

  function handleJump(targetGlobalIndex: number) {
    const s = STEPS[targetGlobalIndex];
    if (!s) return;
    setActiveMode(s.act);
    setStepWithinAct(s.stepWithinAct);
    setAdHocMessages([]);
    // Explicit jump = explicit visit. Lift the skip for the destination.
    setSkippedStepKeys((prev) => {
      const key = stepKey(s.act === 'intro' ? 'act1' : s.act, s.stepWithinAct);
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    // Same partitioned clear pattern as handleResetAct — debug jump must not
    // wipe other-Act disabled state (cr-area1-c2 NEW-1 consistency fix).
    if (s.act === 'act1' || s.act === 'act2') {
      const targetActActionIds = new Set(
        getStepsForAct(s.act).flatMap((st) =>
          st.newMessages.flatMap((m) => (m.actions ?? []).map((a) => a.actionId))
        )
      );
      setDisabledActions((prev) => {
        const next = new Set(prev);
        targetActActionIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      // intro: do not touch disabledActions; preserve any prior Act state.
    }
  }

  function handleToggleContext() {
    setContextVisible(!contextVisible);
  }

  // Storyboard action → next-state mapping (REQ-CIMB-02 area 4 / #12 (α)).
  // No step-conditional gates: clicking the same action_id always produces the
  // same demo state advance, whether the click came from a storyboard-defined
  // button or an LLM-generated suggest_action button. Unknown action_ids fall
  // through and are no-ops on the frontend (the backend whitelist already
  // dropped any non-allowed action_id before the button was rendered).
  // ws-160: apiCall now takes the active step's asOfIso so the action route
  // can scope getDemoCurrentTimestamp to the storyboard time. Required so the
  // Apply tap during Act 2 (Fri 26 Jun) writes bank_interactions / products_held
  // with the correct timestamp instead of the Act 1 default.
  const STORYBOARD_ACTION_MAP: Record<
    string,
    { act: ActId; stepWithinAct: number; apiCall?: (asOfIso?: string) => Promise<unknown> }
  > = {
    lock_fx_forward: {
      act: 'act1',
      stepWithinAct: 3,
      apiCall: (asOfIso) =>
        fetch('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action_type: 'lock_fx_forward',
            referenced_entity_type: 'fx_opportunity',
            referenced_entity_id: 'fx_opp_eval_2026-07-13',
            details: { amount_eur: 8200, rate: 4.95, value_date: '2026-07-22' },
            session_id: SESSION_ID,
            as_of_iso: asOfIso
          })
        })
    },
    accept_preapproved_offer: {
      act: 'act2',
      stepWithinAct: 3,
      apiCall: (asOfIso) =>
        fetch('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action_type: 'accept_preapproved_offer',
            referenced_entity_type: 'preapproved_offer',
            referenced_entity_id: 'offer_flx_001',
            details: { product: 'flexicash', amount: 65000 },
            session_id: SESSION_ID,
            as_of_iso: asOfIso
          })
        })
    },
    show_loan_options: { act: 'act2', stepWithinAct: 2 }
    // decline_fx / decline_flx — no advance (no-op).
  };

  async function handleAction(actionId: string, label?: string) {
    setDisabledActions((s) => new Set([...s, actionId]));
    const mapping = STORYBOARD_ACTION_MAP[actionId];
    if (mapping) {
      // dry-run patch (ii): if this storyboard action jumps past intermediate
      // steps (e.g. Act 1 Step 2 → Step 4 skipping Step 3 Pull), mark those
      // intermediate steps as skipped so their hardcoded messages don't appear.
      const from =
        (activeMode === mapping.act ? stepWithinAct : 0);
      const to = mapping.stepWithinAct;
      if (to > from + 1) {
        const skips: string[] = [];
        for (let s = from + 1; s < to; s++) {
          skips.push(stepKey(mapping.act, s));
        }
        setSkippedStepKeys((prev) => new Set([...prev, ...skips]));
      }
      setActiveMode(mapping.act);
      setStepWithinAct(mapping.stepWithinAct);
      if (mapping.apiCall) {
        void mapping.apiCall(current.asOfIso).catch((err) =>
          console.error(`Action API error (${actionId}):`, err)
        );
      }
      return;
    }
    // Unmapped action_id — LLM-generated dynamic action (whitelisted by the
    // backend before the button was rendered). dry-run patch (ws-152):
    // instead of a dead-end "✓ Noted" ack, convert the click into a natural
    // follow-up message so the LLM continues the conversation. The label that
    // the LLM chose for the button drives the follow-up phrasing — falls back
    // to the action_id (snake_case → spaces) when label is missing.
    const displayLabel =
      label && label.trim().length > 0
        ? label.trim()
        : actionId.replace(/_/g, ' ');
    await handleSendMessage(`Please walk me through: ${displayLabel}.`);
  }

  async function handleSendMessage(text: string) {
    // Free QA 4-bug fix (REQ-CIMB-02 area 3):
    //   (a) system prompt에 step context 주입 (#10 β) — step_context body field
    //   (b) storyboard 메시지를 LLM history에서 분리 (Bug #4-b) — freeQAHistory만 사용
    //   (c) adhoc 메시지 폐기 정책 (#11 β) — 폰 깨끗 + History 패널 보존
    //   (d) action handler step 분기 제거 — DEFERRED area 4
    const userMsg: DemoMessage = {
      id: `adhoc_user_${newAdhocId()}`,
      side: 'self',
      text,
      time: current.timeStamp.split(' · ')[1] ?? '—',
      step: current.step
    };
    // Local snapshot — stale closure 회피 (cr-area3 MEDIUM-1).
    // freeQAHistory state update는 비동기라, fetch 시점에 setState가 아직 반영되지 않은
    // freeQAHistory를 .map하면 직전 입력이 누락된 history가 LLM에 전달됨.
    const nextHistory = [...freeQAHistory, userMsg];
    setAdHocMessages((m) => [...m, userMsg]);
    setFreeQAHistory(nextHistory);
    setIsThinking(true);

    try {
      // LLM에는 storyboard 메시지를 보내지 않는다. Free QA 누적 history (self/other만)
      // + 현재 사용자 입력만 전달. system bubble은 UI 표시용이라 제외.
      const history = nextHistory
        .filter((m) => m.side === 'self' || m.side === 'other')
        .map((m) => ({
          role: m.side === 'self' ? ('user' as const) : ('assistant' as const),
          content: m.text
        }));

      // recentPushText (ws-160): the current storyboard step's agent-side
      // messages, concatenated. Threaded into the system prompt so the LLM
      // anchors ambiguous follow-ups ("any other options?") on the most
      // recent push the user actually saw — not on stale freeQAHistory
      // topics from earlier steps.
      const recentPushText = current.newMessages
        .filter((m) => m.side === 'other')
        .map((m) => m.text)
        .join('\n\n')
        .trim();
      const stepContext: StepContext = {
        activeMode,
        stepWithinAct:
          activeMode === 'act1' || activeMode === 'act2' ? stepWithinAct : undefined,
        timeStamp: current.timeStamp,
        narrative: current.narrative,
        ...(recentPushText.length > 0 ? { recentPushText } : {}),
        // ws-160: thread the step's UTC ISO so backend tools query as of the
        // active storyboard time (Fri 26 Jun for Act 2, not the static Act 1 default).
        ...(current.asOfIso ? { asOfIso: current.asOfIso } : {})
      };

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          session_id: SESSION_ID,
          step_context: stepContext
        })
      });
      const data = await resp.json();
      if (data.reply) {
        // LLM 동적 action 주입 (REQ-CIMB-02 area 4 / #13). 백엔드가 whitelist
        // 검증을 끝낸 actions만 도착. variant fallback은 secondary (UI 기본).
        const rawActions = Array.isArray(data.actions) ? data.actions : [];
        const dynamicActions = rawActions
          .filter(
            (a: unknown): a is { label: string; action_id: string; variant?: string } =>
              !!a &&
              typeof (a as { label?: unknown }).label === 'string' &&
              typeof (a as { action_id?: unknown }).action_id === 'string'
          )
          .map((a: { label: string; action_id: string; variant?: string }) => ({
            label: a.label,
            actionId: a.action_id,
            variant:
              a.variant === 'primary' || a.variant === 'danger' || a.variant === 'secondary'
                ? a.variant
                : ('secondary' as const)
          }));

        const agentMsg: DemoMessage = {
          id: `adhoc_agent_${newAdhocId()}`,
          side: 'other',
          text: data.reply,
          time: current.timeStamp.split(' · ')[1] ?? '—',
          step: current.step,
          ...(dynamicActions.length > 0 ? { actions: dynamicActions } : {})
        };
        setAdHocMessages((m) => [...m, agentMsg]);
        setFreeQAHistory((h) => [...h, agentMsg]);
      } else if (data.error) {
        const errMsg: DemoMessage = {
          id: `adhoc_err_${newAdhocId()}`,
          side: 'system',
          text: `[error: ${data.error}]`,
          time: '—',
          step: current.step
        };
        setAdHocMessages((m) => [...m, errMsg]);
        setFreeQAHistory((h) => [...h, errMsg]);
      }
    } catch (err) {
      console.error('Chat error:', err);
      const errMsg: DemoMessage = {
        id: `adhoc_neterr_${newAdhocId()}`,
        side: 'system',
        text: `[network error: ${err instanceof Error ? err.message : String(err)}]`,
        time: '—',
        step: current.step
      };
      setAdHocMessages((m) => [...m, errMsg]);
      setFreeQAHistory((h) => [...h, errMsg]);
    } finally {
      setIsThinking(false);
    }
  }

  const headerLabel =
    activeMode === 'free'
      ? 'Free QA · open chat'
      : activeMode === 'intro'
      ? 'Intro · choose a scenario'
      : `${ACT_LABELS[activeMode]} · ${current.timeStamp}`;

  return (
    <div className="app">
      <ScenarioTabs
        activeMode={activeMode}
        onSelectMode={handleSelectMode}
        onResetAct={handleResetAct}
        onResetAll={handleResetAll}
        onResetDb={handleResetDb}
        isResettingDb={isResettingDb}
      />
      <header className="demo-header">
        <div className="title">
          CIMB CFO Agent{' '}
          <small>· PoC v2 Demo · Mr. Ahmad Bakri / Sunrise Trading</small>
        </div>
        <div className="time-stamp">{headerLabel}</div>
      </header>
      <main className={`main ${contextVisible ? '' : 'no-panel'}`}>
        <Phone
          messages={messages}
          onAction={handleAction}
          disabledActions={disabledActions}
          onSendMessage={handleSendMessage}
          isThinking={isThinking}
        />
        {contextVisible && (
          <ContextPanel
            activeMode={activeMode}
            stepWithinAct={stepWithinAct}
            timeStamp={current.timeStamp}
            narrative={current.narrative}
            sections={current.context}
            toolTrace={current.toolTrace}
            freeQAHistory={freeQAHistory}
          />
        )}
      </main>
      <DemoControls
        activeMode={activeMode}
        stepWithinAct={stepWithinAct}
        globalStepIndex={globalStepIndex}
        onNext={handleNext}
        onPrev={handlePrev}
        onJump={handleJump}
        onToggleContext={handleToggleContext}
        contextVisible={contextVisible}
      />
    </div>
  );
}
