"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeColor = "purple" | "red" | "cyan" | "emerald" | "amber";

export interface ThemeConfig {
  id: ThemeColor;
  name: string;
  emoji: string;
  primary: string;
  primaryHex: string;
  gradient: string;
  glow: string;
  borderActive: string;
  badge: string;
  textAccent: string;
}

export const THEMES: Record<ThemeColor, ThemeConfig> = {
  purple: {
    id: "purple",
    name: "Electric Violet",
    emoji: "💜",
    primary: "purple-600",
    primaryHex: "#9333ea",
    gradient: "from-purple-600 via-violet-600 to-indigo-600",
    glow: "rgba(147, 51, 234, 0.4)",
    borderActive: "border-purple-500/50",
    badge: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    textAccent: "text-purple-400",
  },
  red: {
    id: "red",
    name: "Neon Crimson",
    emoji: "❤️",
    primary: "red-600",
    primaryHex: "#dc2626",
    gradient: "from-red-600 via-rose-600 to-orange-500",
    glow: "rgba(220, 38, 38, 0.4)",
    borderActive: "border-red-500/50",
    badge: "bg-red-500/20 text-red-300 border-red-500/30",
    textAccent: "text-red-400",
  },
  cyan: {
    id: "cyan",
    name: "Cyber Cyan",
    emoji: "💙",
    primary: "cyan-500",
    primaryHex: "#06b6d4",
    gradient: "from-cyan-500 via-blue-600 to-indigo-600",
    glow: "rgba(6, 182, 212, 0.4)",
    borderActive: "border-cyan-500/50",
    badge: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    textAccent: "text-cyan-400",
  },
  emerald: {
    id: "emerald",
    name: "Emerald Mint",
    emoji: "💚",
    primary: "emerald-500",
    primaryHex: "#10b981",
    gradient: "from-emerald-500 via-teal-600 to-cyan-600",
    glow: "rgba(16, 185, 129, 0.4)",
    borderActive: "border-emerald-500/50",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    textAccent: "text-emerald-400",
  },
  amber: {
    id: "amber",
    name: "Solar Amber",
    emoji: "🧡",
    primary: "amber-500",
    primaryHex: "#f59e0b",
    gradient: "from-amber-500 via-orange-600 to-rose-600",
    glow: "rgba(245, 158, 11, 0.4)",
    borderActive: "border-amber-500/50",
    badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    textAccent: "text-amber-400",
  },
};

interface ThemeContextType {
  theme: ThemeColor;
  config: ThemeConfig;
  setTheme: (theme: ThemeColor) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "purple",
  config: THEMES.purple,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeColor>("purple");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ytdl_theme_preset") as ThemeColor;
      if (saved && THEMES[saved]) {
        setThemeState(saved);
      }
    } catch {}
  }, []);

  const setTheme = (newTheme: ThemeColor) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem("ytdl_theme_preset", newTheme);
    } catch {}
  };

  return (
    <ThemeContext.Provider value={{ theme, config: THEMES[theme], setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
