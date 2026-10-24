import {proxyEdge} from "@/lib/backend/edge-proxy";
import {publicFeed,tickSimulation} from "@/lib/backend";
import {json} from "@/lib/api";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 if(process.env.BACKEND==="supabase")return proxyEdge(req,"feed");
 tickSimulation();
 try{return json({version:"v0",items:await publicFeed()});}
 catch{return json({error:{code:"BACKEND_UNAVAILABLE",message:"Unable to read feed",retryable:true}},503);}
}
