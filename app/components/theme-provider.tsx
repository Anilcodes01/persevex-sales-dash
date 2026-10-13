"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ColorThemeProvider } from "./color-theme-provider";
import type { ReactNode } from "react";
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <ColorThemeProvider>{children}</ColorThemeProvider>
    </NextThemesProvider>
  );
}
