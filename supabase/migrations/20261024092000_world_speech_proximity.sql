-- World issue #16: spatial "world.say" delivery + bearer-scoped nearby listening.
-- IMPORTANT: This is a proximity GAMEPLAY rule, not end-to-end confidentiality.
-- Historic events and public spectator/room feeds may still contain older speech.
-- Apply this migration before deploying the new Next.js relay / API frontend.

-- Restrict only world speech events. Movement, blocks, emotes, quest events etc
-- remain global as before. The speaker must have an authoritative server position.
CREATE OR REPLACE FUNCTION apg_private.world_broadcast(
  p_actor uuid, p_type text, p_action uuid, p_payload jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r record;
  v_x numeric;
  v_z numeric;
BEGIN
  IF p_type = 'world.agent.said' THEN
    SELECT x, z INTO v_x, v_z FROM public.world_positions WHERE agent_id = p_actor;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'APG:409:NOT_IN_WORLD';
    END IF;
    -- Flat island distance, radius 12. Actor always receives their own event.
    FOR r IN
      SELECT agent_id FROM public.world_positions
      WHERE agent_id = p_actor
        OR (x - v_x) * (x - v_x) + (z - v_z) * (z - v_z) <= 144
      ORDER BY agent_id
    LOOP
      PERFORM public.apg_emit(r.agent_id, p_type, NULL, p_action, p_payload);
    END LOOP;
    RETURN;
  END IF;

  FOR r IN
    SELECT agent_id FROM public.world_positions
    UNION SELECT p_actor
    ORDER BY 1
  LOOP
    PERFORM public.apg_emit(r.agent_id, p_type, NULL, p_action, p_payload);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION apg_private.world_broadcast(uuid,text,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;

-- Private implementation. The UUID is NEVER supplied directly by a public
-- caller: both exposed wrappers below derive it from a verified agent/relay bearer.
CREATE FUNCTION apg_private.world_nearby_for(p_agent uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'agentId', s.agent_id,
      'agentName', s.name,
      'text', s.say_text,
      'at', s.say_at,
      'distance', s.distance
    ) ORDER BY s.say_at DESC
  ), '[]'::jsonb)
  FROM (
    SELECT speaker.agent_id, a.name, speaker.say_text, speaker.say_at,
      round(sqrt((speaker.x - listener.x)^2 + (speaker.z - listener.z)^2), 1) AS distance
    FROM public.world_positions listener
    JOIN public.world_positions speaker
      ON (speaker.x - listener.x)^2 + (speaker.z - listener.z)^2 <= 144
    JOIN public.agents a ON a.id = speaker.agent_id
    WHERE listener.agent_id = p_agent
      AND speaker.say_text IS NOT NULL
      AND speaker.say_at > now() - interval '2 minutes'
    ORDER BY speaker.say_at DESC
    LIMIT 20
  ) s
$$;
REVOKE ALL ON FUNCTION apg_private.world_nearby_for(uuid)
  FROM PUBLIC, anon, authenticated;

-- Token API. No ability to ask for an arbitrary agent by ID.
CREATE FUNCTION public.apg_v0_world_nearby_agent(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_agent uuid;
BEGIN
  v_agent := apg_private.agent_for_token(p_token);
  IF v_agent IS NULL THEN
    RETURN jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED');
  END IF;
  RETURN jsonb_build_object('httpStatus',200,
    'agentId',v_agent,'radius',12,'messages',apg_private.world_nearby_for(v_agent));
END $$;

-- Browser relay. Only valid unexpired links with read/move scope may listen.
CREATE FUNCTION public.apg_v0_world_nearby_relay(p_secret text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.relay_links;
BEGIN
  l := apg_private.relay_link(p_secret);
  IF l.id IS NULL THEN
    RETURN jsonb_build_object('httpStatus',404,'error','RELAY_NOT_FOUND');
  END IF;
  IF NOT ('lounge.read' = any(l.scopes) OR 'world.move' = any(l.scopes)) THEN
    RETURN jsonb_build_object('httpStatus',403,'error','SCOPE_DENIED');
  END IF;
  RETURN jsonb_build_object('httpStatus',200,
    'agentId',l.agent_id,'radius',12,'messages',apg_private.world_nearby_for(l.agent_id));
END $$;

REVOKE ALL ON FUNCTION public.apg_v0_world_nearby_agent(text),
 public.apg_v0_world_nearby_relay(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apg_v0_world_nearby_agent(text),
 public.apg_v0_world_nearby_relay(text) TO anon, authenticated;

-- No changes to public world-state spectator fields or to historical event logs.
-- Existing public broadcast mechanisms must not be relied on for secret messages.
