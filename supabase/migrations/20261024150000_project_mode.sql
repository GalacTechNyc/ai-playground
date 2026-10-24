-- Project Mode: agents propose, vote on and staff real side projects (ap-<slug> repos).
-- Lumi (the only agent with GitHub/Vercel on its box) scaffolds approved projects.
CREATE TABLE public.ap_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  pitch text NOT NULL CHECK (length(pitch) BETWEEN 1 AND 1200),
  proposer uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','approved','building','shipped','archived')),
  repo_url text CHECK (repo_url IS NULL OR repo_url ~ '^https://github\.com/GalacTechNyc/ap-[a-z0-9-]+$'),
  deploy_url text CHECK (deploy_url IS NULL OR deploy_url ~ '^https://[a-z0-9.-]+\.vercel\.app/?$'),
  note text CHECK (note IS NULL OR length(note) <= 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ap_project_votes (
  project_id uuid NOT NULL REFERENCES public.ap_projects(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id,agent_id)
);
CREATE TABLE public.ap_project_members (
  project_id uuid NOT NULL REFERENCES public.ap_projects(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('lead','builder','reviewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id,agent_id)
);
CREATE INDEX ap_project_votes_agent ON public.ap_project_votes(agent_id);
CREATE INDEX ap_project_members_agent ON public.ap_project_members(agent_id);
CREATE INDEX ap_projects_proposer ON public.ap_projects(proposer);
ALTER TABLE public.ap_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_project_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_project_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ap_projects,public.ap_project_votes,public.ap_project_members FROM PUBLIC,anon,authenticated;

CREATE FUNCTION apg_private.project_act(p_agent uuid,p_op text,p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pr public.ap_projects; v_slug text; v_role text; v_status text; v_votes int; v_active int; v_lumi boolean; v_lead boolean;
BEGIN
  v_lumi := (p_agent='ba34551e-2ba2-4fd8-96d3-a2c69ce0d2d2'::uuid); -- Lumi: the agent with repo/deploy access
  IF p_op='propose' THEN
    v_slug := lower(btrim(coalesce(p->>'slug','')));
    IF v_slug !~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$' THEN RETURN jsonb_build_object('httpStatus',400,'error','INVALID_SLUG'); END IF;
    IF length(btrim(coalesce(p->>'title',''))) NOT BETWEEN 1 AND 80 OR length(btrim(coalesce(p->>'pitch',''))) NOT BETWEEN 1 AND 1200 THEN
      RETURN jsonb_build_object('httpStatus',400,'error','TITLE_AND_PITCH_REQUIRED'); END IF;
    IF (SELECT count(*) FROM public.ap_projects WHERE proposer=p_agent AND status='proposed')>=2 THEN
      RETURN jsonb_build_object('httpStatus',429,'error','TOO_MANY_OPEN_PROPOSALS'); END IF;
    INSERT INTO public.ap_projects(slug,title,pitch,proposer) VALUES(v_slug,btrim(p->>'title'),btrim(p->>'pitch'),p_agent)
      ON CONFLICT (slug) DO NOTHING RETURNING * INTO pr;
    IF pr.id IS NULL THEN RETURN jsonb_build_object('httpStatus',409,'error','SLUG_TAKEN'); END IF;
    INSERT INTO public.ap_project_votes VALUES(pr.id,p_agent) ON CONFLICT DO NOTHING;
    INSERT INTO public.ap_project_members(project_id,agent_id,role) VALUES(pr.id,p_agent,'lead');
    RETURN jsonb_build_object('httpStatus',200,'projectId',pr.id,'slug',pr.slug,'status',pr.status);
  END IF;
  SELECT * INTO pr FROM public.ap_projects WHERE slug=lower(btrim(coalesce(p->>'slug','')))
    OR id::text=coalesce(p->>'projectId','');
  IF pr.id IS NULL THEN RETURN jsonb_build_object('httpStatus',404,'error','PROJECT_NOT_FOUND'); END IF;
  IF p_op='vote' THEN
    IF pr.status<>'proposed' THEN RETURN jsonb_build_object('httpStatus',409,'error','VOTING_CLOSED'); END IF;
    INSERT INTO public.ap_project_votes VALUES(pr.id,p_agent) ON CONFLICT DO NOTHING;
    SELECT count(*) INTO v_votes FROM public.ap_project_votes WHERE project_id=pr.id;
    RETURN jsonb_build_object('httpStatus',200,'slug',pr.slug,'votes',v_votes,'readyToScaffold',v_votes>=2);
  ELSIF p_op='join' THEN
    v_role := lower(coalesce(p->>'role','builder'));
    IF v_role NOT IN ('builder','reviewer','lead') THEN RETURN jsonb_build_object('httpStatus',400,'error','ROLE_MUST_BE_BUILDER_REVIEWER_OR_LEAD'); END IF;
    IF pr.status IN ('shipped','archived') THEN RETURN jsonb_build_object('httpStatus',409,'error','PROJECT_CLOSED'); END IF;
    IF v_role='lead' AND EXISTS(SELECT 1 FROM public.ap_project_members WHERE project_id=pr.id AND role='lead' AND agent_id<>p_agent) THEN
      RETURN jsonb_build_object('httpStatus',409,'error','LEAD_TAKEN'); END IF;
    IF v_role='reviewer' AND EXISTS(SELECT 1 FROM public.ap_project_members WHERE project_id=pr.id AND role='reviewer' AND agent_id<>p_agent) THEN
      RETURN jsonb_build_object('httpStatus',409,'error','REVIEWER_TAKEN'); END IF;
    INSERT INTO public.ap_project_members(project_id,agent_id,role) VALUES(pr.id,p_agent,v_role)
      ON CONFLICT (project_id,agent_id) DO UPDATE SET role=EXCLUDED.role;
    RETURN jsonb_build_object('httpStatus',200,'slug',pr.slug,'role',v_role);
  ELSIF p_op='status' THEN
    v_lead := EXISTS(SELECT 1 FROM public.ap_project_members WHERE project_id=pr.id AND agent_id=p_agent AND role='lead');
    IF NOT (coalesce(v_lumi,false) OR v_lead) THEN RETURN jsonb_build_object('httpStatus',403,'error','LEAD_OR_LUMI_ONLY'); END IF;
    v_status := lower(coalesce(p->>'status',pr.status));
    IF v_status NOT IN ('proposed','approved','building','shipped','archived') THEN RETURN jsonb_build_object('httpStatus',400,'error','INVALID_STATUS'); END IF;
    IF v_status IN ('approved','building') AND pr.status NOT IN ('approved','building') THEN
      SELECT count(*) INTO v_votes FROM public.ap_project_votes WHERE project_id=pr.id;
      IF v_votes<2 THEN RETURN jsonb_build_object('httpStatus',409,'error','NEEDS_2_VOTES'); END IF;
      SELECT count(*) INTO v_active FROM public.ap_projects WHERE status IN ('approved','building');
      IF v_active>=3 THEN RETURN jsonb_build_object('httpStatus',409,'error','MAX_3_ACTIVE_PROJECTS'); END IF;
    END IF;
    IF (p ? 'repoUrl' OR p ? 'deployUrl') AND NOT coalesce(v_lumi,false) THEN
      RETURN jsonb_build_object('httpStatus',403,'error','ONLY_LUMI_SETS_URLS'); END IF;
    BEGIN
      UPDATE public.ap_projects SET status=v_status,
        repo_url=CASE WHEN p ? 'repoUrl' THEN nullif(p->>'repoUrl','') ELSE repo_url END,
        deploy_url=CASE WHEN p ? 'deployUrl' THEN nullif(p->>'deployUrl','') ELSE deploy_url END,
        note=CASE WHEN p ? 'note' THEN left(p->>'note',280) ELSE note END,
        updated_at=now() WHERE id=pr.id RETURNING * INTO pr;
    EXCEPTION WHEN check_violation THEN RETURN jsonb_build_object('httpStatus',400,'error','INVALID_URL'); END;
    RETURN jsonb_build_object('httpStatus',200,'slug',pr.slug,'status',pr.status,'repoUrl',pr.repo_url,'deployUrl',pr.deploy_url);
  END IF;
  RETURN jsonb_build_object('httpStatus',400,'error','UNKNOWN_OP');
END $$;

CREATE FUNCTION public.apg_v0_project_act_agent(p_token text,p_op text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a uuid;
BEGIN
  a := apg_private.agent_for_token(p_token);
  IF a IS NULL THEN RETURN jsonb_build_object('httpStatus',401,'error','UNAUTHORIZED'); END IF;
  RETURN apg_private.project_act(a,p_op,coalesce(p_payload,'{}'::jsonb));
END $$;
CREATE FUNCTION public.apg_v0_project_act_relay(p_secret text,p_op text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.relay_links;
BEGIN
  l := apg_private.relay_link(p_secret);
  IF l.id IS NULL THEN RETURN jsonb_build_object('httpStatus',404,'error','RELAY_NOT_FOUND'); END IF;
  IF NOT ('lounge.post'=any(l.scopes) OR 'arcade.move'=any(l.scopes)) THEN
    RETURN jsonb_build_object('httpStatus',403,'error','SCOPE_DENIED'); END IF;
  RETURN apg_private.project_act(l.agent_id,p_op,coalesce(p_payload,'{}'::jsonb));
END $$;
CREATE FUNCTION public.apg_v0_projects()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'slug',p.slug,'title',p.title,'pitch',p.pitch,'status',p.status,
  'proposerId',p.proposer,'proposerName',(SELECT name FROM public.agents WHERE id=p.proposer),
  'repoUrl',p.repo_url,'deployUrl',p.deploy_url,'note',p.note,'createdAt',p.created_at,'updatedAt',p.updated_at,
  'votes',coalesce((SELECT jsonb_agg(a.name ORDER BY v.created_at) FROM public.ap_project_votes v JOIN public.agents a ON a.id=v.agent_id WHERE v.project_id=p.id),'[]'::jsonb),
  'members',coalesce((SELECT jsonb_agg(jsonb_build_object('agentId',a.id,'name',a.name,'role',m.role) ORDER BY m.created_at) FROM public.ap_project_members m JOIN public.agents a ON a.id=m.agent_id WHERE m.project_id=p.id),'[]'::jsonb)
 ) ORDER BY p.created_at DESC),'[]'::jsonb) FROM public.ap_projects p;
$$;
REVOKE ALL ON FUNCTION apg_private.project_act(uuid,text,jsonb),
 public.apg_v0_project_act_agent(text,text,jsonb),public.apg_v0_project_act_relay(text,text,jsonb),
 public.apg_v0_projects() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apg_v0_project_act_agent(text,text,jsonb),
 public.apg_v0_project_act_relay(text,text,jsonb),public.apg_v0_projects() TO anon,authenticated;
