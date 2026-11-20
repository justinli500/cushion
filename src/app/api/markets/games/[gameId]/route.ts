import { getGames, getPlayerProps } from "@/domains/markets/gemini";
import { withOfficialLogos } from "@/domains/scores/logos";
import { respond } from "@/lib/http";

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return respond(async () => {
    const game = (await getGames()).find((g) => g.gameId === gameId);
    if (!game) return { game: null, props: [] };
    const [withLogos] = await withOfficialLogos([game]);
    return { game: withLogos, props: await getPlayerProps(game) };
  });
}
