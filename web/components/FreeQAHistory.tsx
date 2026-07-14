'use client';

import type { DemoMessage } from '@/lib/demo_storyboard';

interface Props {
  history: DemoMessage[];
}

// FreeQAHistory — REQ-CIMB-02 area 3 / #11 (β).
// 폰 화면에서 폐기된 adhoc 대화를 시연자가 회상·디버깅할 수 있도록 별도 패널에
// 누적 보존한다. Reset All에서만 비우고, Reset Act / Next / Prev / Tab 전환에서는 보존.

function sideLabel(side: DemoMessage['side']): { label: string; cls: string } {
  if (side === 'self') return { label: 'User', cls: 'freeqa-user' };
  if (side === 'other') return { label: 'Agent', cls: 'freeqa-agent' };
  return { label: 'System', cls: 'freeqa-system' };
}

export default function FreeQAHistory({ history }: Props) {
  if (history.length === 0) {
    return (
      <div className="freeqa-empty">
        <em>No Free QA history yet. Type in the phone to start an ad-hoc chat.</em>
      </div>
    );
  }
  return (
    <div className="freeqa-history">
      {history.map((m) => {
        const meta = sideLabel(m.side);
        return (
          <div className={`freeqa-row ${meta.cls}`} key={m.id}>
            <div className="freeqa-meta">
              <span className="freeqa-side">{meta.label}</span>
              <span className="freeqa-time">{m.time}</span>
            </div>
            <div className="freeqa-text">{m.text}</div>
          </div>
        );
      })}
    </div>
  );
}
