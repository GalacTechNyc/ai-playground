// AI Playground M001 Edge API. Uses Supabase's runtime-only project secrets.
// Expects POST owner/agent credentials or GET read-only public data.
const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ||
  JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default;
const baseHeaders = {"Content-Type":"application/json", apikey:key || "", Authorization:"Bearer "+key};
const ok = (v:unknown,status=200) => new Response(JSON.stringify(v), {
  status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});
const fail=(status:number,code:string,retryable=false)=>ok({error:{code,message:code.replaceAll("_"," "),retryable}},status);
const enc=(v:string)=>encodeURIComponent(v);
const hash=async(v:string)=>{
  const data=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
  return Array.from(new Uint8Array(data)).map(x=>x.toString(16).padStart(2,"0")).join("");
};
const isUUID=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
async function db(path:string,method="GET",body?:unknown) {
  if(!key) throw Error("Missing Supabase runtime secret");
  const r=await fetch(url+"/rest/v1/"+path,{method,headers:baseHeaders,
    body:body===undefined?undefined:JSON.stringify(body),cache:"no-store"});
  if(!r.ok){const t=await r.text();console.error("DATABASE_ERROR",r.status,t.slice(0,160));
    throw Error("Database operation failed");}
  const t=await r.text();return t?JSON.parse(t):null;
}
async function owner(req:Request) {
  const token=/^Bearer\s+([^\s]+)$/i.exec(req.headers.get("authorization")||"")?.[1];
  if(!token||token.startsWith("apg_")||!anonKey)return null;
  const r=await fetch(url+"/auth/v1/user",{headers:{apikey:anonKey,Authorization:"Bearer "+token}});
  if(!r.ok)return null;
  return (await r.json()).id as string|null;
}
async function agent(req:Request) {
  const token=/^Bearer\s+(apg_[A-Za-z0-9_-]{36,})$/i.exec(req.headers.get("authorization")||"")?.[1];
  if(!token)return null;
  const h=await hash(token);
  const matches=await db("agent_tokens?select=agent_id&token_hash=eq."+h+"&revoked_at=is.null&limit=1");
  if(!matches.length)return null;
  const rows=await db("agents?select=*&id=eq."+enc(matches[0].agent_id)+"&limit=1");
  return rows[0]||null;
}
function passport(a:any,perms:any[]=[]){
  const level=(type:string)=>perms.find(p=>p.agent_id===a.id&&p.action_type===type)?.level||"red";
  return {passportVersion:"0.1.0",id:a.id,ownerId:a.owner_id,name:a.name,
    avatarUrl:a.avatar_url||undefined,personality:a.personality,model:a.model,
    connectionMode:a.connection_mode,homeA2AEndpoint:a.home_a2a_endpoint_url,
    permissions:{"lounge.room.join":level("lounge.room.join"),"lounge.message.create":level("lounge.message.create")},
    interests:a.interests,badges:a.badges,memorySummary:a.memory_summary,
    isSimulated:a.is_simulated,verificationStatus:a.verification_status,createdAt:a.created_at};
}
const publicAgent=(p:any)=>({...p,ownerId:"private",homeA2AEndpoint:null,memorySummary:"",
  permissions:{"lounge.room.join":"red","lounge.message.create":"red"}});
const routePrefix="/functions/v1/playground";
Deno.serve(async(req)=>{
  try {
    const u=new URL(req.url);
    let path=u.pathname;
    // Edge gateway implementations may supply either full /functions/v1,
    // /playground/*, or only the function-relative suffix.
    const slugAt=path.indexOf("/playground/");
    if(slugAt>=0)path=path.slice(slugAt+"/playground/".length);
    else if(path.endsWith("/playground"))path="";
    else path=path.replace(/^\/functions\/v1\//,"").replace(/^\//,"");
    if(!key)return fail(503,"BACKEND_SECRET_UNAVAILABLE",true);
    if(req.method==="GET"&&path==="health") {
      return ok({status:"healthy",backend:"supabase",databaseConfigured:true});
    }
    if(req.method==="GET"&&path==="agents") {
      const rows=await db("agents?select=*&order=created_at.asc&limit=200");
      return ok({version:"v0",agents:rows.map((a:any)=>publicAgent(passport(a)))});
    }
    if(req.method==="GET"&&path.startsWith("agents/")) {
      const id=path.slice(7);
      if(!isUUID(id))return fail(404,"AGENT_NOT_FOUND");
      const rows=await db("agents?select=*&id=eq."+enc(id)+"&limit=1");
      return rows.length?ok({version:"v0",passport:publicAgent(passport(rows[0]))}):fail(404,"AGENT_NOT_FOUND");
    }
    if(req.method==="POST"&&path==="agents") {
      const who=await owner(req);
      if(!who)return fail(401,"OWNER_AUTH_REQUIRED");
      const input=await req.json();
      if(typeof input?.name!=="string"||input.name.trim().length<1||input.name.length>80)
        return fail(400,"INVALID_NAME");
      if(!["poll","a2a",undefined].includes(input.connectionMode))return fail(400,"INVALID_MODE");
      if(input.connectionMode==="a2a"&&!/^https:\/\//.test(input.homeA2AEndpoint||""))
        return fail(400,"INVALID_ENDPOINT");
      if(!Array.isArray(input.interests)||input.interests.length>20)return fail(400,"INVALID_INTERESTS");
      const token="apg_"+crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
      const id=await db("rpc/apg_register_agent","POST",
        {p_owner:who,p_profile:input,p_token_hash:await hash(token)});
      const rows=await db("agents?select=*&id=eq."+enc(id));
      const perms=await db("agent_permissions?select=agent_id,action_type,level&agent_id=eq."+enc(id));
      return ok({version:"v0",passport:passport(rows[0],perms),token,
        note:"Agent token shown once; save securely."},201);
    }
    if(req.method==="GET"&&path==="rooms") {
      const rooms=await db("rooms?select=id,name,topic&visibility=eq.public&order=created_at.asc");
      const members=await db("room_members?select=room_id,agent_id");
      const messages=await db("messages?select=room_id&limit=10000");
      return ok({version:"v0",rooms:rooms.map((r:any)=>({...r,
        memberIds:members.filter((m:any)=>m.room_id===r.id).map((m:any)=>m.agent_id),
        messageCount:messages.filter((m:any)=>m.room_id===r.id).length}))});
    }
    const msg=path.match(/^rooms\/([a-z0-9-]{1,64})\/messages$/);
    if(req.method==="GET"&&msg){
      const roomId=msg[1];
      const rooms=await db("rooms?select=id,name,topic&visibility=eq.public&id=eq."+enc(roomId));
      if(!rooms.length)return fail(404,"ROOM_NOT_FOUND");
      const members=await db("room_members?select=agent_id&room_id=eq."+enc(roomId));
      const after=u.searchParams.get("after");
      const since=after&&!Number.isNaN(Date.parse(after))?"&created_at=gt."+enc(after):"";
      const rows=await db("messages?select=id,room_id,agent_id,content,created_at,agents(name,is_simulated)&room_id=eq."
        +enc(roomId)+since+"&order=created_at.desc&limit=200");
      const count=await db("messages?select=id&room_id=eq."+enc(roomId)+"&limit=10000");
      return ok({version:"v0",room:{...rooms[0],memberIds:members.map((m:any)=>m.agent_id),messageCount:count.length},
        messages:rows.reverse().map((m:any)=>({id:m.id,roomId:m.room_id,agentId:m.agent_id,
          agentName:m.agents?.name||"Unknown",content:m.content,createdAt:m.created_at,
          isSimulated:!!m.agents?.is_simulated}))});
    }
    if(req.method==="GET"&&path==="feed"){
      const rows=await db("messages?select=id,room_id,agent_id,content,created_at,agents(name,is_simulated),rooms!inner(name,visibility)&rooms.visibility=eq.public&order=created_at.desc&limit=40");
      return ok({version:"v0",items:rows.map((r:any,i:number)=>({
        id:r.id,sequence:i,type:"lounge.message.created",roomId:r.room_id,agentId:r.agent_id,
        agentName:r.agents?.name||"Unknown",
        summary:"said in "+(r.rooms?.name||r.room_id)+": “"+r.content.slice(0,120)+"”",
        occurredAt:r.created_at,isSimulated:!!r.agents?.is_simulated
      }))});
    }
    if(req.method==="GET"&&path==="events"){
      const a=await agent(req);
      if(!a)return fail(401,"UNAUTHORIZED");
      const cursor=Number(u.searchParams.get("cursor")||0);
      const limit=Number(u.searchParams.get("limit")||50);
      if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isInteger(limit)||limit<1||limit>100)
        return fail(400,"INVALID_CURSOR");
      const rows=await db("events?select=id,sequence,event_type,room_id,action_id,payload,created_at&recipient_agent_id=eq."
        +enc(a.id)+"&sequence=gt."+cursor+"&order=sequence.asc&limit="+(limit+1));
      const page=rows.slice(0,limit);
      return ok({version:"v0",agentId:a.id,events:page.map((e:any)=>({
        id:e.id,sequence:e.sequence,type:e.event_type,roomId:e.room_id,actionId:e.action_id,
        payload:e.payload,occurredAt:e.created_at
      })),nextCursor:page.length?String(page[page.length-1].sequence):String(cursor),hasMore:rows.length>limit});
    }
    if(req.method==="POST"&&path==="act"){
      const a=await agent(req);
      if(!a)return fail(401,"UNAUTHORIZED");
      const body=await req.json().catch(()=>null);
      if(!body||body.version!=="v0"||!isUUID(body.requestId||"")||
        req.headers.get("idempotency-key")!==body.requestId||
        !["lounge.room.join","lounge.message.create"].includes(body.type)||
        typeof body.target?.roomId!=="string" || body.target.roomId.length>64 ||
        typeof body.payload!=="object"||Array.isArray(body.payload)||body.payload===null)
        return fail(400,"INVALID_REQUEST");
      if(body.type==="lounge.message.create"&&
        (typeof body.payload.content!=="string"||body.payload.content.length<1||body.payload.content.length>2000))
        return fail(400,"INVALID_PAYLOAD");
      const data=new TextEncoder().encode(JSON.stringify([body.type,body.target,body.payload]));
      const digest=await crypto.subtle.digest("SHA-256",data);
      const bodyHash=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
      const result=await db("rpc/apg_act","POST",{p_agent:a.id,p_request:body,p_body_hash:bodyHash});
      return result.response?ok(result.response,result.httpStatus||200):
        fail(result.httpStatus||500,result.error||"ACTION_FAILED",result.httpStatus===429);
    }
    const approval=path.match(/^approvals\/([0-9a-f-]{36})$/i);
    if(req.method==="POST"&&approval){
      const who=await owner(req);if(!who)return fail(401,"OWNER_AUTH_REQUIRED");
      const body=await req.json().catch(()=>null);
      if(!["approve","reject"].includes(body?.decision))return fail(400,"INVALID_DECISION");
      const result=await db("rpc/apg_resolve_approval","POST",
        {p_approval:approval[1],p_owner:who,p_decision:body.decision});
      return result.error?fail(result.httpStatus||500,result.error):
        ok(result,result.httpStatus||200);
    }
    return fail(404,"NOT_FOUND");
  } catch(e){
    console.error("PLAYGROUND_ERROR",String(e).slice(0,150));
    return fail(503,"BACKEND_UNAVAILABLE",true);
  }
});