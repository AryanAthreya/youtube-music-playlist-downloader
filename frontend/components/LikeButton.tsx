"use client";

import React, { useState } from "react";
import type { FileInfo } from "@/lib/types";
import { useLiked } from "@/lib/player/useLiked";
import { useTheme } from "@/context/ThemeContext";

export interface LikeButtonProps {
  track?: FileInfo | null;
  trackId?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  showTooltip?: boolean;
  onToggled?: (liked: boolean) => void;
}

export function LikeButton({
  track,
  trackId,
  size = "md",
  className = "",
  showTooltip = true,
  onToggled,
}: LikeButtonProps) {
  const { config } = useTheme();
  const { isLiked, toggleLike } = useLiked(track || trackId);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);

    const nextLiked = await toggleLike(track || undefined);
    if (onToggled) {
      onToggled(nextLiked);
    }
  };

  const sizeClasses = {
    sm: "w-7 h-7 p-1 text-xs",
    md: "w-9 h-9 p-2 text-sm",
    lg: "w-11 h-11 p-2.5 text-base",
  }[size];

  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  }[size];

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isLiked ? "Remove from Liked Songs" : "Save to Liked Songs"}
      aria-pressed={isLiked}
      title={showTooltip ? (isLiked ? "Remove from Liked Songs (L)" : "Save to Liked Songs (L)") : undefined}
      className={`relative inline-flex items-center justify-center rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${sizeClasses} ${
        isLiked
          ? "hover:opacity-90 active:scale-95"
          : "text-zinc-400 hover:text-white hover:bg-white/10 active:scale-95"
      } ${className}`}
      style={{
        color: isLiked ? config.primaryHex : undefined,
      }}
    >
      <svg
        className={`${iconSizes} transition-transform duration-200 ${
          isAnimating ? "scale-125" : "scale-100"
        }`}
        viewBox="0 0 24 24"
        fill={isLiked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={isLiked ? 0 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
