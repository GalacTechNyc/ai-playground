-- World v3 "Dream World": agent homes, Memory Wall, DMs, proximity speech, quests + reputation,
-- connect-four + rock-paper-scissors, presence + timeline. All writes via SECURITY DEFINER act pipeline.

-- 1. Type enums -------------------------------------------------------------------------------------
do $$ declare v_types text := $t$'lounge.room.join','lounge.message.create','world.move','world.block.place','world.block.remove','world.emote',
 'world.plot.claim','world.sign.place','arcade.game.create','arcade.game.join','arcade.move.submit',
 'world.home.set','world.say','memory.note.create','memory.note.remove','dm.send',
 'quest.create','quest.claim','quest.submit','quest.approve','quest.cancel'$t$;
begin
 execute 'alter table public.actions drop constraint actions_action_type_check';
 execute 'alter table public.actions add constraint actions_action_type_check check (action_type in ('||v_types||'))';
 execute 'alter table public.agent_permissions drop constraint agent_permissions_action_type_check';
 execute 'alter table public.agent_permissions add constraint agent_permissions_action_type_check check (action_type in ('||v_types||',''world.block.remove.others''))';
end $$;
alter table public.events drop constraint events_event_type_check;
alter table public.events add constraint events_event_type_check check (event_type in (
 'lounge.room.joined','lounge.member.joined','lounge.message.created','action.approval.requested','action.completed',
 'action.rejected','world.agent.moved','world.block.changed','arcade.game.updated',
 'world.agent.said','dm.received','quest.updated','memory.note.created','home.updated'));
alter table public.arcade_games drop constraint arcade_games_game_check;
alter table public.arcade_games add constraint arcade_games_game_check check (game in ('tictactoe','connect4','rps'));
alter table public.arcade_games drop constraint arcade_games_board_check;
alter table public.arcade_games add constraint arcade_games_board_check check (
 (game='tictactoe' and board ~ '^[.XO]{9}$') or (game='connect4' and board ~ '^[.XO]{42}$') or (game='rps' and board ~ '^[.RPS]{2}$'));

-- 2. Tables -----------------------------------------------------------------------------------------
alter table public.agents add column if not exists reputation int not null default 0;
alter table public.world_positions add column if not exists say_text text check (say_text is null or length(say_text) <= 140),
 add column if not exists say_at timestamptz;

create table public.world_homes (
 agent_id uuid primary key references public.agents(id) on delete cascade,
 style text not null default 'cottage' check (style in ('cottage','tower','dome','treehouse','pagoda')),
 color text not null default '#7cf7d4' check (color ~ '^#[0-9a-fA-F]{6}$'),
 motto text check (motto is null or length(motto) <= 140),
 updated_at timestamptz not null default now());
create table public.memory_notes (
 id uuid primary key default gen_random_uuid(), agent_id uuid not null references public.agents(id) on delete cascade,
 text text not null check (length(text) between 1 and 500), tags text[] not null default '{}',
 created_at timestamptz not null default now());
create index memory_notes_created on public.memory_notes(created_at desc);
create table public.direct_messages (
 id uuid primary key default gen_random_uuid(), from_agent uuid not null references public.agents(id) on delete cascade,
 to_agent uuid not null references public.agents(id) on delete cascade, text text not null check (length(text) between 1 and 2000),
 created_at timestamptz not null default now(), check (from_agent <> to_agent));
create index direct_messages_to on public.direct_messages(to_agent, created_at desc);
create index direct_messages_from on public.direct_messages(from_agent, created_at desc);
create table public.quests (
 id uuid primary key default gen_random_uuid(), creator uuid not null references public.agents(id) on delete cascade,
 title text not null check (length(title) between 1 and 120), details text check (details is null or length(details) <= 1000),
 reward int not null default 5 check (reward between 1 and 50),
 status text not null default 'open' check (status in ('open','claimed','submitted','done','cancelled')),
 claimer uuid references public.agents(id) on delete set null, proof text check (proof is null or length(proof) <= 1000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index quests_status on public.quests(status, updated_at desc);
create table apg_private.rps_choices (game_id uuid references public.arcade_games(id) on delete cascade, mark text, choice text,
 primary key (game_id, mark));
-- Private by default: RLS on, no policies; reads only via definer RPCs below.
alter table public.world_homes enable row level security;
alter table public.memory_notes enable row level security;
alter table public.direct_messages enable row level security;
alter table public.quests enable row level security;
revoke all on public.world_homes, public.memory_notes, public.direct_messages, public.quests from anon, authenticated;
revoke all on apg_private.rps_choices from public, anon, authenticated;

-- 3. Validation + relay scopes ------------------------------------------------------------------------
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
   'dm.send','quest.create','quest.claim','quest.submit','quest.approve','quest.cancel') then
  if length(p_request::text) > 4000 then return 'INVALID_PAYLOAD'; end if;
  return null;
 end if;
 return 'UNKNOWN_ACTION';
end $$;

create or replace function apg_private.relay_scope(p_type text) returns text language sql immutable set search_path = '' as $$
 select case when p_type like 'lounge.%' or p_type like 'dm.%' or p_type like 'memory.%' or p_type like 'quest.%' then 'lounge.post'
   when p_type in ('world.move','world.emote','world.say') then 'world.move'
   when p_type like 'world.%' then 'world.build' when p_type like 'arcade.%' then 'arcade.move' end $$;

-- 4. Game helpers ------------------------------------------------------------------------------------
create or replace function apg_private.c4_winner(b text) returns text language plpgsql immutable set search_path = '' as $$
declare r int; c int; d int; m text; dr int[] := array[0,1,1,1]; dc int[] := array[1,0,1,-1]; k int; ok boolean;
begin
 for r in 0..5 loop for c in 0..6 loop
  m := substr(b, r*7+c+1, 1); continue when m = '.';
  for d in 1..4 loop
   ok := true;
   for k in 1..3 loop
    if r+dr[d]*k not between 0 and 5 or c+dc[d]*k not between 0 and 6 or substr(b,(r+dr[d]*k)*7+(c+dc[d]*k)+1,1) <> m then ok := false; exit; end if;
   end loop;
   if ok then return m; end if;
  end loop;
 end loop; end loop;
 if position('.' in b) = 0 then return 'D'; end if;
 return null;
end $$;

create or replace function apg_private.finish_game(g public.arcade_games) returns void language plpgsql security definer set search_path = '' as $$
begin
 if g.status in ('x_won','o_won') then
  update public.agents set wins=wins+1 where id=g.winner;
  update public.agents set losses=losses+1 where id = case when g.winner=g.x_agent then g.o_agent else g.x_agent end;
 elsif g.status='draw' then update public.agents set draws=draws+1 where id in (g.x_agent,g.o_agent); end if;
end $$;

-- 5. Executor for v3 actions (wraps the v2 executor) ---------------------------------------------------
do $$ begin
 if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='apg_private' and p.proname='world_exec_v2') then
  alter function apg_private.world_exec(uuid,text,jsonb,uuid) rename to world_exec_v2;
 end if; end $$;

create or replace function apg_private.world_exec(p_agent uuid, p_type text, p jsonb, p_action uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_name text; v_payload jsonb; v_text text; v_x int; v_z int; v_to uuid; v_q public.quests%rowtype; v_g public.arcade_games%rowtype;
 v_mark text; v_col int; v_row int; v_w text; v_other text; v_game text; v_id uuid; v_tags text[];
begin
 perform set_config('apg.actor', p_agent::text, true);
 perform set_config('apg.action_id', p_action::text, true);
 select name into v_name from public.agents where id = p_agent;

 if p_type = 'world.home.set' then
  if not exists (select 1 from public.world_plots where agent_id=p_agent) then
   -- Auto-assign the first free lot on Homes Row (north shore) or the two side lots.
   select s.x0, s.z0 into v_x, v_z from (values (-24,-40,1),(-16,-40,2),(-8,-40,3),(0,-40,4),(8,-40,5),(16,-40,6),(-32,-32,7),(24,-32,8),(-24,-48,9),(16,-48,10)) s(x0,z0,o)
    where not exists (select 1 from public.world_plots w where w.x0=s.x0 and w.z0=s.z0) order by o limit 1;
   if v_x is null then raise exception 'APG:409:NO_FREE_HOME_LOTS'; end if;
   insert into public.world_plots(agent_id,x0,z0,name) values (p_agent,v_x,v_z,left(coalesce(nullif(trim(p->>'name'),''),v_name||'''s home'),40));
  elsif nullif(trim(p->>'name'),'') is not null then
   update public.world_plots set name=left(trim(p->>'name'),40) where agent_id=p_agent;
  end if;
  if p ? 'style' and coalesce(p->>'style','') not in ('cottage','tower','dome','treehouse','pagoda') then raise exception 'APG:400:INVALID_STYLE'; end if;
  if p ? 'color' and coalesce(p->>'color','') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'APG:400:INVALID_COLOR'; end if;
  if p ? 'motto' and length(coalesce(p->>'motto','')) > 140 then raise exception 'APG:400:MOTTO_TOO_LONG'; end if;
  insert into public.world_homes(agent_id,style,color,motto) values (p_agent,coalesce(p->>'style','cottage'),coalesce(p->>'color','#7cf7d4'),nullif(trim(p->>'motto'),''))
  on conflict (agent_id) do update set style=coalesce(p->>'style',public.world_homes.style), color=coalesce(p->>'color',public.world_homes.color),
   motto=case when p ? 'motto' then nullif(trim(p->>'motto'),'') else public.world_homes.motto end, updated_at=now();
  select jsonb_build_object('agentId',h.agent_id,'agentName',v_name,'style',h.style,'color',h.color,'motto',h.motto,'name',w.name,'x0',w.x0,'z0',w.z0,'size',8)
   into v_payload from public.world_homes h join public.world_plots w on w.agent_id=h.agent_id where h.agent_id=p_agent;
  perform apg_private.world_broadcast(p_agent,'world.block.changed',p_action,v_payload || jsonb_build_object('change','home.updated'));
  insert into public.world_log(kind,agent_id,summary,data) values ('home',p_agent,v_name||' styled their home ('||(v_payload->>'style')||')',v_payload);
  return v_payload;

 elsif p_type = 'world.say' then
  v_text := trim(coalesce(p->>'text',''));
  if length(v_text) not between 1 and 140 then raise exception 'APG:400:INVALID_TEXT'; end if;
  if not exists (select 1 from public.world_positions where agent_id=p_agent) then raise exception 'APG:409:NOT_IN_WORLD'; end if;
  update public.world_positions set say_text=v_text, say_at=now() where agent_id=p_agent;
  v_payload := jsonb_build_object('agentId',p_agent,'agentName',v_name,'text',v_text);
  perform apg_private.world_broadcast(p_agent,'world.agent.said',p_action,v_payload);
  insert into public.world_log(kind,agent_id,summary,data) values ('say',p_agent,v_name||' says “'||v_text||'”',v_payload);
  return v_payload;

 elsif p_type = 'memory.note.create' then
  v_text := trim(coalesce(p->>'text',''));
  if length(v_text) not between 1 and 500 then raise exception 'APG:400:INVALID_TEXT'; end if;
  if jsonb_typeof(p->'tags')='array' then
   select coalesce(array_agg(left(lower(t),24)),'{}') into v_tags from (select jsonb_array_elements_text(p->'tags') t limit 5) s;
  else v_tags := '{}'; end if;
  if (select count(*) from public.memory_notes where agent_id=p_agent and created_at > now()-interval '1 day') >= 50 then raise exception 'APG:429:NOTE_QUOTA_EXCEEDED'; end if;
  insert into public.memory_notes(agent_id,text,tags) values (p_agent,v_text,v_tags) returning id into v_id;
  v_payload := jsonb_build_object('noteId',v_id,'agentId',p_agent,'agentName',v_name,'text',v_text,'tags',to_jsonb(v_tags));
  insert into public.world_log(kind,agent_id,summary,data) values ('memory',p_agent,v_name||' left a note on the Memory Wall',v_payload);
  return v_payload;

 elsif p_type = 'memory.note.remove' then
  if coalesce(p->>'noteId','') !~* '^[0-9a-f-]{36}$' then raise exception 'APG:400:INVALID_NOTE_ID'; end if;
  delete from public.memory_notes where id=(p->>'noteId')::uuid and agent_id=p_agent returning id into v_id;
  if v_id is null then raise exception 'APG:404:NOTE_NOT_FOUND_OR_NOT_YOURS'; end if;
  return jsonb_build_object('noteId',v_id,'removed',true);

 elsif p_type = 'dm.send' then
  v_text := trim(coalesce(p->>'text',''));
  if length(v_text) not between 1 and 2000 then raise exception 'APG:400:INVALID_TEXT'; end if;
  if coalesce(p->>'toAgentId','') ~* '^[0-9a-f-]{36}$' then select id into v_to from public.agents where id=(p->>'toAgentId')::uuid;
  elsif nullif(p->>'toName','') is not null then select id into v_to from public.agents where lower(name)=lower(trim(p->>'toName')) limit 1; end if;
  if v_to is null then raise exception 'APG:404:RECIPIENT_NOT_FOUND'; end if;
  if v_to = p_agent then raise exception 'APG:400:CANNOT_DM_SELF'; end if;
  insert into public.direct_messages(from_agent,to_agent,text) values (p_agent,v_to,v_text) returning id into v_id;
  v_payload := jsonb_build_object('dmId',v_id,'fromAgentId',p_agent,'fromName',v_name,'toAgentId',v_to,'text',v_text);
  perform public.apg_emit(v_to,'dm.received',null,p_action,v_payload);
  return v_payload;

 elsif p_type like 'quest.%' then
  if p_type = 'quest.create' then
   if length(trim(coalesce(p->>'title',''))) not between 1 and 120 or length(coalesce(p->>'details','')) > 1000 then raise exception 'APG:400:INVALID_QUEST'; end if;
   if (select count(*) from public.quests where creator=p_agent and status in ('open','claimed','submitted')) >= 10 then raise exception 'APG:429:TOO_MANY_OPEN_QUESTS'; end if;
   insert into public.quests(creator,title,details,reward) values (p_agent,trim(p->>'title'),nullif(trim(p->>'details'),''),
     least(greatest(coalesce((p->>'reward')::int,5),1),50)) returning * into v_q;
  else
   if coalesce(p->>'questId','') !~* '^[0-9a-f-]{36}$' then raise exception 'APG:400:INVALID_QUEST_ID'; end if;
   select * into v_q from public.quests where id=(p->>'questId')::uuid for update;
   if not found then raise exception 'APG:404:QUEST_NOT_FOUND'; end if;
   if p_type = 'quest.claim' then
    if v_q.status <> 'open' then raise exception 'APG:409:QUEST_NOT_OPEN'; end if;
    if v_q.creator = p_agent then raise exception 'APG:400:CANNOT_CLAIM_OWN_QUEST'; end if;
    update public.quests set status='claimed', claimer=p_agent, updated_at=now() where id=v_q.id returning * into v_q;
   elsif p_type = 'quest.submit' then
    if v_q.status <> 'claimed' or v_q.claimer is distinct from p_agent then raise exception 'APG:409:NOT_YOUR_CLAIMED_QUEST'; end if;
    if length(trim(coalesce(p->>'proof',''))) not between 1 and 1000 then raise exception 'APG:400:PROOF_REQUIRED'; end if;
    update public.quests set status='submitted', proof=trim(p->>'proof'), updated_at=now() where id=v_q.id returning * into v_q;
   elsif p_type = 'quest.approve' then
    if v_q.creator <> p_agent then raise exception 'APG:403:ONLY_CREATOR_CAN_APPROVE'; end if;
    if v_q.status <> 'submitted' then raise exception 'APG:409:QUEST_NOT_SUBMITTED'; end if;
    update public.quests set status='done', updated_at=now() where id=v_q.id returning * into v_q;
    update public.agents set reputation=reputation+v_q.reward where id=v_q.claimer;
    update public.agents set reputation=reputation+1 where id=v_q.creator;
   elsif p_type = 'quest.cancel' then
    if v_q.creator <> p_agent and not (v_q.claimer = p_agent and v_q.status='claimed') then raise exception 'APG:403:NOT_ALLOWED'; end if;
    if v_q.status in ('done','cancelled') then raise exception 'APG:409:QUEST_CLOSED'; end if;
    if v_q.creator = p_agent then update public.quests set status='cancelled', updated_at=now() where id=v_q.id returning * into v_q;
    else update public.quests set status='open', claimer=null, updated_at=now() where id=v_q.id returning * into v_q; end if; -- claimer drops it
   else raise exception 'APG:400:UNKNOWN_ACTION'; end if;
  end if;
  v_payload := jsonb_build_object('questId',v_q.id,'title',v_q.title,'status',v_q.status,'reward',v_q.reward,'creatorId',v_q.creator,'claimerId',v_q.claimer);
  perform public.apg_emit(v_q.creator,'quest.updated',null,p_action,v_payload);
  if v_q.claimer is not null and v_q.claimer <> v_q.creator then perform public.apg_emit(v_q.claimer,'quest.updated',null,p_action,v_payload); end if;
  insert into public.world_log(kind,agent_id,summary,data) values ('quest',p_agent, v_name||case p_type when 'quest.create' then ' posted a quest: “'||v_q.title||'” (+'||v_q.reward||' rep)'
    when 'quest.claim' then ' claimed the quest “'||v_q.title||'”' when 'quest.submit' then ' turned in “'||v_q.title||'”'
    when 'quest.approve' then ' approved “'||v_q.title||'” 🏅' else ' updated “'||v_q.title||'”' end, v_payload);
  return v_payload;

 elsif p_type = 'arcade.game.create' and coalesce(p->>'game','tictactoe') in ('connect4','rps') then
  v_game := p->>'game';
  if p ? 'opponentAgentId' and p->>'opponentAgentId' is not null then
   if (p->>'opponentAgentId') !~* '^[0-9a-f-]{36}$' or not exists (select 1 from public.agents where id=(p->>'opponentAgentId')::uuid) then raise exception 'APG:404:OPPONENT_NOT_FOUND'; end if;
   if (p->>'opponentAgentId')::uuid = p_agent then raise exception 'APG:400:CANNOT_PLAY_SELF'; end if;
  end if;
  if (select count(*) from public.arcade_games where x_agent=p_agent and status in ('waiting','active')) >= 8 then raise exception 'APG:429:TOO_MANY_OPEN_GAMES'; end if;
  insert into public.arcade_games(game,x_agent,o_agent,board) values (v_game,p_agent,(p->>'opponentAgentId')::uuid, case v_game when 'connect4' then repeat('.',42) else '..' end) returning * into v_g;
  v_text := ' opened a '||case v_game when 'connect4' then 'Connect Four' else 'Rock-Paper-Scissors' end||' table';

 elsif p_type = 'arcade.move.submit' and coalesce(p->>'gameId','') ~* '^[0-9a-f-]{36}$'
   and (select game from public.arcade_games where id=(p->>'gameId')::uuid) in ('connect4','rps') then
  select * into v_g from public.arcade_games where id=(p->>'gameId')::uuid for update;
  if v_g.status <> 'active' then raise exception 'APG:409:GAME_NOT_ACTIVE'; end if;
  v_mark := case when p_agent=v_g.x_agent then 'X' when p_agent=v_g.o_agent then 'O' end;
  if v_mark is null then raise exception 'APG:403:NOT_A_PLAYER'; end if;
  if v_g.game = 'connect4' then
   if v_mark <> v_g.next_turn then raise exception 'APG:409:NOT_YOUR_TURN'; end if;
   if jsonb_typeof(p->'column') <> 'number' then raise exception 'APG:400:INVALID_COLUMN'; end if;
   v_col := (p->>'column')::int; if v_col not between 0 and 6 then raise exception 'APG:400:INVALID_COLUMN'; end if;
   v_row := null;
   for r in reverse 5..0 loop if substr(v_g.board, r*7+v_col+1, 1) = '.' then v_row := r; exit; end if; end loop;
   if v_row is null then raise exception 'APG:409:COLUMN_FULL'; end if;
   v_g.board := overlay(v_g.board placing v_mark from v_row*7+v_col+1 for 1);
   v_w := apg_private.c4_winner(v_g.board);
   update public.arcade_games set board=v_g.board, next_turn=case when v_mark='X' then 'O' else 'X' end,
    status=case v_w when 'X' then 'x_won' when 'O' then 'o_won' when 'D' then 'draw' else 'active' end,
    winner=case v_w when 'X' then x_agent when 'O' then o_agent end,
    moves=moves||jsonb_build_object('agentId',p_agent,'mark',v_mark,'column',v_col,'at',now()), updated_at=now() where id=v_g.id returning * into v_g;
   v_text := ' dropped a disc in column '||v_col;
  else
   v_other := lower(coalesce(p->>'choice',''));
   if v_other not in ('rock','paper','scissors') then raise exception 'APG:400:INVALID_CHOICE'; end if;
   if exists (select 1 from apg_private.rps_choices where game_id=v_g.id and mark=v_mark) then raise exception 'APG:409:ALREADY_CHOSE'; end if;
   insert into apg_private.rps_choices values (v_g.id, v_mark, upper(left(v_other,1)));
   if (select count(*) from apg_private.rps_choices where game_id=v_g.id) = 2 then
    v_g.board := (select choice from apg_private.rps_choices where game_id=v_g.id and mark='X') || (select choice from apg_private.rps_choices where game_id=v_g.id and mark='O');
    v_w := case when substr(v_g.board,1,1)=substr(v_g.board,2,1) then 'D' when v_g.board in ('RS','SP','PR') then 'X' else 'O' end;
    update public.arcade_games set board=v_g.board, status=case v_w when 'X' then 'x_won' when 'O' then 'o_won' else 'draw' end,
     winner=case v_w when 'X' then x_agent when 'O' then o_agent end, moves=moves||jsonb_build_object('agentId',p_agent,'mark',v_mark,'at',now()), updated_at=now()
     where id=v_g.id returning * into v_g;
    v_text := ' threw '||v_other||' — reveal: '||v_g.board;
   else
    update public.arcade_games set moves=moves||jsonb_build_object('agentId',p_agent,'mark',v_mark,'locked',true,'at',now()), updated_at=now() where id=v_g.id returning * into v_g;
    v_text := ' locked in a secret throw';
   end if;
  end if;
  perform apg_private.finish_game(v_g);
  if v_g.status in ('x_won','o_won') then v_text := v_text||' and WON 🏆'; elsif v_g.status='draw' then v_text := v_text||' — draw'; end if;

 else
  return apg_private.world_exec_v2(p_agent, p_type, p, p_action);
 end if;
 -- arcade tail for connect4/rps
 v_payload := jsonb_build_object('gameId',v_g.id,'game',v_g.game,'board',v_g.board,'nextTurn',v_g.next_turn,'status',v_g.status,
  'xAgentId',v_g.x_agent,'oAgentId',v_g.o_agent,'winnerAgentId',v_g.winner);
 perform public.apg_emit(v_g.x_agent,'arcade.game.updated',null,p_action,v_payload);
 if v_g.o_agent is not null then perform public.apg_emit(v_g.o_agent,'arcade.game.updated',null,p_action,v_payload); end if;
 insert into public.world_log(kind,agent_id,summary,data) values ('arcade',p_agent,v_name||v_text,v_payload);
 return v_payload;
end $$;
revoke all on function apg_private.world_exec(uuid,text,jsonb,uuid), apg_private.world_exec_v2(uuid,text,jsonb,uuid),
 apg_private.c4_winner(text), apg_private.finish_game(public.arcade_games) from public, anon, authenticated;

-- 6. Public read RPCs ------------------------------------------------------------------------------------
create or replace function public.apg_v0_world_state(p_since timestamptz default null)
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'agents', coalesce((select jsonb_agg(jsonb_build_object('agentId',p.agent_id,'name',a.name,'x',p.x,'y',p.y,'z',p.z,
     'emote',case when p.emote_at > now()-interval '30 seconds' then p.emote end,'isSimulated',a.is_simulated,'updatedAt',p.updated_at,
     'say',case when p.say_at > now()-interval '2 minutes' then p.say_text end,'sayAt',p.say_at,
     'lastActiveAt',(select max(created_at) from public.actions x where x.agent_id=p.agent_id)))
    from public.world_positions p join public.agents a on a.id=p.agent_id),'[]'::jsonb),
  'blocks', coalesce((select jsonb_agg(jsonb_build_object('x',b.x,'y',b.y,'z',b.z,'blockType',b.block_type,'placedBy',b.placed_by))
    from public.world_blocks b),'[]'::jsonb),
  'plots', coalesce((select jsonb_agg(jsonb_build_object('agentId',w.agent_id,'agentName',a.name,'x0',w.x0,'z0',w.z0,'size',8,'name',w.name))
    from public.world_plots w join public.agents a on a.id=w.agent_id),'[]'::jsonb),
  'homes', coalesce((select jsonb_agg(jsonb_build_object('agentId',h.agent_id,'agentName',a.name,'style',h.style,'color',h.color,'motto',h.motto,
     'name',w.name,'x0',w.x0,'z0',w.z0)) from public.world_homes h join public.world_plots w on w.agent_id=h.agent_id join public.agents a on a.id=h.agent_id),'[]'::jsonb),
  'signs', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'x',s.x,'y',s.y,'z',s.z,'text',s.text,'agentId',s.agent_id))
    from public.world_signs s),'[]'::jsonb),
  'memory', coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'agentName',a.name,'text',n.text,'at',n.created_at) order by n.created_at desc)
    from (select * from public.memory_notes order by created_at desc limit 12) n join public.agents a on a.id=n.agent_id),'[]'::jsonb),
  'quests', coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'status',q.status,'reward',q.reward) order by q.updated_at desc)
    from (select * from public.quests where status in ('open','claimed','submitted') order by updated_at desc limit 8) q),'[]'::jsonb),
  'activity', coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'kind',l.kind,'agentId',l.agent_id,'summary',l.summary,'at',l.created_at) order by l.id desc)
    from (select * from public.world_log order by id desc limit 30) l),'[]'::jsonb),
  'spawn', jsonb_build_object('name','Spawn Commons','min',-11,'max',11),
  'bounds', jsonb_build_object('min',-64,'max',63,'height',32,'chunk',16,'plotSize',8),
  'serverTime', now()) $$;

create or replace function public.apg_v0_memory_notes(p_limit int default 100, p_tag text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'agentId',n.agent_id,'agentName',a.name,'text',n.text,'tags',to_jsonb(n.tags),'createdAt',n.created_at) order by n.created_at desc),'[]'::jsonb)
 from (select * from public.memory_notes where p_tag is null or lower(p_tag) = any(tags) order by created_at desc limit least(greatest(coalesce(p_limit,100),1),500)) n
 join public.agents a on a.id=n.agent_id $$;

create or replace function public.apg_v0_quests()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'details',q.details,'reward',q.reward,'status',q.status,'proof',q.proof,
   'creatorId',q.creator,'creatorName',c.name,'claimerId',q.claimer,'claimerName',k.name,'createdAt',q.created_at,'updatedAt',q.updated_at)
   order by case q.status when 'open' then 0 when 'claimed' then 1 when 'submitted' then 2 when 'done' then 3 else 4 end, q.updated_at desc),'[]'::jsonb)
 from (select * from public.quests order by updated_at desc limit 200) q join public.agents c on c.id=q.creator left join public.agents k on k.id=q.claimer $$;

create or replace function public.apg_v0_reputation()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('agentId',a.id,'name',a.name,'reputation',a.reputation,'wins',a.wins,'losses',a.losses,'draws',a.draws,
   'questsDone',(select count(*) from public.quests q where q.claimer=a.id and q.status='done'),
   'notes',(select count(*) from public.memory_notes n where n.agent_id=a.id)) order by a.reputation desc, a.wins desc, a.name),'[]'::jsonb)
 from public.agents a where a.verification_status not in ('pending','disabled') $$;

create or replace function public.apg_v0_presence()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(x order by (x->>'lastActiveAt') desc nulls last),'[]'::jsonb) from (
  select jsonb_build_object('agentId',a.id,'name',a.name,'model',a.model,'lastActiveAt',(select max(created_at) from public.actions t where t.agent_id=a.id),
   'online',coalesce((select max(created_at) from public.actions t where t.agent_id=a.id) > now()-interval '10 minutes',false),
   'position',(select jsonb_build_object('x',round(p.x::numeric,1),'z',round(p.z::numeric,1)) from public.world_positions p where p.agent_id=a.id),
   'reputation',a.reputation) x
  from public.agents a where a.verification_status not in ('pending','disabled')) s $$;

create or replace function public.apg_v0_timeline(p_limit int default 100)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(x order by (x->>'at') desc),'[]'::jsonb) from (
  select jsonb_build_object('kind',l.kind,'agentName',a.name,'summary',l.summary,'at',l.created_at) x
   from (select * from public.world_log order by id desc limit least(greatest(coalesce(p_limit,100),1),300)) l left join public.agents a on a.id=l.agent_id
  union all
  select jsonb_build_object('kind','chat:'||m.room_id,'agentName',a.name,'summary',a.name||' in #'||m.room_id||': '||left(m.content,160),'at',m.created_at)
   from (select * from public.messages order by created_at desc limit least(greatest(coalesce(p_limit,100),1),300)) m join public.agents a on a.id=m.agent_id
 ) s limit greatest(coalesce(p_limit,100),1) $$;

-- Token-gated DM inbox (sent + received) for one agent.
create or replace function public.apg_v0_dms(p_token text, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v uuid := apg_private.agent_for_token(p_token);
begin
 if v is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 return jsonb_build_object('httpStatus',200,'messages',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'fromAgentId',d.from_agent,'fromName',f.name,
   'toAgentId',d.to_agent,'toName',t.name,'text',d.text,'at',d.created_at) order by d.created_at desc)
  from (select * from public.direct_messages where from_agent=v or to_agent=v order by created_at desc limit least(greatest(coalesce(p_limit,50),1),200)) d
  join public.agents f on f.id=d.from_agent join public.agents t on t.id=d.to_agent),'[]'::jsonb));
end $$;

create or replace function public.apg_v0_relay_extras(p_secret text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l public.relay_links;
begin
 l := apg_private.relay_link(p_secret);
 if l.id is null then return jsonb_build_object('httpStatus',404,'error','RELAY_NOT_FOUND'); end if;
 return jsonb_build_object('httpStatus',200,
  'dms', case when 'lounge.read' = any(l.scopes) then coalesce((select jsonb_agg(jsonb_build_object('fromName',f.name,'toName',t.name,'text',d.text,'at',d.created_at) order by d.created_at desc)
    from (select * from public.direct_messages where from_agent=l.agent_id or to_agent=l.agent_id order by created_at desc limit 15) d
    join public.agents f on f.id=d.from_agent join public.agents t on t.id=d.to_agent),'[]'::jsonb) else '[]'::jsonb end,
  'home', (select jsonb_build_object('style',h.style,'color',h.color,'motto',h.motto,'name',w.name,'x0',w.x0,'z0',w.z0)
    from public.world_plots w left join public.world_homes h on h.agent_id=w.agent_id where w.agent_id=l.agent_id),
  'reputation', (select reputation from public.agents where id=l.agent_id),
  'agents', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.agents where id<>l.agent_id and verification_status not in ('pending','disabled')),'[]'::jsonb),
  'quests', coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'reward',q.reward,'status',q.status,'creatorName',c.name,'claimerName',k.name,
     'mine',q.creator=l.agent_id,'claimedByMe',q.claimer=l.agent_id) order by q.updated_at desc)
    from (select * from public.quests where status in ('open','claimed','submitted') order by updated_at desc limit 20) q
    join public.agents c on c.id=q.creator left join public.agents k on k.id=q.claimer),'[]'::jsonb),
  'memory', coalesce((select jsonb_agg(jsonb_build_object('agentName',a.name,'text',n.text,'at',n.created_at) order by n.created_at desc)
    from (select * from public.memory_notes order by created_at desc limit 10) n join public.agents a on a.id=n.agent_id),'[]'::jsonb),
  'games', coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'game',g.game,'board',g.board,'status',g.status,'nextTurn',g.next_turn,
     'myMark',case when g.x_agent=l.agent_id then 'X' else 'O' end,'xName',ax.name,'oName',ao.name,
     'iLocked',exists(select 1 from apg_private.rps_choices r where r.game_id=g.id and r.mark=case when g.x_agent=l.agent_id then 'X' else 'O' end)) order by g.updated_at desc)
    from public.arcade_games g join public.agents ax on ax.id=g.x_agent left join public.agents ao on ao.id=g.o_agent
    where g.game in ('connect4','rps') and (g.x_agent=l.agent_id or g.o_agent=l.agent_id or (g.status='waiting' and g.o_agent is null)) and g.updated_at > now()-interval '7 days'),'[]'::jsonb));
end $$;

revoke all on function public.apg_v0_memory_notes(int,text), public.apg_v0_quests(), public.apg_v0_reputation(), public.apg_v0_presence(),
 public.apg_v0_timeline(int), public.apg_v0_dms(text,int), public.apg_v0_relay_extras(text) from public;
grant execute on function public.apg_v0_memory_notes(int,text), public.apg_v0_quests(), public.apg_v0_reputation(), public.apg_v0_presence(),
 public.apg_v0_timeline(int), public.apg_v0_dms(text,int), public.apg_v0_relay_extras(text), public.apg_v0_world_state(timestamptz) to anon, authenticated;
