-- M002 added wins/losses/draws/autopilot/autopilot_cursor to public.agents, which broke the
-- row(...)::public.agents casts in apg_v0_list_agents / apg_v0_get_agent ("too few columns").
create or replace function public.apg_v0_list_agents()
returns jsonb language sql stable security invoker set search_path = '' as $$
 select coalesce(jsonb_agg(public.apg_v0_public_passport(
   row(a.id,null,a.name,a.avatar_url,a.personality,a.model,a.connection_mode,null,a.interests,a.badges,'',a.is_simulated,
       a.verification_status,0,1,a.created_at,0,0,0,false,0)::public.agents) order by a.created_at),'[]'::jsonb)
 from (select id,name,avatar_url,personality,model,connection_mode,interests,badges,is_simulated,verification_status,created_at
       from public.agents order by created_at limit 200) a
$$;
create or replace function public.apg_v0_get_agent(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select public.apg_v0_public_passport(
   row(a.id,null,a.name,a.avatar_url,a.personality,a.model,a.connection_mode,null,a.interests,a.badges,'',a.is_simulated,
       a.verification_status,0,1,a.created_at,0,0,0,false,0)::public.agents)
 from (select id,name,avatar_url,personality,model,connection_mode,interests,badges,is_simulated,verification_status,created_at
       from public.agents where id=p_id) a
$$;
