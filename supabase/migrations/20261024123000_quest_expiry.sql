-- #17 Quest Board phase 1: server-enforced quest deadlines and clear expired state.
-- No escrow or multi-claim changes: existing rewards and owner approvals remain intact.
-- Stage/test this migration before frontend deployment.

ALTER TABLE public.quests
  ADD COLUMN expires_at timestamptz;
ALTER TABLE public.quests
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');
CREATE INDEX quests_deadline_active_idx ON public.quests(expires_at)
  WHERE status IN ('open','claimed');

ALTER TABLE public.quests DROP CONSTRAINT quests_status_check;
ALTER TABLE public.quests ADD CONSTRAINT quests_status_check CHECK (
  status IN ('open','claimed','submitted','done','cancelled','expired')
);

-- Keep the existing v3 quest lifecycle function unchanged and wrap ONLY
-- quest create/claim/submit. Other v3 actions delegate without modification.
ALTER FUNCTION apg_private.world_exec_v3(uuid,text,jsonb,uuid)
  RENAME TO world_exec_v3_before_expiry;

CREATE FUNCTION apg_private.world_exec_v3(
  p_agent uuid, p_type text, p jsonb, p_action uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_result jsonb;
  v_hours int := 168;
  v_quest_id uuid;
  v_deadline timestamptz;
BEGIN
  IF p_type = 'quest.create' THEN
    IF p ? 'expiresInHours' THEN
      IF jsonb_typeof(p->'expiresInHours') <> 'number'
         OR (p->>'expiresInHours') !~ '^[0-9]{1,3}$'
         OR (p->>'expiresInHours')::int NOT BETWEEN 1 AND 720 THEN
        RAISE EXCEPTION 'APG:400:INVALID_QUEST_EXPIRY';
      END IF;
      v_hours := (p->>'expiresInHours')::int;
    END IF;

    -- Persist the expired state, freeing slots in the existing 10-active-quest
    -- quota without rewriting that trusted quota logic. Do NOT close quests
    -- with submitted proof; the creator may approve those after the deadline.
    UPDATE public.quests SET status='expired', updated_at=clock_timestamp()
      WHERE status IN ('open','claimed') AND expires_at <= clock_timestamp();

    v_result := apg_private.world_exec_v3_before_expiry(p_agent,p_type,p,p_action);
    v_quest_id := (v_result->>'questId')::uuid;
    UPDATE public.quests
      SET expires_at = clock_timestamp() + make_interval(hours => v_hours)
      WHERE id=v_quest_id
      RETURNING expires_at INTO v_deadline;
    RETURN v_result || jsonb_build_object('expiresAt', v_deadline);

  ELSIF p_type IN ('quest.claim','quest.submit') THEN
    -- Lock the quest before checking the expiry to avoid a concurrent
    -- claim or submit slipping past the deadline.
    IF coalesce(p->>'questId','') ~* '^[0-9a-f]{8}-[0-9a-f-]{27,}$' THEN
      SELECT expires_at INTO v_deadline
      FROM public.quests WHERE id=(p->>'questId')::uuid FOR UPDATE;
      IF FOUND AND v_deadline IS NOT NULL AND v_deadline <= clock_timestamp() THEN
        RAISE EXCEPTION 'APG:409:QUEST_EXPIRED';
      END IF;
    END IF;
  END IF;

  RETURN apg_private.world_exec_v3_before_expiry(p_agent,p_type,p,p_action);
END $$;

REVOKE ALL ON FUNCTION
  apg_private.world_exec_v3(uuid,text,jsonb,uuid),
  apg_private.world_exec_v3_before_expiry(uuid,text,jsonb,uuid)
FROM PUBLIC, anon, authenticated;

-- The public API includes both the deadline and a derived expired state, even
-- before a later create operation persists the 'expired' terminal status.
CREATE OR REPLACE FUNCTION public.apg_v0_quests()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'title',q.title,'details',q.details,'reward',q.reward,
    'status',CASE WHEN q.status IN ('open','claimed')
                   AND q.expires_at <= now() THEN 'expired' ELSE q.status END,
    'proof',q.proof,'creatorId',q.creator,'creatorName',c.name,
    'claimerId',q.claimer,'claimerName',k.name,
    'createdAt',q.created_at,'updatedAt',q.updated_at,
    'expiresAt',q.expires_at
  ) ORDER BY
    CASE WHEN q.status IN ('open','claimed') AND q.expires_at <= now() THEN 4
         WHEN q.status='open' THEN 0 WHEN q.status='claimed' THEN 1
         WHEN q.status='submitted' THEN 2 WHEN q.status='done' THEN 3 ELSE 5 END,
    q.updated_at DESC
  ), '[]'::jsonb)
  FROM (SELECT * FROM public.quests ORDER BY updated_at DESC LIMIT 200) q
  JOIN public.agents c ON c.id=q.creator
  LEFT JOIN public.agents k ON k.id=q.claimer
$$;

-- Keep the in-world Quest Board from showing past-due 'open' quests.
-- Patch only the old selector; explicitly fail review if upstream changed it.
DO $patch_world_board$
DECLARE fn text;
  old_filter text := 'where status in (''open'',''claimed'',''submitted'') order by updated_at desc limit 8';
  new_filter text := 'where status = ''submitted'' or (status in (''open'',''claimed'') and (expires_at is null or expires_at > now())) order by updated_at desc limit 8';
BEGIN
  fn := pg_get_functiondef('public.apg_v0_world_state(timestamptz)'::regprocedure);
  IF position(old_filter in fn) = 0 THEN
    RAISE EXCEPTION 'World Quest Board SQL changed; review deadline selector';
  END IF;
  EXECUTE replace(fn,old_filter,new_filter);
END
$patch_world_board$;

-- 'submitted' quests may still be approved after the deadline.
-- Existing agent action permissions, action idempotency, reputation and
-- cancellation semantics remain unchanged.
