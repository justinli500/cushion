import { chanceAtOrAbove, chanceOf, impliedSpot, yesChance } from "@/domains/cushion/probability";
import type { Exposure } from "@/domains/exposure/portfolio";
import { UNDERLYINGS, type BucketMarket, type Game, type Ladder, type PropLine, type UnderlyingId } from "@/domains/markets/types";
import type { Profile } from "@/domains/profile/profile";
import { formatChance, formatPrice, formatUsdWhole, formatVolume, formatWhen } from "@/lib/format";
import { HEADLINE_OIL, headlineForLeague, headlineForUnderlying } from "./headlines";

/** One card on the Today feed: a thing in the person's life, the market's read on it, and a way in. */
export interface FeedCard {
  id: string;
  /** Plain subject, e.g. "Bitcoin". Two cards on one subject say the same thing, so the feed keeps one. */
  topic: string;
  eyebrow: string;
  headline: string;
  stat: { value: string; label: string } | null;
  /** The numbers on the card as one sentence. */
  facts: string;
  /** What is going on this week for this subject, or null when there is nothing solid to say. */
  news: string | null;
  /** When the card is about a contest: each side's chance, drawn as bars in place of the single stat. */
  outcomes?: { label: string; chance: number | null; mine: boolean; image: string | null; short: string }[];
  /** A small line under the bars, such as how much has traded. */
  footnote?: string;
  href: string;
  action: string;
}

const MOVE = 0.02;
const SPIKE = 0.03;

/** The soonest dated ladder for an underlying: today's, while it is still open. */
export function todaysLadder(ladders: Ladder[], underlying: UnderlyingId): Ladder | null {
  const dated = ladders.filter((l) => l.underlying === underlying && l.horizon === "dated");
  return dated.sort((a, b) => Date.parse(a.expiry) - Date.parse(b.expiry))[0] ?? null;
}

export function portfolioCard(exposure: Exposure, ladders: Ladder[]): FeedCard | null {
  const ladder = todaysLadder(ladders, exposure.underlying);
  const spot = ladder ? impliedSpot(ladder) : null;
  if (!ladder || spot == null) return null;
  const falling = exposure.dollars > 0;
  const above = chanceAtOrAbove(ladder, spot * (falling ? 1 - MOVE : 1 + MOVE));
  if (above == null) return null;
  const chance = falling ? 1 - above : above;
  const name = UNDERLYINGS[exposure.underlying].name;
  const hit = formatUsdWhole(Math.abs(exposure.dollars) * MOVE);
  const direction = falling ? "drop" : "jump";
  return {
    id: `portfolio-${exposure.underlying}`,
    topic: name,
    eyebrow: "Your portfolio",
    headline: `${formatUsdWhole(Math.abs(exposure.dollars))} riding on ${name}`,
    stat: { value: formatChance(chance), label: `chance of a 2% ${direction} by ${formatWhen(ladder.expiry)}` },
    facts: `The market gives a ${formatChance(chance)} chance ${name} closes 2% ${falling ? "lower" : "higher"} than expected, which would cost you about ${hit}.`,
    news: headlineForUnderlying(exposure.underlying),
    href: "/portfolio",
    action: "Cushion it",
  };
}

/** A card for anyone, shown before the person has told the app anything. */
export function marketCard(ladders: Ladder[], underlying: UnderlyingId): FeedCard | null {
  const ladder = todaysLadder(ladders, underlying);
  const spot = ladder ? impliedSpot(ladder) : null;
  const above = ladder && spot != null ? chanceAtOrAbove(ladder, spot * (1 - MOVE)) : null;
  if (!ladder || spot == null || above == null) return null;
  const name = UNDERLYINGS[underlying].name;
  return {
    id: `market-${underlying}`,
    topic: name,
    eyebrow: "Markets today",
    headline: `${name} is expected to close near ${formatPrice(spot)}`,
    stat: { value: formatChance(1 - above), label: `chance of a 2% drop by ${formatWhen(ladder.expiry)}` },
    facts: `The market expects ${name} to close near ${formatPrice(spot)} and gives a ${formatChance(1 - above)} chance it ends 2% lower.`,
    news: headlineForUnderlying(underlying),
    href: "/portfolio",
    action: "Add what you hold",
  };
}

/** The person's team if it plays, otherwise the most-traded game on right now, otherwise the next big one. */
export function pickGame(games: Game[], team: Profile["team"]): Game | null {
  const mine = team ? games.find((g) => g.league === team.league && g.teams.some((t) => t.abbr === team.abbr)) : null;
  if (mine) return mine;
  const byVolume = [...games].sort((a, b) => b.volume - a.volume);
  return byVolume.find((g) => g.isLive) ?? byVolume[0] ?? null;
}

export function gameCard(game: Game, team: Profile["team"]): FeedCard | null {
  const away = game.teams.find((t) => t.side === "away");
  const home = game.teams.find((t) => t.side === "home");
  if (!away || !home) return null;
  // Abbreviations repeat across leagues (HOU is the Texans and the Houston Cougars), so the league has to match too.
  const mine = team && team.league === game.league ? game.teams.find((t) => t.abbr === team.abbr) : null;
  // Without a team to root for, the card speaks about the favorite.
  const favorite = (yesChance(home.contract.quote).p ?? 0) >= (yesChance(away.contract.quote).p ?? 0) ? home : away;
  const subject = mine ?? favorite;
  const other = subject === home ? away : home;
  const chance = yesChance(subject.contract.quote);
  const when = game.isLive ? "The game is on now." : `Starts ${formatWhen(game.startTime)}.`;
  return {
    id: `game-${game.gameId}`,
    topic: `${away.name} at ${home.name}`,
    eyebrow: mine ? "Your team" : game.isLive ? "On now" : "Coming up",
    headline: `${away.name} at ${home.name}`,
    stat: chance.p == null ? null : { value: formatChance(chance.p), label: `chance the ${shortName(subject.name)} win` },
    facts:
      chance.p == null
        ? `No one is quoting ${away.name} at ${home.name} right now. ${when}`
        : `The market gives the ${shortName(subject.name)} a ${formatChance(chance.p)} chance to beat the ${shortName(other.name)}. ${when}`,
    news: headlineForLeague(game.league),
    outcomes: [away, home].map((t) => ({ label: t.name, chance: yesChance(t.contract.quote).p, mine: t === mine, image: t.contract.image ?? null, short: t.abbr })),
    footnote: formatVolume(game.volume),
    href: `/games/${game.gameId}`,
    action: mine ? "Cushion a loss" : "Open game",
  };
}

/** "Houston Texans" -> "Texans". College names ("Texas A&M Aggies") keep their last word too. */
const shortName = (name: string) => name.split(" ").slice(-1)[0];

export function billsCard(gallons: number, ladders: Ladder[]): FeedCard | null {
  const ladder = todaysLadder(ladders, "BRENT");
  const spot = ladder ? impliedSpot(ladder) : null;
  const chance = ladder && spot != null ? chanceAtOrAbove(ladder, spot * (1 + SPIKE)) : null;
  if (!ladder || spot == null || chance == null) return null;
  // A barrel is 42 gallons, so a dollar on the barrel is about 2.4 cents at the pump.
  const monthly = formatUsdWhole(gallons * 0.024 * spot * SPIKE);
  return {
    id: "bills-gas",
    topic: "Oil and gas prices",
    eyebrow: "Your bills",
    headline: `Oil is expected to close near ${formatPrice(spot)} a barrel`,
    stat: { value: formatChance(chance), label: "chance oil jumps 3% today" },
    facts: `The market gives a ${formatChance(chance)} chance oil jumps 3% today. On ${gallons} gallons a month, that is roughly ${monthly} more at the pump.`,
    news: HEADLINE_OIL,
    href: "/bills",
    action: "Cover my gas",
  };
}

/** The bucket the market thinks most likely, by midpoint. */
export function likeliestBucket(market: BucketMarket) {
  const scored = market.buckets.map((bucket) => ({ bucket, p: yesChance(bucket.contract.quote).p })).filter((s) => s.p != null);
  return scored.sort((a, b) => b.p! - a.p!)[0] ?? null;
}

export function weatherCard(city: string, markets: BucketMarket[]): FeedCard | null {
  const market = markets.filter((m) => m.city === city).sort((a, b) => Date.parse(a.expiry) - Date.parse(b.expiry))[0];
  const top = market ? likeliestBucket(market) : null;
  if (!market || !top) return null;
  const { lo, hi } = top.bucket;
  const deg = `°${market.unit}`;
  // Celsius markets come in single degrees, so a range of "14 to 14" is just 14.
  const range = lo == null ? `${hi}${deg} or cooler` : hi == null ? `${lo}${deg} or warmer` : lo === hi ? `${lo}${deg}` : `${lo} to ${hi}${deg}`;
  const colder = market.buckets
    .filter((b) => b.hi != null && lo != null && b.hi < lo)
    .reduce((sum, b) => sum + (yesChance(b.contract.quote).p ?? 0), 0);
  return {
    id: `weather-${city}`,
    topic: `${city} weather`,
    eyebrow: "Your business",
    headline: `${city}'s high is most likely ${range}`,
    stat: lo == null ? null : { value: formatChance(Math.min(colder, 1)), label: `chance it stays under ${lo}${deg}` },
    facts:
      lo == null
        ? `The market's most likely high for ${city} is ${range}.`
        : `The market's most likely high for ${city} is ${range}, with a ${formatChance(Math.min(colder, 1))} chance it stays under ${lo}${deg}.`,
    news: null,
    href: "/business",
    action: "See my hedges",
  };
}

export interface FantasyPlayer {
  player: string;
  league?: string;
  gameTitle: string;
  startTime: string;
  stats: { label: string; lines: PropLine[] }[];
}

export function fantasyCard(entry: FantasyPlayer): FeedCard | null {
  const stat = entry.stats[0];
  if (!stat) return null;
  // The line the market thinks is about one-in-three to miss: a real bad game, not a coin flip.
  const scored = stat.lines.map((line) => ({ line, p: chanceOf(line.contract.quote, "no").p })).filter((s) => s.p != null);
  const pick = scored.sort((a, b) => Math.abs(a.p! - 0.35) - Math.abs(b.p! - 0.35))[0];
  if (!pick) return null;
  const under = Math.ceil(pick.line.line);
  const what = `under ${under} ${stat.label.toLowerCase()}`;
  return {
    id: `fantasy-${entry.player}`,
    topic: entry.player,
    eyebrow: "Your lineup",
    headline: `${entry.player} plays in ${entry.gameTitle}`,
    stat: { value: formatChance(pick.p), label: `chance of ${what}` },
    facts: `The market gives a ${formatChance(pick.p)} chance ${entry.player} finishes ${what}. Starts ${formatWhen(entry.startTime)}.`,
    news: entry.league ? headlineForLeague(entry.league) : null,
    href: "/fantasy",
    action: "Cushion a bust",
  };
}
