"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeColor = "lime" | "cream" | "purple" | "red" | "cyan" | "emerald" | "amber";

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
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "lime",
  config: THEMES.lime,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeColor>("lime");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ytdl_theme_preset") as ThemeColor;
      if (saved && THEMES[saved]) {
        setThemeState(saved);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const config = THEMES[theme];
    if (!config) return;
    const root = document.documentElement;
    root.style.setProperty("--theme-primary", config.primaryHex);
    root.style.setProperty("--theme-glow", config.glow);

    if (config.isLight) {
      root.style.setProperty("--background", "#f7f1e5");
      root.style.setProperty("--foreground", "#1c1917");
      root.style.setProperty("--card-bg", "rgba(255, 255, 255, 0.9)");
      root.style.setProperty("--card-border", "rgba(180, 83, 9, 0.15)");
      root.classList.add("theme-light");
      root.classList.remove("theme-dark");
    } else {
      root.style.setProperty("--background", config.pageBg);
      root.style.setProperty("--foreground", "#f8fafc");
      root.style.setProperty("--card-bg", "rgba(15, 23, 42, 0.65)");
      root.style.setProperty("--card-border", "rgba(255, 255, 255, 0.08)");
      root.classList.add("theme-dark");
      root.classList.remove("theme-light");
    }
  }, [theme]);

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
