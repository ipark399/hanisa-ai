'use client';

import type { ContextSection } from '@/lib/demo_storyboard';

interface Props {
  step: number;
  timeStamp: string;
  narrative: string;
  sections: ContextSection[];
}

export default function ContextPanel({ step, timeStamp, narrative, sections }: Props) {
  return (
    <aside className="context-panel">
      <h2>Context Panel — Step {step}</h2>
      <div style={{ fontSize: 12, color: '#666', marginTop: -10 }}>
        <strong>{timeStamp}</strong> · {narrative}
      </div>
      {sections.map((s, idx) => (
        <div className="context-section" key={idx}>
          <div className="label">{s.label}</div>
          {s.rows && s.rows.map((r, i) => (
            <div className="row" key={i}>
              <span className="k">{r.k}</span>
              <span className="v">{r.v}</span>
            </div>
          ))}
          {s.lines && (
            <ul>
              {s.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
          {s.pre && <pre>{s.pre}</pre>}
        </div>
      ))}
    </aside>
  );
}
