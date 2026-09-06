begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  avatar_url text check (avatar_url is null or (char_length(avatar_url) <= 2000 and avatar_url ~ '^https?://')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{2,71}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index workspaces_slug_lower_key on public.workspaces (lower(slug));

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_id_idx on public.workspace_members (user_id, workspace_id);

create table public.hunts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  original_file_name text not null check (char_length(original_file_name) between 1 and 255),
  source_file_path text not null check (char_length(source_file_path) between 1 and 500),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  engine_version text check (engine_version is null or char_length(engine_version) <= 80),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  rows_received integer not null default 0 check (rows_received between 0 and 10000),
  rows_imported integer not null default 0 check (rows_imported between 0 and 10000),
  rows_rejected integer not null default 0 check (rows_rejected between 0 and 10000),
  error_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(error_summary) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, sha256),
  unique (workspace_id, source_file_path)
);
create index hunts_workspace_created_idx on public.hunts (workspace_id, created_at desc);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  domain text not null check (char_length(domain) between 1 and 253),
  url_final text not null check (char_length(url_final) between 8 and 2000 and url_final ~ '^https?://'),
  title text not null check (char_length(title) between 1 and 240),
  niche text not null default 'outros' check (char_length(niche) between 1 and 120),
  priority text not null check (priority in ('S', 'A', 'B', 'C')),
  score smallint not null check (score between 0 and 100),
  signals jsonb not null default '{}'::jsonb check (jsonb_typeof(signals) = 'object'),
  screenshot_url text,
  preview_url text,
  ads_url text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  recurrence_count integer not null default 1 check (recurrence_count > 0),
  status text not null default 'new' check (status in ('new', 'saved', 'discarded', 'in_copy', 'in_page')),
  user_notes text not null default '' check (char_length(user_notes) <= 10000),
  tags text[] not null default '{}'::text[] check (cardinality(tags) <= 24 and octet_length(array_to_string(tags, '')) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, fingerprint)
);
create index offers_workspace_priority_idx on public.offers (workspace_id, priority, score desc);
create index offers_workspace_last_seen_idx on public.offers (workspace_id, last_seen_at desc);
create index offers_workspace_status_idx on public.offers (workspace_id, status);

create table public.hunt_offers (
  hunt_id uuid not null references public.hunts(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  observed_score smallint not null check (observed_score between 0 and 100),
  observed_priority text not null check (observed_priority in ('S', 'A', 'B', 'C')),
  observed_signals jsonb not null default '{}'::jsonb check (jsonb_typeof(observed_signals) = 'object'),
  raw_observation jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_observation) = 'object'),
  observed_at timestamptz not null default now(),
  primary key (hunt_id, offer_id)
);
create index hunt_offers_workspace_offer_idx on public.hunt_offers (workspace_id, offer_id, observed_at desc);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  role text not null check (role in ('admin', 'editor', 'viewer')),
  token_hash bytea not null,
  created_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index workspace_invitations_active_email_key
  on public.workspace_invitations (workspace_id, lower(email))
  where accepted_at is null and revoked_at is null;
create unique index workspace_invitations_token_hash_key on public.workspace_invitations (token_hash);

create table public.audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 100),
  entity_type text not null check (char_length(entity_type) between 1 and 60),
  entity_id text not null default '' check (char_length(entity_id) <= 120),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_events_workspace_created_idx on public.audit_events (workspace_id, created_at desc);

create table public.import_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count between 0 and 20),
  primary key (user_id, window_start)
);

create or replace function public.role_rank(role_name text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case role_name when 'owner' then 4 when 'admin' then 3 when 'editor' then 2 when 'viewer' then 1 else 0 end;
$$;

create or replace function public.workspace_role(target_workspace uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select wm.role
  from public.workspace_members wm
  where wm.workspace_id = target_workspace and wm.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace and wm.user_id = (select auth.uid())
  );
$$;

create or replace function public.workspace_role_at_least(target_workspace uuid, minimum_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and public.role_rank(public.workspace_role(target_workspace)) >= public.role_rank(minimum_role)
    and public.role_rank(minimum_role) > 0;
$$;

create or replace function public.shares_workspace(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = target_user
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger workspaces_touch_updated_at before update on public.workspaces
for each row execute function public.touch_updated_at();
create trigger offers_touch_updated_at before update on public.offers
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  personal_workspace_id uuid := gen_random_uuid();
  safe_name text;
begin
  safe_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(split_part(new.email, '@', 1), ''), 'Membro'), 120);
  insert into public.profiles (id, display_name) values (new.id, safe_name);
  insert into public.workspaces (id, name, slug, created_by)
  values (personal_workspace_id, left(safe_name || ' · pessoal', 120), 'pessoal-' || replace(new.id::text, '-', ''), new.id);
  insert into public.workspace_members (workspace_id, user_id, role)
  values (personal_workspace_id, new.id, 'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_workspace(p_name text)
returns table (id uuid, name text, slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  workspace_id uuid := gen_random_uuid();
  workspace_name text := left(btrim(coalesce(p_name, '')), 120);
  workspace_slug text;
begin
  if actor is null then raise exception 'authentication_required'; end if;
  if char_length(workspace_name) < 1 then raise exception 'invalid_workspace_name'; end if;
  workspace_slug := 'equipe-' || replace(workspace_id::text, '-', '');
  insert into public.workspaces (id, name, slug, created_by) values (workspace_id, workspace_name, workspace_slug, actor);
  insert into public.workspace_members (workspace_id, user_id, role) values (workspace_id, actor, 'owner');
  insert into public.audit_events (workspace_id, actor_user_id, action, entity_type, entity_id)
  values (workspace_id, actor, 'workspace.created', 'workspace', workspace_id::text);
  return query select workspace_id, workspace_name, workspace_slug;
end;
$$;

create or replace function public.consume_import_rate_limit()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  current_window timestamptz := date_trunc('hour', now());
  resulting_count integer;
begin
  if actor is null then return false; end if;
  delete from public.import_rate_limits where window_start < now() - interval '2 hours';
  insert into public.import_rate_limits (user_id, window_start, request_count)
  values (actor, current_window, 1)
  on conflict (user_id, window_start) do update
    set request_count = public.import_rate_limits.request_count + 1
    where public.import_rate_limits.request_count < 20
  returning request_count into resulting_count;
  return resulting_count is not null and resulting_count <= 20;
end;
$$;

create or replace function public.import_hunt(
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_file_path text,
  p_file_name text,
  p_sha256 text,
  p_engine_version text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := p_actor_user_id;
  hunt_id uuid;
  existing_hunt public.hunts%rowtype;
  received_count integer;
  imported_count integer := 0;
begin
  if actor is null or not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = actor and public.role_rank(role) >= public.role_rank('editor')
  ) then raise exception 'workspace_forbidden'; end if;
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'invalid_sha256'; end if;
  if p_file_path is null or p_file_path !~ ('^' || p_workspace_id::text || '/hunts/[A-Za-z0-9._-]+[.]csv$') then raise exception 'invalid_file_path'; end if;
  if p_file_name is null or char_length(btrim(p_file_name)) not between 1 and 255 then raise exception 'invalid_file_name'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows'; end if;
  received_count := jsonb_array_length(p_rows);
  if received_count < 1 or received_count > 10000 or octet_length(p_rows::text) > 7000000 then raise exception 'invalid_rows'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'cacadas_csv' and name = p_file_path) then raise exception 'file_not_found'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text || ':' || p_sha256, 0)
  );

  select * into existing_hunt
  from public.hunts
  where workspace_id = p_workspace_id and sha256 = p_sha256;
  if found then
    return jsonb_build_object(
      'hunt_id', existing_hunt.id,
      'duplicate', true,
      'rows_received', existing_hunt.rows_received,
      'rows_imported', existing_hunt.rows_imported,
      'rows_rejected', existing_hunt.rows_rejected
    );
  end if;

  insert into public.hunts (
    workspace_id, created_by, original_file_name, source_file_path, sha256,
    engine_version, status, rows_received
  ) values (
    p_workspace_id, actor, left(btrim(p_file_name), 255), p_file_path, p_sha256,
    nullif(left(btrim(coalesce(p_engine_version, '')), 80), ''), 'processing', received_count
  ) returning id into hunt_id;

  with parsed as (
    select
      value as raw,
      nullif(left(btrim(value ->> 'domain'), 253), '') as domain,
      nullif(left(btrim(value ->> 'url_final'), 2000), '') as url_final,
      nullif(left(btrim(value ->> 'title'), 240), '') as title,
      coalesce(nullif(left(btrim(value ->> 'niche'), 120), ''), 'outros') as niche,
      case when coalesce(value ->> 'score', '') ~ '^[0-9]{1,3}$' then (value ->> 'score')::smallint end as score,
      case when jsonb_typeof(value -> 'signals') = 'object' then value -> 'signals' else '{}'::jsonb end as signals,
      case when coalesce(value ->> 'screenshot_url', '') ~ '^https?://' then left(value ->> 'screenshot_url', 2000) end as screenshot_url,
      case when coalesce(value ->> 'preview_url', '') ~ '^https?://' then left(value ->> 'preview_url', 2000) end as preview_url,
      case when coalesce(value ->> 'ads_url', '') ~ '^https?://' then left(value ->> 'ads_url', 2000) end as ads_url
    from jsonb_array_elements(p_rows)
  ), valid as (
    select
      raw, domain, url_final, title, niche, score, signals, screenshot_url, preview_url, ads_url,
      encode(extensions.digest(lower(domain) || '|' || lower(url_final), 'sha256'), 'hex') as fingerprint,
      case when score >= 9 then 'S' when score >= 6 then 'A' when score >= 3 then 'B' else 'C' end as priority
    from parsed
    where domain is not null and domain ~ '^[A-Za-z0-9.-]+$'
      and url_final is not null and url_final ~ '^https?://'
      and title is not null and score between 0 and 100
  ), deduplicated as (
    select distinct on (fingerprint) * from valid order by fingerprint, score desc
  ), upserted as (
    insert into public.offers (
      workspace_id, fingerprint, domain, url_final, title, niche, priority, score, signals,
      screenshot_url, preview_url, ads_url, first_seen_at, last_seen_at, recurrence_count
    )
    select
      p_workspace_id, fingerprint, lower(domain), url_final, title, niche, priority, score, signals,
      screenshot_url, preview_url, ads_url, now(), now(), 1
    from deduplicated
    on conflict (workspace_id, fingerprint) do update set
      domain = excluded.domain,
      url_final = excluded.url_final,
      title = excluded.title,
      niche = excluded.niche,
      priority = excluded.priority,
      score = excluded.score,
      signals = excluded.signals,
      screenshot_url = coalesce(excluded.screenshot_url, public.offers.screenshot_url),
      preview_url = coalesce(excluded.preview_url, public.offers.preview_url),
      ads_url = coalesce(excluded.ads_url, public.offers.ads_url),
      last_seen_at = now(),
      recurrence_count = public.offers.recurrence_count + 1
    returning id, fingerprint
  )
  select count(*) into imported_count from upserted;

  with parsed as (
    select
      value as raw,
      nullif(left(btrim(value ->> 'domain'), 253), '') as domain,
      nullif(left(btrim(value ->> 'url_final'), 2000), '') as url_final,
      case when coalesce(value ->> 'score', '') ~ '^[0-9]{1,3}$' then (value ->> 'score')::smallint end as score,
      case when jsonb_typeof(value -> 'signals') = 'object' then value -> 'signals' else '{}'::jsonb end as signals
    from jsonb_array_elements(p_rows)
  ), valid as (
    select
      raw, domain, url_final, score, signals,
      encode(extensions.digest(lower(domain) || '|' || lower(url_final), 'sha256'), 'hex') as fingerprint,
      case when score >= 9 then 'S' when score >= 6 then 'A' when score >= 3 then 'B' else 'C' end as priority
    from parsed
    where domain is not null and domain ~ '^[A-Za-z0-9.-]+$'
      and url_final is not null and url_final ~ '^https?://' and score between 0 and 100
  ), deduplicated as (
    select distinct on (fingerprint) * from valid order by fingerprint, score desc
  )
  insert into public.hunt_offers (
    hunt_id, offer_id, workspace_id, observed_score, observed_priority, observed_signals, raw_observation
  )
  select hunt_id, offers.id, p_workspace_id, deduplicated.score, deduplicated.priority, deduplicated.signals, deduplicated.raw
  from deduplicated
  join public.offers offers on offers.workspace_id = p_workspace_id and offers.fingerprint = deduplicated.fingerprint;

  update public.hunts set
    status = 'completed',
    rows_imported = imported_count,
    rows_rejected = received_count - imported_count,
    completed_at = now()
  where id = hunt_id;

  insert into public.audit_events (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_workspace_id, actor, 'hunt.imported', 'hunt', hunt_id::text,
    jsonb_build_object('rows_received', received_count, 'rows_imported', imported_count)
  );

  return jsonb_build_object(
    'hunt_id', hunt_id,
    'duplicate', false,
    'rows_received', received_count,
    'rows_imported', imported_count,
    'rows_rejected', received_count - imported_count
  );
end;
$$;

create or replace function public.create_workspace_invitation(p_workspace_id uuid, p_email text, p_role text)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  invitation_uuid uuid;
  expiration timestamptz := now() + interval '7 days';
begin
  if actor is null then raise exception 'authentication_required'; end if;
  if not public.workspace_role_at_least(p_workspace_id, 'admin') then raise exception 'workspace_forbidden'; end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or char_length(normalized_email) > 320 then raise exception 'invalid_email'; end if;
  if p_role not in ('admin', 'editor', 'viewer') then raise exception 'invalid_role'; end if;

  insert into public.workspace_invitations (workspace_id, email, role, token_hash, created_by, expires_at)
  values (p_workspace_id, normalized_email, p_role, extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'), actor, expiration)
  on conflict (workspace_id, (lower(email))) where accepted_at is null and revoked_at is null
  do update set
    role = excluded.role,
    token_hash = excluded.token_hash,
    created_by = excluded.created_by,
    expires_at = excluded.expires_at,
    created_at = now()
  returning id into invitation_uuid;

  insert into public.audit_events (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_workspace_id, actor, 'invitation.created', 'workspace_invitation', invitation_uuid::text, jsonb_build_object('role', p_role));
  return query select invitation_uuid, raw_token, expiration;
end;
$$;

create or replace function public.accept_workspace_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  invitation public.workspace_invitations%rowtype;
begin
  if actor is null then raise exception 'authentication_required'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'invalid_invitation'; end if;
  select * into invitation
  from public.workspace_invitations
  where token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and accepted_at is null and revoked_at is null and expires_at > now()
  for update;
  if not found or actor_email = '' or actor_email <> lower(invitation.email) then raise exception 'invalid_invitation'; end if;

  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (invitation.workspace_id, actor, invitation.role, invitation.created_by)
  on conflict (workspace_id, user_id) do nothing;
  update public.workspace_invitations set accepted_by = actor, accepted_at = now() where id = invitation.id;
  insert into public.audit_events (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (invitation.workspace_id, actor, 'invitation.accepted', 'workspace_invitation', invitation.id::text, jsonb_build_object('role', invitation.role));
  return invitation.workspace_id;
end;
$$;

create or replace function public.update_workspace_member_role(p_workspace_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null or public.workspace_role(p_workspace_id) <> 'owner' then raise exception 'workspace_forbidden'; end if;
  if p_role not in ('admin', 'editor', 'viewer') then raise exception 'invalid_role'; end if;
  update public.workspace_members set role = p_role
  where workspace_id = p_workspace_id and user_id = p_user_id and role <> 'owner';
  if not found then raise exception 'member_not_found_or_owner'; end if;
  insert into public.audit_events (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_workspace_id, actor, 'member.role_updated', 'workspace_member', p_user_id::text, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.audit_offer_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status or old.user_notes is distinct from new.user_notes or old.tags is distinct from new.tags then
    insert into public.audit_events (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (
      new.workspace_id, (select auth.uid()), 'offer.decision_updated', 'offer', new.id::text,
      jsonb_build_object('status_changed', old.status is distinct from new.status, 'notes_changed', old.user_notes is distinct from new.user_notes, 'tags_changed', old.tags is distinct from new.tags)
    );
  end if;
  return new;
end;
$$;
create trigger offers_audit_decision after update on public.offers
for each row execute function public.audit_offer_decision();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.hunts enable row level security;
alter table public.offers enable row level security;
alter table public.hunt_offers enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.audit_events enable row level security;
alter table public.import_rate_limits enable row level security;

create policy profiles_select_shared on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.shares_workspace(id));
create policy profiles_update_self on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy workspaces_select_member on public.workspaces for select to authenticated
using (public.is_workspace_member(id));
create policy workspaces_update_admin on public.workspaces for update to authenticated
using (public.workspace_role_at_least(id, 'admin')) with check (public.workspace_role_at_least(id, 'admin'));

create policy workspace_members_select_member on public.workspace_members for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy hunts_select_member on public.hunts for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy offers_select_member on public.offers for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy offers_update_editor on public.offers for update to authenticated
using (public.workspace_role_at_least(workspace_id, 'editor'))
with check (public.workspace_role_at_least(workspace_id, 'editor'));
create policy hunt_offers_select_member on public.hunt_offers for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy invitations_select_admin on public.workspace_invitations for select to authenticated
using (public.workspace_role_at_least(workspace_id, 'admin'));
create policy audit_events_select_admin on public.audit_events for select to authenticated
using (public.workspace_role_at_least(workspace_id, 'admin'));

revoke all on table public.profiles, public.workspaces, public.workspace_members, public.hunts, public.offers,
  public.hunt_offers, public.workspace_invitations, public.audit_events, public.import_rate_limits from anon, authenticated;
grant select on table public.profiles, public.workspaces, public.workspace_members, public.hunts, public.offers,
  public.hunt_offers, public.workspace_invitations, public.audit_events to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant update (name) on public.workspaces to authenticated;
grant update (status, user_notes, tags) on public.offers to authenticated;

revoke all on function public.role_rank(text), public.workspace_role(uuid), public.is_workspace_member(uuid),
  public.workspace_role_at_least(uuid, text), public.shares_workspace(uuid), public.create_workspace(text),
  public.consume_import_rate_limit(), public.import_hunt(uuid, uuid, text, text, text, text, jsonb),
  public.create_workspace_invitation(uuid, text, text), public.accept_workspace_invitation(text),
  public.update_workspace_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.workspace_role(uuid), public.is_workspace_member(uuid),
  public.workspace_role_at_least(uuid, text), public.shares_workspace(uuid), public.create_workspace(text),
  public.consume_import_rate_limit(),
  public.create_workspace_invitation(uuid, text, text), public.accept_workspace_invitation(text),
  public.update_workspace_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.import_hunt(uuid, uuid, text, text, text, text, jsonb) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cacadas_csv', 'cacadas_csv', false, 5242880, array['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy cacadas_csv_select_member on storage.objects for select to authenticated
using (
  bucket_id = 'cacadas_csv'
and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
);
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
