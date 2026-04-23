-- Permite crearea rândului lab_profile (id=1) la prima salvare din app, dacă seed-ul nu a rulat.
grant insert on table public.lab_profile to authenticated;

drop policy if exists "lab_profile_insert_authenticated" on public.lab_profile;

create policy "lab_profile_insert_authenticated"
  on public.lab_profile for insert
  to authenticated
  with check (id = 1);
