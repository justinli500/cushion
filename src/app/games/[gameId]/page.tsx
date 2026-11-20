import { LiveGame } from "../_components/live-game";

export default async function Page({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return <LiveGame gameId={gameId} />;
}
