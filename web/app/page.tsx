'use client';

import { useMemo, useState } from 'react';
import Phone from '@/components/Phone';
import ContextPanel from '@/components/ContextPanel';
import DemoControls from '@/components/DemoControls';
import { STEPS, type DemoMessage } from '@/lib/demo_storyboard';

const SESSION_ID = 'demo_session_001';

export default function DemoPage() {
  const [step, setStep] = useState(0);
  const [adHocMessages, setAdHocMessages] = useState<DemoMessage[]>([]);
  const [contextVisible, setContextVisible] = useState(true);
  const [disabledActions, setDisabledActions] = useState<Set<string>>(new Set());
  const [isThinking, setIsThinking] = useState(false);

  const current = STEPS[step];

  // Messages accumulated up to and including current step + ad-hoc
  const messages: DemoMessage[] = useMemo(() => {
    const stepMsgs = STEPS.flatMap((s) => (s.step <= step ? s.newMessages : []));
    return [...stepMsgs, ...adHocMessages];
  }, [step, adHocMessages]);

  function handleNext() {
    if (step < STEPS.length - 1) setStep(step + 1);
  }
  function handlePrev() {
    if (step > 0) {
      setStep(step - 1);
      setAdHocMessages([]);
    }
  }
  function handleReset() {
    setStep(0);
    setAdHocMessages([]);
    setDisabledActions(new Set());
  }
  function handleJump(n: number) {
    setStep(n);
    setAdHocMessages([]);
    setDisabledActions(new Set());
  }
  function handleToggleContext() {
    setContextVisible(!contextVisible);
  }

  async function handleAction(actionId: string) {
    setDisabledActions((s) => new Set([...s, actionId]));

    // Map storyboard action → demo step advance
    if (actionId === 'lock_fx_forward' && step === 2) {
      // Advance to Step 4 (skip Step 3 if user clicks directly)
      // But storyboard flow is Step 3 pull then Step 4 confirm.
      // For deterministic demo, jump to Step 4.
      setStep(4);
      // POST /api/action for backend side-effects (optional for live demo)
      void fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'lock_fx_forward',
          referenced_entity_type: 'fx_opportunity',
          referenced_entity_id: 'fx_opp_eval_2026-06-08',
          details: { amount_eur: 8200, rate: 4.95, value_date: '2026-06-17' },
          session_id: SESSION_ID
        })
      });
      return;
    }
    if (actionId === 'accept_preapproved_offer' && step === 5) {
      setStep(7);
      void fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'accept_preapproved_offer',
          referenced_entity_type: 'preapproved_offer',
          referenced_entity_id: 'offer_flx_001',
          details: { product: 'flexicash', amount: 65000 },
          session_id: SESSION_ID
        })
      });
      return;
    }
    if (actionId === 'show_loan_options' && step === 5) {
      setStep(6);
      return;
    }
    if (actionId === 'decline_fx' || actionId === 'decline_flx') {
      // No-op for demo — user can re-tap or move on
      return;
    }
  }

  async function handleSendMessage(text: string) {
    // Add user message immediately
    const userMsg: DemoMessage = {
      id: `adhoc_${Date.now()}`,
      side: 'self',
      text,
      time: current.timeStamp.split(' · ')[1] ?? '—',
      step: step
    };
    setAdHocMessages((m) => [...m, userMsg]);
    setIsThinking(true);

    try {
      // Build history for API: storyboard messages so far + ad-hoc
      const history = messages.map((m) => ({
        role: m.side === 'self' ? 'user' : 'assistant',
        content: m.text
      })) as Array<{ role: 'user' | 'assistant'; content: string }>;
      history.push({ role: 'user', content: text });

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, session_id: SESSION_ID })
      });
      const data = await resp.json();
      if (data.reply) {
        const agentMsg: DemoMessage = {
          id: `adhoc_${Date.now() + 1}`,
          side: 'other',
          text: data.reply,
          time: current.timeStamp.split(' · ')[1] ?? '—',
          step
        };
        setAdHocMessages((m) => [...m, agentMsg]);
      } else if (data.error) {
        const errMsg: DemoMessage = {
          id: `adhoc_${Date.now() + 1}`,
          side: 'system',
          text: `[error: ${data.error}]`,
          time: '—',
          step
        };
        setAdHocMessages((m) => [...m, errMsg]);
      }
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setIsThinking(false);
    }
  }

  return (
    <div className="app">
      <header className="demo-header">
        <div className="title">
          CIMB CFO Agent <small>· PoC v2 Demo · Mr. Ahmad Bakri / Sunrise Trading</small>
        </div>
        <div className="time-stamp">{current.timeStamp}</div>
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
            step={current.step}
            timeStamp={current.timeStamp}
            narrative={current.narrative}
            sections={current.context}
          />
        )}
      </main>
      <DemoControls
        step={step}
        onNext={handleNext}
        onPrev={handlePrev}
        onReset={handleReset}
        onJump={handleJump}
        onToggleContext={handleToggleContext}
        contextVisible={contextVisible}
        total={STEPS.length}
      />
    </div>
  );
}
