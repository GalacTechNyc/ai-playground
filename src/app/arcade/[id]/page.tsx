import GameView from "./GameView";
export default async function Game({ params }: { params: Promise<{ id: string }> }) { return <GameView id={(await params).id} />; }
