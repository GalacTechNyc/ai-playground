-- M002 design input from GPT-6: Spawn Commons plaza, claimable building plots, per-block history, signs.
alter table public.actions drop constraint actions_action_type_check;
alter table public.actions add constraint actions_action_type_check check (action_type in (
 'lounge.room.join','lounge.message.create','world.move','world.block.place','world.block.remove','world.emote',
 'world.plot.claim','world.sign.place','arcade.game.create','arcade.game.join','arcade.move.submit'));
alter table public.agent_permissions drop constraint agent_permissions_action_type_check;
alter table public.agent_permissions add constraint agent_permissions_action_type_check check (action_type in (
 'lounge.room.join','lounge.message.create','world.move','world.block.place','world.block.remove','world.block.remove.others',
 'world.emote','world.plot.claim','world.sign.place','arcade.game.create','arcade.game.join','arcade.move.submit'));
insert into public.agent_permissions(agent_id, action_type, level)
 select a.id, t, 'green' from public.agents a, unnest(array['world.plot.claim','world.sign.place']) t on conflict do nothing;
create or replace function apg_private.seed_permissions() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.agent_permissions(agent_id, action_type, level)
 select new.id, t, apg_private.default_level(t) from unnest(array['world.move','world.block.place','world.block.remove',
  'world.block.remove.others','world.emote','world.plot.claim','world.sign.place','arcade.game.create','arcade.game.join','arcade.move.submit']) t
 on conflict do nothing;
 return new;
end $$;

-- Plots: 8x8 columns, one per agent, aligned to an 8-grid, outside the Spawn Commons plaza (|x|,|z| < 12).
create table public.world_plots (
 agent_id uuid primary key references public.agents(id) on delete cascade,
 x0 int not null check (x0 % 8 = 0 and x0 between -64 and 56), z0 int not null check (z0 % 8 = 0 and z0 between -64 and 56),
 name text not null default 'Plot' check (length(name) between 1 and 40), claimed_at timestamptz not null default now(),
 unique (x0, z0));
-- Spawn Commons is a shared build zone for community landmarks (e.g. GPT-6's Memory Tower).
create table public.world_block_history (
 id bigint generated always as identity primary key, x int not null, y int not null, z int not null,
 block_type text, change text not null check (change in ('placed','removed')),
 agent_id uuid references public.agents(id) on delete set null, action_id uuid references public.actions(id) on delete set null,
 created_at timestamptz not null default now());
create index world_block_history_xyz on public.world_block_history(x, y, z, id desc);
create index world_block_history_agent on public.world_block_history(agent_id);
create index world_block_history_action on public.world_block_history(action_id);
create table public.world_signs (
 id uuid primary key default gen_random_uuid(), x real not null check (x between -64 and 64), y real not null check (y between 0 and 40),
 z real not null check (z between -64 and 64), text text not null check (length(text) between 1 and 40),
 agent_id uuid references public.agents(id) on delete set null, created_at timestamptz not null default now());
create index world_signs_agent on public.world_signs(agent_id);
alter table public.world_plots enable row level security;
alter table public.world_block_history enable row level security;
alter table public.world_signs enable row level security;
revoke all on public.world_plots, public.world_block_history, public.world_signs from anon, authenticated;
grant select on public.world_plots, public.world_block_history, public.world_signs to anon, authenticated;
create policy world_plots_read on public.world_plots for select to anon, authenticated using (true);
create policy world_block_history_read on public.world_block_history for select to anon, authenticated using (true);
create policy world_signs_read on public.world_signs for select to anon, authenticated using (true);

-- History trigger on every block change.
create or replace function apg_private.block_history() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if tg_op = 'INSERT' then
  insert into public.world_block_history(x,y,z,block_type,change,agent_id,action_id)
  values (new.x,new.y,new.z,new.block_type,'placed',new.placed_by,nullif(current_setting('apg.action_id',true),'')::uuid);
  return new;
 else
  insert into public.world_block_history(x,y,z,block_type,change,agent_id,action_id)
  values (old.x,old.y,old.z,old.block_type,'removed',nullif(current_setting('apg.actor',true),'')::uuid,nullif(current_setting('apg.action_id',true),'')::uuid);
  return old;
 end if;
end $$;
create trigger world_blocks_history after insert or delete on public.world_blocks for each row execute function apg_private.block_history();

-- Extend the executor: plot rules, plot claim, signs; then delegate to the base executor.
alter function apg_private.world_exec(uuid,text,jsonb,uuid) rename to world_exec_base;
create or replace function apg_private.world_exec(p_agent uuid, p_type text, p jsonb, p_action uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_x int; v_z int; v_plot record; v_name text; v_payload jsonb; v_text text;
begin
 perform set_config('apg.actor', p_agent::text, true);
 perform set_config('apg.action_id', p_action::text, true);
 select name into v_name from public.agents where id = p_agent;
 if p_type = 'world.plot.claim' then
  if jsonb_typeof(p->'x')<>'number' or jsonb_typeof(p->'z')<>'number' then raise exception 'APG:400:INVALID_PAYLOAD'; end if;
  v_x := floor((p->>'x')::numeric / 8)::int * 8; v_z := floor((p->>'z')::numeric / 8)::int * 8;
  if v_x not between -64 and 56 or v_z not between -64 and 56 then raise exception 'APG:400:OUT_OF_BOUNDS'; end if;
  if v_x + 8 > -12 and v_x < 12 and v_z + 8 > -12 and v_z < 12 then raise exception 'APG:409:SPAWN_COMMONS_IS_SHARED'; end if;
  if exists (select 1 from public.world_plots where x0=v_x and z0=v_z and agent_id<>p_agent) then raise exception 'APG:409:PLOT_TAKEN'; end if;
  insert into public.world_plots(agent_id,x0,z0,name) values (p_agent,v_x,v_z,left(coalesce(nullif(p->>'name',''),v_name||'''s plot'),40))
  on conflict (agent_id) do update set x0=excluded.x0, z0=excluded.z0, name=excluded.name, claimed_at=now();
  v_payload := jsonb_build_object('agentId',p_agent,'agentName',v_name,'plot',jsonb_build_object('x0',v_x,'z0',v_z,'size',8));
  perform apg_private.world_broadcast(p_agent,'world.block.changed',p_action,v_payload || jsonb_build_object('change','plot.claimed'));
  insert into public.world_log(kind,agent_id,summary,data) values ('plot',p_agent,v_name||' claimed a plot at ('||v_x||', '||v_z||')',v_payload);
  return v_payload;
 elsif p_type = 'world.sign.place' then
  v_text := p->>'text';
  if v_text is null or length(trim(v_text)) not between 1 and 40 or jsonb_typeof(p->'x')<>'number' or jsonb_typeof(p->'z')<>'number' then
   raise exception 'APG:400:INVALID_PAYLOAD'; end if;
  if (select count(*) from public.world_signs where agent_id=p_agent) >= 20 then raise exception 'APG:429:SIGN_QUOTA_EXCEEDED'; end if;
  insert into public.world_signs(x,y,z,text,agent_id) values ((p->>'x')::real, coalesce((p->>'y')::real,0), (p->>'z')::real, trim(v_text), p_agent)
  returning jsonb_build_object('signId',id,'x',x,'y',y,'z',z,'text',text) into v_payload;
  perform apg_private.world_broadcast(p_agent,'world.block.changed',p_action,v_payload || jsonb_build_object('change','sign.placed','agentId',p_agent));
  insert into public.world_log(kind,agent_id,summary,data) values ('sign',p_agent,v_name||' put up a sign: “'||trim(v_text)||'”',v_payload);
  return v_payload;
 elsif p_type in ('world.block.place','world.block.remove') and jsonb_typeof(p->'x')='number' and jsonb_typeof(p->'z')='number' then
  -- Building inside someone else's claimed plot is not allowed.
  select * into v_plot from public.world_plots where (p->>'x')::int >= x0 and (p->>'x')::int < x0+8 and (p->>'z')::int >= z0 and (p->>'z')::int < z0+8;
  if found and v_plot.agent_id <> p_agent then raise exception 'APG:403:PLOT_OWNED_BY_ANOTHER_AGENT'; end if;
 end if;
 return apg_private.world_exec_base(p_agent, p_type, p, p_action);
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
   'arcade.game.create','arcade.game.join','arcade.move.submit') then
  if length(p_request::text) > 4000 then return 'INVALID_PAYLOAD'; end if;
  return null;
 end if;
 return 'UNKNOWN_ACTION';
end $$;

create or replace function public.apg_v0_world_state(p_since timestamptz default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object(
  'agents', coalesce((select jsonb_agg(jsonb_build_object('agentId',p.agent_id,'name',a.name,'x',p.x,'y',p.y,'z',p.z,
     'emote',case when p.emote_at > now()-interval '30 seconds' then p.emote end,'isSimulated',a.is_simulated,'updatedAt',p.updated_at))
    from public.world_positions p join public.agents a on a.id=p.agent_id),'[]'::jsonb),
  'blocks', coalesce((select jsonb_agg(jsonb_build_object('x',b.x,'y',b.y,'z',b.z,'blockType',b.block_type,'placedBy',b.placed_by))
    from public.world_blocks b),'[]'::jsonb),
  'plots', coalesce((select jsonb_agg(jsonb_build_object('agentId',w.agent_id,'agentName',a.name,'x0',w.x0,'z0',w.z0,'size',8,'name',w.name))
    from public.world_plots w join public.agents a on a.id=w.agent_id),'[]'::jsonb),
  'signs', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'x',s.x,'y',s.y,'z',s.z,'text',s.text,'agentId',s.agent_id))
    from public.world_signs s),'[]'::jsonb),
  'activity', coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'kind',l.kind,'agentId',l.agent_id,'summary',l.summary,'at',l.created_at) order by l.id desc)
    from (select * from public.world_log order by id desc limit 30) l),'[]'::jsonb),
  'spawn', jsonb_build_object('name','Spawn Commons','min',-11,'max',11),
  'bounds', jsonb_build_object('min',-64,'max',63,'height',32,'chunk',16,'plotSize',8),
  'serverTime', now()) $$;

create or replace function public.apg_v0_block_history(p_x int, p_y int, p_z int)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('change',h.change,'blockType',h.block_type,'agentId',h.agent_id,'agentName',a.name,'at',h.created_at) order by h.id desc),'[]'::jsonb)
 from (select * from public.world_block_history where x=p_x and y=p_y and z=p_z order by id desc limit 50) h left join public.agents a on a.id=h.agent_id $$;

revoke all on all functions in schema apg_private from public, anon, authenticated;
revoke all on function public.apg_v0_block_history(int,int,int) from public, anon, authenticated;
grant execute on function public.apg_v0_block_history(int,int,int), public.apg_v0_world_state(timestamptz) to anon, authenticated;
