"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeColor =
  | "soft-light"
  | "soft-dark"
  | "lime"
  | "cream"
  | "purple"
  | "red"
  | "cyan"
  | "emerald"
  | "amber";

export interface ThemeConfig {
  id: ThemeColor;
  name: string;
  description: string;
  isLight: boolean;
  primaryHex: string;
  secondaryHex: string;
  gradient: string;
  glow: string;
  borderActive: string;
  badge: string;
  textAccent: string;
  pageBg: string;
  pageBgStyle?: string;
  textColor: string;
  subtextColor: string;
  cardBg: string;
  navBg: string;
  dotColor: string;
}

export const THEMES: Record<ThemeColor, ThemeConfig> = {
  "soft-light": {
    id: "soft-light",
    name: "Soft Light",
    description: "Soft Neumorphic Light & Deep Navy Accent",
    isLight: true,
    primaryHex: "#2B4C8F",
    secondaryHex: "#1E3A70",
    gradient: "from-[#2B4C8F] to-[#1E3A70]",
    glow: "rgba(43, 76, 143, 0.20)",
    borderActive: "border-[#2B4C8F]",
    badge: "bg-[#E6ECF8] text-[#2B4C8F] border-[#2B4C8F]/20 font-semibold",
    textAccent: "text-[#2B4C8F]",
    pageBg: "bg-[#F3F5FA]",
    pageBgStyle: "#F3F5FA",
    textColor: "text-[#1A1F2C]",
    subtextColor: "text-[#9AA3B5]",
    cardBg: "bg-white border-[#E2E8F0] shadow-soft text-[#1A1F2C]",
    navBg: "bg-white/95 border-[#E2E8F0] text-[#1A1F2C]",
    dotColor: "#2B4C8F",
  },
  "soft-dark": {
    id: "soft-dark",
    name: "Soft Dark",
    description: "Calm Obsidian Dark & Soft Blue Accent",
    isLight: false,
    primaryHex: "#6C95FF",
    secondaryHex: "#4C75E6",
    gradient: "from-[#6C95FF] to-[#4C75E6]",
    glow: "rgba(108, 149, 255, 0.25)",
    borderActive: "border-[#6C95FF]/60",
    badge: "bg-[#202D4E] text-[#6C95FF] border-[#6C95FF]/30 font-semibold",
    textAccent: "text-[#6C95FF]",
    pageBg: "bg-[#0D1220]",
    pageBgStyle: "#0D1220",
    textColor: "text-[#EAF0FF]",
    subtextColor: "text-[#7F8AA6]",
    cardBg: "bg-[#161C2E] border-white/10 shadow-soft text-[#EAF0FF]",
    navBg: "bg-[#161C2E]/95 border-white/10 text-[#EAF0FF]",
    dotColor: "#6C95FF",
  },
  lime: {
    id: "lime",
    name: "Lemon Green",
    description: "Vibrant Citrus Lime & Forest",
    isLight: false,
    primaryHex: "#84cc16",
    secondaryHex: "#65a30d",
    gradient: "from-lime-400 via-lime-500 to-emerald-500",
    glow: "rgba(132, 204, 22, 0.45)",
    borderActive: "border-lime-500/50",
    badge: "bg-lime-500/20 text-lime-300 border-lime-500/30",
    textAccent: "text-lime-400",
    pageBg: "bg-[#0b1407]",
    pageBgStyle: "radial-gradient(ellipse 80% 60% at 50% -10%, #1a2f0e 0%, #0c1707 55%, #070e04 100%)",
    textColor: "text-lime-50",
    subtextColor: "text-lime-200/60",
    cardBg: "bg-[#11200b]/80 border-lime-500/20",
    navBg: "bg-[#0d1a09]/90 border-lime-500/25",
    dotColor: "#84cc16",
  },
  cream: {
    id: "cream",
    name: "Soft Cream White",
    description: "Warm Cream & Latte Light Mode",
    isLight: true,
    primaryHex: "#b45309",
    secondaryHex: "#d97706",
    gradient: "from-amber-600 via-orange-500 to-amber-700",
    glow: "rgba(217, 119, 6, 0.25)",
    borderActive: "border-amber-600/60",
    badge: "bg-amber-500/15 text-amber-900 border-amber-600/25 font-semibold",
    textAccent: "text-amber-800",
    pageBg: "bg-[#faf7f2]",
    pageBgStyle: "radial-gradient(ellipse 85% 65% at 50% -10%, #fffbf2 0%, #f7f1e5 50%, #eee5d3 100%)",
    textColor: "text-stone-900",
    subtextColor: "text-stone-500",
    cardBg: "bg-white/85 border-stone-200/90 shadow-sm text-stone-900",
    navBg: "bg-stone-100/90 border-stone-300/80 text-stone-800",
    dotColor: "#d97706",
  },
  purple: {
    id: "purple",
    name: "Electric Violet",
    description: "Deep Obsidian & Royal Violet",
    isLight: false,
    primaryHex: "#9333ea",
    secondaryHex: "#6366f1",
    gradient: "from-purple-600 via-violet-600 to-indigo-600",
    glow: "rgba(147, 51, 234, 0.4)",
    borderActive: "border-purple-500/50",
    badge: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    textAccent: "text-purple-400",
    pageBg: "bg-[#0d071a]",
    pageBgStyle: "radial-gradient(ellipse 80% 60% at 50% -10%, #200e3f 0%, #120925 55%, #080412 100%)",
    textColor: "text-purple-50",
    subtextColor: "text-purple-200/60",
    cardBg: "bg-[#140b2a]/80 border-purple-500/20",
    navBg: "bg-[#100922]/90 border-purple-500/25",
    dotColor: "#9333ea",
  },
  red: {
    id: "red",
    name: "Neon Crimson",
    description: "Midnight Black & Neon Rose",
    isLight: false,
    primaryHex: "#dc2626",
    secondaryHex: "#f43f5e",
    gradient: "from-red-600 via-rose-600 to-orange-500",
    glow: "rgba(220, 38, 38, 0.4)",
    borderActive: "border-red-500/50",
    badge: "bg-red-500/20 text-red-300 border-red-500/30",
    textAccent: "text-red-400",
    pageBg: "bg-[#160608]",
    pageBgStyle: "radial-gradient(ellipse 80% 60% at 50% -10%, #360c12 0%, #1d070a 55%, #0d0305 100%)",
    textColor: "text-rose-50",
    subtextColor: "text-rose-200/60",
    cardBg: "bg-[#21090d]/80 border-red-500/20",
    navBg: "bg-[#1a070a]/90 border-red-500/25",
    dotColor: "#dc2626",
  },
  cyan: {
    id: "cyan",
    name: "Cyber Cyan",
    description: "Deep Ocean & Neon Cyan",
    isLight: false,
    primaryHex: "#06b6d4",
    secondaryHex: "#3b82f6",
    gradient: "from-cyan-500 via-blue-600 to-indigo-600",
    glow: "rgba(6, 182, 212, 0.4)",
    borderActive: "border-cyan-500/50",
    badge: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    textAccent: "text-cyan-400",
    pageBg: "bg-[#04111a]",
    pageBgStyle: "radial-gradient(ellipse 80% 60% at 50% -10%, #0b2c41 0%, #061925 55%, #030d14 100%)",
    textColor: "text-cyan-50",
    subtextColor: "text-cyan-200/60",
    cardBg: "bg-[#061a28]/80 border-cyan-500/20",
    navBg: "bg-[#051420]/90 border-cyan-500/25",
    dotColor: "#06b6d4",
  },
  emerald: {
    id: "emerald",
    name: "Emerald Mint",
    description: "Deep Jade & Fresh Mint",
    isLight: false,
    primaryHex: "#10b981",
    secondaryHex: "#0d9488",
    gradient: "from-emerald-500 via-teal-600 to-cyan-600",
    glow: "rgba(16, 185, 129, 0.4)",
    borderActive: "border-emerald-500/50",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    textAccent: "text-emerald-400",
    pageBg: "bg-[#03140e]",
    pageBgStyle: "radial-gradient(ellipse 80% 60% at 50% -10%, #0b3425 0%, #051d14 55%, #020d09 100%)",
    textColor: "text-emerald-50",
    subtextColor: "text-emerald-200/60",
    cardBg: "bg-[#062217]/80 border-emerald-500/20",
    navBg: "bg-[#051b12]/90 border-emerald-500/25",
    dotColor: "#10b981",
  },
  amber: {
    id: "amber",
    name: "Solar Amber",
    description: "Warm Espresso & Sunset Gold",
    isLight: false,
    primaryHex: "#f59e0b",
    secondaryHex: "#ea580c",
    gradient: "from-amber-500 via-orange-600 to-rose-600",
    glow: "rgba(245, 158, 11, 0.4)",
    borderActive: "border-amber-500/50",
    badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    textAccent: "text-amber-400",
    pageBg: "bg-[#170e05]",
    pageBgStyle: "radial-gradient(ellipse 80% 60% at 50% -10%, #361f09 0%, #201306 55%, #0e0802 100%)",
    textColor: "text-amber-50",
    subtextColor: "text-amber-200/60",
    cardBg: "bg-[#241506]/80 border-amber-500/20",
    navBg: "bg-[#1c1005]/90 border-amber-500/25",
    dotColor: "#f59e0b",
  },
};

interface ThemeContextType {
  theme: ThemeColor;
  config: ThemeConfig;
  setTheme: (theme: ThemeColor) => void;
  isFollowSystem: boolean;
  setIsFollowSystem: (follow: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "soft-light",
  config: THEMES["soft-light"],
  setTheme: () => {},
  isFollowSystem: false,
  setIsFollowSystem: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeColor>("soft-light");
  const [isFollowSystem, setIsFollowSystemState] = useState<boolean>(false);

  useEffect(() => {
    try {
      const followSys = localStorage.getItem("ytdl_theme_system") === "true";
      setIsFollowSystemState(followSys);

      if (followSys) {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        setThemeState(prefersDark ? "soft-dark" : "soft-light");
      } else {
        const saved = localStorage.getItem("ytdl_theme_preset") as ThemeColor;
        if (saved && THEMES[saved]) {
          setThemeState(saved);
        } else {
          // Default for new users
          setThemeState("soft-light");
        }
      }
    } catch {}
  }, []);

  // Listen for system color scheme changes if follow-system is enabled
  useEffect(() => {
    if (!isFollowSystem) return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setThemeState(e.matches ? "soft-dark" : "soft-light");
    };

    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [isFollowSystem]);

  useEffect(() => {
    const config = THEMES[theme] || THEMES["soft-light"];
    const root = document.documentElement;

    root.style.setProperty("--theme-primary", config.primaryHex);
    root.style.setProperty("--theme-glow", config.glow);
    root.style.setProperty("--accent", config.primaryHex);
    root.style.setProperty("--accent-glow", config.glow);

    // Apply tokens matching current theme
    if (theme === "soft-light") {
      root.classList.add("theme-soft-light", "theme-light");
      root.classList.remove("theme-soft-dark", "theme-dark");
      root.style.setProperty("--background", "#F3F5FA");
      root.style.setProperty("--foreground", "#1A1F2C");
    } else if (theme === "soft-dark") {
      root.classList.add("theme-soft-dark", "theme-dark");
      root.classList.remove("theme-soft-light", "theme-light");
      root.style.setProperty("--background", "#0D1220");
      root.style.setProperty("--foreground", "#EAF0FF");
    } else if (config.isLight) {
      root.style.setProperty("--background", "#f7f1e5");
      root.style.setProperty("--foreground", "#1c1917");
      root.style.setProperty("--card-bg", "rgba(255, 255, 255, 0.9)");
      root.style.setProperty("--card-border", "rgba(180, 83, 9, 0.15)");
      root.classList.add("theme-light");
      root.classList.remove("theme-dark", "theme-soft-light", "theme-soft-dark");
    } else {
      root.style.setProperty("--background", config.pageBg);
      root.style.setProperty("--foreground", "#f8fafc");
      root.style.setProperty("--card-bg", "rgba(15, 23, 42, 0.65)");
      root.style.setProperty("--card-border", "rgba(255, 255, 255, 0.08)");
      root.classList.add("theme-dark");
      root.classList.remove("theme-light", "theme-soft-light", "theme-soft-dark");
    }
  }, [theme]);

  const setTheme = (newTheme: ThemeColor) => {
    setThemeState(newTheme);
    setIsFollowSystemState(false);
    try {
      localStorage.setItem("ytdl_theme_preset", newTheme);
      localStorage.setItem("ytdl_theme_system", "false");
    } catch {}
  };

  const setIsFollowSystem = (follow: boolean) => {
    setIsFollowSystemState(follow);
    try {
      localStorage.setItem("ytdl_theme_system", follow ? "true" : "false");
      if (follow) {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        setThemeState(prefersDark ? "soft-dark" : "soft-light");
      }
    } catch {}
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        config: THEMES[theme] || THEMES["soft-light"],
        setTheme,
        isFollowSystem,
        setIsFollowSystem,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
