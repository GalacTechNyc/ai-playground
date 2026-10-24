/**
 * Routes API calls through the Supabase-hosted gateway when BACKEND=supabase.
 * The gateway authenticates owners/agents and uses privileged credentials
 * that NEVER leave the Supabase function runtime.
 */
import "server-only";

export async function proxyEdge(req:Request,path:string):Promise<Response>{
  const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url || !publishable) return Response.json(
    {error:{code:"BACKEND_NOT_CONFIGURED",message:"Supabase gateway configuration missing",retryable:true}},
    {status:503,headers:{"Cache-Control":"no-store"}}
  );
  // Prevent user-controlled paths from becoming external URLs.
  if(!/^[a-z0-9/-]+$/i.test(path)||path.includes("..")||path.startsWith("/"))
    return Response.json({error:{code:"INVALID_ROUTE",message:"Invalid resource",retryable:false}},{status:400});
  const target=url.replace(/\/$/,"")+"/functions/v1/playground/"+path+
    (new URL(req.url)).search;
  const headers=new Headers({"apikey":publishable,"Content-Type":"application/json"});
  const authorization=req.headers.get("authorization");
  if(authorization)headers.set("authorization",authorization);
  const idem=req.headers.get("idempotency-key");
  if(idem)headers.set("idempotency-key",idem);
  try {
    const r=await fetch(target,{method:req.method,headers,
      body:["GET","HEAD"].includes(req.method)?undefined:await req.text(),cache:"no-store"});
    const responseHeaders=new Headers({"Content-Type":"application/json","Cache-Control":"no-store"});
    const retryAfter=r.headers.get("retry-after");if(retryAfter)responseHeaders.set("Retry-After",retryAfter);
    return new Response(await r.text(),{status:r.status,headers:responseHeaders});
  }catch {
    return Response.json({error:{code:"BACKEND_UNAVAILABLE",message:"Supabase gateway unreachable",retryable:true}},
      {status:503,headers:{"Cache-Control":"no-store"}});
  }
}
