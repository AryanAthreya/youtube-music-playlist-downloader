"use client";

import { useState, useRef, useCallback } from "react";
import { useTheme } from "../context/ThemeContext";

interface UrlInputFormProps {
  id: string;
  onSubmit: (input: string, isSearch: boolean) => void;
  loading: boolean;
}

const YOUTUBE_URL_REGEX =
  /^https?:\/\/(www\.|music\.)?youtube\.com\/(watch\?.*v=|playlist\?.*list=|shorts\/|embed\/)|^https?:\/\/youtu\.be\//;

export function UrlInputForm({ id, onSubmit, loading }: UrlInputFormProps) {
  const { config, theme } = useTheme();
  const isLight = config.isLight || theme === "soft-light";
  const [inputVal, setInputVal] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isUrl = YOUTUBE_URL_REGEX.test(inputVal.trim());

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputVal.trim();
      if (!trimmed) {
        setClientError("Please enter a YouTube link or track title.");
        inputRef.current?.focus();
        return;
      }
      setClientError(null);
      const isSearchMode = !YOUTUBE_URL_REGEX.test(trimmed);
      onSubmit(trimmed, isSearchMode);
    },
    [inputVal, onSubmit],
  );

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputVal(text.trim());
        setClientError(null);
      }
    } catch {
      // Clipboard API unavailable
    }
  }, []);

  return (
    <form
      id={id}
      onSubmit={handleSubmit}
      className="space-y-2.5 w-full"
      aria-label="Search and download music form"
    >
      <div className="relative flex items-center w-full">
        {/* Soft Neumorphic Pill Input Container */}
        <div
          className={`relative flex items-center w-full rounded-full transition-all duration-200 border ${
            clientError
              ? "border-red-400 ring-2 ring-red-400/20"
              : isLight
              ? "bg-[#F8FAFC] border-[#E2E8F0] shadow-[inset_0_2px_5px_rgba(35,55,110,0.06)] focus-within:border-[#2B4C8F] focus-within:ring-2 focus-within:ring-[#2B4C8F]/15"
              : "bg-[#161C2E] border-white/10 shadow-[inset_0_2px_5px_rgba(0,0,0,0.35)] focus-within:border-[#6C95FF] focus-within:ring-2 focus-within:ring-[#6C95FF]/20"
          }`}
        >
          {/* Leading Search / Music Icon */}
          <div className="pl-4 pr-1 text-[#9AA3B5] shrink-0 pointer-events-none">
            {isUrl ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-red-500">
                <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
              </svg>
            )}
          </div>

          {/* Text Input */}
          <input
            ref={inputRef}
            id={`${id}-input`}
            type="text"
            value={inputVal}
            onChange={(e) => {
              setInputVal(e.target.value);
              if (clientError) setClientError(null);
            }}
            placeholder="Search music, album or paste link..."
            disabled={loading}
            className={`w-full py-3.5 pl-2 pr-24 rounded-full text-sm sm:text-base outline-none bg-transparent transition-colors font-medium ${
              isLight ? "text-[#1A1F2C] placeholder-[#9AA3B5]" : "text-[#EAF0FF] placeholder-[#7F8AA6]"
            } ${loading ? "opacity-60 cursor-not-allowed" : ""}`}
            autoComplete="off"
            spellCheck={false}
          />

          {/* Action buttons inside pill on the right */}
          <div className="absolute right-1.5 flex items-center gap-1">
            {!loading && inputVal ? (
              <button
                type="button"
                onClick={() => {
                  setInputVal("");
                  setClientError(null);
                  inputRef.current?.focus();
                }}
                className={`p-1.5 rounded-full transition-colors ${
                  isLight ? "text-slate-400 hover:text-slate-700 hover:bg-slate-200" : "text-gray-400 hover:text-white hover:bg-white/10"
                }`}
                title="Clear input"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ) : !loading ? (
              <button
                type="button"
                onClick={handlePaste}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all active:scale-95 ${
                  isLight
                    ? "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 shadow-sm"
                    : "bg-[#1E263D] text-slate-300 border-white/10 hover:text-white hover:bg-[#25304C]"
                }`}
                title="Paste from clipboard"
              >
                Paste
              </button>
            ) : null}

            {/* Circular Submit Button inside pill */}
            <button
              type="submit"
              id={`${id}-submit`}
              disabled={loading}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white transition-all shadow-md active:scale-90 disabled:opacity-50 shrink-0"
              style={{
                backgroundColor: config.primaryHex,
                boxShadow: `0 4px 12px ${config.glow}`,
              }}
              title={isUrl ? "Analyze Link" : "Search YouTube"}
              aria-label={isUrl ? "Analyze YouTube Link" : "Search YouTube"}
            >
              {loading ? (
                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : isUrl ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <circle cx="11" cy="11" r="7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error feedback */}
      {clientError && (
        <p id={`${id}-error`} className="text-red-500 dark:text-red-400 text-xs pl-3 flex items-center gap-1.5 animate-in fade-in duration-200" role="alert">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
          </svg>
          <span>{clientError}</span>
        </p>
      )}

      {/* Loading status */}
      {loading && (
        <div className="flex items-center gap-2 pl-3 text-xs animate-pulse" style={{ color: config.primaryHex }}>
          <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: config.primaryHex }} />
          <span>{isUrl ? "Analyzing YouTube formats & audio qualities…" : "Searching YouTube for top matches…"}</span>
        </div>
      )}
    </form>
  );
}
