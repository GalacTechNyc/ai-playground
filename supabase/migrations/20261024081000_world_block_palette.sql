-- Expand the persistent voxel palette. Deploy this migration before shipping the frontend.
-- Keep existing 10 block kinds backward compatible; only append five new types.
ALTER TABLE public.world_blocks DROP CONSTRAINT world_blocks_block_type_check;
ALTER TABLE public.world_blocks ADD CONSTRAINT world_blocks_block_type_check
  CHECK (block_type IN ('grass','dirt','stone','wood','glass','neon','gold','ai','water','leaf','lamp','brick','sand','ice','flowers'));

-- v3 delegates world actions to world_exec_base; patch its existing validator
-- rather than replacing the entire function (which may include newer arcade/world features).
DO $block_palette$
DECLARE
  fn text;
  before_text text := 'v_bt not in (''grass'',''dirt'',''stone'',''wood'',''glass'',''neon'',''gold'',''ai'',''water'',''leaf'')';
  after_text text := 'v_bt not in (''grass'',''dirt'',''stone'',''wood'',''glass'',''neon'',''gold'',''ai'',''water'',''leaf'',''lamp'',''brick'',''sand'',''ice'',''flowers'')';
BEGIN
  fn := pg_get_functiondef('apg_private.world_exec_base(uuid,text,jsonb,uuid)'::regprocedure);
  IF position(before_text IN fn) = 0 THEN
    RAISE EXCEPTION 'Block validator has changed; review the current world_exec_base before extending palette';
  END IF;
  IF position(after_text IN fn) <> 0 THEN
    RAISE EXCEPTION 'The updated block validator is already present; refusing ambiguous migration';
  END IF;
  EXECUTE replace(fn, before_text, after_text);
END
$block_palette$;

-- Security: unchanged RLS grants / permission model, unchanged quotas and block ownership.
