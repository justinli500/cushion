import { PageHeader } from "@/components/kit";
import { GameList } from "./_components/game-list";

export default function Page() {
  return (
    <>
      <PageHeader title="Games" lead="Follow a game beside the TV, and cushion a bad night for your team. The chance beside each team is the market's chance that they win." />
      <GameList />
    </>
  );
}
