"use client";

import dynamic from "next/dynamic";

// WebGL scenes only run in the browser, so they are never prerendered.
export const PillowLab = dynamic(() => import("./pillow-scene").then((m) => m.PillowLab), { ssr: false });
export const CopulaLab = dynamic(() => import("./copula-scene").then((m) => m.CopulaLab), { ssr: false });
export const CopulaCanvas = dynamic(() => import("./copula-scene").then((m) => m.CopulaScene), { ssr: false });
