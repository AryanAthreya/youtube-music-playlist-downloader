"use client";

import React from "react";
import { useTheme, THEMES, ThemeColor } from "../context/ThemeContext";

interface ThemeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ThemeSelectorModal({ isOpen, onClose }: ThemeSelectorModalProps) {
  const { theme, setTheme } = useTheme();

  if (!isOpen) return null;

  const themeList = Object.values(THEMES);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-sm rounded-3xl bg-zinc-950 border border-white/15 p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-base">
              🎨
            </span>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Theme Equalizer</h3>
              <p className="text-[11px] text-zinc-400">Choose your favorite accent palette</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2.5">
          {themeList.map((t) => {
            const isSelected = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTheme(t.id);
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all text-left group ${
                  isSelected
                    ? "bg-white/10 border-white/30 shadow-lg shadow-black/40 ring-1 ring-white/30"
                    : "bg-zinc-900/50 border-white/5 hover:bg-zinc-900 hover:border-white/15"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Swatch Circle */}
                  <div
                    className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${t.gradient} shadow-md flex items-center justify-center text-sm border border-white/20 shrink-0 group-hover:scale-105 transition-transform`}
                  >
                    <span>{t.emoji}</span>
                  </div>

                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-zinc-100">
                      {t.name}
                    </h4>
                    <p className="text-[10px] text-zinc-400 font-mono">Accent: {t.primaryHex}</p>
                  </div>
                </div>

                {isSelected ? (
                  <span className="w-5 h-5 rounded-full bg-white text-zinc-950 flex items-center justify-center text-xs font-black shadow">
                    ✓
                  </span>
                ) : (
                  <span className="w-4 h-4 rounded-full border border-white/20" />
                )}
              </button>
            );
          })}
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
