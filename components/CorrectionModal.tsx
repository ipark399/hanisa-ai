"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface CorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalContent: string;
}

export default function CorrectionModal({
  isOpen,
  onClose,
  originalContent,
}: CorrectionModalProps) {
  const [correctionText, setCorrectionText] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const correctionRef = useRef<HTMLTextAreaElement>(null);

  // 모달 열릴 때 초기화 + 포커스
  useEffect(() => {
    if (isOpen) {
      setCorrectionText("");
      setReason("");
      setError(null);
      setSuccess(false);
      setIsSubmitting(false);
      // 다음 틱에 포커스
      setTimeout(() => correctionRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // body 스크롤 방지
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  // 외부 클릭으로 닫기
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose]
  );

  // 제출
  const handleSubmit = useCallback(async () => {
    if (!correctionText.trim()) {
      setError("수정 내용을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_content: originalContent,
          correction_text: correctionText.trim(),
          reason: reason.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "서버 오류가 발생했습니다.");
      }

      setSuccess(true);
      // 1.5초 후 모달 닫기
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "서버 오류가 발생했습니다."
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [correctionText, reason, originalContent, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.5)" }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl shadow-xl"
        style={{ background: "#fff" }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "#e8dfd4" }}
        >
          <h2
            className="text-lg font-semibold flex items-center gap-2"
            style={{ color: "#5c4f42" }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#8b6914"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            수정 요청
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-stone-100"
            title="닫기"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9a8d7f"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="px-6 py-4 space-y-4">
          {/* 성공 메시지 */}
          {success && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
              style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              수정 요청이 접수되었습니다.
            </div>
          )}

          {/* 에러 메시지 */}
          {error && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
              style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {!success && (
            <>
              {/* 원본 내용 (읽기 전용) */}
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "#5c4f42" }}
                >
                  원본 내용
                </label>
                <div
                  className="max-h-32 overflow-y-auto rounded-lg px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                  style={{
                    background: "#faf8f5",
                    border: "1px solid #e8dfd4",
                    color: "#6b5a3e",
                  }}
                >
                  {originalContent}
                </div>
              </div>

              {/* 수정 내용 (필수) */}
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "#5c4f42" }}
                >
                  수정 내용 <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <textarea
                  ref={correctionRef}
                  value={correctionText}
                  onChange={(e) => setCorrectionText(e.target.value)}
                  placeholder="올바른 정보를 입력해주세요"
                  rows={4}
                  className="w-full rounded-lg px-3 py-2.5 text-sm leading-relaxed outline-none resize-none transition-colors"
                  style={{
                    background: "#fff",
                    border: "1px solid #d4c5b0",
                    color: "#2d2520",
                  }}
                  onFocus={(e) =>
                    (e.target.style.borderColor = "#8b6914")
                  }
                  onBlur={(e) =>
                    (e.target.style.borderColor = "#d4c5b0")
                  }
                  disabled={isSubmitting}
                />
              </div>

              {/* 수정 사유 (선택) */}
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "#5c4f42" }}
                >
                  수정 사유{" "}
                  <span className="font-normal" style={{ color: "#9a8d7f" }}>
                    (선택)
                  </span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="수정 사유를 입력해주세요"
                  rows={2}
                  className="w-full rounded-lg px-3 py-2.5 text-sm leading-relaxed outline-none resize-none transition-colors"
                  style={{
                    background: "#fff",
                    border: "1px solid #d4c5b0",
                    color: "#2d2520",
                  }}
                  onFocus={(e) =>
                    (e.target.style.borderColor = "#8b6914")
                  }
                  onBlur={(e) =>
                    (e.target.style.borderColor = "#d4c5b0")
                  }
                  disabled={isSubmitting}
                />
              </div>
            </>
          )}
        </div>

        {/* 푸터 */}
        {!success && (
          <div
            className="flex justify-end gap-3 px-6 py-4 border-t"
            style={{ borderColor: "#e8dfd4" }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-stone-100 disabled:opacity-50"
              style={{ color: "#5c4f42" }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !correctionText.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background:
                  isSubmitting || !correctionText.trim()
                    ? "#c4b5a0"
                    : "#8b6914",
              }}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <circle cx="12" cy="12" r="10" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75" />
                  </svg>
                  제출 중...
                </span>
              ) : (
                "제출"
              )}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
