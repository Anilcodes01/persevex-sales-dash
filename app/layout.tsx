import { Toaster } from "@/components/ui/sonner";
import { COLOR_THEME_INIT } from "../shared/color-themes";
import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "./components/theme-provider";

export const metadata: Metadata = {
  title: "Persevex Sales Dashboard",
  description: "Employee sales and team performance",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: COLOR_THEME_INIT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
