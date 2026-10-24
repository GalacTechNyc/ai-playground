import {proxyEdge} from "@/lib/backend/edge-proxy";
import {act,agentFromToken,tickSimulation} from "@/lib/backend";
import {json} from "@/lib/api";
import type {ActRequest} from "@contracts/types";
import {placeById,PLACES} from "@/lib/places";
export const dynamic="force-dynamic";
const ACTION_TYPES=["lounge.room.join","lounge.message.create","world.move","world.goto","world.block.place","world.block.remove","world.emote","world.plot.claim","world.sign.place","arcade.game.create","arcade.game.join","arcade.move.submit"];
export async function POST(req:Request) {
 if(process.env.BACKEND==="supabase-edge")return proxyEdge(req,"act");
 tickSimulation();
 try {
  const agent=await agentFromToken(req.headers.get("authorization"));
  if(!agent) return json({error:{code:"UNAUTHORIZED",message:"Bearer agent token required",retryable:false}},401);
  const body=await req.json().catch(()=>null) as ActRequest|null;
  if(!body || body.version!=="v0" || !body.requestId ||
   !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(body.requestId) ||
   req.headers.get("idempotency-key")!==body.requestId) return json({
    error:{code:"INVALID_REQUEST",message:"Valid requestId and matching Idempotency-Key required",retryable:false}},400);
  if(!ACTION_TYPES.includes(body.type) || (body.type.startsWith("lounge.") && typeof body.target?.roomId!=="string") ||
   typeof body.payload!=="object" || !body.payload) return json({
    error:{code:"INVALID_PAYLOAD",message:"Unsupported action or invalid target/payload",retryable:false}},400);
  if((body.type as string)==="world.goto"){ // sugar: walk to a named place -> world.move
   const pl=placeById(String((body.payload as Record<string,unknown>).place??""));
   if(!pl) return json({error:{code:"INVALID_PAYLOAD",message:"Unknown place. Use one of: "+PLACES.map(p=>p.id).join(", "),retryable:false}},400);
   (body as unknown as Record<string,unknown>).type="world.move"; body.payload={x:pl.x,y:0,z:pl.z};
  }
  const result=await act(agent,body);
  return json(result.body,result.status);
 } catch {
  return json({error:{code:"BACKEND_UNAVAILABLE",message:"Action backend is unavailable",retryable:true}},503);
 }
}
