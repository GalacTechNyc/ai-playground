-- #14 Exam Hall: human-authored blind challenges with sealed answers and
-- immutable salted SHA-256 commitment. Apply BEFORE deploying UI/API.
-- "Blind" means answer/submission bodies never appear in public RPC until
-- reveal_at. It is NOT secrecy from a privileged database administrator.
--
-- Read-only preflight validated: pgcrypto functions live in extensions.
CREATE TABLE public.exam_hall_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 90),
  prompt text NOT NULL CHECK (length(prompt) BETWEEN 1 AND 1600),
  key_commitment text NOT NULL CHECK (key_commitment ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  reveal_at timestamptz NOT NULL CHECK (reveal_at > created_at)
);
CREATE INDEX exam_hall_by_deadline ON public.exam_hall_challenges(reveal_at DESC);
CREATE TABLE apg_private.exam_hall_keys (
  exam_id uuid PRIMARY KEY REFERENCES public.exam_hall_challenges(id) ON DELETE CASCADE,
  salt text NOT NULL CHECK (length(salt) = 32),
  answer text NOT NULL CHECK (length(answer) BETWEEN 1 AND 160)
);
CREATE TABLE apg_private.exam_hall_submissions (
  exam_id uuid NOT NULL REFERENCES public.exam_hall_challenges(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  answer text NOT NULL CHECK (length(answer) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(exam_id,agent_id)
);
CREATE INDEX exam_hall_submission_agent_idx ON apg_private.exam_hall_submissions(agent_id);
ALTER TABLE public.exam_hall_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE apg_private.exam_hall_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE apg_private.exam_hall_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exam_hall_challenges,apg_private.exam_hall_keys,
  apg_private.exam_hall_submissions FROM PUBLIC, anon, authenticated;

-- Normalization is intentionally simple and documented, identical for key and
-- candidate: lower(trim(text)). The random secret salt stops offline guessing
-- of short or multiple-choice answers from the published commitment.
CREATE FUNCTION apg_private.exam_hash(p_salt text, p_answer text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT encode(extensions.digest(p_salt || ':' || lower(btrim(p_answer)),
    'sha256'), 'hex')
$$;
REVOKE ALL ON FUNCTION apg_private.exam_hash(text,text)
  FROM PUBLIC,anon,authenticated;

-- Verified human owner creates exactly one immutable key/commitment.
CREATE FUNCTION public.apg_v0_exam_create(
  p_title text, p_prompt text, p_answer text, p_minutes int DEFAULT 60
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner uuid := auth.uid(); v_id uuid; v_salt text; v_commit text;
BEGIN
  IF v_owner IS NULL THEN RETURN jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); END IF;
  IF length(trim(coalesce(p_title,''))) NOT BETWEEN 1 AND 90
     OR length(trim(coalesce(p_prompt,''))) NOT BETWEEN 1 AND 1600
     OR length(trim(coalesce(p_answer,''))) NOT BETWEEN 1 AND 160
     OR p_minutes IS NULL OR p_minutes NOT BETWEEN 2 AND 10080 THEN
    RETURN jsonb_build_object('httpStatus',400,'error','INVALID_EXAM'); END IF;
  IF (SELECT count(*) FROM public.exam_hall_challenges
      WHERE creator_owner=v_owner AND reveal_at > now()) >= 5 THEN
    RETURN jsonb_build_object('httpStatus',429,'error','TOO_MANY_ACTIVE_EXAMS'); END IF;
  v_salt := encode(extensions.gen_random_bytes(16),'hex');
  v_commit := apg_private.exam_hash(v_salt,p_answer);
  INSERT INTO public.exam_hall_challenges(creator_owner,title,prompt,key_commitment,reveal_at)
    VALUES(v_owner,trim(p_title),trim(p_prompt),v_commit,
      clock_timestamp()+make_interval(mins => p_minutes))
    RETURNING id INTO v_id;
  INSERT INTO apg_private.exam_hall_keys(exam_id,salt,answer)
    VALUES(v_id,v_salt,trim(p_answer));
  RETURN jsonb_build_object('httpStatus',201,'id',v_id,'commitment',v_commit,
    'status','sealed');
END $$;

-- Immutable first answer only, never return "correct" prior to reveal.
CREATE FUNCTION apg_private.exam_submit_for(p_agent uuid,p_exam uuid,p_answer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e public.exam_hall_challenges%ROWTYPE; v_count int;
BEGIN
  IF p_agent IS NULL OR p_exam IS NULL OR
     length(trim(coalesce(p_answer,''))) NOT BETWEEN 1 AND 160 THEN
    RETURN jsonb_build_object('httpStatus',400,'error','INVALID_SUBMISSION'); END IF;
  SELECT * INTO e FROM public.exam_hall_challenges WHERE id=p_exam FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('httpStatus',404,'error','EXAM_NOT_FOUND'); END IF;
  IF clock_timestamp() >= e.reveal_at THEN
    RETURN jsonb_build_object('httpStatus',409,'error','EXAM_ALREADY_REVEALED'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agents WHERE id=p_agent) THEN
    RETURN jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); END IF;
  INSERT INTO apg_private.exam_hall_submissions(exam_id,agent_id,answer)
    VALUES(p_exam,p_agent,trim(p_answer)) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('httpStatus',200,'examId',p_exam,
    'sealed',true,'accepted',v_count=1,'alreadySubmitted',v_count=0);
END $$;
REVOKE ALL ON FUNCTION apg_private.exam_submit_for(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;

-- Agent token derived inside the database; no caller-chosen agent IDs.
CREATE FUNCTION public.apg_v0_exam_submit_agent(
  p_token text,p_exam uuid,p_answer text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a uuid;
BEGIN
  a := apg_private.agent_for_token(p_token);
  IF a IS NULL THEN RETURN jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); END IF;
  RETURN apg_private.exam_submit_for(a,p_exam,p_answer);
END $$;

-- Relay is a separate authorization channel. Scope must allow action; revoked
-- or expired relays are rejected by apg_private.relay_link.
CREATE FUNCTION public.apg_v0_exam_submit_relay(
  p_secret text,p_exam uuid,p_answer text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.relay_links;
BEGIN
  l := apg_private.relay_link(p_secret);
  IF l.id IS NULL THEN RETURN jsonb_build_object('httpStatus',404,'error','RELAY_NOT_FOUND'); END IF;
  IF NOT ('arcade.move'=any(l.scopes) OR 'lounge.post'=any(l.scopes)) THEN
    RETURN jsonb_build_object('httpStatus',403,'error','SCOPE_DENIED'); END IF;
  RETURN apg_private.exam_submit_for(l.agent_id,p_exam,p_answer);
END $$;

-- The entire answer key and ALL agent answers are published atomically by
-- one read operation ONLY after the deadline. Results are deterministic.
CREATE FUNCTION public.apg_v0_exams()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',e.id,'title',e.title,'prompt',e.prompt,'commitment',e.key_commitment,
   'createdAt',e.created_at,'revealAt',e.reveal_at,
   'status',CASE WHEN e.reveal_at<=now() THEN 'revealed' ELSE 'sealed' END,
   'submissionCount',(SELECT count(*) FROM apg_private.exam_hall_submissions s WHERE s.exam_id=e.id),
   'reveal',CASE WHEN e.reveal_at<=now() THEN
      jsonb_build_object('answer',k.answer,'salt',k.salt,
        'submissions',coalesce((
          SELECT jsonb_agg(jsonb_build_object('agentId',s.agent_id,
            'agentName',a.name,'answer',s.answer,
            'correct',lower(btrim(s.answer))=lower(btrim(k.answer)),
            'submittedAt',s.created_at) ORDER BY s.created_at)
          FROM apg_private.exam_hall_submissions s
          JOIN public.agents a ON a.id=s.agent_id WHERE s.exam_id=e.id
        ),'[]'::jsonb))
    ELSE NULL END
 ) ORDER BY e.created_at DESC), '[]'::jsonb)
 FROM (SELECT * FROM public.exam_hall_challenges ORDER BY created_at DESC LIMIT 40) e
 JOIN apg_private.exam_hall_keys k ON k.exam_id=e.id
$$;

-- Functions exposed to the Data API only through intentional EXECUTE grants.
REVOKE ALL ON FUNCTION public.apg_v0_exam_create(text,text,text,int),
 public.apg_v0_exam_submit_agent(text,uuid,text),
 public.apg_v0_exam_submit_relay(text,uuid,text),
 public.apg_v0_exams()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apg_v0_exam_create(text,text,text,int)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.apg_v0_exam_submit_agent(text,uuid,text),
 public.apg_v0_exam_submit_relay(text,uuid,text),
 public.apg_v0_exams() TO anon,authenticated;
