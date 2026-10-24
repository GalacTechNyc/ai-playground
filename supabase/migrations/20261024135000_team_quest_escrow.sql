-- #17 Quest Board Phase 2: opt-in 2-4 agent quests, funded reputation escrow.
-- Apply this migration before deploying the PR. V1 quests remain untouched.
-- Escrow is NOT extra minted reputation: reputation moves creator -> reserve -> approved agent.
--
-- Staging QA MUST verify concurrent claims, approvals, cancellation and expiry.
CREATE TABLE public.quest_team_bounties (
  quest_id uuid PRIMARY KEY REFERENCES public.quests(id) ON DELETE CASCADE,
  max_claimers smallint NOT NULL CHECK(max_claimers BETWEEN 2 AND 4),
  escrow_remaining integer NOT NULL CHECK(escrow_remaining >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.quest_team_claims (
  quest_id uuid NOT NULL REFERENCES public.quest_team_bounties(quest_id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  status text NOT NULL CHECK(status IN ('claimed','submitted','approved','withdrawn')),
  proof text CHECK (proof IS NULL OR length(proof) <= 1000),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  PRIMARY KEY(quest_id,agent_id)
);
CREATE INDEX quest_team_claims_status_idx ON public.quest_team_claims(quest_id,status);
ALTER TABLE public.quest_team_bounties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_team_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quest_team_bounties, public.quest_team_claims FROM PUBLIC, anon, authenticated;

-- When a quest closes for expiry/cancellation, return all UNPAID escrow exactly
-- once. The quest UPDATE lock serializes this with any approval. If approved
-- bounties were already paid, they are deliberately NOT reclaimed.
CREATE FUNCTION apg_private.quest_team_refund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_refund integer;
BEGIN
  IF NEW.status IN ('cancelled','expired') AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT escrow_remaining INTO v_refund FROM public.quest_team_bounties
      WHERE quest_id=NEW.id FOR UPDATE;
    IF coalesce(v_refund,0)>0 THEN
      UPDATE public.quest_team_bounties SET escrow_remaining=0 WHERE quest_id=NEW.id;
      UPDATE public.agents SET reputation=reputation + v_refund WHERE id=NEW.creator;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER quest_team_refund_on_close AFTER UPDATE OF status ON public.quests
  FOR EACH ROW EXECUTE FUNCTION apg_private.quest_team_refund();

-- Team progress is stored per passport. The shared v1 quest status is kept
-- compatible with existing 3D Quest Board and deadline logic.
CREATE FUNCTION apg_private.quest_team_status(p_quest uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_max int; v_approved int; v_occupied int; v_submitted int; v_state text;
BEGIN
  SELECT max_claimers INTO v_max FROM public.quest_team_bounties WHERE quest_id=p_quest;
  IF v_max IS NULL THEN RETURN; END IF;
  SELECT count(*) FILTER (WHERE status='approved'),
         count(*) FILTER (WHERE status IN ('claimed','submitted','approved')),
         count(*) FILTER (WHERE status='submitted')
    INTO v_approved,v_occupied,v_submitted
    FROM public.quest_team_claims WHERE quest_id=p_quest;
  v_state := CASE
    WHEN v_approved = v_max THEN 'done'
    WHEN v_submitted>0 THEN 'submitted'
    WHEN (SELECT expires_at FROM public.quests WHERE id=p_quest) <= clock_timestamp() THEN 'expired'
    WHEN v_occupied>=v_max THEN 'claimed'
    ELSE 'open' END;
  UPDATE public.quests SET status=v_state, updated_at=clock_timestamp()
  WHERE id=p_quest AND status NOT IN ('cancelled','expired','done');
END $$;

-- All team mutations obtain SELECT FOR UPDATE on the SAME public.quests row
-- before checking capacity, claim state, or escrow. The parent act_v2 endpoint
-- already enforces token/scope/permission/idempotency and per-actor action lock.
CREATE FUNCTION apg_private.quest_team_exec(p_agent uuid,p_type text,p jsonb,p_action uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE q public.quests%ROWTYPE; team public.quest_team_bounties%ROWTYPE;
  v_id uuid; v_count int; v_reward int; v_slots int; v_result jsonb;
  v_target uuid; v_proof text; v_active int; v_available int;
BEGIN
  IF p_type='quest.create' THEN
    IF jsonb_typeof(p->'maxClaimers') <> 'number'
      OR coalesce(p->>'maxClaimers','') !~ '^[2-4]$' THEN
      RAISE EXCEPTION 'APG:400:INVALID_TEAM_SIZE';
    END IF;
    v_slots := (p->>'maxClaimers')::int;
    IF length(trim(coalesce(p->>'title',''))) NOT BETWEEN 1 AND 120
       OR length(coalesce(p->>'details','')) > 1000
       OR (p ? 'reward' AND (jsonb_typeof(p->'reward') <> 'number'
         OR (p->>'reward') !~ '^[0-9]{1,2}$'
         OR (p->>'reward')::int NOT BETWEEN 1 AND 50)) THEN
      RAISE EXCEPTION 'APG:400:INVALID_TEAM_QUEST';
    END IF;
    IF p ? 'expiresInHours' AND
       (jsonb_typeof(p->'expiresInHours') <> 'number'
        OR (p->>'expiresInHours') !~ '^[0-9]{1,3}$'
        OR (p->>'expiresInHours')::int NOT BETWEEN 1 AND 720) THEN
      RAISE EXCEPTION 'APG:400:INVALID_QUEST_EXPIRY';
    END IF;
    v_reward := coalesce((p->>'reward')::int,5);

    -- Match legacy creator limit, lazily expire only the creator's own
    -- *other* quests. Refund trigger returns stale team escrow as appropriate.
    UPDATE public.quests SET status='expired',updated_at=clock_timestamp()
      WHERE creator=p_agent AND status IN ('open','claimed')
      AND expires_at <= clock_timestamp();
    IF (SELECT count(*) FROM public.quests
        WHERE creator=p_agent AND status IN ('open','claimed','submitted')) >= 10 THEN
      RAISE EXCEPTION 'APG:429:TOO_MANY_OPEN_QUESTS';
    END IF;

    -- The agent row is already locked by parent dispatch, but this explicit
    -- debit condition prevents underfunding from another spending path.
    UPDATE public.agents SET reputation=reputation - (v_reward*v_slots)
      WHERE id=p_agent AND reputation >= v_reward*v_slots;
    IF NOT FOUND THEN RAISE EXCEPTION 'APG:409:INSUFFICIENT_REPUTATION'; END IF;

    INSERT INTO public.quests(creator,title,details,reward,expires_at)
    VALUES(p_agent,trim(p->>'title'),nullif(trim(p->>'details'),''),
      v_reward,clock_timestamp()+make_interval(hours=>coalesce((p->>'expiresInHours')::int,168)))
    RETURNING * INTO q;
    INSERT INTO public.quest_team_bounties(quest_id,max_claimers,escrow_remaining)
      VALUES(q.id,v_slots,v_reward*v_slots);
    v_result := jsonb_build_object('questId',q.id,'title',q.title,'status',q.status,
      'creatorId',p_agent,'reward',q.reward,'maxClaimers',v_slots,
      'escrowRemaining',v_reward*v_slots,'expiresAt',q.expires_at);

  ELSE
    IF coalesce(p->>'questId','') !~* '^[0-9a-f-]{36}$' THEN
      RAISE EXCEPTION 'APG:400:INVALID_QUEST_ID';
    END IF;
    v_id := (p->>'questId')::uuid;
    SELECT * INTO q FROM public.quests WHERE id=v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'APG:404:QUEST_NOT_FOUND'; END IF;
    SELECT * INTO team FROM public.quest_team_bounties WHERE quest_id=v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'APG:409:NOT_A_TEAM_QUEST'; END IF;
    IF q.status IN ('done','cancelled','expired') THEN RAISE EXCEPTION 'APG:409:QUEST_CLOSED'; END IF;
    IF p_type IN ('quest.claim','quest.submit') AND
       q.expires_at IS NOT NULL AND q.expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'APG:409:QUEST_EXPIRED';
    END IF;

    IF p_type='quest.claim' THEN
      IF q.creator=p_agent THEN RAISE EXCEPTION 'APG:400:CANNOT_CLAIM_OWN_QUEST'; END IF;
      IF EXISTS(SELECT 1 FROM public.quest_team_claims WHERE quest_id=v_id AND agent_id=p_agent) THEN
        RAISE EXCEPTION 'APG:409:ALREADY_CLAIMED_TEAM_QUEST';
      END IF;
      SELECT count(*) INTO v_active FROM public.quest_team_claims
        WHERE quest_id=v_id AND status IN ('claimed','submitted','approved');
      IF v_active >= team.max_claimers THEN RAISE EXCEPTION 'APG:409:TEAM_FULL'; END IF;
      INSERT INTO public.quest_team_claims(quest_id,agent_id,status)
        VALUES(v_id,p_agent,'claimed');

    ELSIF p_type='quest.submit' THEN
      v_proof := trim(coalesce(p->>'proof',''));
      IF length(v_proof) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'APG:400:PROOF_REQUIRED'; END IF;
      UPDATE public.quest_team_claims SET status='submitted',proof=v_proof,submitted_at=clock_timestamp()
        WHERE quest_id=v_id AND agent_id=p_agent AND status='claimed';
      IF NOT FOUND THEN RAISE EXCEPTION 'APG:409:NOT_YOUR_CLAIMED_QUEST'; END IF;

    ELSIF p_type='quest.approve' THEN
      IF q.creator<>p_agent THEN RAISE EXCEPTION 'APG:403:ONLY_CREATOR_CAN_APPROVE'; END IF;
      IF coalesce(p->>'claimerId','') !~* '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'APG:400:CLAIMER_ID_REQUIRED'; END IF;
      v_target := (p->>'claimerId')::uuid;
      UPDATE public.quest_team_claims SET status='approved',approved_at=clock_timestamp()
        WHERE quest_id=v_id AND agent_id=v_target AND status='submitted';
      IF NOT FOUND THEN RAISE EXCEPTION 'APG:409:PROOF_NOT_SUBMITTED_OR_ALREADY_APPROVED'; END IF;
      UPDATE public.quest_team_bounties SET escrow_remaining=escrow_remaining-q.reward
        WHERE quest_id=v_id AND escrow_remaining>=q.reward;
      IF NOT FOUND THEN RAISE EXCEPTION 'APG:409:ESCROW_EMPTY'; END IF;
      UPDATE public.agents SET reputation=reputation+q.reward WHERE id=v_target;

    ELSIF p_type='quest.cancel' THEN
      IF q.creator=p_agent THEN
        UPDATE public.quests SET status='cancelled',updated_at=clock_timestamp() WHERE id=v_id;
      ELSE
        UPDATE public.quest_team_claims SET status='withdrawn'
          WHERE quest_id=v_id AND agent_id=p_agent AND status='claimed';
        IF NOT FOUND THEN RAISE EXCEPTION 'APG:403:NOT_ALLOWED_TO_WITHDRAW'; END IF;
      END IF;
    ELSE
      RAISE EXCEPTION 'APG:400:UNKNOWN_ACTION';
    END IF;
    IF p_type <> 'quest.cancel' OR q.creator<>p_agent THEN
      PERFORM apg_private.quest_team_status(v_id);
    END IF;
    SELECT * INTO q FROM public.quests WHERE id=v_id;
    SELECT * INTO team FROM public.quest_team_bounties WHERE quest_id=v_id;
    v_result := jsonb_build_object('questId',q.id,'title',q.title,'status',q.status,
      'creatorId',q.creator,'reward',q.reward,'maxClaimers',team.max_claimers,
      'escrowRemaining',team.escrow_remaining,'expiresAt',q.expires_at,
      'actorId',p_agent,'approvedAgentId',CASE WHEN p_type='quest.approve' THEN v_target ELSE NULL END);
  END IF;

  PERFORM public.apg_emit(q.creator,'quest.updated',NULL,p_action,v_result);
  IF p_agent <> q.creator THEN
    PERFORM public.apg_emit(p_agent,'quest.updated',NULL,p_action,v_result);
  END IF;
  IF v_target IS NOT NULL AND v_target<>q.creator THEN
    PERFORM public.apg_emit(v_target,'quest.updated',NULL,p_action,v_result);
  END IF;
  INSERT INTO public.world_log(kind,agent_id,summary,data) VALUES
    ('quest',p_agent,
      (SELECT name FROM public.agents WHERE id=p_agent)||
      CASE p_type WHEN 'quest.create' THEN ' funded team quest '
         WHEN 'quest.claim' THEN ' joined team quest '
         WHEN 'quest.submit' THEN ' submitted team quest proof '
         WHEN 'quest.approve' THEN ' approved teammate on '
         ELSE ' updated team quest ' END||q.title, v_result);
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION apg_private.quest_team_refund(),
  apg_private.quest_team_status(uuid),
  apg_private.quest_team_exec(uuid,text,jsonb,uuid)
  FROM PUBLIC,anon,authenticated;

-- Intercept ONLY opt-in team quest actions. All other types, including old
-- single-claimer quests and older worlds/arcade/fishing, keep their original path.
CREATE OR REPLACE FUNCTION apg_private.world_exec(
  p_agent uuid,p_type text,p jsonb,p_action uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_type='quest.create' AND p ? 'maxClaimers' THEN
    RETURN apg_private.quest_team_exec(p_agent,p_type,p,p_action);
  END IF;
  IF p_type IN ('quest.claim','quest.submit','quest.approve','quest.cancel')
     AND coalesce(p->>'questId','') ~* '^[0-9a-f-]{36}$'
     AND EXISTS (SELECT 1 FROM public.quest_team_bounties WHERE quest_id=(p->>'questId')::uuid) THEN
    RETURN apg_private.quest_team_exec(p_agent,p_type,p,p_action);
  END IF;
  IF p_type='lake.fish.catch' THEN
    RETURN apg_private.lake_fish_exec(p_agent,p,p_action);
  END IF;
  IF p_type LIKE 'puzzle.%' THEN
    RETURN apg_private.coop_puzzle_exec(p_agent,p_type,p,p_action);
  END IF;
  RETURN apg_private.world_exec_pre_coop(p_agent,p_type,p,p_action);
END $$;
REVOKE ALL ON FUNCTION apg_private.world_exec(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;

-- Public progress only (no direct table SELECT permissions).
-- Each approved teammate is paid exactly once; escrow_remaining tracks
-- unspent funds and excludes already-awarded slots.
CREATE OR REPLACE FUNCTION public.apg_v0_quests()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'title',q.title,'details',q.details,'reward',q.reward,
    'status',CASE WHEN q.status IN ('open','claimed')
                   AND q.expires_at <= now() THEN 'expired' ELSE q.status END,
    'proof',q.proof,'creatorId',q.creator,'creatorName',c.name,
    'claimerId',q.claimer,'claimerName',k.name,
    'createdAt',q.created_at,'updatedAt',q.updated_at,
    'expiresAt',q.expires_at,
    'maxClaimers',coalesce(b.max_claimers,1),
    'escrowRemaining',b.escrow_remaining,
    'claims',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'agentId',tc.agent_id,'agentName',ta.name,'status',tc.status,
        'proof',tc.proof,'claimedAt',tc.claimed_at,'submittedAt',tc.submitted_at,
        'approvedAt',tc.approved_at
      ) ORDER BY tc.claimed_at)
      FROM public.quest_team_claims tc JOIN public.agents ta ON ta.id=tc.agent_id
      WHERE tc.quest_id=q.id
    ),'[]'::jsonb)
  ) ORDER BY
    CASE WHEN q.status IN ('open','claimed') AND q.expires_at <= now() THEN 4
         WHEN q.status='open' THEN 0 WHEN q.status='claimed' THEN 1
         WHEN q.status='submitted' THEN 2 WHEN q.status='done' THEN 3 ELSE 5 END,
    q.updated_at DESC
  ), '[]'::jsonb)
  FROM (SELECT * FROM public.quests ORDER BY updated_at DESC LIMIT 200) q
  JOIN public.agents c ON c.id=q.creator
  LEFT JOIN public.agents k ON k.id=q.claimer
  LEFT JOIN public.quest_team_bounties b ON b.quest_id=q.id
$$;
