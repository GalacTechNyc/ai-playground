import Spectator from "./Spectator";
export default async function Room({ params }: { params: Promise<{ roomId: string }> }) { return <Spectator roomId={(await params).roomId} />; }
