import type { PlayerProp } from "@/domains/markets/types";
import type { Replay } from "@/domains/replay/replay";
import { formatUsd } from "@/lib/format";
import type { GameFeed } from "./feed";

/** What the game screen draws: the shared feed, plus what only this screen needs. */
export interface GameView extends GameFeed {
  /** The moment on screen in epoch ms: the game's own clock for a replay, the latest poll for a live game. */
  at: number | null;
  /** The saved game behind a replay, so a cushion's worth can be read from its prices at every moment. */
  recording: Replay | null;
  /** The player markets of a live game. A saved game has none. */
  props: PlayerProp[];
}

/** "$40.00" as "$40", for sentences. */
export const whole = (dollars: number) => formatUsd(dollars).replace(/\.00$/, "");
