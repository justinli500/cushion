import type { Metadata } from "next";
import { Geist_Mono, Inter, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { SettlementWatcher } from "@/components/settlement-watcher";
import { WarmCache } from "@/components/warm-cache";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// The handoff's two faces: Inter for everything, Space Grotesk for headings and big numbers.
const inter = Inter({ variable: "--font-app", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cushion",
  description: "Whatever you have riding on it, cushion it. Protection priced by Gemini prediction markets.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full" suppressHydrationWarning>
        {children}
        <SettlementWatcher />
        <WarmCache />
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
