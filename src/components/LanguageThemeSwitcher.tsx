"use client";

import { useTheme } from "next-themes";
import { useI18n } from "@/lib/i18n";

export function LanguageThemeSwitcher() {
  const { locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Language"
        value={locale}
        onChange={(e) => setLocale(e.target.value as "ar" | "en")}
        className="rounded-lg border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
      >
        <option value="ar">العربية</option>
        <option value="en">English</option>
      </select>
      <select
        aria-label="Theme"
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
        className="rounded-lg border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
      >
        <option value="light">☀️</option>
        <option value="dark">🌙</option>
        <option value="system">🖥️</option>
      </select>
    </div>
  );
}
