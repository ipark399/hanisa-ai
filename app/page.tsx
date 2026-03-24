"use client";

import { useChat } from "@ai-sdk/react";
import { useRef, useEffect, useState, useCallback } from "react";
import CorrectionModal from "@/components/CorrectionModal";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Home() {
  const { messages, sendMessage, status, stop } = useChat();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isStreaming = status === "streaming" || status === "submitted";

  // 수정 요청 모달 상태
  const [correctionModal, setCorrectionModal] = useState<{
    isOpen: boolean;
    content: string;
  }>({ isOpen: false, content: "" });

  const openCorrectionModal = useCallback((content: string) => {
    setCorrectionModal({ isOpen: true, content });
  }, []);

  const closeCorrectionModal = useCallback(() => {
    setCorrectionModal({ isOpen: false, content: "" });
  }, []);

  // 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // textarea 높이 자동 조절
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = 6 * 24; // 약 4줄
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isStreaming) return;
      sendMessage({ text: trimmed });
      setInput("");
      // 높이 리셋
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    },
    [input, isStreaming, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="flex flex-col h-dvh">
      {/* 면책 배너 */}
      <div
        className="flex-shrink-0 px-4 py-2.5 text-center text-sm border-b"
        style={{
          background: "var(--banner-bg)",
          borderColor: "var(--banner-border)",
          color: "#7a5a00",
        }}
      >
        <span className="font-medium">
          &#9877;&#65039; 본 서비스는 참고용 정보 제공 도구이며, 참고로만
          사용 부탁드립니다.
        </span>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto chat-scroll">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onRequestCorrection={openCorrectionModal}
                />
              ))}
              {isStreaming &&
                messages.length > 0 &&
                messages[messages.length - 1].role === "user" && (
                  <LoadingIndicator />
                )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* 입력 영역 */}
      <div
        className="flex-shrink-0 border-t"
        style={{ borderColor: "var(--input-border)" }}
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6 lg:px-8">
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <div
              className="flex-1 rounded-2xl border px-4 py-3 transition-colors focus-within:border-amber-600"
              style={{
                background: "var(--input-bg)",
                borderColor: "var(--input-border)",
              }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="한의학에 대해 궁금한 점을 물어보세요..."
                rows={1}
                className="w-full resize-none bg-transparent text-[15px] leading-6 outline-none placeholder:text-stone-400"
                style={{ maxHeight: "144px" }}
                disabled={isStreaming}
              />
            </div>
            {isStreaming ? (
              <button
                type="button"
                onClick={stop}
                className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-red-500 text-white transition-colors hover:bg-red-600"
                title="중지"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="currentColor"
                >
                  <rect width="14" height="14" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: input.trim() ? "#8b6914" : "#c4b5a0",
                  color: "#fff",
                }}
                title="전송"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            )}
          </form>
          <p className="mt-2 text-center text-xs text-stone-400">
            AI가 생성한 답변은 부정확할 수 있습니다. 중요한 정보는 반드시 전문가와
            상담하세요.
          </p>
        </div>
      </div>

      {/* 수정 요청 모달 */}
      <CorrectionModal
        isOpen={correctionModal.isOpen}
        onClose={closeCorrectionModal}
        originalContent={correctionModal.content}
      />
    </div>
  );
}

/* ─── 서브 컴포넌트 ─── */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
      <div className="text-5xl mb-4">&#127807;</div>
      <h1 className="text-2xl font-semibold mb-2" style={{ color: "#5c4f42" }}>
        한의사 AI 보조
      </h1>
      <p className="text-stone-500 max-w-sm leading-relaxed">
        한의학에 관한 질문을 입력해 주세요.
        <br />
        증상, 체질, 한약, 침구 등 다양한 주제에 대해 답변합니다.
      </p>
    </div>
  );
}

/**
 * [출처: source - title] 패턴을 감지하여 배지 컴포넌트로 변환
 */
function renderSourceBadges(text: string): React.ReactNode[] {
  const sourceRegex = /\[출처:\s*(.+?)\s*-\s*(.+?)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sourceRegex.exec(text)) !== null) {
    // 매치 이전 텍스트
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // 출처 배지
    const source = match[1];
    const title = match[2];
    parts.push(
      <span key={match.index} className="source-badge">
        <svg
          className="source-badge-icon"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span className="source-badge-text">
          {source} &mdash; {title}
        </span>
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  // 나머지 텍스트
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * react-markdown 커스텀 렌더러: 텍스트 노드 내 [출처: ...] 패턴을 배지로 변환
 */
const markdownComponents: Components = {
  p({ children, ...props }) {
    return (
      <p {...props}>
        {processChildren(children)}
      </p>
    );
  },
  li({ children, ...props }) {
    return (
      <li {...props}>
        {processChildren(children)}
      </li>
    );
  },
};

function processChildren(children: React.ReactNode): React.ReactNode {
  if (!children) return children;

  if (typeof children === "string") {
    const result = renderSourceBadges(children);
    return result.length === 1 && typeof result[0] === "string" ? result[0] : <>{result}</>;
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === "string") {
        const result = renderSourceBadges(child);
        return result.length === 1 && typeof result[0] === "string" ? (
          result[0]
        ) : (
          <span key={i}>{result}</span>
        );
      }
      return child;
    });
  }

  return children;
}

function MessageBubble({
  message,
  onRequestCorrection,
}: {
  message: { id: string; role: string; parts: Array<{ type: string; text?: string }> };
  onRequestCorrection: (content: string) => void;
}) {
  const isUser = message.role === "user";

  const textContent = message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${
          isUser
            ? "rounded-br-md"
            : "rounded-bl-md"
        }`}
        style={{
          background: isUser ? "var(--user-bubble)" : "var(--ai-bubble)",
          border: isUser ? "none" : "1px solid #e8dfd4",
        }}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs font-medium" style={{ color: "#8b6914" }}>
              &#127807; 한의사 AI
            </span>
          </div>
        )}
        {isUser ? (
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
            {textContent}
          </p>
        ) : (
          <>
            <div className="markdown-body text-[15px] leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {textContent}
              </ReactMarkdown>
            </div>
            {/* 참고용 정보 라벨 + 수정 요청 버튼 */}
            <div
              className="flex items-center justify-between mt-3 pt-2"
              style={{ borderTop: "1px solid #e8dfd4" }}
            >
              <div className="reference-label" style={{ margin: 0, padding: 0, border: "none" }}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>참고용 정보 &mdash; 최종 판단은 전문가와 상의하세요</span>
              </div>
              <button
                type="button"
                onClick={() => onRequestCorrection(textContent)}
                className="flex-shrink-0 flex items-center gap-1 text-xs transition-colors rounded px-1.5 py-0.5"
                style={{ color: "#9a8d7f" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#8b6914";
                  e.currentTarget.style.background = "#f5f0e8";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#9a8d7f";
                  e.currentTarget.style.background = "transparent";
                }}
                title="이 답변에 대해 수정을 요청합니다"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span>수정 요청</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div className="flex justify-start">
      <div
        className="rounded-2xl rounded-bl-md px-4 py-3"
        style={{
          background: "var(--ai-bubble)",
          border: "1px solid #e8dfd4",
        }}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-xs font-medium" style={{ color: "#8b6914" }}>
            &#127807; 한의사 AI
          </span>
        </div>
        <div className="flex items-center gap-1.5 py-1">
          <span
            className="loading-dot w-2 h-2 rounded-full inline-block"
            style={{ background: "#8b6914" }}
          />
          <span
            className="loading-dot w-2 h-2 rounded-full inline-block"
            style={{ background: "#8b6914" }}
          />
          <span
            className="loading-dot w-2 h-2 rounded-full inline-block"
            style={{ background: "#8b6914" }}
          />
        </div>
      </div>
    </div>
  );
}
