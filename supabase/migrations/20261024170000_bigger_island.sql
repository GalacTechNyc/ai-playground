-- Bigger island (1.75x): widen world bounds to [-128,127], move Crystal Lake fishing zone,
-- spread Homes Row slots out, and move existing plots/blocks/signs along with their districts.
alter table public.world_positions drop constraint if exists world_positions_x_check, drop constraint if exists world_positions_z_check;
alter table public.world_positions add constraint world_positions_x_check check (x between -128 and 128), add constraint world_positions_z_check check (z between -128 and 128);
alter table public.world_signs drop constraint if exists world_signs_x_check, drop constraint if exists world_signs_z_check;
alter table public.world_signs add constraint world_signs_x_check check (x between -128 and 128), add constraint world_signs_z_check check (z between -128 and 128);
alter table public.world_blocks drop constraint if exists world_blocks_x_check, drop constraint if exists world_blocks_z_check;
alter table public.world_blocks add constraint world_blocks_x_check check (x between -128 and 127), add constraint world_blocks_z_check check (z between -128 and 127);
alter table public.world_plots drop constraint if exists world_plots_x0_check, drop constraint if exists world_plots_z0_check;
alter table public.world_plots add constraint world_plots_x0_check check (x0 % 8 = 0 and x0 between -128 and 120), add constraint world_plots_z0_check check (z0 % 8 = 0 and z0 between -128 and 120);

-- Patch hardcoded coordinates inside the world RPCs in place.
do $$
declare r record; d text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname in ('public','apg_private') and p.prokind='f'
             and p.proname in ('world_exec_base','world_exec_v2','world_exec_v3_before_expiry','lake_fish_exec','apg_v0_world_state')
  loop
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'not between -64 and 64', 'not between -128 and 128');
    d := replace(d, 'not between -64 and 63', 'not between -128 and 127');
    d := replace(d, 'not between -64 and 56', 'not between -128 and 120');
    d := replace(d, '''min'',-64,''max'',63', '''min'',-128,''max'',127');
    d := replace(d, '(values (-24,-40,1),(-16,-40,2),(-8,-40,3),(0,-40,4),(8,-40,5),(16,-40,6),(-32,-32,7),(24,-32,8),(-24,-48,9),(16,-48,10))',
                    '(values (-48,-72,1),(-32,-72,2),(-16,-72,3),(0,-72,4),(16,-72,5),(32,-72,6),(-64,-56,7),(48,-56,8),(-48,-56,9),(32,-56,10))');
    d := replace(d, '(pos.x + 18)^2 + (pos.z - 22)^2', '(pos.x + 31.5)^2 + (pos.z - 38.5)^2');
    d := replace(d, '(pos.x + 18)^2 + (pos.z - 26)^2', '(pos.x + 31.5)^2 + (pos.z - 42.5)^2');
    execute d;
  end loop;
end $$;

-- Move existing home plots (and blocks/signs inside them) to their new slots.
create temp table _slot(ox int, oz int, nx int, nz int);
insert into _slot values (-24,-40,-48,-72),(-16,-40,-32,-72),(-8,-40,-16,-72),(0,-40,0,-72),(8,-40,16,-72),(16,-40,32,-72),(-32,-32,-64,-56),(24,-32,48,-56),(-24,-48,-48,-56),(16,-48,32,-56);
update public.world_blocks b set x=b.x+(s.nx-s.ox), z=b.z+(s.nz-s.oz) from public.world_plots p join _slot s on s.ox=p.x0 and s.oz=p.z0
 where b.x>=p.x0 and b.x<p.x0+8 and b.z>=p.z0 and b.z<p.z0+8;
update public.world_signs g set x=g.x+(s.nx-s.ox), z=g.z+(s.nz-s.oz) from public.world_plots p join _slot s on s.ox=p.x0 and s.oz=p.z0
 where g.x>=p.x0 and g.x<p.x0+8 and g.z>=p.z0 and g.z<p.z0+8;
update public.world_plots p set x0=s.nx, z0=s.nz from _slot s where s.ox=p.x0 and s.oz=p.z0;

-- Move builds near each old district centre with the district.
create temp table _zone(cx real, cz real, r real, dx int, dz int);
insert into _zone values (24,0,8,18,0),(-12,12,6,-9,9),(-26,0,10,-18,0),(0,-24,8,0,-18),(18,22,8,14,17),(-18,22,8,-14,17),(0,40,8,0,30);
update public.world_blocks b set x=b.x+z.dx, z=b.z+z.dz from _zone z where (b.x-z.cx)^2+(b.z-z.cz)^2 <= z.r^2 and b.z > -32;
update public.world_signs g set x=g.x+z.dx, z=g.z+z.dz from _zone z where (g.x-z.cx)^2+(g.z-z.cz)^2 <= z.r^2 and g.z > -32;
drop table _slot; drop table _zone;
