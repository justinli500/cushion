// Refreshes tests/fixtures from the live Gemini API. Run: node scripts/capture-fixtures.mjs
// Only the fields the app reads are kept, which is what src/domains/markets/schemas.ts parses.
import { mkdir, writeFile } from "node:fs/promises";

const BASE = "https://api.gemini.com";
const OUT = new URL("../tests/fixtures/", import.meta.url);

const EVENT_FIELDS = ["ticker", "title", "type", "category", "status", "startTime", "expiryDate", "isLive", "gameId", "participants", "template", "sportsMarket", "volume", "settlement", "resolvedAt"];
const CONTRACT_FIELDS = ["label", "ticker", "instrumentSymbol", "strike", "status", "marketState", "prices", "resolutionSide", "settlementValue"];

const pick = (source, fields) => Object.fromEntries(fields.filter((f) => f in source).map((f) => [f, source[f]]));

async function events(query) {
  const res = await fetch(`${BASE}/v1/prediction-markets/events?${query}`);
  if (!res.ok) throw new Error(`${query} -> ${res.status}`);
  const { data } = await res.json();
  return data.map((event) => ({
    ...pick(event, EVENT_FIELDS),
    contracts: (event.contracts ?? []).map((contract) => pick(contract, CONTRACT_FIELDS)),
  }));
}

async function save(name, value) {
  await writeFile(new URL(name, OUT), JSON.stringify(value, null, 1));
  console.log(name, Array.isArray(value) ? `${value.length} items` : "saved");
}

await mkdir(OUT, { recursive: true });

const crypto = await events("status=active&category=Crypto&limit=200");
await save("crypto-events.json", crypto.filter((e) => e.type === "categorical").slice(0, 14));
await save("commodity-events.json", await events("status=active&category=Commodities&limit=20"));
await save("weather-events.json", await events("status=active&category=Weather&search=Austin&limit=4"));

const moneylines = await events("status=active&category=Sports&sports_market_type=moneyline&limit=500");
await save("moneyline-events.json", moneylines.filter((e) => e.sportsMarket?.scope?.type === "full_contest").slice(0, 12));
const game = await events("status=active&category=Sports&search=Indianapolis&limit=60");
await save("game-events.json", game.filter((e) => /-(M|PPRYDS|PPRECY|T|S)$/.test(e.ticker)));

const ladder = crypto.find((e) => e.type === "categorical" && e.ticker.startsWith("BTC") && e.title.includes("price on"));
if (ladder) {
  const symbol = ladder.contracts[Math.floor(ladder.contracts.length / 2)].instrumentSymbol;
  const book = await (await fetch(`${BASE}/v1/book/${symbol}`)).json();
  await save("book.json", { symbol, book });
}
