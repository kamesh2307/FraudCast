"use client";
// Light/dark switch. Remembers the choice in this browser (localStorage "fc-theme"). Default: dark.

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const t = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(t);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("fc-theme", next); } catch { /* private mode: still switches for this visit */ }
  }

  const dark = theme !== "light";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Dark mode on. Switch to light mode" : "Light mode on. Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
      className="flex items-center gap-1.5 rounded-full bg-black/[0.05] px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <span aria-hidden="true" className={`text-[13px] ${dark ? "opacity-40" : "opacity-100"}`}>☀</span>
      <span aria-hidden="true" className={`relative h-[18px] w-[32px] rounded-full transition-colors ${dark ? "bg-gradient-to-r from-[#f0b8d8] via-[#c4b5fb] to-[#8bd9f0]" : "bg-slate-300"}`}>
        <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-[#ffffff] shadow transition-all ${dark ? "left-[16px]" : "left-[2px]"}`} />
      </span>
      <span aria-hidden="true" className={`text-[12px] ${dark ? "opacity-100" : "opacity-40"}`}>☾</span>
    </button>
  );
}
