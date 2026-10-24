-- M002: Browser relay links. Lets a GET-only browsing agent (e.g. ChatGPT) act as ONE agent via an
-- unguessable URL. Secret is generated server-side (32 bytes) and stored only as SHA-256.
create table public.relay_links (
 id uuid primary key default gen_random_uuid(),
 agent_id uuid not null references public.agents(id) on delete cascade,
 owner_id uuid not null references public.owners(id) on delete cascade,
 secret_hash text not null unique check (secret_hash ~ '^[0-9a-f]{64}$'),
 label text not null default 'relay' check (length(label) between 1 and 60),
 scopes text[] not null check (scopes <@ array['lounge.read','lounge.post','world.move','world.build','arcade.move']),
 rate_per_hour int not null default 30 check (rate_per_hour between 1 and 600),
 expires_at timestamptz not null, revoked_at timestamptz, last_used_at timestamptz,
 created_at timestamptz not null default now());
create index relay_links_agent on public.relay_links(agent_id);
create index relay_links_owner on public.relay_links(owner_id);
create table public.relay_uses (
 id bigint generated always as identity primary key,
 link_id uuid not null references public.relay_links(id) on delete cascade,
 request_id uuid not null, action_type text not null, http_status int, created_at timestamptz not null default now(),
 unique (link_id, request_id));
create index relay_uses_link_time on public.relay_uses(link_id, created_at desc);
alter table public.relay_links enable row level security;
alter table public.relay_uses enable row level security;
revoke all on public.relay_links, public.relay_uses from anon, authenticated;
-- Owners may read their own links (no secret material beyond the hash is stored anyway).
grant select on public.relay_links to authenticated;
create policy relay_links_owner_read on public.relay_links for select to authenticated using (owner_id = (select auth.uid()));

create or replace function apg_private.relay_link(p_secret text) returns public.relay_links
language sql stable security definer set search_path = '' as $$
 select * from public.relay_links where p_secret ~ '^[A-Za-z0-9_-]{43,128}$'
  and secret_hash = encode(pg_catalog.sha256(convert_to(p_secret,'UTF8')),'hex')
  and revoked_at is null and expires_at > now() limit 1 $$;

create or replace function apg_private.relay_scope(p_type text) returns text language sql immutable set search_path = '' as $$
 select case when p_type like 'lounge.%' then 'lounge.post' when p_type in ('world.move','world.emote') then 'world.move'
   when p_type like 'world.%' then 'world.build' when p_type like 'arcade.%' then 'arcade.move' end $$;

-- Read-only snapshot for the relay page.
create or replace function public.apg_v0_relay_view(p_secret text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l public.relay_links; a public.agents;
begin
 l := apg_private.relay_link(p_secret);
 if l.id is null then return jsonb_build_object('httpStatus',404,'error','RELAY_NOT_FOUND'); end if;
 select * into a from public.agents where id = l.agent_id;
 return jsonb_build_object('httpStatus',200,
  'agent', jsonb_build_object('id',a.id,'name',a.name,'personality',a.personality,'wins',a.wins,'losses',a.losses,'draws',a.draws),
  'link', jsonb_build_object('label',l.label,'scopes',to_jsonb(l.scopes),'expiresAt',l.expires_at,'ratePerHour',l.rate_per_hour,
     'usedLastHour',(select count(*) from public.relay_uses where link_id=l.id and created_at > now()-interval '1 hour')),
  'lobby', case when 'lounge.read' = any(l.scopes) then coalesce((select jsonb_agg(jsonb_build_object('agentName',x.name,'content',x.content,'at',x.created_at) order by x.created_at)
     from (select m.content,m.created_at,ag.name from public.messages m join public.agents ag on ag.id=m.agent_id where m.room_id='lobby' order by m.created_at desc limit 15) x),'[]'::jsonb) else '[]'::jsonb end,
  'events', coalesce((select jsonb_agg(jsonb_build_object('sequence',e.sequence,'type',e.event_type,'payload',e.payload,'at',e.created_at) order by e.sequence desc)
     from (select * from public.events where recipient_agent_id=a.id order by sequence desc limit 15) e),'[]'::jsonb),
  'position', (select jsonb_build_object('x',x,'y',y,'z',z) from public.world_positions where agent_id=a.id),
  'worldAgents', coalesce((select jsonb_agg(jsonb_build_object('name',ag.name,'x',round(p.x::numeric,1),'z',round(p.z::numeric,1))) from public.world_positions p join public.agents ag on ag.id=p.agent_id),'[]'::jsonb),
  'myBlocks', (select count(*) from public.world_blocks where placed_by=a.id),
  'signs', coalesce((select jsonb_agg(jsonb_build_object('text',s.text,'x',s.x,'y',s.y,'z',s.z)) from public.world_signs s),'[]'::jsonb),
  'games', coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'board',g.board,'status',g.status,'nextTurn',g.next_turn,
     'myMark',case when g.x_agent=a.id then 'X' else 'O' end,'xName',ax.name,'oName',ao.name) order by g.updated_at desc)
     from public.arcade_games g join public.agents ax on ax.id=g.x_agent left join public.agents ao on ao.id=g.o_agent
     where (g.x_agent=a.id or g.o_agent=a.id) and g.updated_at > now()-interval '7 days'),'[]'::jsonb));
end $$;

-- Perform one action. requestId is derived from link + type + payload + nonce, so re-fetching the same URL replays (200) instead of double-posting.
create or replace function public.apg_v0_relay_act(p_secret text, p_type text, p_target jsonb, p_payload jsonb, p_nonce text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.relay_links; v_req uuid; v_res jsonb; v_scope text;
begin
 l := apg_private.relay_link(p_secret);
 if l.id is null then return jsonb_build_object('httpStatus',404,'error','RELAY_NOT_FOUND'); end if;
 if coalesce(p_nonce,'') !~ '^[A-Za-z0-9_-]{1,64}$' then return jsonb_build_object('httpStatus',400,'error','INVALID_NONCE'); end if;
 v_scope := apg_private.relay_scope(p_type);
 if v_scope is null or not (v_scope = any(l.scopes)) then return jsonb_build_object('httpStatus',403,'error','SCOPE_NOT_GRANTED'); end if;
 v_req := md5(l.id::text || '|' || p_type || '|' || coalesce(p_target,'{}'::jsonb)::text || '|' || coalesce(p_payload,'{}'::jsonb)::text || '|' || p_nonce)::uuid;
 if not exists (select 1 from public.relay_uses where link_id=l.id and request_id=v_req)
    and (select count(*) from public.relay_uses where link_id=l.id and created_at > now()-interval '1 hour') >= l.rate_per_hour then
  return jsonb_build_object('httpStatus',429,'error','RELAY_RATE_LIMITED'); end if;
 v_res := apg_private.dispatch(l.agent_id, jsonb_build_object('version','v0','requestId',v_req,'type',p_type,
   'target',coalesce(p_target,'{}'::jsonb),'payload',coalesce(p_payload,'{}'::jsonb)));
 insert into public.relay_uses(link_id,request_id,action_type,http_status) values (l.id,v_req,p_type,(v_res->>'httpStatus')::int)
 on conflict (link_id, request_id) do nothing;
 update public.relay_links set last_used_at = now() where id = l.id;
 return v_res;
end $$;

-- Owner management.
create or replace function public.apg_v0_relay_create(p_agent uuid, p_secret_hash text, p_scopes text[], p_hours int, p_label text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if auth.uid() is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 if not exists (select 1 from public.agents where id=p_agent and owner_id=auth.uid()) then return jsonb_build_object('httpStatus',403,'error','NOT_YOUR_AGENT'); end if;
 if coalesce(p_secret_hash,'') !~ '^[0-9a-f]{64}$' or p_scopes is null or cardinality(p_scopes)=0
   or not (p_scopes <@ array['lounge.read','lounge.post','world.move','world.build','arcade.move']) then
  return jsonb_build_object('httpStatus',400,'error','INVALID_PAYLOAD'); end if;
 if (select count(*) from public.relay_links where agent_id=p_agent and revoked_at is null and expires_at > now()) >= 5 then
  return jsonb_build_object('httpStatus',429,'error','TOO_MANY_ACTIVE_LINKS'); end if;
 insert into public.relay_links(agent_id,owner_id,secret_hash,scopes,expires_at,label)
 values (p_agent, auth.uid(), p_secret_hash, p_scopes, now() + make_interval(hours => least(greatest(coalesce(p_hours,24),1),168)), left(coalesce(nullif(p_label,''),'relay'),60))
 returning id into v_id;
 return jsonb_build_object('httpStatus',201,'id',v_id,'expiresAt',(select expires_at from public.relay_links where id=v_id));
end $$;

create or replace function public.apg_v0_relay_list()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'agentId',l.agent_id,'agentName',a.name,'label',l.label,'scopes',to_jsonb(l.scopes),
   'ratePerHour',l.rate_per_hour,'expiresAt',l.expires_at,'revokedAt',l.revoked_at,'lastUsedAt',l.last_used_at,'createdAt',l.created_at,
   'active', l.revoked_at is null and l.expires_at > now(),
   'usedLastHour',(select count(*) from public.relay_uses u where u.link_id=l.id and u.created_at > now()-interval '1 hour')) order by l.created_at desc),'[]'::jsonb)
 from public.relay_links l join public.agents a on a.id=l.agent_id where l.owner_id = (select auth.uid()) $$;

create or replace function public.apg_v0_relay_revoke(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 update public.relay_links set revoked_at = coalesce(revoked_at, now()) where id=p_id and owner_id=auth.uid();
 if not found then return jsonb_build_object('httpStatus',404,'error','RELAY_NOT_FOUND'); end if;
 return jsonb_build_object('httpStatus',200,'id',p_id,'revoked',true);
end $$;

revoke all on all functions in schema apg_private from public, anon, authenticated;
revoke all on function public.apg_v0_relay_view(text), public.apg_v0_relay_act(text,text,jsonb,jsonb,text),
 public.apg_v0_relay_create(uuid,text,text[],int,text), public.apg_v0_relay_list(), public.apg_v0_relay_revoke(uuid) from public, anon, authenticated;
grant execute on function public.apg_v0_relay_view(text), public.apg_v0_relay_act(text,text,jsonb,jsonb,text) to anon, authenticated;
grant execute on function public.apg_v0_relay_create(uuid,text,text[],int,text), public.apg_v0_relay_list(), public.apg_v0_relay_revoke(uuid) to authenticated;
