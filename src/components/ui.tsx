import type { ReactNode } from "react";

export function PageHeader({ title, lead }: { title: string; lead: string }) {
  return (
    <header className="mb-8">
      <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-muted">{lead}</p>
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-card p-6 ${className}`}>{children}</section>;
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {hint ? <span className="text-[13px] text-faint">{hint}</span> : null}
    </div>
  );
}

/** Marks any number the app estimated or made up, as opposed to one read from Gemini. */
export function Tag({ children, tone = "note" }: { children: ReactNode; tone?: "note" | "cushion" | "loss" | "plain" }) {
  const tones = {
    note: "bg-note-soft text-note",
    cushion: "bg-cushion-soft text-cushion",
    loss: "bg-loss-soft text-loss",
    plain: "bg-paper text-muted",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "quiet";
  type?: "button" | "submit";
}) {
  const variants = {
    primary: "bg-cushion text-white hover:bg-[#195c4c] disabled:bg-line disabled:text-faint",
    quiet: "border border-line bg-card text-ink hover:border-faint disabled:text-faint",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`press rounded-xl px-4 py-2.5 text-[14px] font-medium disabled:cursor-not-allowed ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-card px-3 py-2.5 text-[14px] outline-none transition-colors duration-200 placeholder:text-faint focus:border-cushion";

export function Skeleton({ className = "h-5 w-full" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

/** A quiet message for empty, unavailable, or error states. */
export function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-paper px-4 py-3 text-[14px] leading-relaxed text-muted">{children}</p>;
}

/** Two-column page body: content on the left, a sticky ticket on the right. */
export function WithTicket({ children, ticket }: { children: ReactNode; ticket: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-8">
      <div className="space-y-6">{children}</div>
      <aside className="sticky top-8">{ticket}</aside>
    </div>
  );
}
