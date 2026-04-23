-- Presiometrie (SR EN ISO 22476-5) support.
-- Safe-ish migration: adds new test_type value (if enum exists) and JSONB columns on tests.

do $$
begin
  if exists (select 1 from pg_type where typname = 'test_type') then
    -- PostgreSQL 12+ supports IF NOT EXISTS here.
    execute 'alter type test_type add value if not exists ''presiometry''';
  end if;
exception
  when duplicate_object then
    null;
end $$;

alter table if exists public.tests
  add column if not exists presiometry_curve_json jsonb null,
  add column if not exists presiometry_settings_json jsonb null,
  add column if not exists presiometry_report_metadata_json jsonb null;

