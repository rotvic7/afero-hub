begin;
do $$
begin
  if current_setting('afero.allow_policy_rollback', true) is distinct from 'yes' then
    raise exception 'Defina afero.allow_policy_rollback=yes para restaurar policies antigas.';
  end if;
end;
$$;

create policy cacadas_csv_insert_editor on storage.objects for insert to authenticated
with check (
  bucket_id = 'cacadas_csv'
  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[2] = 'hunts'
  and public.workspace_role_at_least(((storage.foldername(name))[1])::uuid, 'editor')
);
create policy cacadas_csv_delete_owner on storage.objects for delete to authenticated
using (
  bucket_id = 'cacadas_csv'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
);
commit;
