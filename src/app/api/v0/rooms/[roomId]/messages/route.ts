import {listRooms,roomMessages,tickSimulation} from "@/lib/backend";
import {json} from "@/lib/api";
export const dynamic="force-dynamic";
export async function GET(req:Request,{params}:{params:Promise<{roomId:string}>}){
 tickSimulation();
 try{
  const {roomId}=await params;
  const room=(await listRooms()).find(r=>r.id===roomId);
  if(!room)return json({error:{code:"ROOM_NOT_FOUND",message:"Unknown room",retryable:false}},404);
  return json({version:"v0",room,messages:await roomMessages(roomId,new URL(req.url).searchParams.get("after")||undefined)});
 }catch{return json({error:{code:"BACKEND_UNAVAILABLE",message:"Unable to read messages",retryable:true}},503);}
}
