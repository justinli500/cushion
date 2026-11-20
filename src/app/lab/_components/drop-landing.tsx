"use client";

import Link from "next/link";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import type { CopulaView } from "./copula-scene";
import { CopulaCanvas } from "./lab-loaders";


// The line through the person's day, in a 1280 x 1000 frame. It plunges where the Texans could lose
// and runs off the bottom edge, straight down onto the copula below.
const LINE =
  "M-20 470 C 120 430, 200 510, 300 470 S 460 390, 560 430 S 680 470, 720 450 C 770 438, 850 600, 868 760 S 880 940, 880 1000";

// Where the line leaves the frame, as a share of its width. The copula is centered under this point,
// and the lead drop falls straight down from it.
const LINE_END = 880 / 1280;

const COPULA_VIEW: CopulaView = {
  camera: [5.2, 3.6, 6.1],
  zoom: false,
  transparent: true,
  center: LINE_END,
  auto: false,
  // Just under the top of the copula's canvas, where the line fades out, and already falling.
  lead: { y: 2.15, vy: -5.5, size: 1.5, keep: 10, slant: 0.05, slantPeriod: 30 },
};

// The dot's loop, in seconds: along the line to the Texans, a beat, down the plunge, then a rest
// while the drops land. The first loop waits for the line to finish drawing.
const DRAW = 3;
const TRAVEL = 3.6;
const FALL = 0.8;
const REST = 2.8;

/**
 * Runs a dot along the line. It eases to a stop at the live game, falls down the plunge, and the
 * moment it leaves the frame `onLeave` fires, so the copula can drop a ball from the same spot.
 */
function useTraveller(onLeave: () => void) {
  const path = useRef<SVGPathElement>(null);
  const dot = useRef<SVGGElement>(null);
  const leave = useRef(onLeave);
  useEffect(() => {
    leave.current = onLeave;
  });

  useEffect(() => {
    const line = path.current;
    const marker = dot.current;
    if (!line || !marker) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      marker.style.opacity = "0";
      const id = window.setInterval(() => leave.current(), (TRAVEL + FALL + REST) * 1000);
      return () => window.clearInterval(id);
    }

    const total = line.getTotalLength();
    // The plunge starts at the Texans' point on the line.
    let split = 0;
    let best = Infinity;
    for (let s = 0; s < total; s += 2) {
      const p = line.getPointAtLength(s);
      const d = (p.x - 720) ** 2 + (p.y - 450) ** 2;
      if (d < best) {
        best = d;
        split = s;
      }
    }

    let start = performance.now() + DRAW * 1000;
    let left = false;
    let frame = 0;
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      let s = 0;
      if (t < 0) s = 0;
      else if (t < TRAVEL) {
        const k = t / TRAVEL;
        s = split * (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
      } else if (t < TRAVEL + FALL) {
        const k = (t - TRAVEL) / FALL;
        s = split + (total - split) * k * k;
      } else {
        s = total;
        if (!left) {
          left = true;
          leave.current();
        }
      }
      const p = line.getPointAtLength(s);
      marker.setAttribute("transform", `translate(${p.x} ${p.y})`);
      marker.style.opacity = t >= 0 && t < TRAVEL + FALL ? "1" : "0";
      if (t > TRAVEL + FALL + REST) {
        start = now;
        left = false;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return { path, dot };
}

/** Places a block at a point of the 1280 x 1000 frame, so it stays on the line as the page scales. */
const at = (x: number, y: number): CSSProperties => ({ position: "absolute", left: `${(x / 1280) * 100}%`, top: `${(y / 1000) * 100}%` });

function Stake({ label, value, line, live, big }: { label: string; value: string; line: string; live?: boolean; big?: boolean }) {
  return (
    <>
      <p className={`text-[13px] tracking-[0.12em] ${live ? "text-[#FF9E7A]" : "text-[#A29FB8]"}`}>{label}</p>
      <p className={`drop-soft mt-1 leading-none font-medium ${big ? "text-[64px]" : "text-[44px]"}`}>{value}</p>
      <p className={`mt-1.5 leading-snug text-[#CFCBE0] ${big ? "text-[17px]" : "text-[15px]"}`}>{line}</p>
    </>
  );
}

function Also({ value, children }: { value: string; children: ReactNode }) {
  return (
    <Link href="/today" className="flex items-baseline gap-3.5 text-[#F1EEF8] no-underline">
      <span className={`drop-soft text-[52px]`}>{value}</span>
      <span className="text-[17px] text-[#CFCBE0]">{children} →</span>
    </Link>
  );
}

/**
 * The Drop: a line through the person's day that falls onto the copula. As the lab page it covers the
 * window; on the landing page it is the top of the page and `children` follow it.
 */
export function DropLanding({ overlay = true, children }: { overlay?: boolean; children?: ReactNode }) {
  const [cue, setCue] = useState(0);
  const { path: linePath, dot } = useTraveller(() => setCue((c) => c + 1));
  return (
    <div
      className={`${overlay ? "fixed inset-0 z-40 overflow-y-auto" : "relative overflow-hidden"} bg-[#0A0B14] text-[#F1EEF8]`}
      style={{ fontFamily: "var(--font-tight), system-ui, sans-serif" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2600px]"
        style={{
          background:
            "radial-gradient(800px 600px at 15% 10%, rgba(150,130,255,0.12), transparent 70%), radial-gradient(800px 600px at 68% 52%, rgba(255,140,110,0.11), transparent 70%)",
        }}
      />

      <header className="relative mx-auto flex max-w-[1216px] flex-wrap items-center justify-between gap-4 px-8 py-7">
        <Link href="/" className="drop-soft text-[30px] font-medium italic tracking-tight">
          cushion
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-7 text-[15px] font-medium">
          <a href="#how" className="text-[#A29FB8] hover:text-[#F1EEF8]">
            How it works
          </a>
          <a href="#live" className="text-[#A29FB8] hover:text-[#F1EEF8]">
            Live games
          </a>
          <Link
            href="/today"
            className="press inline-flex min-h-11 items-center rounded-full border border-[#3A3850] px-5 font-semibold text-[#F1EEF8] hover:border-[#C3B5FF]"
          >
            Open the app
          </Link>
        </nav>
      </header>

      <section aria-label="Your day" className="relative mx-auto aspect-[1280/1000] w-full max-w-[1280px]">
        <svg
          viewBox="0 0 1280 1000"
          className="absolute inset-0 size-full [mask-image:linear-gradient(to_bottom,black_82%,transparent)]"
          role="img"
          aria-label="A glowing line runs through Bitcoin, oil and the Texans game, then plunges where the Texans could lose"
        >
          <defs>
            <linearGradient id="drop-line" x1="0" y1="0" x2="1280" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#C3B5FF" />
              <stop offset="0.56" stopColor="#C3B5FF" />
              <stop offset="0.66" stopColor="#FF9E7A" />
              <stop offset="1" stopColor="#FFC9A8" />
            </linearGradient>
            <filter id="drop-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>
          <path d={LINE} fill="none" stroke="url(#drop-line)" strokeWidth="18" strokeLinecap="round" filter="url(#drop-glow)" opacity="0.5" />
          <path ref={linePath} className="drop-draw" d={LINE} fill="none" stroke="url(#drop-line)" strokeWidth="4" strokeLinecap="round" />
          <circle cx="300" cy="470" r="7" fill="#0A0B14" stroke="#C3B5FF" strokeWidth="3" />
          <circle cx="560" cy="430" r="7" fill="#0A0B14" stroke="#C3B5FF" strokeWidth="3" />
          <circle className="drop-ring" cx="720" cy="450" r="10" fill="none" stroke="#FF9E7A" strokeWidth="2" />
          <circle cx="720" cy="450" r="8" fill="#FF9E7A" />
          <line x1="300" y1="458" x2="300" y2="380" stroke="#3A3850" />
          <line x1="560" y1="444" x2="560" y2="520" stroke="#3A3850" />
          <line x1="720" y1="438" x2="720" y2="320" stroke="#3A3850" />
          <g ref={dot} style={{ opacity: 0 }}>
            <circle r="20" fill="#FFB894" opacity="0.35" filter="url(#drop-glow)" />
            <circle r="10" fill="#FFF4EE" />
          </g>
        </svg>

        <h1
          className={`drop-soft absolute left-[4%] top-[2%] m-0 font-normal italic leading-[0.9] tracking-[-0.03em]`}
          style={{ fontSize: "clamp(64px, 12vw, 176px)" }}
        >
          Things fall.
        </h1>
        <p className="absolute right-[4%] top-[10%] m-0 hidden max-w-[300px] text-right text-[19px] leading-[1.45] text-[#A29FB8] md:block">
          Cushion catches the ones you care about, priced by what the markets think will happen.
          <br />
          <span className="text-[13px] tracking-[0.12em]">THU 20 NOV · SAMPLE NUMBERS</span>
        </p>

        <div style={{ ...at(210, 250), width: 200 }}>
          <Stake label="BITCOIN" value="71%" line="it holds $90k tonight" />
        </div>
        <div style={{ ...at(470, 540), width: 220 }}>
          <Stake label="OIL" value="24%" line="it passes $80 this month" />
        </div>
        <div style={{ ...at(700, 170), width: 300 }}>
          <Stake label="● LIVE · Q3 · HOU 20–17" value="62%" line="your Texans hold on" live big />
        </div>
        <p
          className={`drop-soft m-0 text-[40px] font-light italic leading-[1.1] text-[#FFC9A8]`}
          style={at(910, 640)}
        >
          And if they don&apos;t…
        </p>
      </section>

      <section aria-label="The landing" className="relative mx-auto -mt-[12%] max-w-[1280px] md:h-[860px]">
        <figure className="relative m-0 h-[560px] w-full md:absolute md:inset-0 md:h-full">
          <CopulaCanvas pours={0} cue={cue} view={COPULA_VIEW} />
          <figcaption className="absolute bottom-4 right-6 font-mono text-[12px] tracking-[0.08em] text-[#A29FB8]">
            FRANK COPULA · θ = 6 · HOW TWO OUTCOMES FALL TOGETHER
          </figcaption>
        </figure>
        <div className="relative z-10 w-full px-[6%] py-10 md:absolute md:left-0 md:top-1/2 md:w-[36%] md:-translate-y-1/2 md:pr-0">
          <p className={`drop-soft m-0 font-normal leading-[0.95] tracking-[-0.02em]`} style={{ fontSize: "clamp(44px, 6vw, 84px)" }}>
            you land on <span className="italic text-[#FFC9A8]">$40.</span>
          </p>
          <p className="mt-5 text-[18px] leading-relaxed text-[#CFCBE0]">
            A cushion under the Texans game costs $15 right now. It pays $40 the moment they lose.
          </p>
          <Link
            href="/games/live"
            className={`drop-cta mt-7 inline-flex min-h-14 items-center rounded-full bg-gradient-to-br from-[#FFC9A8] to-[#FF9E7A] px-8 text-[17px] font-semibold text-[#1A0E0A] shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_14px_40px_rgba(255,158,122,0.35)]`}
          >
            Catch this one · $15
          </Link>
        </div>
      </section>

      {children ?? (
        <section aria-label="Also today" className="relative mx-auto max-w-[1280px] px-[4%] pb-24 pt-16">
          <p className="mb-5 text-[13px] tracking-[0.12em] text-[#A29FB8]">ALSO ON YOUR LINE TODAY</p>
          <div className="flex flex-wrap gap-x-[72px] gap-y-12">
            <Also value="41°">likeliest high in Chicago</Also>
            <Also value="64%">your running back clears 60 yards</Also>
          </div>
        </section>
      )}
    </div>
  );
}
