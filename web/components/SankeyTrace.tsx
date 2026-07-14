'use client';

import { useMemo, useState } from 'react';
import type { ToolTraceEntry } from '@/lib/demo_storyboard';

interface Props {
  trace?: ToolTraceEntry[];
}

// SankeyTrace — REQ-CIMB-02 area 2.
// Renders the LLM's Read → Reason → Write sequence as a left-to-right SVG flow.
// Self-contained SVG (no external library) — node-style boxes connected by
// curved paths. Two presenter toggles:
//   - Sankey ⇄ Row preview (#6 b+c / #9 γ)
//   - Animation ON / OFF   (#7 c — Read→Reason→Write 3-phase + skip)
//
// Empty/undefined trace renders a placeholder.

const NODE_W = 160;
const NODE_H = 56;
const COL_GAP = 40;
const ROW_GAP = 12;
const COL_X = {
  read: 12,
  reason: 12 + NODE_W + COL_GAP,
  write: 12 + (NODE_W + COL_GAP) * 2
};

function buildLayout(trace: ToolTraceEntry[]) {
  const reads = trace.filter((t) => t.phase === 'read');
  const reasons = trace.filter((t) => t.phase === 'reason');
  const writes = trace.filter((t) => t.phase === 'write');

  const colHeight = (arr: ToolTraceEntry[]) =>
    arr.length === 0 ? 0 : arr.length * NODE_H + (arr.length - 1) * ROW_GAP;

  const maxColH = Math.max(colHeight(reads), colHeight(reasons), colHeight(writes), NODE_H);
  const startY = (arr: ToolTraceEntry[]) => (maxColH - colHeight(arr)) / 2;

  const place = (arr: ToolTraceEntry[], col: 'read' | 'reason' | 'write') =>
    arr.map((entry, i) => ({
      entry,
      x: COL_X[col],
      y: startY(arr) + i * (NODE_H + ROW_GAP),
      col
    }));

  const nodes = [...place(reads, 'read'), ...place(reasons, 'reason'), ...place(writes, 'write')];

  // Edges: every read → every reason, every reason → every write.
  type Node = (typeof nodes)[number];
  const edges: { from: Node; to: Node }[] = [];
  const readNodes = nodes.filter((n) => n.col === 'read');
  const reasonNodes = nodes.filter((n) => n.col === 'reason');
  const writeNodes = nodes.filter((n) => n.col === 'write');
  for (const r of readNodes) for (const rs of reasonNodes) edges.push({ from: r, to: rs });
  for (const rs of reasonNodes) for (const w of writeNodes) edges.push({ from: rs, to: w });

  // Fallback: when one column is empty, link read → write directly.
  if (reasonNodes.length === 0) {
    for (const r of readNodes) for (const w of writeNodes) edges.push({ from: r, to: w });
  }

  const totalW = COL_X.write + NODE_W + 12;
  return { nodes, edges, width: totalW, height: maxColH + 24 };
}

function curve(x1: number, y1: number, x2: number, y2: number) {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

function NodeRect({
  node,
  animationEnabled
}: {
  node: { entry: ToolTraceEntry; x: number; y: number; col: 'read' | 'reason' | 'write' };
  animationEnabled: boolean;
}) {
  const { entry, x, y, col } = node;
  const label =
    col === 'reason'
      ? 'REASON'
      : col === 'read'
      ? `READ ${entry.table ?? ''}`
      : `WRITE ${entry.table ?? ''}`;
  const sub =
    col === 'reason'
      ? entry.reasoning ?? ''
      : col === 'read'
      ? `${entry.rowsRead ?? 0} rows`
      : entry.rowsWritten != null
      ? `+${entry.rowsWritten} row${entry.rowsWritten === 1 ? '' : 's'}`
      : '';
  const isBank = entry.table?.startsWith('bank_');
  const isInfer = entry.table?.startsWith('infer_');
  const fill =
    col === 'reason'
      ? '#FFF6E5'
      : col === 'read'
      ? isBank
        ? '#E8F4FF'
        : isInfer
        ? '#F2EAFF'
        : '#F0F0F0'
      : isBank
      ? '#E0EFFF'
      : isInfer
      ? '#EADCFF'
      : '#F0F0F0';
  const stroke =
    col === 'reason' ? '#D69E2E' : isBank ? '#3182CE' : isInfer ? '#805AD5' : '#888';

  return (
    <g
      className={`sankey-node sankey-node-${col} ${animationEnabled ? '' : 'no-anim'}`}
      data-phase={col}
    >
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={6}
        ry={6}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
      />
      <text x={x + 10} y={y + 22} fontSize={11} fontWeight={700} fill={stroke}>
        {label.length > 22 ? label.slice(0, 21) + '…' : label}
      </text>
      <text x={x + 10} y={y + 40} fontSize={10} fill="#3a3a3a">
        {sub.length > 26 ? sub.slice(0, 25) + '…' : sub}
      </text>
    </g>
  );
}

function RowPreview({ trace }: { trace: ToolTraceEntry[] }) {
  const entriesWithRows = trace.filter((t) => t.rowPreview && t.rowPreview.length > 0);
  if (entriesWithRows.length === 0) {
    return (
      <div className="sankey-empty">
        <em>No row preview available for this step.</em>
      </div>
    );
  }
  return (
    <div className="row-preview">
      {entriesWithRows.map((t, i) => (
        <div className="row-preview-block" key={i}>
          <div className="row-preview-label">
            <strong>{t.phase.toUpperCase()}</strong> {t.table ?? ''}
            {t.toolCall ? <span className="row-preview-tool"> · {t.toolCall}</span> : null}
          </div>
          <div className="row-preview-rows">
            {(t.rowPreview ?? []).map((row, ri) => (
              <pre key={ri} className="row-preview-row">
                {Object.entries(row)
                  .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
                  .join('  ·  ')}
              </pre>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SankeyTrace({ trace }: Props) {
  // All hooks must run unconditionally (Rules of Hooks — fix per sc-area2 finding).
  const [showRowPreview, setShowRowPreview] = useState(false);
  const [animationEnabled, setAnimationEnabled] = useState(true);
  // animation key forces CSS animations to restart when the trace changes.
  const animationKey = useMemo(
    () => (trace ?? []).map((t) => `${t.phase}:${t.table ?? ''}`).join('|'),
    [trace]
  );
  const layout = useMemo(
    () => (trace && trace.length > 0 ? buildLayout(trace) : null),
    [trace]
  );

  if (!trace || trace.length === 0 || !layout) {
    return (
      <div className="sankey-empty">
        <em>No tool trace recorded for this step.</em>
      </div>
    );
  }

  return (
    <div className="sankey-wrap">
      <div className="sankey-toolbar">
        <button
          type="button"
          className={`sankey-toggle ${showRowPreview ? '' : 'active'}`}
          onClick={() => setShowRowPreview(false)}
          aria-pressed={!showRowPreview}
        >
          Sankey
        </button>
        <button
          type="button"
          className={`sankey-toggle ${showRowPreview ? 'active' : ''}`}
          onClick={() => setShowRowPreview(true)}
          aria-pressed={showRowPreview}
        >
          📊 Show rows
        </button>
        <span className="sankey-spacer" />
        <button
          type="button"
          className="sankey-skip"
          onClick={() => setAnimationEnabled((v) => !v)}
          title={animationEnabled ? 'Skip animation' : 'Re-enable animation'}
          aria-pressed={!animationEnabled}
        >
          {animationEnabled ? '⏭ Skip anim' : '▶ Anim on'}
        </button>
      </div>
      {showRowPreview ? (
        <RowPreview trace={trace} />
      ) : (
        <svg
          key={animationKey}
          className={`sankey-svg ${animationEnabled ? '' : 'no-anim'}`}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width="100%"
          height={layout.height + 12}
          aria-label="Tool and database read-reason-write trace"
        >
          {layout.edges.map((edge, i) => {
            const x1 = edge.from.x + NODE_W;
            const y1 = edge.from.y + NODE_H / 2;
            const x2 = edge.to.x;
            const y2 = edge.to.y + NODE_H / 2;
            const phaseClass =
              edge.to.col === 'reason'
                ? 'edge-read-reason'
                : edge.from.col === 'reason'
                ? 'edge-reason-write'
                : 'edge-read-write';
            return (
              <path
                key={i}
                d={curve(x1, y1, x2, y2)}
                className={`sankey-edge ${phaseClass}`}
                fill="none"
                stroke="#A0AEC0"
                strokeWidth={1.5}
                opacity={0.6}
              />
            );
          })}
          {layout.nodes.map((node, i) => (
            <NodeRect key={i} node={node} animationEnabled={animationEnabled} />
          ))}
        </svg>
      )}
    </div>
  );
}
