import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { SettlementWatcher } from "@/components/settlement-watcher";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cushion",
  description: "Protection for the things you already have riding on tomorrow, priced by prediction markets.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <div className="mx-auto flex min-h-screen max-w-[1320px]">
          <Sidebar />
          <main className="min-w-0 flex-1 px-10 py-8">{children}</main>
        </div>
        <SettlementWatcher />
      </body>
    </html>
  );
}
