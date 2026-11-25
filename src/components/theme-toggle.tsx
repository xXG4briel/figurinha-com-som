"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className="size-11 rounded-full"
      aria-label={t.theme.toggle}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {/* Os dois ícones ficam no DOM; o CSS escolhe, evitando flash na hidratação. */}
      <SunIcon className="size-5 dark:hidden" />
      <MoonIcon className="hidden size-5 dark:block" />
    </Button>
  );
}
