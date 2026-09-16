"use client";

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

const ERROR_COLORS: Record<string, string> = {
  INVALID_URL: "border-orange-500/40 bg-orange-500/10",
  UNSUPPORTED_URL: "border-orange-500/40 bg-orange-500/10",
  VIDEO_UNAVAILABLE: "border-red-500/40 bg-red-500/10",
  REGION_RESTRICTED: "border-yellow-500/40 bg-yellow-500/10",
  FORMAT_UNAVAILABLE: "border-yellow-500/40 bg-yellow-500/10",
  EXTRACTION_ERROR: "border-red-500/40 bg-red-500/10",
  MERGE_ERROR: "border-red-500/40 bg-red-500/10",
  DISK_SPACE_ERROR: "border-purple-500/40 bg-purple-500/10",
  NETWORK_ERROR: "border-blue-500/40 bg-blue-500/10",
  DUPLICATE_JOB: "border-blue-500/40 bg-blue-500/10",
};

export function ErrorBanner({ id, message, code, onDismiss }: ErrorBannerProps) {
  const icon = ERROR_ICONS[code] ?? "❌";
  const colorClass = ERROR_COLORS[code] ?? "border-red-500/40 bg-red-500/10";

  return (
    <div
      id={id}
      role="alert"
      aria-live="assertive"
      className={`flex items-start gap-3 rounded-2xl border p-4 mb-4 ${colorClass}`}
    >
      <span className="text-2xl shrink-0 mt-0.5" aria-hidden>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium leading-snug">{message}</p>
        <p className="text-gray-400 text-xs mt-0.5 font-mono">{code}</p>
      </div>
      <button
        id={`${id}-dismiss`}
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="shrink-0 text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
