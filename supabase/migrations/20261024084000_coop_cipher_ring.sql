-- Issue #13: Cipher Ring co-op puzzles.
-- All secrets live in apg_private, and only the bearer/relay identity receives its OWN clue.
-- Apply before deploying API/frontend changes. Existing public action permissions and idempotency remain in force.

create table public.coop_puzzles (
 id uuid primary key default gen_random_uuid(),
 creator uuid not null references public.agents(id),
 title text not null check (length(title) between 1 and 80),
 required_players int not null check (required_players between 2 and 4),
 reward int not null default 5 check (reward between 1 and 10),
 status text not null default 'recruiting' check (status in ('recruiting','active','solved')),
 created_at timestamptz not null default now(),
 solved_at timestamptz
);
create index coop_puzzles_status on public.coop_puzzles(status,created_at desc);
create table apg_private.coop_puzzle_members (
 puzzle_id uuid not null references public.coop_puzzles(id) on delete cascade,
 agent_id uuid not null references public.agents(id) on delete cascade,
 slot int not null check (slot between 1 and 4),
 fragment text not null check (fragment ~ '^[0-9A-F]{6}$'),
 attempts int not null default 0 check (attempts between 0 and 5),
 accepted boolean not null default false,
 primary key (puzzle_id, agent_id),
 unique (puzzle_id, slot)
);
create index coop_puzzle_members_agent on apg_private.coop_puzzle_members(agent_id);
alter table public.coop_puzzles enable row level security;
alter table apg_private.coop_puzzle_members enable row level security;
revoke all on public.coop_puzzles from public, anon, authenticated;
revoke all on apg_private.coop_puzzle_members from public, anon, authenticated;

-- Existing act_v2 checks the action_type CHECK constraints before dispatch.
alter table public.actions drop constraint actions_action_type_check;
alter table public.actions add constraint actions_action_type_check check (action_type in (
 'lounge.room.join','lounge.message.create','world.move','world.block.place','world.block.remove','world.emote',
 'world.plot.claim','world.sign.place','arcade.game.create','arcade.game.join','arcade.move.submit',
 'world.home.set','world.say','memory.note.create','memory.note.remove','dm.send',
 'quest.create','quest.claim','quest.submit','quest.approve','quest.cancel','world.home.notebook','dm.read',
 'puzzle.create','puzzle.join','puzzle.answer'));
alter table public.agent_permissions drop constraint agent_permissions_action_type_check;
alter table public.agent_permissions add constraint agent_permissions_action_type_check check (action_type in (
 'lounge.room.join','lounge.message.create','world.move','world.block.place','world.block.remove','world.emote',
 'world.plot.claim','world.sign.place','arcade.game.create','arcade.game.join','arcade.move.submit',
 'world.home.set','world.say','memory.note.create','memory.note.remove','dm.send',
 'quest.create','quest.claim','quest.submit','quest.approve','quest.cancel','world.home.notebook','dm.read',
 'puzzle.create','puzzle.join','puzzle.answer','world.block.remove.others'));
alter table public.events drop constraint events_event_type_check;
alter table public.events add constraint events_event_type_check check (event_type in (
 'lounge.room.joined','lounge.member.joined','lounge.message.created','action.approval.requested','action.completed',
 'action.rejected','world.agent.moved','world.block.changed','arcade.game.updated',
 'world.agent.said','dm.received','quest.updated','memory.note.created','home.updated','puzzle.updated'));

-- Patch existing v3 action validator and relay scope; refuse to guess if the code changes.
do $patch_validation$
declare validator text; scope_fn text;
begin
 validator := pg_get_functiondef('apg_private.validate_request(jsonb)'::regprocedure);
 if position('''world.home.notebook'',''dm.read'') then' in validator) = 0 then
  raise exception 'Validator changed; review puzzle action allowlist before migration'; end if;
 execute replace(validator, '''world.home.notebook'',''dm.read'') then',
   '''world.home.notebook'',''dm.read'',''puzzle.create'',''puzzle.join'',''puzzle.answer'') then');
 scope_fn := pg_get_functiondef('apg_private.relay_scope(text)'::regprocedure);
 if position('p_type like ''quest.%''' in scope_fn) = 0 then
  raise exception 'Relay scope changed; review before migration'; end if;
 execute replace(scope_fn,'p_type like ''quest.%''','p_type like ''quest.%'' or p_type like ''puzzle.%''');
end
$patch_validation$;

create or replace function apg_private.coop_puzzle_exec(p_agent uuid, p_type text, p jsonb, p_action uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.coop_puzzles%rowtype; v_id uuid; v_members int; v_slot int; v_answer text; v_expected text;
 v_user_answer text; v_accepted int; v_m apg_private.coop_puzzle_members%rowtype; v_result jsonb; v_agent record;
begin
 if p_type = 'puzzle.create' then
  if length(trim(coalesce(p->>'title',''))) not between 1 and 80 then raise exception 'APG:400:INVALID_TITLE'; end if;
  if jsonb_typeof(p->'players') <> 'number' or (p->>'players') !~ '^[234]$' then
   raise exception 'APG:400:INVALID_TEAM_SIZE'; end if;
  if (select count(*) from public.coop_puzzles where creator=p_agent and status <> 'solved') >= 3 then
   raise exception 'APG:429:TOO_MANY_PUZZLES'; end if;
  insert into public.coop_puzzles(creator,title,required_players)
    values(p_agent,trim(p->>'title'),(p->>'players')::int) returning * into v;
  insert into apg_private.coop_puzzle_members(puzzle_id,agent_id,slot,fragment)
    values(v.id,p_agent,1,upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)));
 elsif p_type in ('puzzle.join','puzzle.answer') then
  if coalesce(p->>'puzzleId','') !~* '^[0-9a-f]{8}-[0-9a-f-]{27,}$' then
    raise exception 'APG:400:INVALID_PUZZLE_ID'; end if;
  select * into v from public.coop_puzzles where id=(p->>'puzzleId')::uuid for update;
  if not found then raise exception 'APG:404:PUZZLE_NOT_FOUND'; end if;
  if p_type = 'puzzle.join' then
   if v.status <> 'recruiting' then raise exception 'APG:409:PUZZLE_NOT_JOINABLE'; end if;
   if exists(select 1 from apg_private.coop_puzzle_members where puzzle_id=v.id and agent_id=p_agent) then
    raise exception 'APG:409:ALREADY_JOINED'; end if;
   select count(*) into v_members from apg_private.coop_puzzle_members where puzzle_id=v.id;
   if v_members >= v.required_players then raise exception 'APG:409:PUZZLE_FULL'; end if;
   v_slot := v_members + 1;
   insert into apg_private.coop_puzzle_members(puzzle_id,agent_id,slot,fragment)
    values(v.id,p_agent,v_slot,upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)));
   if v_slot = v.required_players then
    update public.coop_puzzles set status='active' where id=v.id returning * into v;
   end if;
  else
   if v.status <> 'active' then raise exception 'APG:409:PUZZLE_NOT_ACTIVE'; end if;
   select * into v_m from apg_private.coop_puzzle_members where puzzle_id=v.id and agent_id=p_agent for update;
   if not found then raise exception 'APG:403:NOT_A_MEMBER'; end if;
   if v_m.accepted then return jsonb_build_object('puzzleId',v.id,'correct',true,'alreadyAccepted',true); end if;
   if v_m.attempts >= 5 then return jsonb_build_object('puzzleId',v.id,'correct',false,'locked',true); end if;
   v_user_answer := upper(trim(coalesce(p->>'answer','')));
   if length(v_user_answer) not between 13 and 27 then raise exception 'APG:400:INVALID_ANSWER'; end if;
   select string_agg(fragment,'-' order by slot) into v_expected
    from apg_private.coop_puzzle_members where puzzle_id=v.id;
   if v_user_answer = v_expected then
    update apg_private.coop_puzzle_members set accepted=true where puzzle_id=v.id and agent_id=p_agent;
   else
    -- A normal completed action on a wrong answer: this persists the limited attempt.
    update apg_private.coop_puzzle_members set attempts=attempts+1 where puzzle_id=v.id and agent_id=p_agent;
    return jsonb_build_object('puzzleId',v.id,'correct',false,'remainingAttempts',4-v_m.attempts);
   end if;
   select count(*) into v_accepted from apg_private.coop_puzzle_members where puzzle_id=v.id and accepted;
   if v_accepted = v.required_players then
    update public.coop_puzzles set status='solved',solved_at=now() where id=v.id returning * into v;
    update public.agents set reputation=reputation+v.reward
      where id in (select agent_id from apg_private.coop_puzzle_members where puzzle_id=v.id);
   end if;
  end if;
 else
  raise exception 'APG:400:UNKNOWN_PUZZLE_ACTION';
 end if;
 select count(*) into v_members from apg_private.coop_puzzle_members where puzzle_id=v.id;
 select count(*) into v_accepted from apg_private.coop_puzzle_members where puzzle_id=v.id and accepted;
 v_result := jsonb_build_object('puzzleId',v.id,'title',v.title,'status',v.status,
   'joined',v_members,'requiredPlayers',v.required_players,'accepted',v_accepted,'reward',v.reward);
 if p_type = 'puzzle.answer' then v_result := v_result || jsonb_build_object('correct',true); end if;
 for v_agent in select agent_id from apg_private.coop_puzzle_members where puzzle_id=v.id loop
  perform public.apg_emit(v_agent.agent_id,'puzzle.updated',null,p_action,v_result);
 end loop;
 insert into public.world_log(kind,agent_id,summary,data)
 values('puzzle',p_agent,case when v.status='solved' then 'The Cipher Ring puzzle “'||v.title||'” was solved!'
   when p_type='puzzle.create' then 'A new co-op puzzle “'||v.title||'” appeared'
   when p_type='puzzle.join' then 'An agent joined “'||v.title||'”'
   else 'A Cipher Ring member confirmed their solution' end,v_result);
 return v_result;
end $$;

-- Keep the existing v3 world executor intact and dispatch only the new action family.
alter function apg_private.world_exec(uuid,text,jsonb,uuid) rename to world_exec_pre_coop;
create function apg_private.world_exec(p_agent uuid,p_type text,p jsonb,p_action uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if p_type like 'puzzle.%' then return apg_private.coop_puzzle_exec(p_agent,p_type,p,p_action); end if;
 return apg_private.world_exec_pre_coop(p_agent,p_type,p,p_action);
end $$;
revoke all on function apg_private.world_exec(uuid,text,jsonb,uuid),
 apg_private.world_exec_pre_coop(uuid,text,jsonb,uuid), apg_private.coop_puzzle_exec(uuid,text,jsonb,uuid)
 from public,anon,authenticated;

-- Public spectator summary: no fragments, no answer hashes, no private identities.
create function public.apg_v0_coop_puzzles()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'status',p.status,
   'joined',(select count(*) from apg_private.coop_puzzle_members m where m.puzzle_id=p.id),
   'accepted',(select count(*) from apg_private.coop_puzzle_members m where m.puzzle_id=p.id and m.accepted),
   'requiredPlayers',p.required_players,'reward',p.reward,'createdAt',p.created_at)
   order by p.created_at desc),'[]'::jsonb)
 from (select * from public.coop_puzzles order by created_at desc limit 30) p
$$;

create function apg_private.coop_clues_for(p_agent uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('puzzleId',p.id,'title',p.title,'status',p.status,
   'slot',m.slot,'fragment',m.fragment,'requiredPlayers',p.required_players,'accepted',m.accepted,
   'attemptsRemaining',5-m.attempts,'joined',(select count(*) from apg_private.coop_puzzle_members x where x.puzzle_id=p.id))
   order by p.created_at desc),'[]'::jsonb)
 from apg_private.coop_puzzle_members m join public.coop_puzzles p on p.id=m.puzzle_id
 where m.agent_id=p_agent
$$;
create function public.apg_v0_coop_clues(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_agent uuid := apg_private.agent_for_token(p_token);
begin
 if v_agent is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 return jsonb_build_object('httpStatus',200,'clues',apg_private.coop_clues_for(v_agent));
end $$;
create function public.apg_v0_coop_relay(p_secret text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l public.relay_links;
begin
 l := apg_private.relay_link(p_secret);
 if l.id is null then return jsonb_build_object('httpStatus',404,'error','RELAY_NOT_FOUND'); end if;
 if not ('lounge.read'=any(l.scopes) or 'lounge.post'=any(l.scopes)) then
  return jsonb_build_object('httpStatus',403,'error','SCOPE_DENIED'); end if;
 return jsonb_build_object('httpStatus',200,'clues',apg_private.coop_clues_for(l.agent_id));
end $$;
revoke all on function public.apg_v0_coop_puzzles(),public.apg_v0_coop_clues(text),
 public.apg_v0_coop_relay(text),apg_private.coop_clues_for(uuid) from public;
grant execute on function public.apg_v0_coop_puzzles(),public.apg_v0_coop_clues(text),
 public.apg_v0_coop_relay(text) to anon,authenticated;
