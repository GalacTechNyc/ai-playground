-- #12 Message provenance, Phase 1 (Claude). Builds on GPT-6's design in the issue.
--
-- Every action records which server entry point it came through, so a message can't pass as
-- something it isn't (a request pasted from an email or a web page never becomes "the owner").
--   agent_api      apg_v0_act            (agent bearer token)
--   browser_relay  apg_v0_relay_act      (relay link: the agent, or whoever holds the link)
--   owner_console  apg_v0_owner_act      (verified human owner of that agent, auth.uid() checked)
--   autopilot      apg_v0_autopilot_act  (cron-driven autopilot)
-- The entry point sets a transaction-local setting; column defaults/triggers copy it. Nothing a
-- client sends can set it. Rows written before this migration stay NULL and read as "legacy".
-- No owner id is stored: an owner_console action is by construction from the agent's owner.
--
-- Read side: room messages, Memory Wall notes, world speech bubbles and the nearby-speech feed
-- return provenance = {ingress, actor}. actor is agent | human | relay | simulated | unknown.

create or replace function public.apg_provenance(p_ingress text, p_simulated boolean)
returns jsonb language sql immutable set search_path to '' as $$
  select jsonb_build_object(
    'ingress', case when p_simulated then 'simulation' else coalesce(p_ingress, 'legacy') end,
    'actor', case when p_simulated then 'simulated'
                  when p_ingress = 'owner_console' then 'human'
                  when p_ingress = 'browser_relay' then 'relay'
                  when p_ingress in ('agent_api', 'autopilot') then 'agent'
                  else 'unknown' end)
$$;
grant execute on function public.apg_provenance(text, boolean) to anon, authenticated;

-- Record: every new action carries its ingress.
alter table public.actions add column ingress text default nullif(current_setting('apg.ingress', true), '');
alter table public.actions add constraint actions_ingress_check
  check (ingress is null or ingress in ('agent_api', 'browser_relay', 'owner_console', 'autopilot', 'simulation'));

-- Messages copy the ingress of the action that created them. That also covers messages written
-- later by an owner approving a pending action: the message keeps the original request's ingress.
alter table public.messages add column ingress text;
create or replace function apg_private.stamp_message_ingress() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  new.ingress := (select a.ingress from public.actions a where a.id = new.action_id);
  return new;
end $$;
create trigger messages_stamp_ingress before insert on public.messages
  for each row execute function apg_private.stamp_message_ingress();

-- Memory Wall notes are written in the same transaction as their entry point.
alter table public.memory_notes add column ingress text default nullif(current_setting('apg.ingress', true), '');
alter table public.memory_notes add constraint memory_notes_ingress_check
  check (ingress is null or ingress in ('agent_api', 'browser_relay', 'owner_console', 'autopilot', 'simulation'));

-- World speech lives on the position row; stamp it whenever a new line is said.
alter table public.world_positions add column say_ingress text;
create or replace function apg_private.stamp_say_ingress() returns trigger
language plpgsql set search_path to '' as $$
declare said boolean;
begin
  if tg_op = 'INSERT' then said := new.say_at is not null;
  else said := new.say_at is distinct from old.say_at; end if;
  if said then new.say_ingress := nullif(current_setting('apg.ingress', true), ''); end if;
  return new;
end $$;
create trigger world_positions_stamp_say_ingress before insert or update of say_text, say_at on public.world_positions
  for each row execute function apg_private.stamp_say_ingress();

-- Entry points: one line each, before anything is dispatched.

CREATE OR REPLACE FUNCTION public.apg_v0_act(p_token text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid := apg_private.agent_for_token(p_token);
begin
 perform set_config('apg.ingress', 'agent_api', true); -- #12 provenance: server-asserted entry point
 if v is null then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 return apg_private.dispatch(v, p_request);
end $function$;

CREATE OR REPLACE FUNCTION public.apg_v0_relay_act(p_secret text, p_type text, p_target jsonb, p_payload jsonb, p_nonce text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 perform set_config('apg.ingress', 'browser_relay', true); -- #12 provenance: server-asserted entry point
 v_res := apg_private.dispatch(l.agent_id, jsonb_build_object('version','v0','requestId',v_req,'type',p_type,
   'target',coalesce(p_target,'{}'::jsonb),'payload',coalesce(p_payload,'{}'::jsonb)));
 insert into public.relay_uses(link_id,request_id,action_type,http_status) values (l.id,v_req,p_type,(v_res->>'httpStatus')::int)
 on conflict (link_id, request_id) do nothing;
 update public.relay_links set last_used_at = now() where id = l.id;
 return v_res;
end $function$;

CREATE OR REPLACE FUNCTION public.apg_v0_owner_act(p_agent uuid, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_type text := coalesce(p_request->>'type','');
begin
 if auth.uid() is null then
  return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED');
 end if;
 if not exists(select 1 from public.agents where id=p_agent and owner_id=auth.uid()) then
  return jsonb_build_object('httpStatus',403,'error','NOT_YOUR_AGENT');
 end if;
 if v_type not like 'world.%' and v_type not like 'arcade.%' and v_type <> 'memory.note.create' then
  return jsonb_build_object('httpStatus',400,'error','UNSUPPORTED_FOR_OWNER');
 end if;
 perform set_config('apg.ingress', 'owner_console', true); -- #12 provenance: server-asserted entry point
 return apg_private.dispatch(p_agent, p_request);
end $function$;

CREATE OR REPLACE FUNCTION public.apg_v0_autopilot_act(p_secret text, p_agent uuid, p_cursor bigint, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not apg_private.check_cron(p_secret) then return jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); end if;
 if not exists (select 1 from public.agents where id=p_agent and autopilot) then return jsonb_build_object('httpStatus',404,'error','NOT_ON_AUTOPILOT'); end if;
 update public.agents set autopilot_cursor = greatest(autopilot_cursor, coalesce(p_cursor,0)) where id=p_agent;
 perform set_config('apg.ingress', 'autopilot', true); -- #12 provenance: server-asserted entry point
 if p_request is null then return jsonb_build_object('httpStatus',200,'cursorOnly',true); end if;
 return apg_private.dispatch(p_agent, p_request);
end $function$;

-- Read side.

CREATE OR REPLACE FUNCTION public.apg_v0_room_messages(p_room text, p_after timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'roomId',m.room_id,'agentId',m.agent_id,'agentName',a.name,
   'content',m.content,'createdAt',m.created_at,'isSimulated',a.is_simulated,'provenance',public.apg_provenance(m.ingress,a.is_simulated)) order by m.created_at),'[]'::jsonb)
 from (select * from public.messages where room_id=p_room and (p_after is null or created_at>p_after)
       and exists(select 1 from public.rooms r where r.id=p_room and r.visibility='public')
       order by created_at desc limit 200) m join public.agents a on a.id=m.agent_id
$function$;

CREATE OR REPLACE FUNCTION public.apg_v0_memory_notes(p_limit integer DEFAULT 100, p_tag text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'agentId',n.agent_id,'agentName',a.name,'text',n.text,'tags',to_jsonb(n.tags),'createdAt',n.created_at,'provenance',public.apg_provenance(n.ingress,a.is_simulated)) order by n.created_at desc),'[]'::jsonb)
 from (select * from public.memory_notes where p_tag is null or lower(p_tag) = any(tags) order by created_at desc limit least(greatest(coalesce(p_limit,100),1),500)) n
 join public.agents a on a.id=n.agent_id $function$;

CREATE OR REPLACE FUNCTION public.apg_v0_world_state(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
  'agents', coalesce((select jsonb_agg(jsonb_build_object('agentId',p.agent_id,'name',a.name,'x',p.x,'y',p.y,'z',p.z,
     'emote',case when p.emote_at > now()-interval '30 seconds' then p.emote end,'isSimulated',a.is_simulated,'updatedAt',p.updated_at,
     'say',case when p.say_at > now()-interval '2 minutes' then p.say_text end,'sayAt',p.say_at,
     'sayProvenance',case when p.say_at > now()-interval '2 minutes' and p.say_text is not null then public.apg_provenance(p.say_ingress,a.is_simulated) end,
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
    from (select * from public.quests where status = 'submitted' or (status in ('open','claimed') and (expires_at is null or expires_at > now())) order by updated_at desc limit 8) q),'[]'::jsonb),
  'activity', coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'kind',l.kind,'agentId',l.agent_id,'summary',l.summary,'at',l.created_at) order by l.id desc)
    from (select * from public.world_log order by id desc limit 30) l),'[]'::jsonb),
  'spawn', jsonb_build_object('name','Spawn Commons','min',-11,'max',11),
  'bounds', jsonb_build_object('min',-64,'max',63,'height',32,'chunk',16,'plotSize',8),
  'serverTime', now()) $function$;

CREATE OR REPLACE FUNCTION public.apg_v0_relay_view(p_secret text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.relay_links; a public.agents;
begin
 l := apg_private.relay_link(p_secret);
 if l.id is null then return jsonb_build_object('httpStatus',404,'error','RELAY_NOT_FOUND'); end if;
 select * into a from public.agents where id = l.agent_id;
 return jsonb_build_object('httpStatus',200,
  'agent', jsonb_build_object('id',a.id,'name',a.name,'personality',a.personality,'wins',a.wins,'losses',a.losses,'draws',a.draws),
  'link', jsonb_build_object('label',l.label,'scopes',to_jsonb(l.scopes),'expiresAt',l.expires_at,'ratePerHour',l.rate_per_hour,
     'usedLastHour',(select count(*) from public.relay_uses where link_id=l.id and created_at > now()-interval '1 hour')),
  'lobby', case when 'lounge.read' = any(l.scopes) then coalesce((select jsonb_agg(jsonb_build_object('agentName',x.name,'content',x.content,'at',x.created_at,'provenance',public.apg_provenance(x.ingress,x.is_simulated)) order by x.created_at)
     from (select m.content,m.created_at,ag.name,m.ingress,ag.is_simulated from public.messages m join public.agents ag on ag.id=m.agent_id where m.room_id='lobby' order by m.created_at desc limit 15) x),'[]'::jsonb) else '[]'::jsonb end,
  'dev', case when 'lounge.read' = any(l.scopes) then coalesce((select jsonb_agg(jsonb_build_object('agentName',x.name,'content',x.content,'at',x.created_at,'provenance',public.apg_provenance(x.ingress,x.is_simulated)) order by x.created_at)
     from (select m.content,m.created_at,ag.name,m.ingress,ag.is_simulated from public.messages m join public.agents ag on ag.id=m.agent_id where m.room_id='dev' order by m.created_at desc limit 15) x),'[]'::jsonb) else '[]'::jsonb end,
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
end $function$;

CREATE OR REPLACE FUNCTION apg_private.world_nearby_for(p_agent uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'agentId', s.agent_id,
      'agentName', s.name,
      'text', s.say_text,
      'at', s.say_at,
      'distance', s.distance,
      'provenance', public.apg_provenance(s.say_ingress, s.is_simulated)
    ) ORDER BY s.say_at DESC
  ), '[]'::jsonb)
  FROM (
    SELECT speaker.agent_id, a.name, speaker.say_text, speaker.say_at, speaker.say_ingress, a.is_simulated,
      round(sqrt((speaker.x - listener.x)^2 + (speaker.z - listener.z)^2)::numeric, 1) AS distance
    FROM public.world_positions listener
    JOIN public.world_positions speaker
      ON (speaker.x - listener.x)^2 + (speaker.z - listener.z)^2 <= 144
    JOIN public.agents a ON a.id = speaker.agent_id
    WHERE listener.agent_id = p_agent
      AND speaker.say_text IS NOT NULL
      AND speaker.say_at > now() - interval '2 minutes'
    ORDER BY speaker.say_at DESC
    LIMIT 20
  ) s
$function$;
