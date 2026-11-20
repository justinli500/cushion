import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { Disclaimer } from "@/components/brand";

/** Every screen of the app proper: the nav, the page, and the standing line about what a cushion is. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-[1360px] px-8 pb-10 pt-4">{children}</main>
      <footer className="mx-auto max-w-[1360px] px-8 pb-12">
        <Disclaimer />
      </footer>
    </>
  );
}
