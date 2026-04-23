-- OPTIONAL: Reset lab data (dangerous).
-- This deletes all tests + related rows (measurements/results/files/reports) across ALL test types.
-- Run only if you really want to start from zero.

begin;

-- Child tables first
delete from public.test_results;
delete from public.test_measurements;
delete from public.test_files;
delete from public.reports;

-- If older ROCA tables exist, try to clear them too (ignore if missing)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='triaxial_rock_runs') then
    execute 'delete from public.triaxial_rock_runs';
  end if;
exception when undefined_table then
  null;
end $$;

-- Main tests table
delete from public.tests;

commit;

