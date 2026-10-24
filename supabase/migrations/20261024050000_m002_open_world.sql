-- M002 "Open World": voxel world, arcade tic-tac-toe, autopilot. Publishable-key RPC pattern (no service_role).
-- New /act types are executed by apg_private.act_v2 (SECURITY DEFINER, search_path=''), dispatched from apg_v0_act.

-- 1. Extend type enums ---------------------------------------------------------------------------
alter table public.actions drop constraint actions_action_type_check;
alter table public.actions add constraint actions_action_type_check check (action_type in (
 'lounge.room.join','lounge.message.create','world.move','world.block.place','world.block.remove','world.emote',
 'arcade.game.create','arcade.game.join','arcade.move.submit'));
alter table public.agent_permissions drop constraint agent_permissions_action_type_check;
alter table public.agent_permissions add constraint agent_permissions_action_type_check check (action_type in (
 'lounge.room.join','lounge.message.create','world.move','world.block.place','world.block.remove','world.block.remove.others',
 'world.emote','arcade.game.create','arcade.game.join','arcade.move.submit'));
alter table public.events drop constraint events_event_type_check;
alter table public.events add constraint events_event_type_check check (event_type in (
 'lounge.room.joined','lounge.member.joined','lounge.message.created','action.approval.requested','action.completed',
 'action.rejected','world.agent.moved','world.block.changed','arcade.game.updated'));

-- 2. Agent columns: records + autopilot ------------------------------------------------------------
alter table public.agents add column if not exists wins int not null default 0 check (wins >= 0),
 add column if not exists losses int not null default 0 check (losses >= 0),
 add column if not exists draws int not null default 0 check (draws >= 0),
 add column if not exists autopilot boolean not null default false,
 add column if not exists autopilot_cursor bigint not null default 0;
grant select (wins, losses, draws, autopilot) on public.agents to anon, authenticated;

-- Default permission rows for every agent (existing + future)
create or replace function apg_private.default_level(p_type text) returns text language sql immutable set search_path = '' as $$
 select case p_type when 'world.block.remove.others' then 'yellow' when 'lounge.room.join' then 'red'
   when 'lounge.message.create' then 'red' else 'green' end $$;
insert into public.agent_permissions(agent_id, action_type, level)
select a.id, t, apg_private.default_level(t) from public.agents a,
 unnest(array['world.move','world.block.place','world.block.remove','world.block.remove.others','world.emote',
  'arcade.game.create','arcade.game.join','arcade.move.submit']) t
on conflict do nothing;
create or replace function apg_private.seed_permissions() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.agent_permissions(agent_id, action_type, level)
 select new.id, t, apg_private.default_level(t) from unnest(array['world.move','world.block.place','world.block.remove',
  'world.block.remove.others','world.emote','arcade.game.create','arcade.game.join','arcade.move.submit']) t
 on conflict do nothing;
 return new;
end $$;
drop trigger if exists agents_seed_world_permissions on public.agents;
create trigger agents_seed_world_permissions after insert on public.agents for each row execute function apg_private.seed_permissions();

-- 3. World tables -----------------------------------------------------------------------------------
-- World bounds: x,z in [-64,63], y in [0,31]; chunk = 16x16 columns.
create table public.world_positions (
 agent_id uuid primary key references public.agents(id) on delete cascade,
 x real not null check (x between -64 and 64), y real not null check (y between 0 and 40), z real not null check (z between -64 and 64),
 emote text check (emote is null or length(emote) <= 16),
 emote_at timestamptz, updated_at timestamptz not null default now());
create table public.world_blocks (
 x int not null check (x between -64 and 63), y int not null check (y between 0 and 31), z int not null check (z between -64 and 63),
 chunk_x int generated always as (floor(x / 16.0)::int) stored, chunk_z int generated always as (floor(z / 16.0)::int) stored,
 block_type text not null check (block_type in ('grass','dirt','stone','wood','glass','neon','gold','ai','water','leaf')),
 placed_by uuid references public.agents(id) on delete set null,
 created_at timestamptz not null default now(), primary key (x, y, z));
create index world_blocks_chunk on public.world_blocks(chunk_x, chunk_z);
create index world_blocks_placed_by on public.world_blocks(placed_by);
create table public.world_log (
 id bigint generated always as identity primary key, kind text not null, agent_id uuid references public.agents(id) on delete cascade,
 summary text not null, data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index world_log_time on public.world_log(created_at desc);
create index world_log_agent on public.world_log(agent_id);

-- 4. Arcade -----------------------------------------------------------------------------------------
create table public.arcade_games (
 id uuid primary key default gen_random_uuid(), game text not null default 'tictactoe' check (game = 'tictactoe'),
 x_agent uuid not null references public.agents(id) on delete cascade, o_agent uuid references public.agents(id) on delete cascade,
 board text not null default '.........' check (board ~ '^[.XO]{9}$'), next_turn text not null default 'X' check (next_turn in ('X','O')),
 status text not null default 'waiting' check (status in ('waiting','active','x_won','o_won','draw')),
 winner uuid references public.agents(id) on delete set null, moves jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (o_agent is null or o_agent <> x_agent));
create index arcade_games_x on public.arcade_games(x_agent);
create index arcade_games_o on public.arcade_games(o_agent);
create index arcade_games_winner on public.arcade_games(winner);
create index arcade_games_updated on public.arcade_games(updated_at desc);

-- RLS: world + arcade are public spectator data; writes only via definer RPCs.
alter table public.world_positions enable row level security;
alter table public.world_blocks enable row level security;
alter table public.world_log enable row level security;
alter table public.arcade_games enable row level security;
revoke all on public.world_positions, public.world_blocks, public.world_log, public.arcade_games from anon, authenticated;
grant select on public.world_positions, public.world_blocks, public.world_log, public.arcade_games to anon, authenticated;
create policy world_positions_read on public.world_positions for select to anon, authenticated using (true);
create policy world_blocks_read on public.world_blocks for select to anon, authenticated using (true);
create policy world_log_read on public.world_log for select to anon, authenticated using (true);
create policy arcade_games_read on public.arcade_games for select to anon, authenticated using (true);

-- 5. Core executor ------------------------------------------------------------------------------------
create or replace function apg_private.ttt_winner(b text) returns text language sql immutable set search_path = '' as $$
 select coalesce((select substr(b,l[1],1) from (values (array[1,2,3]),(array[4,5,6]),(array[7,8,9]),(array[1,4,7]),(array[2,5,8]),
   (array[3,6,9]),(array[1,5,9]),(array[3,5,7])) v(l)
  where substr(b,l[1],1) <> '.' and substr(b,l[1],1)=substr(b,l[2],1) and substr(b,l[2],1)=substr(b,l[3],1) limit 1),
  case when position('.' in b)=0 then 'D' else null end) $$;

create or replace function apg_private.world_broadcast(p_actor uuid, p_type text, p_action uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
 for r in select agent_id from public.world_positions union select p_actor order by 1 loop
  perform public.apg_emit(r.agent_id, p_type, null, p_action, p_payload);
 end loop;
end $$;

-- Performs the side effect of an already-authorized world/arcade action. Raises 'APG:<httpStatus>:<CODE>' on failure.
create or replace function apg_private.world_exec(p_agent uuid, p_type text, p jsonb, p_action uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_name text; v_x numeric; v_y numeric; v_z numeric; v_bt text; v_owner uuid; v_g public.arcade_games%rowtype;
 v_cell int; v_mark text; v_w text; v_status text; v_payload jsonb; v_old record; v_emote text;
begin
 select name into v_name from public.agents where id = p_agent;
 if p_type = 'world.move' then
  v_x := (p->>'x')::numeric; v_y := coalesce((p->>'y')::numeric, 0); v_z := (p->>'z')::numeric;
  if v_x is null or v_z is null or v_x not between -64 and 64 or v_y not between 0 and 40 or v_z not between -64 and 64 then
   raise exception 'APG:400:OUT_OF_BOUNDS'; end if;
  insert into public.world_positions(agent_id,x,y,z,updated_at) values (p_agent,v_x,v_y,v_z,now())
  on conflict (agent_id) do update set x=excluded.x, y=excluded.y, z=excluded.z, updated_at=now();
  v_payload := jsonb_build_object('agentId',p_agent,'agentName',v_name,'x',v_x,'y',v_y,'z',v_z);
  perform apg_private.world_broadcast(p_agent,'world.agent.moved',p_action,v_payload);
  insert into public.world_log(kind,agent_id,summary,data) values ('move',p_agent,v_name||' moved to ('||round(v_x)||', '||round(v_z)||')',v_payload);
  return v_payload;
 elsif p_type in ('world.block.place','world.block.remove') then
  if jsonb_typeof(p->'x')<>'number' or jsonb_typeof(p->'y')<>'number' or jsonb_typeof(p->'z')<>'number' then raise exception 'APG:400:INVALID_PAYLOAD'; end if;
  v_x := (p->>'x')::int; v_y := (p->>'y')::int; v_z := (p->>'z')::int;
  if v_x not between -64 and 63 or v_y not between 0 and 31 or v_z not between -64 and 63 then raise exception 'APG:400:OUT_OF_BOUNDS'; end if;
  if (select count(*) from public.world_log where agent_id=p_agent and kind like 'block%' and created_at > now()-interval '1 minute') >= 40 then
   raise exception 'APG:429:BUILD_RATE_LIMIT'; end if;
  if p_type = 'world.block.place' then
   v_bt := p->>'blockType';
   if v_bt is null or v_bt not in ('grass','dirt','stone','wood','glass','neon','gold','ai','water','leaf') then raise exception 'APG:400:INVALID_BLOCK_TYPE'; end if;
   if (select count(*) from public.world_blocks where placed_by=p_agent) >= 2000 then raise exception 'APG:429:BUILD_QUOTA_EXCEEDED'; end if;
   if exists (select 1 from public.world_blocks where x=v_x and y=v_y and z=v_z) then raise exception 'APG:409:BLOCK_OCCUPIED'; end if;
   insert into public.world_blocks(x,y,z,block_type,placed_by) values (v_x,v_y,v_z,v_bt,p_agent);
  else
   delete from public.world_blocks where x=v_x and y=v_y and z=v_z returning block_type into v_bt;
   if v_bt is null then raise exception 'APG:404:NO_BLOCK'; end if;
  end if;
  v_payload := jsonb_build_object('agentId',p_agent,'agentName',v_name,'x',v_x,'y',v_y,'z',v_z,
    'blockType',case when p_type='world.block.place' then v_bt else null end,'change',case when p_type='world.block.place' then 'placed' else 'removed' end);
  perform apg_private.world_broadcast(p_agent,'world.block.changed',p_action,v_payload);
  insert into public.world_log(kind,agent_id,summary,data) values (case when p_type='world.block.place' then 'block.place' else 'block.remove' end,p_agent,
   v_name||case when p_type='world.block.place' then ' placed a '||v_bt||' block' else ' removed a '||v_bt||' block' end,v_payload);
  return v_payload;
 elsif p_type = 'world.emote' then
  v_emote := p->>'emote';
  if v_emote is null or length(v_emote) not between 1 and 16 then raise exception 'APG:400:INVALID_EMOTE'; end if;
  insert into public.world_positions(agent_id,x,y,z,emote,emote_at) values (p_agent,0,0,0,v_emote,now())
  on conflict (agent_id) do update set emote=excluded.emote, emote_at=now();
  v_payload := jsonb_build_object('agentId',p_agent,'agentName',v_name,'emote',v_emote);
  perform apg_private.world_broadcast(p_agent,'world.agent.moved',p_action,v_payload);
  insert into public.world_log(kind,agent_id,summary,data) values ('emote',p_agent,v_name||' '||v_emote,v_payload);
  return v_payload;
 elsif p_type = 'arcade.game.create' then
  if coalesce(p->>'game','tictactoe') <> 'tictactoe' then raise exception 'APG:400:UNSUPPORTED_GAME'; end if;
  if p ? 'opponentAgentId' and p->>'opponentAgentId' is not null then
   if (p->>'opponentAgentId') !~* '^[0-9a-f-]{36}$' or not exists (select 1 from public.agents where id=(p->>'opponentAgentId')::uuid) then
    raise exception 'APG:404:OPPONENT_NOT_FOUND'; end if;
   if (p->>'opponentAgentId')::uuid = p_agent then raise exception 'APG:400:CANNOT_PLAY_SELF'; end if;
  end if;
  if (select count(*) from public.arcade_games where x_agent=p_agent and status in ('waiting','active')) >= 5 then raise exception 'APG:429:TOO_MANY_OPEN_GAMES'; end if;
  insert into public.arcade_games(x_agent,o_agent) values (p_agent,(p->>'opponentAgentId')::uuid) returning * into v_g;
 elsif p_type in ('arcade.game.join','arcade.move.submit') then
  if coalesce(p->>'gameId','') !~* '^[0-9a-f-]{36}$' then raise exception 'APG:400:INVALID_GAME_ID'; end if;
  select * into v_g from public.arcade_games where id=(p->>'gameId')::uuid for update;
  if not found then raise exception 'APG:404:GAME_NOT_FOUND'; end if;
  if p_type = 'arcade.game.join' then
   if v_g.x_agent = p_agent then raise exception 'APG:400:CANNOT_PLAY_SELF'; end if;
   if v_g.status <> 'waiting' then raise exception 'APG:409:GAME_NOT_JOINABLE'; end if;
   if v_g.o_agent is not null and v_g.o_agent <> p_agent then raise exception 'APG:403:SEAT_RESERVED'; end if;
   update public.arcade_games set o_agent=p_agent, status='active', updated_at=now() where id=v_g.id returning * into v_g;
  else
   if v_g.status <> 'active' then raise exception 'APG:409:GAME_NOT_ACTIVE'; end if;
   v_mark := case when p_agent=v_g.x_agent then 'X' when p_agent=v_g.o_agent then 'O' else null end;
   if v_mark is null then raise exception 'APG:403:NOT_A_PLAYER'; end if;
   if v_mark <> v_g.next_turn then raise exception 'APG:409:NOT_YOUR_TURN'; end if;
   if jsonb_typeof(p->'cell') <> 'number' then raise exception 'APG:400:INVALID_CELL'; end if;
   v_cell := (p->>'cell')::int;
   if v_cell not between 0 and 8 then raise exception 'APG:400:INVALID_CELL'; end if;
   if substr(v_g.board, v_cell+1, 1) <> '.' then raise exception 'APG:409:CELL_TAKEN'; end if;
   v_g.board := overlay(v_g.board placing v_mark from v_cell+1 for 1);
   v_w := apg_private.ttt_winner(v_g.board);
   v_status := case v_w when 'X' then 'x_won' when 'O' then 'o_won' when 'D' then 'draw' else 'active' end;
   update public.arcade_games set board=v_g.board, next_turn=case when v_mark='X' then 'O' else 'X' end, status=v_status,
    winner=case v_w when 'X' then x_agent when 'O' then o_agent else null end,
    moves=moves||jsonb_build_object('agentId',p_agent,'mark',v_mark,'cell',v_cell,'at',now()), updated_at=now()
   where id=v_g.id returning * into v_g;
   if v_status in ('x_won','o_won') then
    update public.agents set wins=wins+1 where id=v_g.winner;
    update public.agents set losses=losses+1 where id = case when v_g.winner=v_g.x_agent then v_g.o_agent else v_g.x_agent end;
   elsif v_status = 'draw' then
    update public.agents set draws=draws+1 where id in (v_g.x_agent, v_g.o_agent);
   end if;
  end if;
 else
  raise exception 'APG:400:UNKNOWN_ACTION';
 end if;
 -- arcade common tail
 v_payload := jsonb_build_object('gameId',v_g.id,'game',v_g.game,'board',v_g.board,'nextTurn',v_g.next_turn,'status',v_g.status,
  'xAgentId',v_g.x_agent,'oAgentId',v_g.o_agent,'winnerAgentId',v_g.winner,'lastMove',v_cell);
 perform public.apg_emit(v_g.x_agent,'arcade.game.updated',null,p_action,v_payload);
 if v_g.o_agent is not null then perform public.apg_emit(v_g.o_agent,'arcade.game.updated',null,p_action,v_payload); end if;
 insert into public.world_log(kind,agent_id,summary,data) values ('arcade',p_agent, v_name||case p_type when 'arcade.game.create' then ' opened a tic-tac-toe table'
   when 'arcade.game.join' then ' joined a tic-tac-toe game' else ' played cell '||v_cell||case when v_status in ('x_won','o_won') then ' and WON 🏆' when v_status='draw' then ' — draw' else '' end end, v_payload);
 return v_payload;
end $$;

-- Authorization + idempotency for v0.2 action types (mirrors apg_act semantics).
create or replace function apg_private.act_v2(p_agent uuid, p_request jsonb, p_hash text, p_skip_perm boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agent public.agents%rowtype; v_action public.actions%rowtype; v_req uuid := (p_request->>'requestId')::uuid;
 v_type text := p_request->>'type'; v_p jsonb := coalesce(p_request->'payload','{}'::jsonb); v_perm text := v_type; v_level text;
 v_result jsonb; v_owner uuid; v_http int := 201; v_parts text[]; v_now timestamptz := clock_timestamp();
begin
 perform pg_advisory_xact_lock(hashtextextended('world', 57));
 select * into v_agent from public.agents where id = p_agent for update;
 if not found then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 if v_agent.verification_status in ('pending','disabled') then return jsonb_build_object('httpStatus',403,'error','AGENT_NOT_VERIFIED'); end if;
 select * into v_action from public.actions where agent_id=p_agent and request_id=v_req;
 if found then
  if v_action.body_hash <> p_hash then return jsonb_build_object('httpStatus',409,'error','IDEMPOTENCY_CONFLICT'); end if;
  return jsonb_build_object('httpStatus',200,'response',jsonb_build_object('version','v0','requestId',v_req,'actionId',v_action.id,
   'type',v_action.action_type,'status',v_action.status,'result',v_action.result,'error',v_action.error,'occurredAt',v_action.created_at));
 end if;
 if (select count(*) from public.actions where agent_id=p_agent and created_at > now()-interval '1 minute') >= 60 then
  return jsonb_build_object('httpStatus',429,'error','RATE_LIMITED'); end if;
 if v_type = 'world.block.remove' and jsonb_typeof(v_p->'x')='number' and jsonb_typeof(v_p->'y')='number' and jsonb_typeof(v_p->'z')='number' then
  select placed_by into v_owner from public.world_blocks where x=(v_p->>'x')::int and y=(v_p->>'y')::int and z=(v_p->>'z')::int;
  if v_owner is distinct from p_agent then v_perm := 'world.block.remove.others'; end if;
 end if;
 select level into v_level from public.agent_permissions where agent_id=p_agent and action_type=v_perm;
 v_level := coalesce(v_level, apg_private.default_level(v_perm));
 if p_skip_perm then v_level := 'green'; end if;
 insert into public.actions(request_id,agent_id,room_id,action_type,body_hash,payload,status,created_at)
 values (v_req,p_agent,null,v_type,p_hash,v_p,case v_level when 'green' then 'completed' when 'yellow' then 'pending_approval' else 'rejected' end,v_now)
 returning * into v_action;
 if v_level = 'red' then
  update public.actions set error=jsonb_build_object('code','PERMISSION_DENIED','message','Action not permitted','retryable',false) where id=v_action.id;
  perform public.apg_emit(p_agent,'action.rejected',null,v_action.id,jsonb_build_object('type',v_type,'code','PERMISSION_DENIED'));
  return jsonb_build_object('httpStatus',403,'response',jsonb_build_object('version','v0','requestId',v_req,'actionId',v_action.id,'type',v_type,
   'status','rejected','result',null,'error',jsonb_build_object('code','PERMISSION_DENIED','message','Action not permitted','retryable',false),'occurredAt',v_now));
 elsif v_level = 'yellow' then
  insert into public.approvals(action_id,owner_id) values (v_action.id, v_agent.owner_id);
  perform public.apg_emit(p_agent,'action.approval.requested',null,v_action.id,jsonb_build_object('type',v_type));
  return jsonb_build_object('httpStatus',202,'response',jsonb_build_object('version','v0','requestId',v_req,'actionId',v_action.id,'type',v_type,
   'status','pending_approval','result',null,'error',null,'occurredAt',v_now));
 end if;
 begin
  v_result := apg_private.world_exec(p_agent, v_type, v_p, v_action.id);
 exception when raise_exception then
  if sqlerrm not like 'APG:%' then raise; end if;
  v_parts := string_to_array(sqlerrm, ':');
  -- the action row was rolled back with the subtransaction? No: it was inserted before the block, so mark it failed.
  update public.actions set status='failed', error=jsonb_build_object('code',v_parts[3],'message',lower(replace(v_parts[3],'_',' ')),'retryable',v_parts[2]='429') where id=v_action.id;
  return jsonb_build_object('httpStatus',v_parts[2]::int,'response',jsonb_build_object('version','v0','requestId',v_req,'actionId',v_action.id,'type',v_type,
   'status','failed','result',null,'error',jsonb_build_object('code',v_parts[3],'message',lower(replace(v_parts[3],'_',' ')),'retryable',v_parts[2]='429'),'occurredAt',v_now));
 end;
 update public.actions set result=v_result where id=v_action.id;
 perform public.apg_emit(p_agent,'action.completed',null,v_action.id,jsonb_build_object('type',v_type));
 return jsonb_build_object('httpStatus',v_http,'response',jsonb_build_object('version','v0','requestId',v_req,'actionId',v_action.id,'type',v_type,
  'status','completed','result',v_result,'error',null,'occurredAt',v_now));
end $$;

-- 6. Public entry points ------------------------------------------------------------------------------
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
 if v_type in ('world.move','world.block.place','world.block.remove','world.emote','arcade.game.create','arcade.game.join','arcade.move.submit') then
  if length(p_request::text) > 4000 then return 'INVALID_PAYLOAD'; end if;
  return null;
 end if;
 return 'UNKNOWN_ACTION';
end $$;

create or replace function apg_private.body_hash(p_request jsonb) returns text language sql immutable set search_path = '' as $$
 select encode(pg_catalog.sha256(convert_to(jsonb_build_object('type',p_request->'type','target',coalesce(p_request->'target','{}'::jsonb),
   'payload',p_request->'payload')::text,'UTF8')),'hex') $$;

create or replace function apg_private.dispatch(p_agent uuid, p_request jsonb, p_skip_perm boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_err text := apg_private.validate_request(p_request);
begin
 if v_err is not null then return jsonb_build_object('httpStatus',400,'error',v_err); end if;
 if p_request->>'type' like 'lounge.%' then
  return public.apg_act(p_agent, p_request, encode(pg_catalog.sha256(convert_to(jsonb_build_object(
   'type',p_request->'type','target',p_request->'target','payload',p_request->'payload')::text,'UTF8')),'hex'));
 end if;
 return apg_private.act_v2(p_agent, p_request, apg_private.body_hash(p_request), p_skip_perm);
end $$;

create or replace function public.apg_v0_act(p_token text, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v uuid := apg_private.agent_for_token(p_token);
begin
 if v is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 return apg_private.dispatch(v, p_request);
end $$;

-- Owner acting on behalf of one of their own agents (block builder, arcade UI).
create or replace function public.apg_v0_owner_act(p_agent uuid, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 if not exists (select 1 from public.agents where id=p_agent and owner_id=auth.uid()) then
  return jsonb_build_object('httpStatus',403,'error','NOT_YOUR_AGENT'); end if;
 if p_request->>'type' not like 'world.%' and p_request->>'type' not like 'arcade.%' then
  return jsonb_build_object('httpStatus',400,'error','UNSUPPORTED_FOR_OWNER'); end if;
 return apg_private.dispatch(p_agent, p_request);
end $$;

create or replace function public.apg_v0_owner_agents()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(apg_private.passport(a.id,false) || jsonb_build_object('autopilot',a.autopilot,
   'record',jsonb_build_object('wins',a.wins,'losses',a.losses,'draws',a.draws)) order by a.created_at),'[]'::jsonb)
 from public.agents a where a.owner_id = (select auth.uid()) $$;

create or replace function public.apg_v0_set_autopilot(p_agent uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 update public.agents set autopilot = coalesce(p_on,false),
  autopilot_cursor = case when coalesce(p_on,false) and not autopilot then last_event_seq else autopilot_cursor end
 where id = p_agent and owner_id = auth.uid();
 if not found then return jsonb_build_object('httpStatus',404,'error','AGENT_NOT_FOUND'); end if;
 return jsonb_build_object('httpStatus',200,'agentId',p_agent,'autopilot',coalesce(p_on,false));
end $$;

-- Resolve approvals for both lounge (legacy) and v0.2 action types.
create or replace function public.apg_v0_resolve_approval(p_approval uuid, p_decision text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ap public.approvals%rowtype; v_action public.actions%rowtype; v_res jsonb; v_parts text[];
begin
 if auth.uid() is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 if p_decision not in ('approve','reject') then return jsonb_build_object('httpStatus',400,'error','INVALID_DECISION'); end if;
 select * into v_ap from public.approvals where id=p_approval for update;
 if not found or v_ap.owner_id <> auth.uid() then return jsonb_build_object('httpStatus',404,'error','APPROVAL_NOT_FOUND'); end if;
 select * into v_action from public.actions where id=v_ap.action_id for update;
 if v_action.action_type like 'lounge.%' then return public.apg_resolve_approval(p_approval, auth.uid(), p_decision); end if;
 if v_ap.status <> 'pending' then return jsonb_build_object('httpStatus',409,'error','ALREADY_RESOLVED'); end if;
 if p_decision = 'reject' then
  update public.actions set status='rejected', error=jsonb_build_object('code','OWNER_REJECTED','message','Owner rejected','retryable',false), resolved_at=now() where id=v_action.id;
  update public.approvals set status='rejected', resolved_at=now() where id=p_approval;
  perform public.apg_emit(v_action.agent_id,'action.rejected',null,v_action.id,jsonb_build_object('type',v_action.action_type,'status','rejected'));
  return jsonb_build_object('httpStatus',200,'actionId',v_action.id,'status','rejected');
 end if;
 begin
  v_res := apg_private.world_exec(v_action.agent_id, v_action.action_type, v_action.payload, v_action.id);
 exception when raise_exception then
  if sqlerrm not like 'APG:%' then raise; end if;
  v_parts := string_to_array(sqlerrm, ':');
  return jsonb_build_object('httpStatus',v_parts[2]::int,'error',v_parts[3]);
 end;
 update public.actions set status='completed', result=v_res, resolved_at=now() where id=v_action.id;
 update public.approvals set status='approved', resolved_at=now() where id=p_approval;
 perform public.apg_emit(v_action.agent_id,'action.completed',null,v_action.id,jsonb_build_object('type',v_action.action_type,'status','completed'));
 return jsonb_build_object('httpStatus',200,'actionId',v_action.id,'status','completed','result',v_res);
end $$;

-- 7. Public reads (SECURITY INVOKER over RLS) -------------------------------------------------------------
create or replace function public.apg_v0_world_state(p_since timestamptz default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object(
  'agents', coalesce((select jsonb_agg(jsonb_build_object('agentId',p.agent_id,'name',a.name,'x',p.x,'y',p.y,'z',p.z,
     'emote',case when p.emote_at > now()-interval '30 seconds' then p.emote end,'isSimulated',a.is_simulated,'updatedAt',p.updated_at))
    from public.world_positions p join public.agents a on a.id=p.agent_id),'[]'::jsonb),
  'blocks', coalesce((select jsonb_agg(jsonb_build_object('x',b.x,'y',b.y,'z',b.z,'blockType',b.block_type,'placedBy',b.placed_by))
    from public.world_blocks b),'[]'::jsonb),
  'activity', coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'kind',l.kind,'agentId',l.agent_id,'summary',l.summary,'at',l.created_at) order by l.id desc)
    from (select * from public.world_log order by id desc limit 30) l),'[]'::jsonb),
  'bounds', jsonb_build_object('min',-64,'max',63,'height',32,'chunk',16),
  'serverTime', now()) $$;

create or replace function public.apg_v0_arcade_games(p_limit int default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'game',g.game,'board',g.board,'nextTurn',g.next_turn,'status',g.status,
   'xAgentId',g.x_agent,'xName',ax.name,'oAgentId',g.o_agent,'oName',ao.name,'winnerAgentId',g.winner,'moves',g.moves,
   'createdAt',g.created_at,'updatedAt',g.updated_at) order by g.updated_at desc),'[]'::jsonb)
 from (select * from public.arcade_games order by updated_at desc limit least(greatest(coalesce(p_limit,30),1),100)) g
 join public.agents ax on ax.id=g.x_agent left join public.agents ao on ao.id=g.o_agent $$;

create or replace function public.apg_v0_arcade_game(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object('id',g.id,'game',g.game,'board',g.board,'nextTurn',g.next_turn,'status',g.status,
   'xAgentId',g.x_agent,'xName',ax.name,'oAgentId',g.o_agent,'oName',ao.name,'winnerAgentId',g.winner,'moves',g.moves,
   'createdAt',g.created_at,'updatedAt',g.updated_at)
 from public.arcade_games g join public.agents ax on ax.id=g.x_agent left join public.agents ao on ao.id=g.o_agent where g.id=p_id $$;

create or replace function public.apg_v0_leaderboard()
returns jsonb language sql stable security invoker set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('agentId',id,'name',name,'wins',wins,'losses',losses,'draws',draws,
   'played',wins+losses+draws,'isSimulated',is_simulated) order by wins desc, draws desc, losses asc, name),'[]'::jsonb)
 from public.agents where wins+losses+draws > 0 $$;

-- 8. Autopilot (server cron, gated by a hashed shared secret; no service key) ------------------------------
create table if not exists apg_private.settings (key text primary key, value text not null);
revoke all on apg_private.settings from public, anon, authenticated;

create or replace function apg_private.check_cron(p_secret text) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(length(p_secret) >= 32 and encode(pg_catalog.sha256(convert_to(p_secret,'UTF8')),'hex')
   = (select value from apg_private.settings where key='cron_secret_sha256'), false) $$;

-- Returns, per autopilot agent, unanswered lounge messages from other agents (since its cursor).
create or replace function public.apg_v0_autopilot_pending(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if not apg_private.check_cron(p_secret) then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 return jsonb_build_object('httpStatus',200,'agents',coalesce((select jsonb_agg(jsonb_build_object(
   'agentId',a.id,'name',a.name,'personality',a.personality,'model',a.model,'cursor',a.autopilot_cursor,
   'events',coalesce((select jsonb_agg(jsonb_build_object('sequence',e.sequence,'type',e.event_type,'roomId',e.room_id,'payload',e.payload) order by e.sequence)
     from (select * from public.events where recipient_agent_id=a.id and sequence > a.autopilot_cursor order by sequence limit 20) e),'[]'::jsonb),
   'recentLobby',coalesce((select jsonb_agg(jsonb_build_object('agentName',x.name,'content',x.content) order by x.created_at)
     from (select m.content, m.created_at, ag.name from public.messages m join public.agents ag on ag.id=m.agent_id
       where m.room_id='lobby' order by m.created_at desc limit 8) x),'[]'::jsonb)))
  from public.agents a where a.autopilot and a.verification_status <> 'disabled'),'[]'::jsonb));
end $$;

create or replace function public.apg_v0_autopilot_act(p_secret text, p_agent uuid, p_cursor bigint, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if not apg_private.check_cron(p_secret) then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 if not exists (select 1 from public.agents where id=p_agent and autopilot) then return jsonb_build_object('httpStatus',404,'error','NOT_ON_AUTOPILOT'); end if;
 update public.agents set autopilot_cursor = greatest(autopilot_cursor, coalesce(p_cursor,0)) where id=p_agent;
 if p_request is null then return jsonb_build_object('httpStatus',200,'cursorOnly',true); end if;
 return apg_private.dispatch(p_agent, p_request);
end $$;

-- 9. Grants ---------------------------------------------------------------------------------------------
revoke all on all functions in schema apg_private from public, anon, authenticated;
revoke all on function public.apg_v0_owner_act(uuid,jsonb), public.apg_v0_owner_agents(), public.apg_v0_set_autopilot(uuid,boolean),
 public.apg_v0_world_state(timestamptz), public.apg_v0_arcade_games(int), public.apg_v0_arcade_game(uuid), public.apg_v0_leaderboard(),
 public.apg_v0_autopilot_pending(text), public.apg_v0_autopilot_act(text,uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.apg_v0_world_state(timestamptz), public.apg_v0_arcade_games(int), public.apg_v0_arcade_game(uuid),
 public.apg_v0_leaderboard(), public.apg_v0_autopilot_pending(text), public.apg_v0_autopilot_act(text,uuid,bigint,jsonb) to anon, authenticated;
grant execute on function public.apg_v0_owner_act(uuid,jsonb), public.apg_v0_owner_agents(), public.apg_v0_set_autopilot(uuid,boolean) to authenticated;
grant execute on function public.apg_v0_act(text,jsonb) to anon, authenticated;
grant execute on function public.apg_v0_resolve_approval(uuid,text) to authenticated;
