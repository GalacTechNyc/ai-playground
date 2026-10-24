import {proxyEdge} from "@/lib/backend/edge-proxy";
import {act,agentFromToken,tickSimulation} from "@/lib/backend";
import {json} from "@/lib/api";
import type {ActRequest} from "@contracts/types";
import {placeById,PLACES} from "@/lib/places";
import {worldState} from "@/lib/backend";
import {clampToIsland,lookAround} from "@/lib/world/look";
import { homeByName, homeEntrance } from "@/lib/world/homeVisits";
export const dynamic="force-dynamic";
const ACTION_TYPES=["lounge.room.join","lounge.message.create","world.move","world.goto","world.block.place","world.block.remove","world.emote","world.plot.claim","world.sign.place","arcade.game.create","arcade.game.join","arcade.move.submit",
 "puzzle.create","puzzle.join","puzzle.answer","lake.fish.catch","world.home.set","world.say","memory.note.create","memory.note.remove","dm.send","quest.create","quest.claim","quest.submit","quest.approve","quest.cancel","world.home.notebook","dm.read","world.look"];
export async function POST(req:Request) {
 if(process.env.BACKEND==="supabase-edge"){ const t=((await req.clone().json().catch(()=>null)) as {type?:string}|null)?.type;
  if(t!=="world.look"&&t!=="world.move"&&t!=="world.goto"&&!t?.startsWith("puzzle.")&&t!=="lake.fish.catch") return proxyEdge(req,"act"); }
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
   const params = body.payload as Record<string, unknown>;
   if (typeof params.home === "string" && params.home.trim()) {
     const s = await worldState(); const h = homeByName(s.homes ?? [], params.home);
     if (!h) return json({error:{code:"HOME_NOT_FOUND",message:"Unknown home or agent name",retryable:false}},404);
     (body as unknown as Record<string,unknown>).type="world.move"; body.payload=homeEntrance(h);
   } else {
     const pl=placeById(String(params.place??""));
     if(!pl) return json({error:{code:"INVALID_PAYLOAD",message:"Unknown place. Use one of: "+PLACES.map(p=>p.id).join(", "),retryable:false}},400);
     (body as unknown as Record<string,unknown>).type="world.move"; body.payload={x:pl.x,y:0,z:pl.z};
   }
  }
  if((body.type as string)==="world.look"){ // read-only: who/what is near you (or near payload.x,z)
   const s=await worldState(); const p=body.payload as Record<string,unknown>; const me=s.agents.find(a=>a.agentId===agent.id);
   const x=Number.isFinite(Number(p.x))&&p.x!==undefined?Number(p.x):me?.x??0, z=Number.isFinite(Number(p.z))&&p.z!==undefined?Number(p.z):me?.z??0;
   return json({version:"v0",requestId:body.requestId,status:"completed",result:lookAround(s,x,z,Number(p.radius)||12,agent.id)},200);
  }
  if(body.type==="world.move"){ const p=body.payload as Record<string,unknown>; const x=Number(p.x),z=Number(p.z);
   if(!Number.isFinite(x)||!Number.isFinite(z)) return json({error:{code:"INVALID_PAYLOAD",message:"world.move needs numeric x and z",retryable:false}},400);
   body.payload={...p,...clampToIsland(x,z),y:0}; }
  const result=await act(agent,body);
  return json(result.body,result.status);
 } catch {
  return json({error:{code:"BACKEND_UNAVAILABLE",message:"Action backend is unavailable",retryable:true}},503);
 }
}
