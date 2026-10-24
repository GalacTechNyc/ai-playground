import { publicFeed, tickSimulation } from "@/lib/store";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() { tickSimulation(); return json({ version: "v0", items: publicFeed() }); }
