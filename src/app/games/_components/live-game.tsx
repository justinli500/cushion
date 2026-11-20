"use client";

import { GameScreen } from "./game-screen";
import { useLiveGame } from "./use-live-game";

export function LiveGame({ gameId }: { gameId: string }) {
  return <GameScreen feed={useLiveGame(gameId)} />;
}
