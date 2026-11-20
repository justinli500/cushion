import { getGames, getPlayerProps } from "@/domains/markets/gemini";
import { respond } from "@/lib/http";

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return respond(async () => {
    const game = (await getGames()).find((g) => g.gameId === gameId);
    if (!game) return { game: null, props: [] };
    return { game, props: await getPlayerProps(game) };
  });
}
