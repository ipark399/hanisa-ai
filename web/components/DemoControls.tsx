'use client';

import { STEPS } from '@/lib/demo_storyboard';

interface Props {
  step: number;
  onNext: () => void;
  onPrev: () => void;
  onReset: () => void;
  onJump: (n: number) => void;
  onToggleContext: () => void;
  contextVisible: boolean;
  total: number;
}

export default function DemoControls({
  step, onNext, onPrev, onReset, onJump, onToggleContext, contextVisible, total
}: Props) {
  return (
    <footer className="controls-footer">
      <div className="btn-group">
        <button onClick={onReset}>Reset</button>
        <button onClick={onPrev} disabled={step === 0}>◀ Prev</button>
        <button className="primary" onClick={onNext} disabled={step >= total - 1}>
          Next ▶
        </button>
      </div>
      <div className="step">
        Step {step} of {total - 1}
      </div>
      <div className="btn-group">
        <select value={step} onChange={(e) => onJump(Number(e.target.value))}>
          {STEPS.map((s) => (
            <option key={s.step} value={s.step}>
              Step {s.step} — {s.timeStamp}
            </option>
          ))}
        </select>
        <button className="toggle-context" onClick={onToggleContext}>
          {contextVisible ? 'Hide context' : 'Show context'}
        </button>
      </div>
    </footer>
  );
}
