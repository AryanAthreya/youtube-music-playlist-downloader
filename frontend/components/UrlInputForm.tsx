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
  const { config } = useTheme();
  const [inputVal, setInputVal] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isUrl = YOUTUBE_URL_REGEX.test(inputVal.trim());

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputVal.trim();
      if (!trimmed) {
        setClientError("Please enter a YouTube URL or search query.");
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
      className="space-y-3"
      aria-label="YouTube URL or search form"
    >
      <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
        {/* Input Wrapper */}
        <div className="relative flex-1">
          {/* Icon */}
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: config.primaryHex }}>
            {isUrl ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </div>

          <input
            ref={inputRef}
            id={`${id}-input`}
            type="text"
            value={inputVal}
            onChange={(e) => {
              setInputVal(e.target.value);
              if (clientError) setClientError(null);
            }}
            placeholder="Paste YouTube link or type keywords to search..."
            disabled={loading}
            className={`w-full pl-11 pr-16 sm:pr-20 py-3.5 sm:py-4 rounded-2xl text-white placeholder-gray-500 text-sm sm:text-base
              bg-slate-900/80 glass-card transition-all duration-200 outline-none
              ${
                clientError
                  ? "border-red-500/80 focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
                  : "border-white/10"
              }
              ${loading ? "opacity-60 cursor-not-allowed" : ""}
            `}
            style={
              !clientError
                ? {
                    // Dynamic focus ring via box-shadow trick (can't use CSS vars in Tailwind focus:)
                    borderColor: undefined,
                  }
                : undefined
            }
            onFocus={(e) => {
              if (!clientError) {
                e.currentTarget.style.borderColor = `${config.primaryHex}99`;
                e.currentTarget.style.boxShadow = `0 0 0 3px ${config.primaryHex}25`;
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "";
              e.currentTarget.style.boxShadow = "";
            }}
            aria-invalid={!!clientError}
            aria-describedby={clientError ? `${id}-error` : undefined}
            autoComplete="off"
            spellCheck={false}
          />

          {/* Quick Clear or Paste button */}
          {!loading && inputVal ? (
            <button
              type="button"
              onClick={() => {
                setInputVal("");
                setClientError(null);
                inputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors text-xs"
              title="Clear input"
            >
              ✕
            </button>
          ) : !loading ? (
            <button
              type="button"
              onClick={handlePaste}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-all"
              title="Paste from clipboard"
            >
              Paste
            </button>
          ) : null}
        </div>

        {/* Submit Button — fully themed */}
        <button
          type="submit"
          id={`${id}-submit`}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-6 py-3.5 sm:py-4 rounded-2xl font-semibold text-sm sm:text-base shrink-0 transition-all duration-200 active:scale-95"
          style={
            loading
              ? { background: "rgba(30, 41, 59, 0.8)", color: "#9ca3af", border: "1px solid rgba(255,255,255,0.05)" }
              : {
                  background: `linear-gradient(135deg, ${config.primaryHex} 0%, ${config.secondaryHex} 100%)`,
                  color: "#fff",
                  boxShadow: `0 8px 20px -4px ${config.glow}`,
                }
          }
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span>{isUrl ? "Analyzing…" : "Searching…"}</span>
            </>
          ) : isUrl ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Fetch Formats</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Search YouTube</span>
            </>
          )}
        </button>
      </div>

      {/* Client error */}
      {clientError && (
        <p id={`${id}-error`} className="text-red-400 text-xs sm:text-sm pl-1 flex items-center gap-1.5" role="alert">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{clientError}</span>
        </p>
      )}

      {/* Loading indicator */}
      {loading && (
        <p className="text-xs sm:text-sm pl-1 animate-pulse flex items-center gap-2" style={{ color: config.primaryHex }}>
          <span
            className="inline-block w-2 h-2 rounded-full animate-ping"
            style={{ backgroundColor: config.primaryHex }}
          />
          <span>{isUrl ? "Analyzing formats and audio qualities…" : "Searching YouTube for top 15 matches…"}</span>
        </p>
      )}
    </form>
  );
}
