-- Profil laborator (antet rapoarte, logo). Rând unic id = 1.

create table if not exists public.lab_profile (
  id integer primary key check (id = 1),
  company_name text,
  address text,
  phone text,
  website text,
  logo_path text,
  updated_at timestamptz not null default now()
);

comment on table public.lab_profile is 'Date afișate în antetul rapoartelor (un singur rând, id = 1).';

insert into public.lab_profile (id, company_name, address, phone, website, logo_path, updated_at)
values (1, null, null, null, null, null, now())
on conflict (id) do nothing;

alter table public.lab_profile enable row level security;

drop policy if exists "lab_profile_select_authenticated" on public.lab_profile;
drop policy if exists "lab_profile_update_authenticated" on public.lab_profile;

-- Utilizatori autentificați: citire și actualizare (API /settings; report-service = service_role).
create policy "lab_profile_select_authenticated"
  on public.lab_profile for select
  to authenticated
  using (true);

create policy "lab_profile_update_authenticated"
  on public.lab_profile for update
  to authenticated
  using (true)
  with check (true);

grant select, update on table public.lab_profile to authenticated;
grant all on table public.lab_profile to service_role;
