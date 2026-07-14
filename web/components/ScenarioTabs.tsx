'use client';

import type { ActiveMode } from '@/lib/demo_storyboard';
import { ACT_LABELS } from '@/lib/demo_storyboard';

interface Props {
  activeMode: ActiveMode;
  onSelectMode: (mode: ActiveMode) => void;
  onResetAct: () => void;
  onResetAll: () => void;
  onResetDb: () => void;
  isResettingDb?: boolean;
}

// Top-bar scenario tabs (REQ-CIMB-02 #3 (b) decision).
// - Confirm dialog 없음 (#8 사용자 결정)
// - 시연자 숙련 + 사고 시 Reset Act 복구
// - Free QA 탭은 storyboard 진행과 분리되어 자유 채팅 (영역 3 Free QA 안정화에서 후속 처리)

export default function ScenarioTabs({
  activeMode,
  onSelectMode,
  onResetAct,
  onResetAll,
  onResetDb,
  isResettingDb
}: Props) {
  const isAct = activeMode === 'act1' || activeMode === 'act2';

  return (
    <nav className="scenario-tabs" aria-label="Scenario selector">
      <div className="tabs-group">
        <button
          type="button"
          className={`tab ${activeMode === 'act1' ? 'active' : ''}`}
          onClick={() => onSelectMode('act1')}
          aria-pressed={activeMode === 'act1'}
        >
          {ACT_LABELS.act1}
        </button>
        <button
          type="button"
          className={`tab ${activeMode === 'act2' ? 'active' : ''}`}
          onClick={() => onSelectMode('act2')}
          aria-pressed={activeMode === 'act2'}
        >
          {ACT_LABELS.act2}
        </button>
        <button
          type="button"
          className={`tab ${activeMode === 'free' ? 'active' : ''}`}
          onClick={() => onSelectMode('free')}
          aria-pressed={activeMode === 'free'}
        >
          Free QA
        </button>
      </div>
      <div className="reset-group">
        <button
          type="button"
          className="reset reset-act"
          onClick={onResetAct}
          disabled={!isAct}
          title={isAct ? 'Restart current Act from Step 1' : 'Available inside an Act'}
        >
          ↻ Reset Act
        </button>
        <button
          type="button"
          className="reset reset-all"
          onClick={onResetAll}
          title="Reset everything (state cleared)"
          aria-label="Reset all scenarios — clears Act 1, Act 2, and Free QA state"
        >
          ⟲ Reset All
        </button>
        <button
          type="button"
          className="reset reset-db"
          onClick={onResetDb}
          disabled={isResettingDb}
          title="Clean up DB residue (offers, holdings, scheduled FX, audit logs) from prior demo runs"
          aria-label="Reset demo database — restores the offer to open and clears Apply/Lock side-effects"
        >
          {isResettingDb ? '⌛ Resetting…' : '🧹 Reset DB'}
        </button>
      </div>
    </nav>
  );
}
