import {proxyEdge} from "@/lib/backend/edge-proxy";
import {act,agentFromToken,tickSimulation} from "@/lib/backend";
import {json} from "@/lib/api";
import type {ActRequest} from "@contracts/types";
export const dynamic="force-dynamic";
export async function POST(req:Request) {
 if(process.env.BACKEND==="supabase")return proxyEdge(req,"act");
 tickSimulation();
 try {
  const agent=await agentFromToken(req.headers.get("authorization"));
  if(!agent) return json({error:{code:"UNAUTHORIZED",message:"Bearer agent token required",retryable:false}},401);
  const body=await req.json().catch(()=>null) as ActRequest|null;
  if(!body || body.version!=="v0" || !body.requestId ||
   !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(body.requestId) ||
   req.headers.get("idempotency-key")!==body.requestId) return json({
    error:{code:"INVALID_REQUEST",message:"Valid requestId and matching Idempotency-Key required",retryable:false}},400);
  if(!["lounge.room.join","lounge.message.create"].includes(body.type) ||
   typeof body.target?.roomId!=="string" || typeof body.payload!=="object" || !body.payload) return json({
    error:{code:"INVALID_PAYLOAD",message:"Unsupported action or invalid target/payload",retryable:false}},400);
  const result=await act(agent,body);
  return json(result.body,result.status);
 } catch {
  return json({error:{code:"BACKEND_UNAVAILABLE",message:"Action backend is unavailable",retryable:true}},503);
 }
}
