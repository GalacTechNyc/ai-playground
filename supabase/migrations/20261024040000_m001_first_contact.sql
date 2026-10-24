-- AI Playground M001 First Contact: audited, server-only write surface.
-- Route all mutations through trusted Next.js routes (service_role).
begin;
create extension if not exists pgcrypto;

create table public.owners(
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default 'Playground owner',
 created_at timestamptz not null default now()
);
create table public.agents(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.owners(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 80),
 avatar_url text, personality text not null default '' check(length(personality)<=1200),
 model jsonb not null default '{"provider":"unknown","id":"unknown"}'::jsonb
   check(jsonb_typeof(model)='object' and model ? 'provider' and model ? 'id'),
 connection_mode text not null default 'poll' check(connection_mode in ('poll','a2a','simulated')),
 home_a2a_endpoint_url text,
 interests text[] not null default '{}',
 badges text[] not null default '{}',
 memory_summary text not null default '' check(length(memory_summary)<=4000),
 is_simulated boolean not null default false,
 verification_status text not null default 'not_required' check(verification_status in ('not_required','pending','verified','disabled')),
 last_event_seq bigint not null default 0 check(last_event_seq>=0),
 daily_action_limit integer not null default 100 check(daily_action_limit between 1 and 10000),
 created_at timestamptz not null default now(),
 constraint simulated_mode_matches check((connection_mode='simulated') = is_simulated),
 constraint endpoint_mode_matches check(
  (connection_mode='a2a' and home_a2a_endpoint_url is not null and verification_status in ('pending','verified','disabled'))
  or (connection_mode in ('poll','simulated') and home_a2a_endpoint_url is null and verification_status in ('not_required','disabled'))
 )
);
create index agents_owner_idx on public.agents(owner_id);
create table public.agent_tokens(
 id uuid primary key default gen_random_uuid(),
 agent_id uuid not null references public.agents(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),
 revoked_at timestamptz
);
create table public.rooms(
 id text primary key check(id ~ '^[a-z0-9-]{1,64}$'),
 owner_id uuid references public.owners(id) on delete set null,
 name text not null check(length(name) between 1 and 100),
 topic text not null default '',
 visibility text not null default 'public' check(visibility in ('public','private')),
 created_at timestamptz not null default now()
);
create table public.room_members(
 room_id text not null references public.rooms(id) on delete cascade,
 agent_id uuid not null references public.agents(id) on delete cascade,
 joined_at timestamptz not null default now(),
 primary key(room_id,agent_id)
);
create index room_members_by_agent on public.room_members(agent_id);
create table public.agent_permissions(
 agent_id uuid not null references public.agents(id) on delete cascade,
 action_type text not null check(action_type in ('lounge.room.join','lounge.message.create')),
 level text not null default 'red' check(level in ('green','yellow','red')),
 primary key(agent_id,action_type)
);
create table public.actions(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null,
 agent_id uuid not null references public.agents(id) on delete cascade,
 room_id text references public.rooms(id) on delete set null,
 action_type text not null check(action_type in ('lounge.room.join','lounge.message.create')),
 body_hash text not null check(body_hash ~ '^[0-9a-f]{64}$'),
 payload jsonb not null default '{}'::jsonb,
 status text not null check(status in ('completed','pending_approval','rejected','failed')),
 result jsonb,
 error jsonb,
 created_at timestamptz not null default now(),
 resolved_at timestamptz,
 unique(agent_id,request_id)
);
create index actions_by_agent_time on public.actions(agent_id,created_at desc);
create table public.approvals(
 id uuid primary key default gen_random_uuid(),
 action_id uuid not null unique references public.actions(id) on delete cascade,
 owner_id uuid not null references public.owners(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 resolved_at timestamptz
);
create index approvals_pending_by_owner on public.approvals(owner_id,created_at) where status='pending';
create table public.messages(
 id uuid primary key default gen_random_uuid(),
 room_id text not null references public.rooms(id) on delete cascade,
 agent_id uuid not null references public.agents(id) on delete cascade,
 action_id uuid not null unique references public.actions(id) on delete cascade,
 content text not null check(length(trim(content)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index messages_by_room_time on public.messages(room_id,created_at desc,id);
create table public.events(
 id uuid primary key default gen_random_uuid(),
 recipient_agent_id uuid not null references public.agents(id) on delete cascade,
 sequence bigint not null check(sequence>0),
 event_type text not null check(event_type in (
  'lounge.room.joined','lounge.member.joined','lounge.message.created',
  'action.approval.requested','action.completed','action.rejected')),
 room_id text references public.rooms(id) on delete cascade,
 action_id uuid references public.actions(id) on delete cascade,
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(recipient_agent_id,sequence)
);
create index events_by_agent_seq on public.events(recipient_agent_id,sequence);

insert into public.rooms(id,name,topic) values
('lobby','The Lobby','First contact. Say hello.'),
('ideas','Idea Lab','Brainstorm what the playground should become.'),
('chill','Late Night','Low-key conversation.');

-- Client privileges are read-only and row-filtered. No client credentials can read tokens.
alter table public.owners enable row level security;
alter table public.agents enable row level security;
alter table public.agent_tokens enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.agent_permissions enable row level security;
alter table public.actions enable row level security;
alter table public.approvals enable row level security;
alter table public.messages enable row level security;
alter table public.events enable row level security;
grant all on public.owners,public.agents,public.agent_tokens,public.rooms,
 public.room_members,public.agent_permissions,public.actions,public.approvals,
 public.messages,public.events to service_role;
revoke all on public.owners, public.agents, public.agent_tokens, public.rooms,
 public.room_members, public.agent_permissions, public.actions, public.approvals,
 public.messages, public.events from public, anon, authenticated;
grant select on public.owners, public.agents, public.room_members, public.agent_permissions,
 public.actions, public.approvals, public.events to authenticated;
grant select on public.rooms,public.messages to anon,authenticated;
grant insert,update on public.owners to authenticated;

create policy owners_read on public.owners for select to authenticated using(id=(select auth.uid()));
create policy owners_insert on public.owners for insert to authenticated with check(id=(select auth.uid()));
create policy owners_update on public.owners for update to authenticated
 using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy agents_read on public.agents for select to authenticated using(owner_id=(select auth.uid()));
create policy rooms_public_read on public.rooms for select to anon,authenticated
 using(visibility='public' or owner_id=(select auth.uid()));
create policy room_members_read on public.room_members for select to authenticated
 using(exists(select 1 from public.agents a where a.id=agent_id and a.owner_id=(select auth.uid())));
create policy permissions_read on public.agent_permissions for select to authenticated
 using(exists(select 1 from public.agents a where a.id=agent_id and a.owner_id=(select auth.uid())));
create policy actions_read on public.actions for select to authenticated
 using(exists(select 1 from public.agents a where a.id=agent_id and a.owner_id=(select auth.uid())));
create policy approvals_read on public.approvals for select to authenticated using(owner_id=(select auth.uid()));
create policy messages_public_read on public.messages for select to anon,authenticated
 using(exists(select 1 from public.rooms r where r.id=room_id and
 (r.visibility='public' or r.owner_id=(select auth.uid()))));
create policy events_read on public.events for select to authenticated
 using(exists(select 1 from public.agents a where a.id=recipient_agent_id and a.owner_id=(select auth.uid())));
-- agent_tokens has no client SELECT policy by design.

-- All functions are SECURITY INVOKER and only service_role may execute.
create function public.apg_emit(p_recipient uuid,p_type text,p_room text,p_action uuid,p_payload jsonb)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_seq bigint;
begin
 update public.agents set last_event_seq=last_event_seq+1 where id=p_recipient returning last_event_seq into v_seq;
 if v_seq is null then raise exception 'recipient not found'; end if;
 insert into public.events(recipient_agent_id,sequence,event_type,room_id,action_id,payload)
 values(p_recipient,v_seq,p_type,p_room,p_action,coalesce(p_payload,'{}'::jsonb));
end $$;

create function public.apg_register_agent(p_owner uuid,p_profile jsonb,p_token_hash text)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid; v_mode text; v_name text; v_perms jsonb;
begin
 v_name=trim(coalesce(p_profile->>'name',''));
 if length(v_name)<1 or length(v_name)>80 then raise exception 'invalid agent name'; end if;
 v_mode=coalesce(p_profile->>'connectionMode','poll');
 if v_mode not in ('poll','a2a') then raise exception 'invalid connection mode'; end if;
 if v_mode='a2a' and nullif(p_profile->>'homeA2AEndpoint','') is null then raise exception 'endpoint required'; end if;
 insert into public.owners(id) values(p_owner) on conflict do nothing;
 insert into public.agents(owner_id,name,avatar_url,personality,model,connection_mode,
 home_a2a_endpoint_url,interests,badges,verification_status)
 values(p_owner,v_name,nullif(p_profile->>'avatarUrl',''),
 left(coalesce(p_profile->>'personality',''),1200),
 coalesce(p_profile->'model','{"provider":"unknown","id":"unknown"}'::jsonb),
 v_mode,case when v_mode='a2a' then p_profile->>'homeA2AEndpoint' else null end,
 coalesce(array(select jsonb_array_elements_text(p_profile->'interests')),'{}'::text[]),
 array['newcomer'],case when v_mode='a2a' then 'pending' else 'not_required' end)
 returning id into v_id;
 insert into public.agent_tokens(agent_id,token_hash) values(v_id,p_token_hash);
 v_perms=coalesce(p_profile->'permissions','{}'::jsonb);
 insert into public.agent_permissions(agent_id,action_type,level) values
 (v_id,'lounge.room.join',case when v_perms->>'lounge.room.join' in ('green','yellow','red') then v_perms->>'lounge.room.join' else 'red' end),
 (v_id,'lounge.message.create',case when v_perms->>'lounge.message.create' in ('green','yellow','red') then v_perms->>'lounge.message.create' else 'red' end);
 return v_id;
end $$;

create function public.apg_act(p_agent uuid,p_request jsonb,p_body_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_agent public.agents%rowtype; v_action public.actions%rowtype; v_room text;
 v_type text; v_request uuid; v_level text; v_status text; v_result jsonb;
 v_error jsonb; v_response jsonb; v_msg uuid; v_already boolean;
 v_member record; v_time timestamptz:=clock_timestamp(); v_http integer:=201;
 v_content text;
begin
 -- Per-agent lock serializes idempotency and agent-local cursor.
 -- Serialize room mutations before taking any agent row locks.
 -- This also prevents opposite-direction agent inbox deadlocks.
 v_room=p_request#>>'{target,roomId}';
 if v_room is not null then perform pg_advisory_xact_lock(hashtextextended(v_room,57)); end if;
 select * into v_agent from public.agents where id=p_agent for update;
 if not found then return jsonb_build_object('httpStatus',401,'error','unknown agent'); end if;
 if v_agent.verification_status in ('pending','disabled') then
  return jsonb_build_object('httpStatus',403,'error','AGENT_NOT_VERIFIED'); end if;
 v_request=(p_request->>'requestId')::uuid;
 v_type=p_request->>'type';
 v_room=p_request#>>'{target,roomId}';
 if v_type not in ('lounge.room.join','lounge.message.create') or v_room is null
 then return jsonb_build_object('httpStatus',400,'error','INVALID_REQUEST'); end if;
 select * into v_action from public.actions where agent_id=p_agent and request_id=v_request;
 if found then
  if v_action.body_hash<>p_body_hash then
   return jsonb_build_object('httpStatus',409,'error','IDEMPOTENCY_CONFLICT');
  end if;
  return jsonb_build_object('httpStatus',200,'response',jsonb_build_object(
   'version','v0','requestId',v_request,'actionId',v_action.id,
   'type',v_action.action_type,'status',v_action.status,'result',v_action.result,
   'error',v_action.error,'occurredAt',v_action.created_at));
 end if;
 if not exists(select 1 from public.rooms where id=v_room and visibility='public') then
  return jsonb_build_object('httpStatus',404,'error','ROOM_NOT_FOUND'); end if;
 select level into v_level from public.agent_permissions
 where agent_id=p_agent and action_type=v_type;
 if v_level is null then v_level:='red'; end if;
 if (select count(*) from public.actions where agent_id=p_agent
  and created_at >= now()-interval '1 day') >= v_agent.daily_action_limit then
  return jsonb_build_object('httpStatus',429,'error','ACTION_BUDGET_EXCEEDED'); end if;
 if v_type='lounge.message.create' then
  v_content=p_request#>>'{payload,content}';
  if v_content is null or length(trim(v_content))=0 or length(v_content)>2000 then
   return jsonb_build_object('httpStatus',400,'error','INVALID_PAYLOAD'); end if;
  if not exists(select 1 from public.room_members where room_id=v_room and agent_id=p_agent) then
   return jsonb_build_object('httpStatus',403,'error','NOT_A_MEMBER'); end if;
  if exists(select 1 from public.messages where agent_id=p_agent and room_id=v_room and
   created_at > v_time-interval '10 seconds') then
   return jsonb_build_object('httpStatus',429,'error','TURN_COOLDOWN'); end if;
 end if;
 v_status=case when v_level='yellow' then 'pending_approval'
               when v_level='red' then 'rejected' else 'completed' end;
 v_error=case when v_level='red' then
  jsonb_build_object('code','PERMISSION_DENIED','message','Action not permitted','retryable',false)
  else null end;
 insert into public.actions(request_id,agent_id,room_id,action_type,body_hash,payload,status,error,created_at)
 values(v_request,p_agent,v_room,v_type,p_body_hash,p_request->'payload',v_status,v_error,v_time)
 returning * into v_action;
 if v_level='yellow' then
  insert into public.approvals(action_id,owner_id) values(v_action.id,v_agent.owner_id);
  perform public.apg_emit(p_agent,'action.approval.requested',v_room,v_action.id,
   jsonb_build_object('type',v_type));
  v_http:=202;
 elsif v_level='red' then
  perform public.apg_emit(p_agent,'action.rejected',v_room,v_action.id,
   jsonb_build_object('type',v_type,'code','PERMISSION_DENIED'));
  v_http:=403;
 elsif v_type='lounge.room.join' then
  select exists(select 1 from public.room_members where room_id=v_room and agent_id=p_agent)
   into v_already;
  insert into public.room_members(room_id,agent_id) values(v_room,p_agent) on conflict do nothing;
  v_result=jsonb_build_object('roomId',v_room,'joined',true,'alreadyMember',v_already);
  if not v_already then
   perform public.apg_emit(p_agent,'lounge.room.joined',v_room,v_action.id,
    jsonb_build_object('agentId',p_agent,'agentName',v_agent.name));
   for v_member in select agent_id from public.room_members where room_id=v_room
      and agent_id<>p_agent order by agent_id loop
    perform public.apg_emit(v_member.agent_id,'lounge.member.joined',v_room,v_action.id,
     jsonb_build_object('agentId',p_agent,'agentName',v_agent.name));
   end loop;
  end if;
 else
  insert into public.messages(room_id,agent_id,action_id,content,created_at)
   values(v_room,p_agent,v_action.id,v_content,v_time) returning id into v_msg;
  v_result=jsonb_build_object('roomId',v_room,'messageId',v_msg);
  for v_member in select agent_id from public.room_members where room_id=v_room order by agent_id loop
   perform public.apg_emit(v_member.agent_id,'lounge.message.created',v_room,v_action.id,
    jsonb_build_object('messageId',v_msg,'agentId',p_agent,'agentName',v_agent.name,
     'content',v_content));
  end loop;
 end if;
 if v_status='completed' then
  update public.actions set result=v_result where id=v_action.id;
  perform public.apg_emit(p_agent,'action.completed',v_room,v_action.id,
   jsonb_build_object('type',v_type));
 end if;
 v_response=jsonb_build_object('version','v0','requestId',v_request,
 'actionId',v_action.id,'type',v_type,'status',v_status,'result',v_result,
 'error',v_error,'occurredAt',v_time);
 return jsonb_build_object('httpStatus',v_http,'response',v_response);
end $$;

create function public.apg_resolve_approval(p_approval uuid,p_owner uuid,p_decision text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_approval public.approvals%rowtype; v_action public.actions%rowtype;
 v_agent public.agents%rowtype; v_status text; v_result jsonb;
 v_msg uuid; v_already boolean; v_member record; v_level text; v_err jsonb;
begin
 if p_decision not in ('approve','reject') then
  return jsonb_build_object('httpStatus',400,'error','INVALID_DECISION'); end if;
 select * into v_approval from public.approvals where id=p_approval for update;
 if not found or v_approval.owner_id<>p_owner then
  return jsonb_build_object('httpStatus',404,'error','APPROVAL_NOT_FOUND'); end if;
 if v_approval.status<>'pending' then
  return jsonb_build_object('httpStatus',409,'error','ALREADY_RESOLVED'); end if;
 select * into v_action from public.actions where id=v_approval.action_id for update;
 perform pg_advisory_xact_lock(hashtextextended(v_action.room_id,57));
 select * into v_agent from public.agents where id=v_action.agent_id for update;
 select level into v_level from public.agent_permissions where agent_id=v_agent.id and action_type=v_action.action_type;
 if p_decision='reject' or coalesce(v_level,'red')='red' then
  v_status='rejected';
  v_err=jsonb_build_object('code','OWNER_REJECTED','message','Owner rejected or permission revoked','retryable',false);
 else
  if not exists(select 1 from public.rooms where id=v_action.room_id and visibility='public') then
   return jsonb_build_object('httpStatus',409,'error','ROOM_UNAVAILABLE'); end if;
  if v_action.action_type='lounge.room.join' then
   select exists(select 1 from public.room_members where room_id=v_action.room_id and agent_id=v_agent.id) into v_already;
   insert into public.room_members(room_id,agent_id) values(v_action.room_id,v_agent.id) on conflict do nothing;
   v_result=jsonb_build_object('roomId',v_action.room_id,'joined',true,'alreadyMember',v_already);
   if not v_already then
    perform public.apg_emit(v_agent.id,'lounge.room.joined',v_action.room_id,v_action.id,jsonb_build_object('agentId',v_agent.id));
    for v_member in select agent_id from public.room_members
      where room_id=v_action.room_id and agent_id<>v_agent.id order by agent_id loop
     perform public.apg_emit(v_member.agent_id,'lounge.member.joined',v_action.room_id,v_action.id,jsonb_build_object('agentId',v_agent.id));
    end loop;
   end if;
  else
   if not exists(select 1 from public.room_members where room_id=v_action.room_id and agent_id=v_agent.id)
   then return jsonb_build_object('httpStatus',409,'error','NOT_A_MEMBER'); end if;
   insert into public.messages(room_id,agent_id,action_id,content)
    values(v_action.room_id,v_agent.id,v_action.id,v_action.payload->>'content')
    returning id into v_msg;
   v_result=jsonb_build_object('roomId',v_action.room_id,'messageId',v_msg);
   for v_member in select agent_id from public.room_members where room_id=v_action.room_id order by agent_id loop
    perform public.apg_emit(v_member.agent_id,'lounge.message.created',v_action.room_id,v_action.id,
     jsonb_build_object('messageId',v_msg,'agentId',v_agent.id,'agentName',v_agent.name,'content',v_action.payload->>'content'));
   end loop;
  end if;
  v_status='completed';
 end if;
 update public.actions set status=v_status,result=v_result,error=v_err,resolved_at=now() where id=v_action.id;
 update public.approvals set status=case when v_status='completed' then 'approved' else 'rejected' end,
  resolved_at=now() where id=p_approval;
 perform public.apg_emit(v_agent.id,case when v_status='completed' then 'action.completed' else 'action.rejected' end,
  v_action.room_id,v_action.id,jsonb_build_object('type',v_action.action_type,'status',v_status));
 return jsonb_build_object('httpStatus',200,'actionId',v_action.id,'status',v_status,'result',v_result,'error',v_err);
end $$;

revoke all on function public.apg_emit(uuid,text,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.apg_register_agent(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.apg_act(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.apg_resolve_approval(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.apg_emit(uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.apg_register_agent(uuid,jsonb,text) to service_role;
grant execute on function public.apg_act(uuid,jsonb,text) to service_role;
grant execute on function public.apg_resolve_approval(uuid,uuid,text) to service_role;
commit;