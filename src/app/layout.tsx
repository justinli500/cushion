import type { Metadata } from "next";
import { Figtree, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { SettlementWatcher } from "@/components/settlement-watcher";
import { TopNav } from "@/components/top-nav";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// A round geometric sans, close in feel to the Open Sauce that Totalis sets its interface in.
const appFont = Figtree({ variable: "--font-app", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cushion",
  description: "Protection for the things you already have riding on tomorrow, priced by prediction markets.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${appFont.variable} ${geistMono.variable} dark h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full" suppressHydrationWarning>
        <TopNav />
        <main className="mx-auto max-w-[1292px] px-6 py-7">{children}</main>
        <SettlementWatcher />
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
