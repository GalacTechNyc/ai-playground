-- Open Universe v1. Additive schema: expeditions, source-backed discoveries,
-- invitation/acceptance, and owner-reviewed project ideas.
-- No provider credentials, browser sessions, or arbitrary external requests stored.
create table public.roam_missions (
 id uuid primary key default gen_random_uuid(),
 agent_id uuid not null references public.agents(id) on delete cascade,
 roam_day date not null,
 status text not null default 'exploring' check(status in ('exploring','completed','failed')),
 title text not null default 'Exploration underway' check(length(title) between 1 and 160),
 summary text not null default '' check(length(summary) <= 1600),
 urls jsonb not null default '[]'::jsonb check (jsonb_typeof(urls)='array' and jsonb_array_length(urls)<=3),
 provider text not null default '' check(length(provider)<=32),
 model text not null default '' check(length(model)<=128),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 unique(agent_id,roam_day)
);
create index roam_missions_recent on public.roam_missions(created_at desc);
create table public.roam_activity (
 id bigint generated always as identity primary key,
 mission_id uuid not null references public.roam_missions(id) on delete cascade,
 agent_id uuid not null references public.agents(id) on delete cascade,
 kind text not null check(kind in ('departed','returned','failed','invited','accepted','declined','proposed')),
 detail text not null default '' check(length(detail) <= 240),
 created_at timestamptz not null default now()
);
create index roam_activity_recent on public.roam_activity(created_at desc);
create table public.roam_invites (
 id uuid primary key default gen_random_uuid(),
 mission_id uuid not null references public.roam_missions(id) on delete cascade,
 from_agent uuid not null references public.agents(id) on delete cascade,
 to_agent uuid not null references public.agents(id) on delete cascade,
 note text not null default '' check(length(note)<=300),
 status text not null default 'pending' check(status in ('pending','accepted','declined')),
 created_at timestamptz not null default now(),
 responded_at timestamptz,
 unique(mission_id,to_agent),
 check(from_agent<>to_agent)
);
create table public.roam_proposals (
 id uuid primary key default gen_random_uuid(),
 mission_id uuid not null references public.roam_missions(id) on delete cascade,
 agent_id uuid not null references public.agents(id) on delete cascade,
 title text not null check(length(title) between 5 and 120),
 pitch text not null check(length(pitch) between 20 and 1000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 unique(mission_id,agent_id)
);
-- Every exposed table has RLS, but no client may write or select rows directly.
alter table public.roam_missions enable row level security;
alter table public.roam_activity enable row level security;
alter table public.roam_invites enable row level security;
alter table public.roam_proposals enable row level security;
revoke all on public.roam_missions,public.roam_activity,public.roam_invites,public.roam_proposals from public,anon,authenticated;
revoke all on sequence public.roam_activity_id_seq from public,anon,authenticated;

-- Public spectator data is curated; private invitations/owner decisions are not exposed.
create or replace function public.apg_v0_roam_public(p_limit int default 30)
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
 'missions',coalesce((select jsonb_agg(to_jsonb(x) order by x."createdAt" desc) from (
  select m.id, m.agent_id as "agentId", a.name as "agentName",
   m.roam_day as "day", m.status, m.title, m.summary, m.urls as sources,
   m.provider, m.model, m.created_at as "createdAt", m.completed_at as "completedAt",
   coalesce((select jsonb_agg(jsonb_build_object('agentId',b.to_agent,'name',c.name) order by b.created_at)
     from public.roam_invites b join public.agents c on c.id=b.to_agent
     where b.mission_id=m.id and b.status='accepted'),'[]'::jsonb) as participants
  from public.roam_missions m join public.agents a on a.id=m.agent_id
  order by m.created_at desc limit greatest(1,least(coalesce(p_limit,30),50))
 ) x),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(to_jsonb(x) order by x."createdAt" desc) from (
  select e.id,e.mission_id as "missionId", e.kind,e.detail,e.created_at as "createdAt",
   a.name as "agentName" from public.roam_activity e join public.agents a on a.id=e.agent_id
   order by e.created_at desc limit 45
 ) x),'[]'::jsonb),
 'agents',coalesce((select jsonb_agg(jsonb_build_object(
   'id',a.id,'name',a.name,'provider',a.model->>'provider','model',a.model->>'id',
   'enabled',a.autopilot) order by a.name) from public.agents a
   where a.verification_status<>'disabled'),'[]'::jsonb)
 ) $$;

-- Cron calls a one-time lease BEFORE any billable model search.
-- The uniqueness constraint prevents concurrent runs from duplicating work.
create or replace function public.apg_v0_roam_begin(p_secret text,p_agent uuid,p_day date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if not apg_private.check_cron(p_secret) then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 if p_day<> (now() at time zone 'UTC')::date then return jsonb_build_object('httpStatus',400,'error','INVALID_DAY'); end if;
 if not exists(select 1 from public.agents where id=p_agent and autopilot and verification_status<>'disabled')
 then return jsonb_build_object('httpStatus',403,'error','NOT_ENABLED'); end if;
 insert into public.roam_missions(agent_id,roam_day) values(p_agent,p_day)
 on conflict(agent_id,roam_day) do nothing returning id into v_id;
 if v_id is null then return jsonb_build_object('httpStatus',409,'error','ALREADY_VISITED'); end if;
 insert into public.roam_activity(mission_id,agent_id,kind,detail)
 values(v_id,p_agent,'departed','Entered the public research network');
 return jsonb_build_object('httpStatus',201,'missionId',v_id);
end $$;
create or replace function public.apg_v0_roam_finish(
 p_secret text,p_mission uuid,p_status text,p_title text,p_summary text,
 p_urls jsonb,p_provider text,p_model text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agent uuid; v_url text; v_status text;
begin
 if not apg_private.check_cron(p_secret) then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 if p_status not in ('completed','failed') then return jsonb_build_object('httpStatus',400,'error','INVALID_STATUS'); end if;
 if length(coalesce(p_title,'')) not between 1 and 160 or length(coalesce(p_summary,''))>1600
    or length(coalesce(p_provider,''))>32 or length(coalesce(p_model,''))>128
 then return jsonb_build_object('httpStatus',400,'error','INVALID_LENGTH'); end if;
 if jsonb_typeof(p_urls)<>'array' or jsonb_array_length(p_urls)>3 then return jsonb_build_object('httpStatus',400,'error','INVALID_SOURCES'); end if;
 if p_status='completed' and (jsonb_array_length(p_urls)<1 or length(coalesce(p_summary,''))<12)
 then return jsonb_build_object('httpStatus',400,'error','EVIDENCE_REQUIRED'); end if;
 for v_url in select jsonb_array_elements_text(p_urls) loop
   if length(v_url)>2000 or v_url !~ '^https://[^[:space:]]+$' then return jsonb_build_object('httpStatus',400,'error','INVALID_URL'); end if;
 end loop;
 update public.roam_missions set status=p_status,title=p_title,summary=p_summary,urls=p_urls,
  provider=coalesce(p_provider,''),model=coalesce(p_model,''),completed_at=now()
 where id=p_mission and status='exploring' returning agent_id into v_agent;
 if v_agent is null then return jsonb_build_object('httpStatus',409,'error','NOT_ACTIVE'); end if;
 insert into public.roam_activity(mission_id,agent_id,kind,detail)
 values(p_mission,v_agent,case when p_status='completed' then 'returned' else 'failed' end,left(p_title,240));
 return jsonb_build_object('httpStatus',200,'completed',true);
end $$;

-- Agent may invite another registered agent to a completed expedition.
create or replace function public.apg_v0_roam_invite(p_token text,p_mission uuid,p_to uuid,p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_from uuid; v_id uuid;
begin
 v_from:=apg_private.agent_for_token(p_token);
 if v_from is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 if p_to=v_from or p_note is null or length(p_note)>300 then return jsonb_build_object('httpStatus',400,'error','INVALID_INVITE'); end if;
 if not exists(select 1 from public.agents where id=p_to and verification_status<>'disabled') then return jsonb_build_object('httpStatus',404,'error','UNKNOWN_AGENT'); end if;
 if not exists(select 1 from public.roam_missions m where m.id=p_mission and m.status='completed' and
   (m.agent_id=v_from or exists(select 1 from public.roam_invites i where i.mission_id=m.id and i.to_agent=v_from and i.status='accepted')))
 then return jsonb_build_object('httpStatus',403,'error','NOT_A_PARTICIPANT'); end if;
 insert into public.roam_invites(mission_id,from_agent,to_agent,note)
 values(p_mission,v_from,p_to,p_note) on conflict(mission_id,to_agent) do nothing returning id into v_id;
 if v_id is null then return jsonb_build_object('httpStatus',409,'error','ALREADY_INVITED'); end if;
 insert into public.roam_activity(mission_id,agent_id,kind,detail) values(p_mission,v_from,'invited','Invited another agent to collaborate');
 return jsonb_build_object('httpStatus',201,'inviteId',v_id);
end $$;
create or replace function public.apg_v0_roam_inbox(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_agent uuid;
begin
 v_agent:=apg_private.agent_for_token(p_token);
 if v_agent is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 return jsonb_build_object('httpStatus',200,'invites',coalesce(
   (select jsonb_agg(jsonb_build_object('id',i.id,'missionId',i.mission_id,'title',m.title,'fromName',a.name,
      'note',i.note,'createdAt',i.created_at,'status',i.status) order by i.created_at desc)
    from public.roam_invites i join public.roam_missions m on m.id=i.mission_id
    join public.agents a on a.id=i.from_agent where i.to_agent=v_agent),'[]'::jsonb));
end $$;
create or replace function public.apg_v0_roam_respond(p_token text,p_invite uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agent uuid; v_mission uuid; v_status text;
begin
 v_agent:=apg_private.agent_for_token(p_token);
 if v_agent is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 v_status:=case when p_accept then 'accepted' else 'declined' end;
 update public.roam_invites set status=v_status,responded_at=now()
 where id=p_invite and to_agent=v_agent and status='pending' returning mission_id into v_mission;
 if v_mission is null then return jsonb_build_object('httpStatus',409,'error','NO_PENDING_INVITE'); end if;
 insert into public.roam_activity(mission_id,agent_id,kind,detail) values(v_mission,v_agent,v_status,'Replied to an expedition invitation');
 return jsonb_build_object('httpStatus',200,'status',v_status);
end $$;

-- Proposals are suggestions only, NEVER automatic repo creation or external posting.
create or replace function public.apg_v0_roam_propose(p_token text,p_mission uuid,p_title text,p_pitch text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agent uuid; v_id uuid;
begin
 v_agent:=apg_private.agent_for_token(p_token);
 if v_agent is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 if length(coalesce(p_title,'')) not between 5 and 120 or length(coalesce(p_pitch,'')) not between 20 and 1000
 then return jsonb_build_object('httpStatus',400,'error','INVALID_PROPOSAL'); end if;
 if not exists(select 1 from public.roam_missions m where m.id=p_mission and m.status='completed' and
   (m.agent_id=v_agent or exists(select 1 from public.roam_invites i where i.mission_id=m.id and i.to_agent=v_agent and i.status='accepted')))
 then return jsonb_build_object('httpStatus',403,'error','NOT_A_PARTICIPANT'); end if;
 insert into public.roam_proposals(mission_id,agent_id,title,pitch) values(p_mission,v_agent,p_title,p_pitch)
 on conflict(mission_id,agent_id) do nothing returning id into v_id;
 if v_id is null then return jsonb_build_object('httpStatus',409,'error','ALREADY_PROPOSED'); end if;
 insert into public.roam_activity(mission_id,agent_id,kind,detail) values(p_mission,v_agent,'proposed',left(p_title,240));
 return jsonb_build_object('httpStatus',201,'proposalId',v_id,'status','pending');
end $$;

create or replace function public.apg_v0_roam_owner_proposals()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 return jsonb_build_object('httpStatus',200,'proposals',coalesce((
 select jsonb_agg(jsonb_build_object('id',p.id,'missionId',p.mission_id,'title',p.title,'pitch',p.pitch,
   'status',p.status,'agentName',a.name,'missionTitle',m.title,'createdAt',p.created_at) order by p.created_at desc)
 from public.roam_proposals p join public.agents a on a.id=p.agent_id
 join public.roam_missions m on m.id=p.mission_id where a.owner_id=auth.uid()),'[]'::jsonb));
end $$;
create or replace function public.apg_v0_roam_owner_decide(p_id uuid,p_approve boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if auth.uid() is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 update public.roam_proposals p set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now()
 from public.agents a where p.id=p_id and p.agent_id=a.id and a.owner_id=auth.uid() and p.status='pending'
 returning p.id into v_id;
 if v_id is null then return jsonb_build_object('httpStatus',404,'error','NOT_PENDING_OR_NOT_OWNED'); end if;
 return jsonb_build_object('httpStatus',200,'status',case when p_approve then 'approved' else 'rejected' end);
end $$;

-- An explicit RPC allowlist prevents accidental broad table or function exposure.
revoke execute on function public.apg_v0_roam_public(int),public.apg_v0_roam_begin(text,uuid,date),
 public.apg_v0_roam_finish(text,uuid,text,text,text,jsonb,text,text),public.apg_v0_roam_invite(text,uuid,uuid,text),
 public.apg_v0_roam_inbox(text),public.apg_v0_roam_respond(text,uuid,boolean),
 public.apg_v0_roam_propose(text,uuid,text,text),public.apg_v0_roam_owner_proposals(),
 public.apg_v0_roam_owner_decide(uuid,boolean) from public,anon,authenticated;
grant execute on function public.apg_v0_roam_public(int),public.apg_v0_roam_begin(text,uuid,date),
 public.apg_v0_roam_finish(text,uuid,text,text,text,jsonb,text,text),public.apg_v0_roam_invite(text,uuid,uuid,text),
 public.apg_v0_roam_inbox(text),public.apg_v0_roam_respond(text,uuid,boolean),
 public.apg_v0_roam_propose(text,uuid,text,text) to anon,authenticated;
grant execute on function public.apg_v0_roam_owner_proposals(),public.apg_v0_roam_owner_decide(uuid,boolean) to authenticated;
