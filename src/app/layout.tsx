import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Inter, Inter_Tight, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { SettlementWatcher } from "@/components/settlement-watcher";
import { WarmCache } from "@/components/warm-cache";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// The handoff's two faces: Inter for everything, Space Grotesk for headings and big numbers.
const inter = Inter({ variable: "--font-app", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// The Drop's faces: Fraunces with its SOFT axis for display, Inter Tight beside it.
const soft = Fraunces({ variable: "--font-soft", subsets: ["latin"], axes: ["SOFT", "opsz"], style: ["normal", "italic"] });
const tight = Inter_Tight({ variable: "--font-tight", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cushion",
  description: "Whatever you have riding on it, cushion it. Protection priced by Gemini prediction markets.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${geistMono.variable} ${soft.variable} ${tight.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Sets light or dark before the first paint; see THEME_SCRIPT. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full" suppressHydrationWarning>
        {children}
        <SettlementWatcher />
        <WarmCache />
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
