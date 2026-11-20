import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root,
  resolve: { alias: { "@": `${root}src` } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Route tests tell clients apart by address, which the rate limiter only believes on Vercel.
    env: { VERCEL: "1" },
  },
});
