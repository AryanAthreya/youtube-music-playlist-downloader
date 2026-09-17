"use client";

import React from "react";
import { useTheme, THEMES } from "../context/ThemeContext";

interface ThemeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ThemeSelectorModal({ isOpen, onClose }: ThemeSelectorModalProps) {
  const { theme, setTheme, config } = useTheme();

  if (!isOpen) return null;

  const themeList = Object.values(THEMES);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl bg-zinc-950 border border-white/15 p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-zinc-300">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Settings & Appearance</h3>
              <p className="text-[11px] text-zinc-400">Themes, presets & app information</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Section 1: Themes */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Appearance Preset</span>
          <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
            {themeList.map((t) => {
              const isSelected = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left group ${
                    isSelected
                      ? "bg-white/10 border-white/30 shadow-lg shadow-black/40 ring-1 ring-white/30"
                      : "bg-zinc-900/50 border-white/5 hover:bg-zinc-900 hover:border-white/15"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Swatch with clean geometric inner dot/square */}
                    <div
                      className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${t.gradient} shadow-md flex items-center justify-center border border-white/20 shrink-0 group-hover:scale-105 transition-transform`}
                    >
                      <span className="w-3 h-3 rounded-md bg-white/95 shadow-sm" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-zinc-100">
                          {t.name}
                        </h4>
                        {t.isLight && (
                          <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Light
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-400">{t.description}</p>
                    </div>
                  </div>

                  {isSelected ? (
                    <span
                      className="w-5 h-5 rounded-full text-zinc-950 flex items-center justify-center text-xs font-black shadow"
                      style={{ backgroundColor: config.primaryHex }}
                    >
                      ✓
                    </span>
                  ) : (
                    <span className="w-4 h-4 rounded-full border border-white/20" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: All Footer & About Info */}
        <div className="pt-3 border-t border-white/10 space-y-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">About & Footer Info</span>

          <div className="p-3 rounded-2xl bg-zinc-900/60 border border-white/5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Created by</span>
              <span className="font-semibold text-white flex items-center gap-1.5">
                aryanathreya
                <span className="text-red-500 animate-pulse">❤️</span>
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Engine</span>
              <span className="font-mono text-[11px] text-zinc-300">yt-dlp & FFmpeg Local Engine</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <a
                href="https://github.com/aryanathreya"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white transition-all text-xs font-medium"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>GitHub</span>
              </a>

              <a
                href="https://www.linkedin.com/in/aryanathreya"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white transition-all text-xs font-medium"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
                <span>LinkedIn</span>
              </a>
            </div>

            <div className="text-[10px] text-zinc-500 text-center pt-1">
              © 2026 aryanathreya. All rights reserved.
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-zinc-200 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
