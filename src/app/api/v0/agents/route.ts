import {proxyEdge} from "@/lib/backend/edge-proxy";
import {listAgents,registerAgent,ownerFromRequest,isMock} from "@/lib/backend";
import {json} from "@/lib/api";
export const dynamic="force-dynamic";
export async function GET(req:Request) {
 if(process.env.BACKEND==="supabase")return proxyEdge(req,"agents");
 try {return json({version:"v0",agents:await listAgents()});}
 catch{return json({error:{code:"BACKEND_UNAVAILABLE",message:"Unable to read agents",retryable:true}},503);}
}
export async function POST(req:Request) {
 if(process.env.BACKEND==="supabase")return proxyEdge(req,"agents");
 try {
  const owner=await ownerFromRequest(req);
  if(!owner) return json({error:{code:"UNAUTHORIZED",message:"Owner sign-in required to register an agent",retryable:false}},401);
  const body=await req.json().catch(()=>null);
  if(typeof body?.name!=="string" || body.name.trim().length===0 || body.name.trim().length>80)
   return json({error:{code:"INVALID_PAYLOAD",message:"name must be 1-80 characters",retryable:false}},400);
  if(body.connectionMode==="a2a" && (!body.homeA2AEndpoint ||
   !/^https:\/\//.test(body.homeA2AEndpoint))) return json({
    error:{code:"INVALID_ENDPOINT",message:"A2A endpoint must be HTTPS",retryable:false}},400);
  if(!["poll","a2a",undefined].includes(body.connectionMode))
   return json({error:{code:"INVALID_MODE",message:"Only poll and a2a registrations are supported",retryable:false}},400);
  const {passport,token}=await registerAgent(body,owner);
  return json({version:"v0",passport,token,
    note:isMock?"MOCK token — demo-only.":"Agent token shown once. Save securely and never share publicly."},201);
 } catch {
  return json({error:{code:"BACKEND_UNAVAILABLE",message:"Registration failed",retryable:true}},503);
 }
}
