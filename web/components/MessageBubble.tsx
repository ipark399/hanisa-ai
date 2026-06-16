'use client';

import type { DemoMessage } from '@/lib/demo_storyboard';

function renderText(text: string) {
  // Very simple markdown: **bold** and _italic_
  return text.split('\n').map((line, idx) => {
    const segments: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;
    while (remaining.length > 0) {
      const boldM = /\*\*(.+?)\*\*/.exec(remaining);
      const italM = /_([^_]+?)_/.exec(remaining);
      if (boldM && (!italM || boldM.index <= italM.index)) {
        if (boldM.index > 0) segments.push(<span key={key++}>{remaining.slice(0, boldM.index)}</span>);
        segments.push(<strong key={key++}>{boldM[1]}</strong>);
        remaining = remaining.slice(boldM.index + boldM[0].length);
      } else if (italM) {
        if (italM.index > 0) segments.push(<span key={key++}>{remaining.slice(0, italM.index)}</span>);
        segments.push(<em key={key++} style={{ color: '#888', fontSize: '12px' }}>{italM[1]}</em>);
        remaining = remaining.slice(italM.index + italM[0].length);
      } else {
        segments.push(<span key={key++}>{remaining}</span>);
        remaining = '';
      }
    }
    return (
      <span key={idx}>
        {segments}
        <br />
      </span>
    );
  });
}

interface Props {
  msg: DemoMessage;
  onAction?: (actionId: string) => void;
  disabledActions?: Set<string>;
}

export default function MessageBubble({ msg, onAction, disabledActions }: Props) {
  return (
    <div className={`bubble-row ${msg.side}`}>
      <div className={`bubble ${msg.side}`}>
        {msg.intel && <span className="intel-tag">From CIMB CFO Agent · INTEL</span>}
        {msg.intel && <br />}
        <div>{renderText(msg.text)}</div>
        {msg.actions && (
          <div className="actions">
            {msg.actions.map((a) => (
              <button
                key={a.actionId}
                className={`action-btn ${a.variant === 'primary' ? 'primary' : a.variant === 'danger' ? 'danger' : ''}`}
                disabled={disabledActions?.has(a.actionId)}
                onClick={() => onAction?.(a.actionId)}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        <div className="time-row">{msg.time}</div>
      </div>
    </div>
  );
}
