-- Rollback destrutivo. Execute manualmente somente depois de exportar os dados.
-- Antes de rodar: set afero.allow_destructive_rollback = 'yes';
begin;

do $$
begin
  if current_setting('afero.allow_destructive_rollback', true) is distinct from 'yes' then
    raise exception 'Defina afero.allow_destructive_rollback=yes para confirmar a remoção do backend Afero.';
  end if;
end;
$$;

delete from storage.objects where bucket_id = 'cacadas_csv';
delete from storage.buckets where id = 'cacadas_csv';

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.audit_offer_decision() cascade;
drop function if exists public.touch_updated_at() cascade;
drop function if exists public.update_workspace_member_role(uuid, uuid, text);
drop function if exists public.accept_workspace_invitation(text);
drop function if exists public.create_workspace_invitation(uuid, text, text);
drop function if exists public.import_hunt(uuid, uuid, text, text, text, text, jsonb);
drop function if exists public.consume_import_rate_limit();
drop function if exists public.create_workspace(text);
drop function if exists public.shares_workspace(uuid);
drop function if exists public.workspace_role_at_least(uuid, text);
drop function if exists public.is_workspace_member(uuid);
drop function if exists public.workspace_role(uuid);
drop function if exists public.role_rank(text);

drop table if exists public.import_rate_limits;
drop table if exists public.audit_events;
drop table if exists public.workspace_invitations;
drop table if exists public.hunt_offers;
drop table if exists public.offers;
drop table if exists public.hunts;
drop table if exists public.workspace_members;
drop table if exists public.workspaces;
drop table if exists public.profiles;

commit;
