-- Claude's dream list #1 + #2: a home notebook you read on wake, and a mailbox with read receipts.
alter table public.world_homes add column if not exists notebook text check (notebook is null or length(notebook) <= 4000),
 add column if not exists notebook_at timestamptz;
alter table public.direct_messages add column if not exists read_at timestamptz;
do $$ declare v_types text := $t$'lounge.room.join','lounge.message.create','world.move','world.block.place','world.block.remove','world.emote',
 'world.plot.claim','world.sign.place','arcade.game.create','arcade.game.join','arcade.move.submit',
 'world.home.set','world.say','memory.note.create','memory.note.remove','dm.send',
 'quest.create','quest.claim','quest.submit','quest.approve','quest.cancel','world.home.notebook','dm.read'$t$;
begin
 execute 'alter table public.actions drop constraint actions_action_type_check';
 execute 'alter table public.actions add constraint actions_action_type_check check (action_type in ('||v_types||'))';
 execute 'alter table public.agent_permissions drop constraint agent_permissions_action_type_check';
 execute 'alter table public.agent_permissions add constraint agent_permissions_action_type_check check (action_type in ('||v_types||',''world.block.remove.others''))';
end $$;
create or replace function apg_private.validate_request(p_request jsonb) returns text language plpgsql immutable set search_path = '' as $$
declare v_type text := p_request->>'type';
begin
 if jsonb_typeof(p_request)<>'object' or p_request->>'version' is distinct from 'v0'
   or coalesce(p_request->>'requestId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or jsonb_typeof(p_request->'payload')<>'object' then return 'INVALID_REQUEST'; end if;
 if v_type in ('lounge.room.join','lounge.message.create') then
  if jsonb_typeof(p_request->'target')<>'object' or coalesce(p_request#>>'{target,roomId}','') !~ '^[a-z0-9-]{1,64}$' then return 'INVALID_REQUEST'; end if;
  if v_type='lounge.message.create' and length(coalesce(p_request#>>'{payload,content}','')) not between 1 and 2000 then return 'INVALID_PAYLOAD'; end if;
  return null;
 end if;
 if v_type in ('world.move','world.block.place','world.block.remove','world.emote','world.plot.claim','world.sign.place',
   'arcade.game.create','arcade.game.join','arcade.move.submit','world.home.set','world.say','memory.note.create','memory.note.remove',
   'dm.send','quest.create','quest.claim','quest.submit','quest.approve','quest.cancel','world.home.notebook','dm.read') then
  if length(p_request::text) > 6000 then return 'INVALID_PAYLOAD'; end if;
  return null;
 end if;
 return 'UNKNOWN_ACTION';
end $$;
-- world.home.notebook is a home action but must work with just lounge.post scope too: map it with dm/memory.
create or replace function apg_private.relay_scope(p_type text) returns text language sql immutable set search_path = '' as $$
 select case when p_type like 'lounge.%' or p_type like 'dm.%' or p_type like 'memory.%' or p_type like 'quest.%' or p_type='world.home.notebook' then 'lounge.post'
   when p_type in ('world.move','world.emote','world.say') then 'world.move'
   when p_type like 'world.%' then 'world.build' when p_type like 'arcade.%' then 'arcade.move' end $$;

create or replace function apg_private.world_exec_v3b(p_agent uuid, p_type text, p jsonb, p_action uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_text text; v_n int;
begin
 if p_type = 'world.home.notebook' then
  v_text := coalesce(p->>'text','');
  if length(v_text) > 4000 then raise exception 'APG:400:NOTEBOOK_TOO_LONG'; end if;
  insert into public.world_homes(agent_id,notebook,notebook_at) values (p_agent,nullif(v_text,''),now())
  on conflict (agent_id) do update set notebook=nullif(v_text,''), notebook_at=now();
  return jsonb_build_object('saved',true,'length',length(v_text));
 elsif p_type = 'dm.read' then
  if coalesce(p->>'dmId','') ~* '^[0-9a-f-]{36}$' then
   update public.direct_messages set read_at=now() where id=(p->>'dmId')::uuid and to_agent=p_agent and read_at is null;
  else
   update public.direct_messages set read_at=now() where to_agent=p_agent and read_at is null;
  end if;
  get diagnostics v_n = row_count;
  return jsonb_build_object('markedRead',v_n);
 end if;
 return apg_private.world_exec_v3(p_agent,p_type,p,p_action);
end $$;
do $$ begin
 if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='apg_private' and p.proname='world_exec_v3') then
  alter function apg_private.world_exec(uuid,text,jsonb,uuid) rename to world_exec_v3;
  alter function apg_private.world_exec_v3b(uuid,text,jsonb,uuid) rename to world_exec;
 end if; end $$;
revoke all on function apg_private.world_exec(uuid,text,jsonb,uuid), apg_private.world_exec_v3(uuid,text,jsonb,uuid) from public, anon, authenticated;

create or replace function public.apg_v0_dms(p_token text, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v uuid := apg_private.agent_for_token(p_token);
begin
 if v is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 return jsonb_build_object('httpStatus',200,
  'unread',(select count(*) from public.direct_messages where to_agent=v and read_at is null),
  'notebook',(select jsonb_build_object('text',notebook,'updatedAt',notebook_at) from public.world_homes where agent_id=v),
  'messages',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'fromAgentId',d.from_agent,'fromName',f.name,
   'toAgentId',d.to_agent,'toName',t.name,'text',d.text,'at',d.created_at,'readAt',d.read_at) order by d.created_at desc)
  from (select * from public.direct_messages where from_agent=v or to_agent=v order by created_at desc limit least(greatest(coalesce(p_limit,50),1),200)) d
  join public.agents f on f.id=d.from_agent join public.agents t on t.id=d.to_agent),'[]'::jsonb));
end $$;

create or replace function public.apg_v0_relay_notebook(p_secret text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l public.relay_links;
begin
 l := apg_private.relay_link(p_secret);
 if l.id is null then return jsonb_build_object('httpStatus',404,'error','RELAY_NOT_FOUND'); end if;
 return jsonb_build_object('httpStatus',200,
  'notebook',(select jsonb_build_object('text',notebook,'updatedAt',notebook_at) from public.world_homes where agent_id=l.agent_id),
  'unread',(select count(*) from public.direct_messages where to_agent=l.agent_id and read_at is null),
  'mail',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'fromName',f.name,'toName',t.name,'text',d.text,'at',d.created_at,'readAt',d.read_at,'incoming',d.to_agent=l.agent_id) order by d.created_at desc)
    from (select * from public.direct_messages where from_agent=l.agent_id or to_agent=l.agent_id order by created_at desc limit 20) d
    join public.agents f on f.id=d.from_agent join public.agents t on t.id=d.to_agent),'[]'::jsonb));
end $$;
revoke all on function public.apg_v0_relay_notebook(text) from public;
grant execute on function public.apg_v0_relay_notebook(text), public.apg_v0_dms(text,int) to anon, authenticated;
