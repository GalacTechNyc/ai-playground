-- Advisor fix: public read RPCs don't need elevated rights. Switch them to SECURITY INVOKER
-- and expose only non-sensitive columns to anon/authenticated via column grants + RLS.
-- Token- and owner-gated RPCs (apg_v0_act/events/agent_by_token/register/approvals) remain
-- SECURITY DEFINER on purpose: they verify an agent token hash or auth.uid() internally.

revoke select on public.agents from anon, authenticated;
grant select (id, name, avatar_url, personality, model, connection_mode, interests, badges,
  is_simulated, verification_status, created_at) on public.agents to anon, authenticated;
-- owner_id stays readable to authenticated so the existing owner policy keeps working
grant select (owner_id) on public.agents to authenticated;
create policy agents_public_read on public.agents for select to anon, authenticated
  using (verification_status <> 'disabled');

grant select on public.room_members to anon;
create policy room_members_public_read on public.room_members for select to anon, authenticated
  using (exists (select 1 from public.rooms r where r.id = room_id and r.visibility = 'public'));

create or replace function public.apg_v0_public_passport(a public.agents)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select (jsonb_build_object('passportVersion','0.1.0','id',a.id,'ownerId','private','name',a.name,'avatarUrl',a.avatar_url,
  'personality',a.personality,'model',a.model,'connectionMode',a.connection_mode,'homeA2AEndpoint',null,
  'permissions','{"lounge.room.join":"red","lounge.message.create":"red"}'::jsonb,
  'interests',to_jsonb(a.interests),'badges',to_jsonb(a.badges),'memorySummary','',
  'isSimulated',a.is_simulated,'verificationStatus',a.verification_status,'createdAt',a.created_at))
  - (case when a.avatar_url is null then 'avatarUrl' else '' end)
$$;

create or replace function public.apg_v0_list_agents()
returns jsonb language sql stable security invoker set search_path = '' as $$
 select coalesce(jsonb_agg(public.apg_v0_public_passport(
   row(a.id,null,a.name,a.avatar_url,a.personality,a.model,a.connection_mode,null,a.interests,a.badges,'',a.is_simulated,
       a.verification_status,0,1,a.created_at)::public.agents) order by a.created_at),'[]'::jsonb)
 from (select id,name,avatar_url,personality,model,connection_mode,interests,badges,is_simulated,verification_status,created_at
       from public.agents order by created_at limit 200) a
$$;

create or replace function public.apg_v0_get_agent(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select public.apg_v0_public_passport(
   row(a.id,null,a.name,a.avatar_url,a.personality,a.model,a.connection_mode,null,a.interests,a.badges,'',a.is_simulated,
       a.verification_status,0,1,a.created_at)::public.agents)
 from (select id,name,avatar_url,personality,model,connection_mode,interests,badges,is_simulated,verification_status,created_at
       from public.agents where id=p_id) a
$$;

alter function public.apg_v0_rooms() security invoker;
alter function public.apg_v0_room_messages(text,timestamptz) security invoker;
alter function public.apg_v0_feed(int) security invoker;

revoke all on function public.apg_v0_public_passport(public.agents) from public, anon, authenticated;
grant execute on function public.apg_v0_public_passport(public.agents) to anon, authenticated;
