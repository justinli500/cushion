@AGENTS.md

# Cushion

Next.js 16 + TypeScript app (UBC 2026 hackathon). It sells play-money "cushions": cover priced off Gemini's live prediction markets that pays out if something you already have at stake goes wrong. See README.md for the product and the reasoning behind it.

## Commands

```bash
pnpm dev          # http://localhost:3000, no config needed
pnpm test         # vitest, config in config/vitest.config.ts
pnpm typecheck
pnpm lint
```

Optional env var: `SOLANA_RECEIPT_KEY` in `.env.local` (create it with `node scripts/make-receipt-key.mjs [--fund]`).

## Conventions

- **Engine stays pure.** `src/domains/cushion/` takes data in and returns data out, with no fetching or React. Test it with worked numbers.
- **Parse third-party JSON at the boundary.** Gemini, ESPN and Yahoo responses go through zod (`domains/markets/schemas.ts`, `domains/scores/parse.ts`). Code past that point trusts its own types.
- **One buy flow.** Every section buys through `components/cushion-ticket.tsx`.
- **The account is an event log** in localStorage (`domains/account/ledger.ts`). Balance and positions are derived with `replay()`. Settlements must stay idempotent.
- **Pages use `components/kit.tsx`**, not raw shadcn `components/ui/*`, so sizes and tones stay in one place.
- **Server routes** wrap their work in `respond()` (`lib/http.ts`), cache with `cached()` (`lib/ttl-cache.ts`) and rate-limit with `throttle()` (`lib/throttle.ts`).
- **"This week" lines** in `domains/feed/headlines.ts` are hand-written. Update `HEADLINES_AS_OF` when you change them.
- **Copy style:** plain sentences, no jargon.

## Index

### Pages (`src/app/`)
| Route | Files | Purpose |
|---|---|---|
| `/` | `page.tsx` | Today feed: cards built by `domains/feed/cards.ts` |
| `/portfolio` | `portfolio/page.tsx`, `holdings-editor.tsx` | Holdings → regression → cover against a fall |
| `/games`, `/games/[gameId]` | `games/_components/game-list.tsx`, `game-screen.tsx`, `ticket-panel.tsx`, `use-live-game.ts` | Game lobby and live second screen |
| `/games/live` | `games/_components/use-replay-game.ts`, `game-video.tsx`, `replay-bar.tsx` | Saved game (`public/replays/`) re-run in step with a YouTube broadcast |
| `/bills` | `bills/page.tsx`, `autopilot.tsx`, `replay.tsx`, `use-bill-markets.ts`, `copy.ts` | Gas and heating cover on oil and natural gas ladders |
| `/fantasy` | `fantasy/page.tsx`, `player-card.tsx` | Player-under-line cover from props |
| `/business` | `business/page.tsx`, `steps.tsx`, `cards.tsx`, `hooks.ts` | Wizard that suggests hedges |
| `/account` | `account/page.tsx` | Balance, positions, Solana receipt links |

### API routes (`src/app/api/`)
- `markets/ladders`, `markets/weather`, `markets/games`, `markets/games/[gameId]`, `markets/props`: normalised Gemini markets
- `book?symbols=`, `candles?symbol=&tf=`, `resolutions?events=`: Gemini proxies
- `prices?symbols=`: Yahoo daily closes
- `scores?league=`, `scores/[league]/[espnId]`: ESPN scoreboard and summary
- `bills/replay`: past settled days for the bills replay
- `receipts` (POST): writes a Solana devnet memo receipt

### Domains (`src/domains/`)
- `markets/`: `gemini.ts` (client), `schemas.ts` (zod), `normalise.ts`, `types.ts` (Ladder, BucketMarket, Game, PropLine, `UNDERLYINGS`)
- `cushion/`:
  - `legs.ts`: `stripLegs`, `temperatureLegs`, `teamLossLegs`, `playerUnderLegs`
  - `price.ts`: book walk, `priceCushion`, `settleLegs`
  - `probability.ts`: `yesChance`, `survivalCurve`, `impliedSpot`
  - `types.ts`
- `account/`: `ledger.ts` (event schema, `replay`), `store.ts` (`useAccount`, `record`), `buy.ts` (`buyCushion`, `requestReceipt`)
- `exposure/`: `portfolio.ts` (regression), `bills.ts`, `bills-replay.ts`, `fantasy.ts`, `business.ts`
- `feed/`: `cards.ts` (card builders), `headlines.ts` (static dated lines)
- `scores/`: `espn.ts`, `parse.ts`, `match.ts` (game ↔ ESPN), `logos.ts`, `names.ts`, `series.ts` (odds chart points), `chance.ts`, `lobby.ts`
- `replay/replay.ts`: replay schema, `frameAt`, `replayBooks`, `moments`, settlement
- `receipts/`: `schema.ts`, `memo.ts`, `send.ts` (Memo program)
- `profile/profile.ts`: browser-only profile, `useProfile` / `updateProfile`
- `prices/history.ts`: Yahoo history

### Shared
- `src/components/`:
  - `cushion-ticket.tsx`
  - charts: `odds-chart.tsx`, `payoff-chart.tsx`, `outcome-bar.tsx`
  - `settlement-watcher.tsx` (auto-settles open positions)
  - `top-nav.tsx`, `team-logo.tsx`, `feed/feed-card.tsx`, `kit.tsx`, `ui/` (shadcn)
- `src/lib/`: `format.ts`, `http.ts`, `ttl-cache.ts`, `throttle.ts`, `use-poll.ts`, `chart-colors.ts`

### Scripts, tests and docs
- `scripts/`:
  - `capture-fixtures.mjs` refreshes `tests/fixtures/`
  - `capture-replay.mjs` saves a finished game to `public/replays/`
  - `make-receipt-key.mjs` creates the Solana key
- `tests/` mirrors `src/domains`, using real saved responses in `tests/fixtures/`
- `docs/devpost.md` is the hackathon submission draft
