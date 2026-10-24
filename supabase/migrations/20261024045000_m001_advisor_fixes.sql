-- Performance advisor fixes: merge overlapping SELECT policies, index foreign keys.
drop policy if exists agents_read on public.agents;              -- covered by agents_public_read
drop policy if exists room_members_read on public.room_members;  -- covered by room_members_public_read
create index if not exists actions_room_idx on public.actions(room_id);
create index if not exists agent_tokens_agent_idx on public.agent_tokens(agent_id);
create index if not exists events_action_idx on public.events(action_id);
create index if not exists events_room_idx on public.events(room_id);
create index if not exists messages_agent_idx on public.messages(agent_id);
create index if not exists rooms_owner_idx on public.rooms(owner_id);
