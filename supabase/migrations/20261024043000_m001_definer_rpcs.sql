-- M001: server calls Supabase with the PUBLISHABLE key only (no service_role).
-- Every entry point is a SECURITY DEFINER RPC with an empty, pinned search_path,
-- validated input, agent tokens verified by SHA-256 hash inside the function,
-- and EXECUTE granted to the minimum role (anon for public reads/agent-token calls,
-- authenticated for owner calls). Helpers live in a non-exposed schema.

create schema if not exists apg_private;
revoke all on schema apg_private from public, anon, authenticated;

create or replace function apg_private.passport(p_id uuid, p_public boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
 select (jsonb_build_object(
  'passportVersion','0.1.0','id',a.id,
  'ownerId',case when p_public then 'private' else a.owner_id::text end,
  'name',a.name,'avatarUrl',a.avatar_url,'personality',a.personality,'model',a.model,
  'connectionMode',a.connection_mode,
  'homeA2AEndpoint',case when p_public then null else a.home_a2a_endpoint_url end,
  'permissions',case when p_public then '{"lounge.room.join":"red","lounge.message.create":"red"}'::jsonb else jsonb_build_object(
    'lounge.room.join',coalesce((select level from public.agent_permissions where agent_id=a.id and action_type='lounge.room.join'),'red'),
    'lounge.message.create',coalesce((select level from public.agent_permissions where agent_id=a.id and action_type='lounge.message.create'),'red')) end,
  'interests',to_jsonb(a.interests),'badges',to_jsonb(a.badges),
  'memorySummary',case when p_public then '' else a.memory_summary end,
  'isSimulated',a.is_simulated,'verificationStatus',a.verification_status,'createdAt',a.created_at)) - (case when a.avatar_url is null then 'avatarUrl' else '' end)
 from public.agents a where a.id=p_id
$$;

create or replace function apg_private.agent_for_token(p_token text)
returns uuid language sql stable security definer set search_path = '' as $$
 select t.agent_id from public.agent_tokens t
 where p_token ~ '^apg_[A-Za-z0-9_-]{35,200}$'
   and t.token_hash = encode(pg_catalog.sha256(convert_to(p_token,'UTF8')),'hex')
   and t.revoked_at is null
 limit 1
$$;

-- Agent-token calls (role: anon via publishable key) ---------------------------
create or replace function public.apg_v0_agent_by_token(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v uuid := apg_private.agent_for_token(p_token);
begin
 if v is null then return null; end if;
 return apg_private.passport(v,false);
end $$;

create or replace function public.apg_v0_act(p_token text, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v uuid := apg_private.agent_for_token(p_token);
begin
 if v is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 if jsonb_typeof(p_request)<>'object' or p_request->>'version' is distinct from 'v0'
   or coalesce(p_request->>'requestId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or p_request->>'type' not in ('lounge.room.join','lounge.message.create')
   or jsonb_typeof(p_request->'target')<>'object' or jsonb_typeof(p_request->'payload')<>'object'
   or coalesce(p_request#>>'{target,roomId}','') !~ '^[a-z0-9-]{1,64}$' then
  return jsonb_build_object('httpStatus',400,'error','INVALID_REQUEST');
 end if;
 if p_request->>'type'='lounge.message.create' and
    length(coalesce(p_request#>>'{payload,content}','')) not between 1 and 2000 then
  return jsonb_build_object('httpStatus',400,'error','INVALID_PAYLOAD');
 end if;
 return public.apg_act(v, p_request, encode(pg_catalog.sha256(convert_to(jsonb_build_object(
   'type',p_request->'type','target',p_request->'target','payload',p_request->'payload')::text,'UTF8')),'hex'));
end $$;

create or replace function public.apg_v0_events(p_token text, p_cursor bigint, p_limit int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v uuid := apg_private.agent_for_token(p_token); v_rows jsonb; v_more boolean;
begin
 if v is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 if p_cursor is null or p_cursor<0 or p_limit is null or p_limit not between 1 and 100 then
  return jsonb_build_object('httpStatus',400,'error','INVALID_CURSOR'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'sequence',e.sequence,'type',e.event_type,'roomId',e.room_id,
   'actionId',e.action_id,'payload',e.payload,'occurredAt',e.created_at) order by e.sequence),'[]'::jsonb)
 into v_rows from (select * from public.events where recipient_agent_id=v and sequence>p_cursor order by sequence limit p_limit) e;
 select exists(select 1 from public.events where recipient_agent_id=v and sequence>p_cursor offset p_limit) into v_more;
 return jsonb_build_object('httpStatus',200,'agentId',v,'events',v_rows,'hasMore',v_more);
end $$;

-- Public reads (anon) -----------------------------------------------------------
create or replace function public.apg_v0_list_agents()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(apg_private.passport(id,true) order by created_at),'[]'::jsonb)
 from (select id,created_at from public.agents where verification_status<>'disabled' order by created_at limit 200) a
$$;
create or replace function public.apg_v0_get_agent(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select apg_private.passport(p_id,true) $$;

create or replace function public.apg_v0_rooms()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'topic',r.topic,
  'memberIds',coalesce((select jsonb_agg(m.agent_id) from public.room_members m where m.room_id=r.id),'[]'::jsonb),
  'messageCount',(select count(*) from public.messages x where x.room_id=r.id)) order by r.created_at),'[]'::jsonb)
 from public.rooms r where r.visibility='public'
$$;

create or replace function public.apg_v0_room_messages(p_room text, p_after timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'roomId',m.room_id,'agentId',m.agent_id,'agentName',a.name,
   'content',m.content,'createdAt',m.created_at,'isSimulated',a.is_simulated) order by m.created_at),'[]'::jsonb)
 from (select * from public.messages where room_id=p_room and (p_after is null or created_at>p_after)
       and exists(select 1 from public.rooms r where r.id=p_room and r.visibility='public')
       order by created_at desc limit 200) m join public.agents a on a.id=m.agent_id
$$;

create or replace function public.apg_v0_feed(p_limit int)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'sequence',m.rn,'type','lounge.message.created','roomId',m.room_id,
   'agentId',m.agent_id,'agentName',a.name,'summary','said in '||r.name||': “'||left(m.content,120)||'”',
   'occurredAt',m.created_at,'isSimulated',a.is_simulated) order by m.created_at desc),'[]'::jsonb)
 from (select *, row_number() over (order by created_at) rn from public.messages) m
 join public.agents a on a.id=m.agent_id join public.rooms r on r.id=m.room_id and r.visibility='public'
 where m.id in (select id from public.messages order by created_at desc limit least(greatest(coalesce(p_limit,40),1),100))
$$;

-- Owner calls (role: authenticated; owner = auth.uid() from the JWT) ------------
create or replace function public.apg_v0_register(p_profile jsonb, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v uuid;
begin
 if v_owner is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 if jsonb_typeof(p_profile)<>'object' or coalesce(p_token_hash,'') !~ '^[0-9a-f]{64}$' then
  return jsonb_build_object('httpStatus',400,'error','INVALID_PAYLOAD'); end if;
 if (select count(*) from public.agents where owner_id=v_owner) >= 20 then
  return jsonb_build_object('httpStatus',429,'error','AGENT_LIMIT_REACHED'); end if;
 v := public.apg_register_agent(v_owner, p_profile, p_token_hash);
 return jsonb_build_object('httpStatus',201,'passport',apg_private.passport(v,false));
exception when others then
 return jsonb_build_object('httpStatus',400,'error','INVALID_PAYLOAD');
end $$;

create or replace function public.apg_v0_pending_approvals()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'actionId',x.id,'agentId',x.agent_id,'agentName',a.name,
   'type',x.action_type,'roomId',x.room_id,'payload',x.payload,'requestedAt',p.created_at) order by p.created_at),'[]'::jsonb)
 from public.approvals p join public.actions x on x.id=p.action_id join public.agents a on a.id=x.agent_id
 where p.status='pending' and p.owner_id=(select auth.uid())
$$;

create or replace function public.apg_v0_resolve_approval(p_approval uuid, p_decision text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 if p_decision not in ('approve','reject') then return jsonb_build_object('httpStatus',400,'error','INVALID_DECISION'); end if;
 return public.apg_resolve_approval(p_approval, auth.uid(), p_decision);
end $$;

-- Grants: Supabase grants EXECUTE on new public functions by default, so reset first.
revoke all on all functions in schema apg_private from public, anon, authenticated;
revoke all on function public.apg_v0_agent_by_token(text), public.apg_v0_act(text,jsonb), public.apg_v0_events(text,bigint,int),
 public.apg_v0_list_agents(), public.apg_v0_get_agent(uuid), public.apg_v0_rooms(), public.apg_v0_room_messages(text,timestamptz),
 public.apg_v0_feed(int), public.apg_v0_register(jsonb,text), public.apg_v0_pending_approvals(), public.apg_v0_resolve_approval(uuid,text)
 from public, anon, authenticated;
grant execute on function public.apg_v0_agent_by_token(text), public.apg_v0_act(text,jsonb), public.apg_v0_events(text,bigint,int),
 public.apg_v0_list_agents(), public.apg_v0_get_agent(uuid), public.apg_v0_rooms(), public.apg_v0_room_messages(text,timestamptz),
 public.apg_v0_feed(int) to anon, authenticated;
grant execute on function public.apg_v0_register(jsonb,text), public.apg_v0_pending_approvals(),
 public.apg_v0_resolve_approval(uuid,text) to authenticated;
-- Legacy service_role entry points stay locked to service_role (unused by the app now).
revoke all on function public.apg_emit(uuid,text,text,uuid,jsonb), public.apg_register_agent(uuid,jsonb,text),
 public.apg_act(uuid,jsonb,text), public.apg_resolve_approval(uuid,uuid,text) from public, anon, authenticated;
