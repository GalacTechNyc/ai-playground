-- Fix #10 follow-up: serialize per-agent fishing cooldown and daily catch caps.
--
-- The current act_v2 caller already locks the agent row, but that behavior is
-- an incidental property of a different executor. Lock INSIDE the fishing
-- function, so future authorized dispatch paths cannot race on a separate
-- action ID. A row lock is held through the catch INSERT and transaction commit.
--
-- Use clock_timestamp() AFTER acquiring the lock to avoid time becoming stale
-- if another cast held the lock for a while. This migration only replaces
-- apg_private.lake_fish_exec; no table/grant/permission changes.

CREATE OR REPLACE FUNCTION apg_private.lake_fish_exec(
  p_agent uuid, p jsonb, p_action uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  pos public.world_positions%rowtype;
  v_now timestamptz;
  roll int;
  fish text;
  tier text;
  catch_id uuid;
  payload jsonb;
BEGIN
  IF p <> '{}'::jsonb THEN
    RAISE EXCEPTION 'APG:400:INVALID_FISH_PAYLOAD';
  END IF;

  -- Serialize ALL casts by one passport, even when request IDs differ. Locking
  -- the durable agent row works for first-ever catches (no catches to lock).
  -- Always acquire this before inspecting cooldown or 24-hour counts.
  PERFORM 1 FROM public.agents WHERE id = p_agent FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APG:401:UNAUTHORIZED'; END IF;
  v_now := clock_timestamp();

  SELECT * INTO pos FROM public.world_positions WHERE agent_id = p_agent;
  IF NOT FOUND OR pos.y > 4 OR NOT (
       (pos.x + 18)^2 + (pos.z - 22)^2 <= 3.24
       OR (pos.x + 18)^2 + (pos.z - 26)^2 <= 42.25
     ) THEN
    RAISE EXCEPTION 'APG:409:NOT_AT_CRYSTAL_LAKE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lake_catches
    WHERE agent_id = p_agent AND caught_at > v_now - interval '30 seconds'
  ) THEN
    RAISE EXCEPTION 'APG:429:FISHING_COOLDOWN';
  END IF;

  IF (
    SELECT count(*) FROM public.lake_catches
    WHERE agent_id = p_agent AND caught_at > v_now - interval '1 day'
  ) >= 100 THEN
    RAISE EXCEPTION 'APG:429:DAILY_CATCH_LIMIT';
  END IF;

  roll := floor(random() * 100)::int;
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

  INSERT INTO public.lake_catches(action_id, agent_id, species, rarity, caught_at)
    VALUES (p_action, p_agent, fish, tier, v_now) RETURNING id INTO catch_id;

  payload := jsonb_build_object('catchId',catch_id,'species',fish,'rarity',tier,
    'agentId',p_agent,'lake','Crystal Lake','caughtAt',v_now);

  INSERT INTO public.world_log(kind, agent_id, summary, data) VALUES
    ('fish',p_agent,
      (SELECT name FROM public.agents WHERE id=p_agent)||' caught '||fish||' at Crystal Lake',
      payload);
  RETURN payload;
END $$;

REVOKE ALL ON FUNCTION apg_private.lake_fish_exec(uuid,jsonb,uuid)
  FROM PUBLIC, anon, authenticated;
