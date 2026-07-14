'use client';

import { STEPS, ACT_LABELS, MAX_STEP_WITHIN_ACT } from '@/lib/demo_storyboard';
import type { ActiveMode } from '@/lib/demo_storyboard';

interface Props {
  activeMode: ActiveMode;
  stepWithinAct: number;
  globalStepIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onJump: (globalStepIndex: number) => void;
  onToggleContext: () => void;
  contextVisible: boolean;
}

// Bottom controls bar (REQ-CIMB-02 area 1).
// - Reset 버튼은 상단 ScenarioTabs로 이전됨
// - Step 표시 양식: "Act 1 · Step 2 of 4" / Free / Intro
// - Next/Prev는 현재 Act 안에서만 작동 (Act 간 자동 진입 없음 — 시연자 명시적 탭 클릭 필요)
// - Jump select는 전역 step (디버깅·dry-run 용)

export default function DemoControls({
  activeMode,
  stepWithinAct,
  globalStepIndex,
  onNext,
  onPrev,
  onJump,
  onToggleContext,
  contextVisible
}: Props) {
  let label = '';
  let canPrev = false;
  let canNext = false;

  if (activeMode === 'intro') {
    label = 'Intro · pick an Act above';
  } else if (activeMode === 'free') {
    label = 'Free QA · no scripted steps';
  } else {
    label = `${ACT_LABELS[activeMode]} · Step ${stepWithinAct} of ${MAX_STEP_WITHIN_ACT}`;
    canPrev = stepWithinAct > 1;
    canNext = stepWithinAct < MAX_STEP_WITHIN_ACT;
  }

  return (
    <footer className="controls-footer">
      <div className="btn-group">
        <button type="button" onClick={onPrev} disabled={!canPrev}>
          ◀ Prev
        </button>
        <button
          type="button"
          className="primary"
          onClick={onNext}
          disabled={!canNext}
        >
          Next ▶
        </button>
      </div>
      <div className="step">{label}</div>
      <div className="btn-group">
        <select
          value={globalStepIndex}
          onChange={(e) => onJump(Number(e.target.value))}
          aria-label="Jump to step (debug)"
        >
          {STEPS.map((s, i) => (
            <option key={s.step} value={i}>
              {s.act === 'intro'
                ? `Intro (Setup) — ${s.timeStamp}`
                : `${ACT_LABELS[s.act]} · Step ${s.stepWithinAct} — ${s.timeStamp}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="toggle-context"
          onClick={onToggleContext}
        >
          {contextVisible ? 'Hide context' : 'Show context'}
        </button>
      </div>
    </footer>
  );
}
