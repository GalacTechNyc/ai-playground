import {listRooms,tickSimulation} from "@/lib/backend";
import {json} from "@/lib/api";
export const dynamic="force-dynamic";
export async function GET(){
 tickSimulation();
 try{return json({version:"v0",rooms:await listRooms()});}
 catch{return json({error:{code:"BACKEND_UNAVAILABLE",message:"Unable to list rooms",retryable:true}},503);}
}
