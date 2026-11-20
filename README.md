# Cushion

Protection for the things you already have riding on tomorrow, priced by prediction markets.

**Live demo:** https://cushion-ecru.vercel.app

Cushion is a web app built for the UBC 2026 hackathon (Consumer Apps track, Gemini Prediction Markets bounty). Most people meet prediction markets as a place to bet. Cushion turns them around: every position in the app protects something you already have at stake. If your Bitcoin drops, your team loses, oil jumps, your running back has a bad night, or a cold day empties your patio, the cushion pays.

Fills are simulated with play money. Prices, order books, odds and settlements are live from Gemini.

## What it does

| Section | What you tell it | What it does |
|---|---|---|
| Landing page | Nothing | Five example stakes, each priced as one number from live quotes, and how the app works in three steps. |
| Today | Nothing | The news market that moved most in the last day, what is coming up, a card for each thing you have at stake, and news markets (the Fed, the S&P, elections, awards) you can take a side on. |
| Portfolio | The coins and stocks you hold | Works out what each holding really moves with, and charts that price with every level Gemini lists a market at drawn across it. Drag the line to where your cushion should start paying: below the price for a fall, above it for a rise. It shows your loss with and without the cushions you chose. |
| Live games | Your team | A second screen for the game: the score, what your cushion is worth play by play, a win-chance chart, and a cushion that pays if your team loses, which you can add to or cash out. A real game can also be run as if it were live, in step with a broadcast of it, so the screen works when nothing is on. |
| Bills | The kind of car you drive and how far, or a heating bill | Cover against a jump in oil or natural gas, bought once through month end or re-bought daily on autopilot. |
| Fantasy | Your lineup and what is riding on the week | A roster of your players, or an example lineup of this week's real players until you enter yours. Pick a player to see every way to cushion him, and cover one or several at once. |
| Small business | Your business type, city and what a bad day costs | Suggests cushions that fit, each priced and bought from its own card: cold days, home-team losses, rising costs, a recession. |

## How it uses Gemini's prediction markets

Everything comes from Gemini's public market-data endpoints. No account or API key is needed.

| Need | Endpoint |
|---|---|
| Markets, contracts and quotes | `GET /v1/prediction-markets/events` (filtered by category and sports market type) |
| Live order book | `GET /v1/book/{instrumentSymbol}` |
| Price history | `GET /v2/candles/{instrumentSymbol}/{timeframe}` |
| Settlement | `GET /v1/prediction-markets/events/{eventTicker}` (`resolutionSide` on each contract) |
| Daily history for the coins | `GET /v2/candles/{symbol}/1day` |

The engine reads four kinds of market:

- **Price ladders** for BTC, ETH, SOL, XRP, HYPE, ZEC, Brent, WTI, natural gas, copper, gold and silver. Each rung is a contract that pays if the price settles at or above a level.
- **Temperature buckets** for the daily high in about 50 cities. Exactly one bucket wins.
- **Game winners** for NFL, NBA, NHL and college games, which stay open during play.
- **Player props** such as rushing yards and points.

## How a cushion is built

A cushion is a list of legs. Each leg is one contract, a side, and a quantity, and pays $1 per contract if it resolves on that side.

| What could go wrong | Legs |
|---|---|
| A price falls | NO on a strip of rungs at and below a start level. Each rung is sized to the gap below it, so the payout steps up as the loss grows. |
| A price rises | YES on a strip of rungs at and above a start level. |
| A day is too cold or too hot | YES on every temperature bucket past the threshold. |
| Your team loses | The cheaper of YES on the opponent and NO on your team. |
| A player goes under a line | NO on the "N or more" contract. |

Legs are priced by walking Gemini's live order book level by level. Buying NO at a price `p` is selling YES at `1 - p` into the bids. If the book is too thin to fill the whole cushion, the app says how much cover is actually on offer. The market's chance of each outcome comes from the bid and ask midpoint. Ladder probabilities are forced to fall as the level rises, because thin books wobble.

When a contract's event resolves, the app reads `resolutionSide` and pays out the legs that resolved on their side.

## The simulated live game

`/games/live` runs last Thursday's Colts at Texans game as if it were on now. A fan broadcast of the game is embedded from YouTube, and because it was streamed live, a moment in the video is the same moment in the data. The video's position is the clock: press play, pause, or scrub, and the score, play by play and win chance move with it. Buttons jump straight to kickoff, each score, and the final whistle.

Nothing in it is made up. The plays, clock and score are ESPN's, each stamped with the time it happened. The win chance is every real trade on Gemini's winner market for that game, less two trades entered on the wrong contract (a jump of more than 25 points that reverses within three trades is dropped).

A cushion added during the game uses play money and fills at the last price that really traded at that moment, plus a fixed 1 cent spread, since no order book was saved. The panel beside the video shows what your cushion would fetch right now and lets you cash it out at that price, a chart follows its worth through each score, and it settles on the real result when the game ends. The screen is tagged "Simulated live" with the date the game was played.

`node scripts/capture-replay.mjs` saves a game to `public/replays/`.

## Where the blockchain comes in

Every cushion you add is written to Solana devnet as a receipt. The server builds a compact memo (contract symbols, sides, quantities, cost and maximum payout), signs one transaction with an app-held key, and sends it to the Memo program:

```
MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr
```

The account page links each cushion to its transaction on the Solana explorer. Nobody connects a wallet or sees a seed phrase. A receipt that fails never blocks a cushion: it shows as pending and can be retried. The memo holds no personal data.

There is no login, and fills are simulated in the browser, so a receipt is a public record that the app wrote this cushion down. It is not proof of a real purchase. The signing key lives on the server and should only ever hold devnet SOL.

## What is real and what is not

| Real | Simulated or estimated |
|---|---|
| Quotes, order books, odds, settlements, price history (Gemini) | Fills: play money, booked at the real book's prices and sizes |
| Live scores, play-by-play, team logos, and players' positions and pictures (ESPN's public feed; a team ESPN does not list by the same name keeps Gemini's own picture) | Exchange fees are not modelled |
| Stock and commodity history (Yahoo Finance) | Which market a stock "moves with": a regression on daily returns, labelled as an estimate |
| Receipts (Solana devnet transactions) | How gas and heating bills follow oil and natural gas: rough pass-through, labelled as an estimate |
| | The "this week" line on each card: written by hand and dated, not live |
| | Prices in the simulated live game: the last real trade at that moment plus a fixed 1 cent spread |

## Architecture

One Next.js 16 app in TypeScript, with a shadcn/ui component layer on Tailwind and a light theme: a pale ground, white borderless cards, one blue for what is covered and one orange for what is at risk, and a dark panel that carries each cushion's summary. A landing page at `/` prices five example stakes from live quotes; the app's sections sit under a pill nav. Server routes fetch and cache upstream data. The browser holds the person's profile and their play-money account.

```
src/
  app/                    pages and API routes
    api/markets, book, candles, resolutions, prices, scores, bills, receipts
  domains/
    markets/              Gemini client, zod schemas, one internal market model
    cushion/              pure engine: legs, book pricing, implied chance, settlement
    account/              play-money ledger
    exposure/             portfolio, bills, fantasy and small-business models
    feed/                 the Today cards and their dated "this week" lines
    scores/               ESPN client and game matching
    replay/               a saved game's state, prices and settlement at any moment
    receipts/             Solana memo builder and sender
    profile/              what the person has told the app
  components/             cushion ticket, charts, layout
    ui/                   shadcn/ui components
    kit.tsx               Cushion's own building blocks, each a thin layer over a shadcn component
tests/                    mirrors src/domains, with fixtures of real Gemini responses
```

A few decisions worth knowing:

- **The account is an event log.** Purchases, settlements and receipts are appended to a log in `localStorage`, and the balance and positions are derived by replaying it. A settlement recorded twice pays once.
- **Third-party JSON is parsed at the boundary.** Gemini, ESPN and Yahoo responses go through zod schemas, and the rest of the code trusts its own types.
- **The engine is pure.** Building legs, pricing against a book, and settling take data in and return data out, so they are tested with worked numbers and real saved ladders.
- **One way to buy.** Every section prices and buys through the same hook, which fetches the live book, prices the cushion, and books the fill. The dark summary panel is its standard face; screens with their own layout call the hook directly.
- **The "this week" lines are static.** Each is written by hand from the news and carries its date. A line written fresh on every page load would mean a paid model call each time.

## Run it

Requires Node 22 and pnpm.

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. The app works with no configuration. One optional setting goes in `.env.local`:

| Variable | What it enables |
|---|---|
| `SOLANA_RECEIPT_KEY` | On-chain receipts. Create one with `node scripts/make-receipt-key.mjs`, then fund it on devnet with `node scripts/make-receipt-key.mjs --fund` |

```bash
pnpm test        # unit tests
pnpm typecheck
pnpm lint
```

`node scripts/capture-fixtures.mjs` refreshes the saved Gemini responses the tests read.

## Limits

- Gemini's books are thin, so large cushions only partly fill. The app shows this instead of hiding it.
- Most contracts expire the same day or at month end, so cover is short-dated and has to be renewed.
- Server-side caches and rate limits are held in memory per process.
- Yahoo's history endpoint is unofficial. A holding it cannot price is reported as having no history.
