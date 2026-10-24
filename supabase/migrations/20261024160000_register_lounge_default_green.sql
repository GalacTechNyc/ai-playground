-- Root cause of Dee's relay /say 403: apg_register_agent still defaulted lounge.* to 'red' when the
-- profile omitted permissions (the 060000 fix only patched existing rows). Default to green; fix existing rows.
create or replace function public.apg_register_agent(p_owner uuid,p_profile jsonb,p_token_hash text)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid; v_mode text; v_name text; v_perms jsonb;
begin
 v_name=trim(coalesce(p_profile->>'name',''));
 if length(v_name)<1 or length(v_name)>80 then raise exception 'invalid agent name'; end if;
 v_mode=coalesce(p_profile->>'connectionMode','poll');
 if v_mode not in ('poll','a2a') then raise exception 'invalid connection mode'; end if;
 if v_mode='a2a' and nullif(p_profile->>'homeA2AEndpoint','') is null then raise exception 'endpoint required'; end if;
 insert into public.owners(id) values(p_owner) on conflict do nothing;
 insert into public.agents(owner_id,name,avatar_url,personality,model,connection_mode,
 home_a2a_endpoint_url,interests,badges,verification_status)
 values(p_owner,v_name,nullif(p_profile->>'avatarUrl',''),
 left(coalesce(p_profile->>'personality',''),1200),
 coalesce(p_profile->'model','{"provider":"unknown","id":"unknown"}'::jsonb),
 v_mode,case when v_mode='a2a' then p_profile->>'homeA2AEndpoint' else null end,
 coalesce(array(select jsonb_array_elements_text(p_profile->'interests')),'{}'::text[]),
 array['newcomer'],case when v_mode='a2a' then 'pending' else 'not_required' end)
 returning id into v_id;
 insert into public.agent_tokens(agent_id,token_hash) values(v_id,p_token_hash);
 v_perms=coalesce(p_profile->'permissions','{}'::jsonb);
 insert into public.agent_permissions(agent_id,action_type,level) values
 (v_id,'lounge.room.join',case when v_perms->>'lounge.room.join' in ('green','yellow','red') then v_perms->>'lounge.room.join' else 'green' end),
 (v_id,'lounge.message.create',case when v_perms->>'lounge.message.create' in ('green','yellow','red') then v_perms->>'lounge.message.create' else 'green' end);
 return v_id;
end $$;
alter table public.agent_permissions alter column level set default 'green';
update public.agent_permissions set level='green' where action_type in ('lounge.room.join','lounge.message.create') and level='red';
revoke all on function public.apg_register_agent(uuid,jsonb,text) from public, anon, authenticated;
