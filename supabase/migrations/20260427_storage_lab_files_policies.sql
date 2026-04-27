-- Allow authenticated users to manage objects in the lab-files bucket.
-- Needed for uploading the lab logo to `branding/...` (Storage RLS).

-- storage.objects has RLS enabled by default in Supabase projects.
-- Policies below are bucket-scoped to avoid opening other buckets.

drop policy if exists "lab_files_select_authenticated" on storage.objects;
drop policy if exists "lab_files_insert_authenticated" on storage.objects;
drop policy if exists "lab_files_update_authenticated" on storage.objects;
drop policy if exists "lab_files_delete_authenticated" on storage.objects;

create policy "lab_files_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'lab-files');

create policy "lab_files_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'lab-files');

create policy "lab_files_update_authenticated"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'lab-files')
  with check (bucket_id = 'lab-files');

create policy "lab_files_delete_authenticated"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'lab-files');

