# Devpost submission draft

Track: Consumer Apps. Bounty: Gemini Prediction Markets. Chain award: Solana.

- Live demo: https://cushion-ecru.vercel.app
- Code: https://github.com/justinli500/cushion

## Short description

Cushion turns prediction markets into everyday protection. Tell it what you have riding on tomorrow, and it prices a cushion that pays if things go wrong.

## What did you build?

A web app with a landing page and six sections that all work the same way: you say what you have at stake, Cushion finds the Gemini prediction markets that move against it, and prices cover on the live order book.

- **Today**: the news market that moved most in a day, what is coming up, a card for each thing you have at stake, and news markets you can take a side on.
- **Portfolio**: enter coins and stocks. Cushion works out what each one really moves with and charts it, with every level Gemini lists a market at drawn across the chart. You drag a line to where your cushion should start paying, and see your loss with and without it.
- **Live games**: a second screen for a game, with the score, play by play and a win-chance chart, plus a cushion that pays if your team loses. You watch what the cushion is worth after each score and can cash it out. A recorded game runs as if live, in step with a broadcast of it, so it works any time.
- **Bills**: pick the kind of car you drive and how far, and Cushion works out your gas; or pick your home and set the thermostat, and it works out a winter heating bill. Then cover against a jump in gas or heating costs, bought once or re-bought daily on autopilot.
- **Fantasy**: a roster of your players, with an example lineup of this week's real players to start from. Pick a player to see every way to cushion him, and get paid back when he has a bad game.
- **Small business**: pick your business type and city, and get hedges that fit, such as a cold day for a food truck or a home loss for a sports bar.

Fills are simulated with play money. Prices, order books, odds and settlements are live from Gemini. Every cushion is written to Solana devnet as a receipt.

## What problem does it solve?

Most people meet prediction markets as a place to bet, so most people never use them. But the same contracts can do the opposite job. A contract that pays when Bitcoin falls is insurance for someone holding Bitcoin. A contract that pays when the Texans lose is a consolation for a Texans fan. A contract that pays on a cold day is cover for an ice cream shop.

Cushion only offers that side. Every position protects something you already have at stake, and the app speaks in those terms: what it costs, what it pays, and the market's chance it is needed.

## How does it work?

- **Market data**: Gemini's public prediction market API supplies the events, quotes, order books, price history and settlements. The app reads five kinds of market: price ladders (coins and commodities), temperature buckets, game winners, player props, and news events (the Fed's decision, how low the S&P gets, a recession, elections, awards).
- **The engine**: a cushion is a list of contract legs. A falling price is covered by a strip of NO contracts down a price ladder, each sized to the gap below it, so the payout steps up as the loss grows. Legs are priced by walking the real order book level by level, and the app says so when the book is too thin to fill the whole cushion.
- **Exposure**: for a stock, the app regresses its daily returns on each market Gemini lists and uses the best match only if it explains enough of the stock's moves. Otherwise it says the holding cannot be cushioned.
- **Settlement**: when Gemini resolves a contract, the app reads the result and pays the play-money account.
- **On-chain**: each purchase is written to Solana devnet through the Memo program (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`), signed by an app-held key, so nobody needs a wallet.
- **Stack**: Next.js 16, TypeScript, Tailwind, shadcn/ui, Recharts, zod, `@solana/kit`, Vitest.

## What makes it unique?

- **It reframes the product.** The same markets, used only to protect. You buy the outcome you do not want.
- **It is honest about thin markets.** Cushions are priced against real depth, and a partial fill is shown as one.
- **It reads a strike ladder as a payoff.** A strip of binary contracts is sized to behave like an option, so the payout grows with the loss.
- **It speaks insurance, not trading.** Each cushion is one price and one payout. The contracts behind it are a footnote.
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

# Demo video script (about 2:45)

Spoken lines are in quotes. Numbers on screen will differ from take to take, since prices are live.

## Before you record

- **Warm the data:** open the landing page and Fantasy a minute beforehand. A first load after a quiet spell can take 20 to 45 seconds.
- **Mute the game video:** the reel carries NFL broadcast audio, which can get the demo flagged or muted on YouTube.
- **Stay off the middle of the reel:** it repeats the second quarter from about 23:30. Use the "Jump to" chips instead of letting it run.
- **Pick light or dark** with the switch in the nav and keep it for the whole take.
- **Fantasy:** check the ticks match "Players covered" before you start.

## Script

**1. Landing (0:00 to 0:15).** Start on the landing page, scroll a little.
"Things fall. Your team loses, Bitcoin drops, gas spikes. Prediction markets already price all of that, but people only use them to bet. Cushion uses the same markets the other way: to protect what you already have riding on tomorrow."

**2. Live game (0:15 to 0:55).** Open the app, then Live games, then Colts at Texans. Press play. Pick the Texans, $20, buy.
"I'm a Texans fan. For a few dollars, I get twenty back if they lose."
Click the first chip (Colts field goal).
"The Colts score first, and my cushion is worth more. The field, the score and the price are Gemini's real trades from this game, moving with the video. I could cash out right here."
Click the touchdown chip, then Final.
"Houston wins. I'm out a few dollars and I didn't need it. That's what insurance is."

**3. Portfolio (0:55 to 1:30).** Open Portfolio, choose Bitcoin.
"Here's a portfolio. Each dashed line is a level Gemini has a market at. I drag the line to choose where my cushion starts paying. Nearer costs more, further costs less. Red is where it pays."
Drag the line a level, point at the dark panel, buy.
"Without a cushion, a drop costs me this much. With it, this much. Nvidia has no market of its own, so Cushion reads it as S&P exposure and labels that an estimate."

**4. Fantasy (1:30 to 1:55).** Open Fantasy.
"Fantasy points aren't a market, but yards and touchdowns are. Every player in my lineup starts cushioned, as one price."
Open James Cook, tap a different line chip, then untick one player.
"I choose the line that pays me back, and drop a player with one tap. The price follows."

**5. Bills (1:55 to 2:20).** Open Bills. Pick the pickup, drag the miles slider.
"Pick your car and how far you drive. Cushion works out the gallons and covers a gas spike."
Switch to Heating, raise the thermostat.
"Same for heating: your home, your winter, your thermostat. Oil heat is priced on the oil market."

**6. Business (2:20 to 2:30).** Open Business, tap a suggested city.
"A food truck can cushion a cold day. Pick a city and it's priced on the live book."

**7. Account and receipt (2:30 to 2:40).** Click the balance in the nav, open the receipt link on the Portfolio cushion.
"Every cushion gets a receipt on Solana."

**8. Close (2:40 to 2:45).**
"Same markets, opposite purpose. Every price is Gemini's live order book. Fills are simulated play money, and every estimate is labelled."

## Notes

- **Receipt:** use the Portfolio or Fantasy cushion for step 7. The game cushion is on a saved game and gets no on-chain receipt. The receipt takes a few seconds to write, so buying in step 3 leaves it ready by step 7.
- **To cut to 2:30:** drop step 6.
- **Do one dry run of step 2** (buy, then three chips) before the real take.
