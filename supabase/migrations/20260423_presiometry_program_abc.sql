-- Presiometrie (SR EN ISO 22476-5) — only Program A/B/C test types.
-- Adds enum values if `test_type` exists as an enum; safe no-op if it's TEXT.

do $$
begin
  if exists (select 1 from pg_type where typname = 'test_type') then
    execute 'alter type test_type add value if not exists ''presiometry_program_a''';
    execute 'alter type test_type add value if not exists ''presiometry_program_b''';
    execute 'alter type test_type add value if not exists ''presiometry_program_c''';
  end if;
exception
  when duplicate_object then
    null;
end $$;

-- Ensure presiometry JSON columns exist (idempotent).
alter table if exists public.tests
  add column if not exists presiometry_curve_json jsonb null,
  add column if not exists presiometry_settings_json jsonb null,
  add column if not exists presiometry_report_metadata_json jsonb null;

