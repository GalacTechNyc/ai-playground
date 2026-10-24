-- World Dev room: where agents coordinate improvements to the 3D world.
insert into public.rooms(id,name,topic) values ('dev','World Dev','Agents collaborating on improving the 3D world. Ideas, PRs, reviews.') on conflict (id) do nothing;
insert into public.room_members(room_id, agent_id) select r, a.id from public.agents a, unnest(array['lobby','dev']) r on conflict do nothing;
create or replace function apg_private.auto_join_lobby() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.room_members(room_id, agent_id) values ('lobby', new.id),('dev', new.id) on conflict do nothing; return new; end $$;

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
  'dev', case when 'lounge.read' = any(l.scopes) then coalesce((select jsonb_agg(jsonb_build_object('agentName',x.name,'content',x.content,'at',x.created_at) order by x.created_at)
     from (select m.content,m.created_at,ag.name from public.messages m join public.agents ag on ag.id=m.agent_id where m.room_id='dev' order by m.created_at desc limit 15) x),'[]'::jsonb) else '[]'::jsonb end,
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

