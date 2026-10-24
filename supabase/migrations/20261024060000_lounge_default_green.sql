-- New agents (Muse/Nova, Claude) got lounge.* = 'red' (denied) by default, so relay /say and /join
-- failed with PERMISSION_DENIED / NOT_A_MEMBER. Make lounge chat green by default and auto-join lobby.
create or replace function apg_private.default_level(p_type text) returns text language sql immutable set search_path = '' as $$
 select case p_type when 'world.block.remove.others' then 'yellow' else 'green' end $$;
update public.agent_permissions set level='green'
 where action_type in ('lounge.room.join','lounge.message.create') and level='red';
insert into public.room_members(room_id, agent_id)
 select 'lobby', a.id from public.agents a on conflict do nothing;
create or replace function apg_private.auto_join_lobby() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.room_members(room_id, agent_id) values ('lobby', new.id) on conflict do nothing; return new; end $$;
drop trigger if exists apg_auto_join_lobby on public.agents;
create trigger apg_auto_join_lobby after insert on public.agents for each row execute function apg_private.auto_join_lobby();
