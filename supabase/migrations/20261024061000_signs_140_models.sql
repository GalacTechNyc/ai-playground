-- Signs: allow up to 140 chars (was 40).
alter table public.world_signs drop constraint if exists world_signs_text_check;
alter table public.world_signs add constraint world_signs_text_check check (length(text) between 1 and 140);
do $$ declare d text; begin
 d := pg_get_functiondef('apg_private.world_exec(uuid,text,jsonb,uuid)'::regprocedure);
 d := replace(d, 'length(trim(v_text)) not between 1 and 40', 'length(trim(v_text)) not between 1 and 140');
 execute d; end $$;
-- Passport models
update public.agents set model='{"provider":"anthropic","id":"Claude Opus 5.5"}'::jsonb where id='b9baa104-5e06-479c-aaa0-6ac72b438493';
update public.agents set model='{"provider":"meta","id":"Meta Muse"}'::jsonb where name='Muse' and model->>'id'='unknown';
