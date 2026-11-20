# Devpost submission draft

Track: Consumer Apps. Bounty: Gemini Prediction Markets. Chain award: Solana.

- Live demo: https://cushion-ecru.vercel.app
- Code: https://github.com/justinli500/cushion

## Short description

Cushion turns prediction markets into everyday protection. Tell it what you have riding on tomorrow, and it prices a cushion that pays if things go wrong.

## What did you build?

A web app with six sections that all work the same way: you say what you have at stake, Cushion finds the Gemini prediction markets that move against it, and prices cover on the live order book.

- **Today**: a feed of what the markets think about each thing you care about.
- **Portfolio**: enter coins and stocks. Cushion works out what each one really moves with and prices cover against a fall.
- **Games**: a second screen for a game, with live score, play by play and a win-chance chart, plus a cushion that pays if your team loses. A recorded game runs as if live, in step with a broadcast of it, so it works any time.
- **Bills**: cover against a jump in gas or heating costs, bought once or re-bought daily on autopilot.
- **Fantasy**: get paid back when one of your players has a bad game.
- **Small business**: pick your business type and city, and get hedges that fit, such as a cold day for a food truck or a home loss for a sports bar.

Fills are simulated with play money. Prices, order books, odds and settlements are live from Gemini. Every cushion is written to Solana devnet as a receipt.

## What problem does it solve?

Most people meet prediction markets as a place to bet, so most people never use them. But the same contracts can do the opposite job. A contract that pays when Bitcoin falls is insurance for someone holding Bitcoin. A contract that pays when the Texans lose is a consolation for a Texans fan. A contract that pays on a cold day is cover for an ice cream shop.

Cushion only offers that side. Every position protects something you already have at stake, and the app speaks in those terms: what it costs, what it pays, and the market's chance it is needed.

## How does it work?

- **Market data**: Gemini's public prediction market API supplies the events, quotes, order books, price history and settlements. The app reads four kinds of market: price ladders (coins and commodities), temperature buckets, game winners, and player props.
- **The engine**: a cushion is a list of contract legs. A falling price is covered by a strip of NO contracts down a price ladder, each sized to the gap below it, so the payout steps up as the loss grows. Legs are priced by walking the real order book level by level, and the app says so when the book is too thin to fill the whole cushion.
- **Exposure**: for a stock, the app regresses its daily returns on each market Gemini lists and uses the best match only if it explains enough of the stock's moves. Otherwise it says the holding cannot be cushioned.
- **Settlement**: when Gemini resolves a contract, the app reads the result and pays the play-money account.
- **On-chain**: each purchase is written to Solana devnet through the Memo program (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`), signed by an app-held key, so nobody needs a wallet.
- **Stack**: Next.js 16, TypeScript, Tailwind, shadcn/ui, Recharts, zod, `@solana/kit`, Vitest.

## What makes it unique?

- **It reframes the product.** The same markets, used only to protect. You buy the outcome you do not want.
- **It is honest about thin markets.** Cushions are priced against real depth, and a partial fill is shown as one.
- **It reads a strike ladder as a payoff.** A strip of binary contracts is sized to behave like an option, and the chart shows your outcome with and without it.
- **The crypto is invisible.** Receipts land on Solana with no wallet, seed phrase or gas for the user.
- **Nothing is passed off as real that is not.** Estimates and replay prices are labelled where they appear.

## What would you build next?

- Real orders through Gemini's trading API, behind the same ticket.
- Longer cover, by rolling daily contracts automatically and using month-end ladders.
- More life events as Gemini lists more markets: rain, flight delays, mortgage rates.
- Accounts, so a profile and its cushions follow you across devices.

## Technologies and sponsor tools

Gemini Prediction Markets API (market data), Solana devnet (Memo program), Next.js, TypeScript, Vercel.

## Solana details for the README requirement

- Program used: Memo program `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` on devnet.
- Receipt wallet (fee payer and signer): `442CDMzrvfKqKkyqSHsLnQgPdzUeuJuYYMWPFQhd4jQm`.

# Demo video script (2 to 3 minutes)

1. **Today (15 s).** "Prediction markets are usually a place to bet. Cushion uses them to protect what you already have riding on tomorrow." Show the feed with live odds.
2. **Portfolio (40 s).** Add BTC $2,000 and MSTR $800. Point out that MicroStrategy is read as Bitcoin exposure and that a stock with no match is reported as such. Pick a cushion, show cost, payout and chance, and the with-and-without chart. Add it.
3. **Live game (40 s).** Open Colts at Texans and press play on the broadcast. Show the score, plays and Gemini's real traded odds moving with it. Root for a team, add a loss cushion, jump to a touchdown and show what the cushion is worth now, then jump to the final and show it settle.
4. **Small business (25 s).** Pick a food truck in Austin, enter a bad-day cost, and show the cold-day cushion priced on the live book, including the thin-market note if it appears.
5. **Bills and fantasy (20 s).** Show the gas cover with spikes-only against full, then a fantasy player cushion.
6. **Account and receipt (20 s).** Open the account, show the cushions and play-money balance, and click "View receipt" to show the Solana transaction.
7. **Close (10 s).** "Same markets, opposite purpose. Built on Gemini's prediction market API, with receipts on Solana."
