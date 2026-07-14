'use client';

import type {
  ContextSection,
  ToolTraceEntry,
  ActiveMode,
  DemoMessage
} from '@/lib/demo_storyboard';
import { ACT_LABELS } from '@/lib/demo_storyboard';
import SankeyTrace from '@/components/SankeyTrace';
import FreeQAHistory from '@/components/FreeQAHistory';

interface Props {
  activeMode: ActiveMode;
  stepWithinAct: number;
  timeStamp: string;
  narrative: string;
  sections: ContextSection[];
  toolTrace?: ToolTraceEntry[];
  freeQAHistory?: DemoMessage[];
}

// 3-zone Right Context Panel (REQ-CIMB-02 area 2).
// Zone 1: Scenario Header — current Act/Step + timestamp + narrative
// Zone 2: Current Trigger Eval — preserved storyboard context sections
// Zone 3: Tool & DB Trace — SankeyTrace (Read → Reason → Write)
//
// All three zones are visible at the same time (#5 (a) decision).
// Free/Intro modes still render Zone 1+2+3 to keep the layout consistent;
// Zone 3 placeholders for steps without toolTrace.

function ScenarioHeader({
  activeMode,
  stepWithinAct,
  timeStamp,
  narrative
}: {
  activeMode: ActiveMode;
  stepWithinAct: number;
  timeStamp: string;
  narrative: string;
}) {
  let scope = '';
  if (activeMode === 'intro') scope = 'Intro · choose a scenario above';
  else if (activeMode === 'free') scope = 'Free QA · open chat';
  else scope = `${ACT_LABELS[activeMode]} · Step ${stepWithinAct} of 4`;

  return (
    <section className="panel-zone zone-scenario">
      <div className="zone-label">Scenario</div>
      <div className="zone-scope">{scope}</div>
      <div className="zone-time">{timeStamp}</div>
      <div className="zone-narrative">{narrative}</div>
    </section>
  );
}

function TriggerEval({ sections }: { sections: ContextSection[] }) {
  if (!sections || sections.length === 0) {
    return (
      <section className="panel-zone zone-trigger">
        <div className="zone-label">Current Trigger Eval</div>
        <div className="zone-empty">
          <em>No trigger evaluation for this step.</em>
        </div>
      </section>
    );
  }
  return (
    <section className="panel-zone zone-trigger">
      <div className="zone-label">Current Trigger Eval</div>
      {sections.map((s, idx) => (
        <div className="context-section" key={idx}>
          <div className="label">{s.label}</div>
          {s.rows &&
            s.rows.map((r, i) => (
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
    </section>
  );
}

function ToolDbTrace({ trace }: { trace?: ToolTraceEntry[] }) {
  return (
    <section className="panel-zone zone-trace">
      <div className="zone-label">Tool &amp; DB Trace</div>
      <SankeyTrace trace={trace} />
    </section>
  );
}

export default function ContextPanel({
  activeMode,
  stepWithinAct,
  timeStamp,
  narrative,
  sections,
  toolTrace,
  freeQAHistory
}: Props) {
  // The Free QA History footer sits outside the 3-zone grid (#5 (a) decision
  // is preserved — three primary zones) and is collapsible-by-design via
  // styling. It surfaces adhoc dialogue that the phone screen cleared, so the
  // presenter can recall it during dry-run or Q&A (#11 (β)).
  return (
    <aside className="context-panel">
      <ScenarioHeader
        activeMode={activeMode}
        stepWithinAct={stepWithinAct}
        timeStamp={timeStamp}
        narrative={narrative}
      />
      <TriggerEval sections={sections} />
      <ToolDbTrace trace={toolTrace} />
      <section className="panel-footer freeqa-footer" aria-label="Free QA history">
        <div className="zone-label">Free QA History</div>
        <FreeQAHistory history={freeQAHistory ?? []} />
      </section>
    </aside>
  );
}
