'use client';

import { useEffect, useRef, useState } from 'react';
import MessageBubble from './MessageBubble';
import type { DemoMessage } from '@/lib/demo_storyboard';

interface Props {
  messages: DemoMessage[];
  onAction: (actionId: string) => void;
  disabledActions: Set<string>;
  onSendMessage: (text: string) => Promise<void>;
  isThinking: boolean;
}

export default function Phone({ messages, onAction, disabledActions, onSendMessage, isThinking }: Props) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isThinking]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    await onSendMessage(text);
  }

  return (
    <div className="phone-frame">
      <div className="phone-screen">
        <div className="wa-header">
          <div className="avatar">CC</div>
          <div className="info">
            <div className="name">CIMB CFO Agent</div>
            <div className="status">online</div>
          </div>
        </div>
        <div className="messages" ref={scrollRef}>
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} onAction={onAction} disabledActions={disabledActions} />
          ))}
          {isThinking && (
            <div className="bubble-row other">
              <div className="bubble other" style={{ opacity: 0.6 }}>
                <em>typing…</em>
              </div>
            </div>
          )}
        </div>
        <form className="composer" onSubmit={handleSend}>
          <input
            type="text"
            placeholder="Type a message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isThinking}
          />
          <button type="submit" disabled={isThinking || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
