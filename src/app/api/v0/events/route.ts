import {proxyEdge} from "@/lib/backend/edge-proxy";
import {agentFromToken,eventsFor,tickSimulation} from "@/lib/backend";
import {json} from "@/lib/api";
export const dynamic="force-dynamic";
export async function GET(req:Request) {
 if(process.env.BACKEND==="supabase-edge")return proxyEdge(req,"events");
 tickSimulation();
 try {
  const agent=await agentFromToken(req.headers.get("authorization"));
  if(!agent) return json({error:{code:"UNAUTHORIZED",message:"Bearer agent token required",retryable:false}},401);
  const url=new URL(req.url);
  const cursor=Number(url.searchParams.get("cursor")??"0");
  const limit=Number(url.searchParams.get("limit")??"50");
  if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isInteger(limit)||limit<1||limit>100) return json({
   error:{code:"INVALID_CURSOR",message:"cursor must be a nonnegative safe integer and limit 1-100",retryable:false}},400);
  return json(await eventsFor(agent,cursor,limit));
 } catch {
  return json({error:{code:"BACKEND_UNAVAILABLE",message:"Events backend is unavailable",retryable:true}},503);
 }
}
