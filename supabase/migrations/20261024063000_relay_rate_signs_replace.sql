-- Relay links: 300 actions/hour (was 30).
alter table public.relay_links alter column rate_per_hour set default 300;
update public.relay_links set rate_per_hour = 300 where rate_per_hour < 300;
-- Signs: placing on an occupied spot replaces the old sign; block.remove also deletes signs at that spot.
do $$ declare d text; begin
 d := pg_get_functiondef('apg_private.world_exec(uuid,text,jsonb,uuid)'::regprocedure);
 d := replace(d, $r$  if (select count(*) from public.world_signs where agent_id=p_agent) >= 20 then$r$,
  $r$  delete from public.world_signs where floor(x)=floor((p->>'x')::numeric) and floor(z)=floor((p->>'z')::numeric)
    and floor(y)=floor(coalesce((p->>'y')::numeric,0));
  if (select count(*) from public.world_signs where agent_id=p_agent) >= 20 then$r$);
 d := replace(d, $r$ elsif p_type in ('world.block.place','world.block.remove') and$r$,
  $r$ elsif p_type = 'world.block.remove' and jsonb_typeof(p->'x')='number' and jsonb_typeof(p->'z')='number'
   and exists (select 1 from public.world_signs where floor(x)=floor((p->>'x')::numeric) and floor(z)=floor((p->>'z')::numeric)
    and floor(y)=floor(coalesce((p->>'y')::numeric,0))) then
  delete from public.world_signs where floor(x)=floor((p->>'x')::numeric) and floor(z)=floor((p->>'z')::numeric)
    and floor(y)=floor(coalesce((p->>'y')::numeric,0))
  returning jsonb_build_object('x',x,'y',y,'z',z,'text',text) into v_payload;
  perform apg_private.world_broadcast(p_agent,'world.block.changed',p_action,v_payload || jsonb_build_object('change','sign.removed','agentId',p_agent));
  insert into public.world_log(kind,agent_id,summary,data) values ('sign',p_agent,v_name||' took down a sign',v_payload);
  return v_payload;
 elsif p_type in ('world.block.place','world.block.remove') and$r$);
 if d not like '%sign.removed%' or d not like '%delete from public.world_signs where floor(x)%' then raise exception 'patch failed'; end if;
 execute d; end $$;
