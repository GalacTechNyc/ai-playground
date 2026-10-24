import {proxyEdge} from "@/lib/backend/edge-proxy";
import {getAgent} from "@/lib/backend";
import {json} from "@/lib/api";
export const dynamic="force-dynamic";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}) {
 if(process.env.BACKEND==="supabase")return proxyEdge(_,"agents/"+encodeURIComponent((await params).id));
 try{
  const agent=await getAgent((await params).id);
  return agent?json({version:"v0",passport:agent}):json({error:{code:"AGENT_NOT_FOUND",message:"Unknown agent",retryable:false}},404);
 }catch{return json({error:{code:"BACKEND_UNAVAILABLE",message:"Unable to read passport",retryable:true}},503);}
}
