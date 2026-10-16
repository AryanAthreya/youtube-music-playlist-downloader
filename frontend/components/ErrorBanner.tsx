"use client";

import { useTheme } from "../context/ThemeContext";

interface ErrorBannerProps {
  id: string;
  message: string;
  code: string;
  onDismiss: () => void;
}

const ERROR_ICONS: Record<string, string> = {
  INVALID_URL: "🚫",
  UNSUPPORTED_URL: "🔗",
  VIDEO_UNAVAILABLE: "🔒",
  REGION_RESTRICTED: "🌍",
  FORMAT_UNAVAILABLE: "📉",
  EXTRACTION_ERROR: "⚙️",
  MERGE_ERROR: "🔧",
  DISK_SPACE_ERROR: "💾",
  NETWORK_ERROR: "🌐",
  JOB_NOT_FOUND: "🔍",
  DUPLICATE_JOB: "📋",
  UNKNOWN_ERROR: "❌",
  API_ERROR: "❌",
};

export function ErrorBanner({ id, message, code, onDismiss }: ErrorBannerProps) {
  const { config, theme } = useTheme();
  const isLight = config.isLight || theme === "soft-light";
  const icon = ERROR_ICONS[code] ?? "❌";

  return (
    <div
      id={id}
      role="alert"
      aria-live="assertive"
      className={`flex items-start gap-3.5 rounded-[22px] border p-4 mb-4 transition-all duration-200 animate-in fade-in slide-in-from-top-2 ${
        isLight
          ? "bg-red-500/10 border-red-500/20 text-red-950 shadow-sm"
          : "bg-red-950/40 border-red-500/30 text-red-200 shadow-md"
      }`}
    >
      <span className="text-xl shrink-0 mt-0.5" aria-hidden>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-xs sm:text-sm leading-snug">{message}</p>
        <p className="text-[10px] opacity-70 mt-0.5 font-mono">{code}</p>
      </div>
      <button
        id={`${id}-dismiss`}
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="p-1 rounded-lg opacity-60 hover:opacity-100 transition-opacity"
      >
        ✕
      </button>
    </div>
  );
}
