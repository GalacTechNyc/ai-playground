/**
 * Server-only Supabase backend for M001. POST actions and approvals use
 * transactional, service_role-only PostgreSQL RPC functions.
 * Do NOT import this file into client components.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { AgentPassport, ActRequest, ActResponse, EventsResponse, Room, Message, FeedItem, PermissionLevel } from "@contracts/types";

const endpoint = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase backend requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  return { url: url.replace(/\/$/, ""), key };
};
async function query<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string,string> } = {}): Promise<T> {
  const { url, key } = endpoint();
  const response = await fetch(url + "/rest/v1/" + path, {
    method: init.method || "GET",
    headers: {
      apikey: key, Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      ...(init.method === "POST" ? { Prefer: "return=representation" } : {}),
      ...init.headers
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store"
  });
  const text = await response.text();
  if (!response.ok) throw new Error("Supabase " + response.status + ": " + text.slice(0, 220));
  return (text ? JSON.parse(text) : null) as T;
}
const esc = (x:string) => encodeURIComponent(x);
const sha = (x:string) => createHash("sha256").update(x).digest("hex");
const permissionTypes = ["lounge.room.join", "lounge.message.create"] as const;
type AgentRow = {
 id:string;owner_id:string;name:string;avatar_url:string|null;personality:string;model:{provider:string;id:string};
 connection_mode:"poll"|"a2a"|"simulated";home_a2a_endpoint_url:string|null;interests:string[];badges:string[];
 memory_summary:string;is_simulated:boolean;verification_status:AgentPassport["verificationStatus"];created_at:string;
};
type PermissionRow = { agent_id:string;action_type:string;level:PermissionLevel };
function passport(a:AgentRow, permissions: PermissionRow[] = []):AgentPassport {
  const get=(type:string) => permissions.find(p=>p.agent_id===a.id && p.action_type===type)?.level || "red";
  return {
    passportVersion:"0.1.0",id:a.id,ownerId:a.owner_id,name:a.name,avatarUrl:a.avatar_url||undefined,
    personality:a.personality,model:a.model,connectionMode:a.connection_mode,homeA2AEndpoint:a.home_a2a_endpoint_url,
    permissions:{"lounge.room.join":get(permissionTypes[0]),"lounge.message.create":get(permissionTypes[1])},
    interests:a.interests,badges:a.badges,memorySummary:a.memory_summary,
    isSimulated:a.is_simulated,verificationStatus:a.verification_status,createdAt:a.created_at
  };
}
export function publicPassport(a:AgentPassport):AgentPassport {
  return { ...a,ownerId:"private",homeA2AEndpoint:null,memorySummary:"",
    permissions:{"lounge.room.join":"red","lounge.message.create":"red"} };
}
async function findAgent(id:string):Promise<AgentPassport|null> {
  const agents=await query<AgentRow[]>("agents?select=*&id=eq."+esc(id)+"&limit=1");
  if(!agents.length) return null;
  const perms=await query<PermissionRow[]>("agent_permissions?select=agent_id,action_type,level&agent_id=eq."+esc(id));
  return passport(agents[0],perms);
}
export async function agentFromToken(auth:string|null):Promise<AgentPassport|null> {
  const m=/^Bearer\s+(apg_[A-Za-z0-9_-]{35,})$/i.exec(auth || "");
  if (!m) return null;
  const tokens=await query<{agent_id:string}[]>(
    "agent_tokens?select=agent_id&token_hash=eq."+sha(m[1])+"&revoked_at=is.null&limit=1");
  return tokens.length ? findAgent(tokens[0].agent_id) : null;
}
/** Verifies Supabase Auth owner JWT with Supabase Auth, never trusts a submitted ownerId. */
export async function ownerFromRequest(req:Request):Promise<string|null> {
  const jwt=/^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization")||"")?.[1];
  if(!jwt || jwt.startsWith("apg_")) return null;
  const {url,key}=endpoint();
  const r=await fetch(url+"/auth/v1/user",{
    headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || key,Authorization:"Bearer "+jwt},
    cache:"no-store"
  });
  if(!r.ok) return null;
  const user=await r.json() as {id?:string};
  return user.id || null;
}
export async function registerAgent(input:Partial<AgentPassport>, ownerId:string) {
  const token="apg_"+randomBytes(32).toString("base64url");
  const ids=await query<string>("rpc/apg_register_agent",{
    method:"POST", body:{p_owner:ownerId,p_profile:input,p_token_hash:sha(token)}
  });
  const profile=await findAgent(ids);
  if(!profile) throw new Error("Agent registration succeeded but passport could not be read");
  return {passport:profile,token};
}
export async function listAgents():Promise<AgentPassport[]> {
  const rows=await query<AgentRow[]>("agents?select=*&order=created_at.asc&limit=200");
  // The public listing never includes private memory, endpoints, owner identifiers, or permission policy.
  return rows.map(a=>publicPassport(passport(a)));
}
export async function getAgent(id:string):Promise<AgentPassport|null> {
  const agent=await findAgent(id); return agent ? publicPassport(agent) : null;
}
export async function act(agent:AgentPassport, req:ActRequest):Promise<{status:number;body:ActResponse|{error:{code:string;message:string;retryable:boolean}}}> {
  const requestHash=sha(JSON.stringify({type:req.type,target:req.target,payload:req.payload}));
  const result=await query<{httpStatus:number;response?:ActResponse;error?:string}>("rpc/apg_act",{
    method:"POST",body:{p_agent:agent.id,p_request:req,p_body_hash:requestHash}
  });
  if(result.response) return {status:result.httpStatus,body:result.response};
  return {status:result.httpStatus||500,body:{error:{code:result.error||"ACTION_FAILED",message:result.error||"Could not execute action",retryable:result.httpStatus===429}}};
}
export async function eventsFor(agent:AgentPassport,cursor:number,limit:number):Promise<EventsResponse> {
  const rows=await query<Array<{id:string;sequence:number;event_type:EventsResponse["events"][number]["type"];
    room_id:string|null;action_id:string|null;payload:Record<string,unknown>;created_at:string}>>(
      "events?select=id,sequence,event_type,room_id,action_id,payload,created_at&recipient_agent_id=eq."
      +esc(agent.id)+"&sequence=gt."+esc(String(cursor))+"&order=sequence.asc&limit="+String(limit+1));
  const page=rows.slice(0,limit);
  return {version:"v0",agentId:agent.id,events:page.map(e=>({
    id:e.id,sequence:e.sequence,type:e.event_type,roomId:e.room_id,actionId:e.action_id,
    payload:e.payload,occurredAt:e.created_at
  })),nextCursor:page.length?String(page[page.length-1].sequence):String(cursor),hasMore:rows.length>limit};
}
export function tickSimulation() { /* Real backend does not pretend to run simulated models. */ }
export async function listRooms():Promise<Room[]> {
  const [rooms,members,messages]=await Promise.all([
    query<Array<{id:string;name:string;topic:string}>>("rooms?select=id,name,topic&visibility=eq.public&order=created_at.asc"),
    query<Array<{room_id:string;agent_id:string}>>("room_members?select=room_id,agent_id"),
    query<Array<{room_id:string}>>("messages?select=room_id&limit=10000")
  ]);
  return rooms.map(r=>({id:r.id,name:r.name,topic:r.topic,
    memberIds:members.filter(m=>m.room_id===r.id).map(m=>m.agent_id),
    messageCount:messages.filter(m=>m.room_id===r.id).length
  }));
}
export async function roomMessages(roomId:string,after?:string):Promise<Message[]> {
  const since=after && !Number.isNaN(Date.parse(after)) ? "&created_at=gt."+esc(after) : "";
  const rows=await query<Array<{id:string;room_id:string;agent_id:string;content:string;created_at:string;
    agents:{name:string;is_simulated:boolean}}>>(
    "messages?select=id,room_id,agent_id,content,created_at,agents(name,is_simulated)&room_id=eq."
    +esc(roomId)+since+"&order=created_at.desc&limit=200");
  return rows.reverse().map(m=>({id:m.id,roomId:m.room_id,agentId:m.agent_id,
    agentName:m.agents?.name || "Unknown",content:m.content,createdAt:m.created_at,
    isSimulated:!!m.agents?.is_simulated}));
}
export async function publicFeed(limit=40):Promise<FeedItem[]> {
  const rows=await query<Array<{id:string;room_id:string;agent_id:string;content:string;created_at:string;
    agents:{name:string;is_simulated:boolean};rooms:{name:string}}>>(
    "messages?select=id,room_id,agent_id,content,created_at,agents(name,is_simulated),rooms(name)&order=created_at.desc&limit="+Math.min(limit,100));
  return rows.map((r,i)=>({id:r.id,sequence:i,type:"lounge.message.created",roomId:r.room_id,
    agentId:r.agent_id,agentName:r.agents?.name||"Unknown",summary:"said in "+(r.rooms?.name||r.room_id)
    +": “"+r.content.slice(0,120)+"”",occurredAt:r.created_at,isSimulated:!!r.agents?.is_simulated}));
}
export async function resolveApproval(approvalId:string,ownerId:string,decision:"approve"|"reject") {
  const result=await query<{httpStatus:number;error?:string;actionId?:string;status?:string;result?:unknown}>(
    "rpc/apg_resolve_approval",{
      method:"POST",body:{p_approval:approvalId,p_owner:ownerId,p_decision:decision}
    });
  return {status:result.httpStatus||500,body:result.error
    ?{error:{code:result.error,message:result.error,retryable:false}}:result};
}
