import {proxyEdge} from "@/lib/backend/edge-proxy";
import { ownerFromRequest, resolveApproval, isMock } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {
 if(process.env.BACKEND==="supabase-edge")return proxyEdge(req,"approvals/"+encodeURIComponent((await params).id));
  const owner=await ownerFromRequest(req);
  if(!owner) return json({error:{code:"UNAUTHORIZED",message:"Supabase owner authentication required",retryable:false}},401);
  const data=await req.json().catch(()=>null);
  if(data?.decision!=="approve" && data?.decision!=="reject") return json({
    error:{code:"INVALID_DECISION",message:"decision must be approve or reject",retryable:false}},400);
  try {
    const {id}=await params; const result=await resolveApproval(id,owner,data.decision);
    return json(result.body,result.status);
  } catch {
    return json({error:{code:"BACKEND_UNAVAILABLE",message:isMock?"Mock unavailable":"Approval backend failed",retryable:true}},503);
  }
}
