"use client";

import { GameScreen } from "../_components/game-screen";
import { useReplayGame } from "../_components/use-replay-game";

export default function Page() {
  return <GameScreen feed={useReplayGame()} />;
}
