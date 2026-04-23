-- Auto sample code allocator: PREFIX + DDMMYYYY + ##### (per borehole/test/day).
-- Required by RPC calls:
-- - public.allocate_next_sample_code(p_borehole_id, p_day, p_test_type) -> text
-- - public.peek_next_sample_code(p_borehole_id, p_day, p_test_type) -> text

create table if not exists public.sample_code_counters (
  borehole_id uuid not null,
  test_type text not null,
  day date not null,
  last_seq integer not null default 0,
  primary key (borehole_id, test_type, day),
  constraint sample_code_counters_last_seq_nonneg check (last_seq >= 0)
);

-- Lock down direct access; use RPC functions instead.
revoke all on table public.sample_code_counters from anon, authenticated;

create or replace function public._pmt_sample_prefix(p_test_type text)
returns text
language sql
immutable
as $$
  select case p_test_type
    when 'presiometry_program_a' then 'PMTA'
    when 'presiometry_program_b' then 'PMTB'
    when 'presiometry_program_c' then 'PMTC'
    else 'PMT'
  end;
$$;

create or replace function public._pmt_allocation_day(p_day date)
returns date
language sql
stable
as $$
  select coalesce(p_day, (now() at time zone 'Europe/Bucharest')::date);
$$;

create or replace function public.peek_next_sample_code(
  p_borehole_id uuid,
  p_test_type text,
  p_day date default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := public._pmt_allocation_day(p_day);
  v_prefix text := public._pmt_sample_prefix(p_test_type);
  v_next integer;
  v_ddmmyyyy text;
begin
  select coalesce(last_seq, 0) + 1
    into v_next
    from public.sample_code_counters
   where borehole_id = p_borehole_id
     and test_type = p_test_type
     and day = v_day;

  if v_next is null then
    v_next := 1;
  end if;

  v_ddmmyyyy := to_char(v_day, 'DDMMYYYY');
  return v_prefix || v_ddmmyyyy || lpad(v_next::text, 5, '0');
end;
$$;

create or replace function public.allocate_next_sample_code(
  p_borehole_id uuid,
  p_test_type text,
  p_day date default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := public._pmt_allocation_day(p_day);
  v_prefix text := public._pmt_sample_prefix(p_test_type);
  v_seq integer;
  v_ddmmyyyy text;
begin
  -- Atomic increment per key (borehole/test/day).
  insert into public.sample_code_counters (borehole_id, test_type, day, last_seq)
  values (p_borehole_id, p_test_type, v_day, 1)
  on conflict (borehole_id, test_type, day)
  do update set last_seq = public.sample_code_counters.last_seq + 1
  returning last_seq into v_seq;

  v_ddmmyyyy := to_char(v_day, 'DDMMYYYY');
  return v_prefix || v_ddmmyyyy || lpad(v_seq::text, 5, '0');
end;
$$;

grant execute on function public.peek_next_sample_code(uuid, text, date) to authenticated;
grant execute on function public.allocate_next_sample_code(uuid, text, date) to authenticated;

