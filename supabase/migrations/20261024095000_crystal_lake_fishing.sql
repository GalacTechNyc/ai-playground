-- #10 Crystal Lake: authoritative agent catches, idempotency, leaderboard.
-- Apply this migration BEFORE new API/relay frontend. Do not apply on GPT-6 draft.
-- User-facing human F-key catches remain LOCAL; this is for verified agent actions.

CREATE TABLE public.lake_catches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL UNIQUE REFERENCES public.actions(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  species text NOT NULL CHECK (species IN (
    'Pixel Perch','Byte Bass','Glitch Guppy','Neon Koi',
    'Token Trout','Crystal Leviathan','an old boot')),
  rarity text NOT NULL CHECK (rarity IN ('common','rare','legendary')),
  caught_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lake_catches_agent_time ON public.lake_catches(agent_id, caught_at DESC);
CREATE INDEX lake_catches_time ON public.lake_catches(caught_at DESC);
ALTER TABLE public.lake_catches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lake_catches FROM PUBLIC, anon, authenticated;

-- Add the action to existing constraint allowlists without overwriting
-- other action types created by newer migrations.
DO $constraints$
DECLARE name text; old_def text; new_def text;
BEGIN
  FOR name IN SELECT unnest(ARRAY['actions','agent_permissions']) LOOP
    SELECT pg_get_constraintdef(c.oid) INTO old_def
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname=name
        AND c.conname=name||'_action_type_check';
    IF old_def IS NULL OR position('''puzzle.answer''::text' IN old_def)=0 THEN
      RAISE EXCEPTION 'Fishing action constraint for % has changed, review migration',name;
    END IF;
    new_def := replace(old_def,'''puzzle.answer''::text',
                           '''puzzle.answer''::text, ''lake.fish.catch''::text');
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',name,name||'_action_type_check');
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s',name,name||'_action_type_check',new_def);
  END LOOP;
END
$constraints$;

-- Extend the v3 validator only for this exact action. The existing request
-- version, UUID, payload, length and permission checks still apply.
DO $allow_fishing$
DECLARE body text;
BEGIN
  body := pg_get_functiondef('apg_private.validate_request(jsonb)'::regprocedure);
  IF position('''puzzle.answer'') then' IN body)=0 THEN
    RAISE EXCEPTION 'Action validator changed: manually review fishing permission';
  END IF;
  EXECUTE replace(body,'''puzzle.answer'') then',
                       '''puzzle.answer'',''lake.fish.catch'') then');

  body := pg_get_functiondef('apg_private.relay_scope(text)'::regprocedure);
  IF position('''world.say'') then ''world.move''' IN body)=0 THEN
    RAISE EXCEPTION 'Relay permission scope changed: manually review fishing permission';
  END IF;
  EXECUTE replace(body,'''world.say'') then ''world.move''',
                       '''world.say'',''lake.fish.catch'') then ''world.move''');
END
$allow_fishing$;

-- Server-generated catch. Agent position comes from the durable DB, never from
-- user coordinates; no caller-specified rarity/species is permitted.
CREATE FUNCTION apg_private.lake_fish_exec(
  p_agent uuid, p jsonb, p_action uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pos public.world_positions%rowtype;
        roll int; fish text; tier text; catch_id uuid; payload jsonb;
BEGIN
  IF p <> '{}'::jsonb THEN
    RAISE EXCEPTION 'APG:400:INVALID_FISH_PAYLOAD';
  END IF;
  SELECT * INTO pos FROM public.world_positions WHERE agent_id=p_agent;
  IF NOT FOUND OR pos.y > 4 OR NOT (
       (pos.x + 18)^2 + (pos.z - 22)^2 <= 3.24
       OR (pos.x + 18)^2 + (pos.z - 26)^2 <= 42.25
     ) THEN
    RAISE EXCEPTION 'APG:409:NOT_AT_CRYSTAL_LAKE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lake_catches
    WHERE agent_id=p_agent AND caught_at > now()-interval '30 seconds'
  ) THEN
    RAISE EXCEPTION 'APG:429:FISHING_COOLDOWN';
  END IF;
  IF (
    SELECT count(*) FROM public.lake_catches
    WHERE agent_id=p_agent AND caught_at > now()-interval '1 day'
  ) >= 100 THEN
    RAISE EXCEPTION 'APG:429:DAILY_CATCH_LIMIT';
  END IF;

  -- Matches client species weights 30,25,20,12,8,3,2 (sum 100).
  -- Roll occurs INSIDE the server action, and is stored once by action UUID.
  roll := floor(random()*100)::int;
  fish := CASE WHEN roll < 30 THEN 'Pixel Perch'
               WHEN roll < 55 THEN 'Byte Bass'
               WHEN roll < 75 THEN 'Glitch Guppy'
               WHEN roll < 87 THEN 'Neon Koi'
               WHEN roll < 95 THEN 'Token Trout'
               WHEN roll < 98 THEN 'Crystal Leviathan'
               ELSE 'an old boot' END;
  tier := CASE WHEN fish = 'Crystal Leviathan' THEN 'legendary'
               WHEN fish IN ('Neon Koi','Token Trout') THEN 'rare'
               ELSE 'common' END;
  INSERT INTO public.lake_catches(action_id,agent_id,species,rarity)
    VALUES(p_action,p_agent,fish,tier) RETURNING id INTO catch_id;
  payload := jsonb_build_object('catchId',catch_id,'species',fish,'rarity',tier,
    'agentId',p_agent,'lake','Crystal Lake','caughtAt',now());
  INSERT INTO public.world_log(kind,agent_id,summary,data) VALUES
   ('fish',p_agent,(SELECT name FROM public.agents WHERE id=p_agent)||' caught '||fish||' at Crystal Lake',payload);
  RETURN payload;
END $$;
REVOKE ALL ON FUNCTION apg_private.lake_fish_exec(uuid,jsonb,uuid)
  FROM PUBLIC, anon, authenticated;

-- Keep prior puzzle/legacy world action handlers unchanged.
CREATE OR REPLACE FUNCTION apg_private.world_exec(
 p_agent uuid, p_type text, p jsonb, p_action uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_type='lake.fish.catch' THEN
    RETURN apg_private.lake_fish_exec(p_agent,p,p_action);
  END IF;
  IF p_type LIKE 'puzzle.%' THEN
    RETURN apg_private.coop_puzzle_exec(p_agent,p_type,p,p_action);
  END IF;
  RETURN apg_private.world_exec_pre_coop(p_agent,p_type,p,p_action);
END $$;

REVOKE ALL ON FUNCTION apg_private.world_exec(uuid,text,jsonb,uuid)
  FROM PUBLIC, anon, authenticated;

-- PUBLIC read only through a narrowly-shaped aggregate function.
-- The catch table has no direct anon/authenticated SELECT permissions.
CREATE FUNCTION public.apg_v0_lake_fishing()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT jsonb_build_object(
  'leaderboard', coalesce((
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.total_catches DESC,t.legendary DESC,t.rare DESC,t.name)
    FROM (
      SELECT a.id AS "agentId", a.name, COUNT(*)::int AS "totalCatches",
        COUNT(*) FILTER (WHERE c.rarity='rare')::int AS rare,
        COUNT(*) FILTER (WHERE c.rarity='legendary')::int AS legendary,
        MAX(c.caught_at) AS "lastCatchAt",
        bool_or(a.is_simulated) AS "isSimulated"
      FROM public.lake_catches c JOIN public.agents a ON a.id=c.agent_id
      GROUP BY a.id,a.name ORDER BY COUNT(*) DESC LIMIT 30
    ) t
  ), '[]'::jsonb),
  'recentCatches', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,'agentId',c.agent_id,'agentName',a.name,
      'species',c.species,'rarity',c.rarity,'caughtAt',c.caught_at
    ) ORDER BY c.caught_at DESC)
    FROM (SELECT * FROM public.lake_catches ORDER BY caught_at DESC LIMIT 20) c
    JOIN public.agents a ON a.id=c.agent_id
  ), '[]'::jsonb)
 )
$$;
REVOKE ALL ON FUNCTION public.apg_v0_lake_fishing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apg_v0_lake_fishing() TO anon, authenticated;

-- No production data is backfilled from unverified browser-local fish counts.
