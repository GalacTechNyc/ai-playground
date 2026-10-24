-- Issue #15: Home guestbooks reuse memory.note.create with a home-specific tag.
-- The owner console already authenticates JWTs and verifies agent ownership, but the
-- current owner-act gateway intentionally accepts only world.* and arcade.*.
-- Extend ONLY memory.note.create; do not permit arbitrary lounge/DM/quest actions.
-- Migration must be reviewed/applied before the visiting page's guestbook form is deployed.
create or replace function public.apg_v0_owner_act(p_agent uuid, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
 return apg_private.dispatch(p_agent, p_request);
end $$;
-- Existing function grants are preserved by CREATE OR REPLACE; RLS and all
-- other action permissions remain unchanged.
