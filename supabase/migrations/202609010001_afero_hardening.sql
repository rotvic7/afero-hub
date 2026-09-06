begin;

do $$
begin
  if exists (
    select 1
    from public.hunt_offers ho
    join public.hunts h on h.id = ho.hunt_id
    join public.offers o on o.id = ho.offer_id
    where ho.workspace_id <> h.workspace_id
       or ho.workspace_id <> o.workspace_id
  ) then
    raise exception 'hunt_offers contains cross-tenant links';
  end if;
end;
$$;

alter table public.hunts
  add constraint hunts_id_workspace_key unique (id, workspace_id);
alter table public.offers
  add constraint offers_id_workspace_key unique (id, workspace_id);

alter table public.hunt_offers
  add constraint hunt_offers_hunt_workspace_fkey
    foreign key (hunt_id, workspace_id)
    references public.hunts (id, workspace_id) on delete cascade not valid,
  add constraint hunt_offers_offer_workspace_fkey
    foreign key (offer_id, workspace_id)
    references public.offers (id, workspace_id) on delete cascade not valid;
alter table public.hunt_offers validate constraint hunt_offers_hunt_workspace_fkey;
alter table public.hunt_offers validate constraint hunt_offers_offer_workspace_fkey;

create index if not exists offers_workspace_catalog_idx
  on public.offers (workspace_id, score desc, last_seen_at desc, id);
create index if not exists offers_workspace_status_score_idx
  on public.offers (workspace_id, status, score desc);

create or replace function public.consume_import_rate_limit(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz := pg_catalog.date_trunc('hour', now());
  resulting_count integer;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    return false;
  end if;

  delete from public.import_rate_limits where window_start < now() - interval '2 hours';
  insert into public.import_rate_limits (user_id, window_start, request_count)
  values (p_user_id, current_window, 1)
  on conflict (user_id, window_start) do update
    set request_count = public.import_rate_limits.request_count + 1
    where public.import_rate_limits.request_count < 20
  returning request_count into resulting_count;

  return resulting_count is not null and resulting_count <= 20;
end;
$$;

revoke all on function public.consume_import_rate_limit() from public, anon, authenticated;
revoke all on function public.consume_import_rate_limit(uuid) from public, anon, authenticated;
grant execute on function public.consume_import_rate_limit(uuid) to service_role;

create or replace function public.merge_offer_signals(p_existing jsonb, p_incoming jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with source as (
    select coalesce(p_existing, '{}'::jsonb) as existing_signals,
           coalesce(p_incoming, '{}'::jsonb) as incoming_signals
  ), merged_arrays as (
    select key,
           coalesce(jsonb_agg(value order by value), '[]'::jsonb) as value
    from source,
    lateral (values
      ('motives'::text), ('queries'::text), ('gateways'::text), ('trackers'::text)
    ) keys(key)
    left join lateral (
      select distinct items.item as value
      from jsonb_array_elements_text(
        case when jsonb_typeof(existing_signals -> key) = 'array' then existing_signals -> key else '[]'::jsonb end ||
        case when jsonb_typeof(incoming_signals -> key) = 'array' then incoming_signals -> key else '[]'::jsonb end
      ) as items(item)
    ) values_on_key on true
    group by key
  )
  select (existing_signals || incoming_signals)
    || jsonb_build_object(
      'mrr', (existing_signals ->> 'mrr' = 'true') or (incoming_signals ->> 'mrr' = 'true'),
      'pixel_ads', (existing_signals ->> 'pixel_ads' = 'true') or (incoming_signals ->> 'pixel_ads' = 'true'),
      'vsl_player', (existing_signals ->> 'vsl_player' = 'true') or (incoming_signals ->> 'vsl_player' = 'true'),
      'funnel_quiz', (existing_signals ->> 'funnel_quiz' = 'true') or (incoming_signals ->> 'funnel_quiz' = 'true'),
      'double_signal', (existing_signals ->> 'double_signal' = 'true') or (incoming_signals ->> 'double_signal' = 'true'),
      'scaled', (existing_signals ->> 'scaled' = 'true') or (incoming_signals ->> 'scaled' = 'true'),
      'new_builder', (existing_signals ->> 'new_builder' = 'true') or (incoming_signals ->> 'new_builder' = 'true'),
      'times_seen', greatest(
        coalesce(nullif(existing_signals ->> 'times_seen', '')::integer, 0),
        coalesce(nullif(incoming_signals ->> 'times_seen', '')::integer, 0)
      )
    )
    || coalesce((select jsonb_object_agg(key, value) from merged_arrays), '{}'::jsonb)
  from source;
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
  hunt_id uuid;
  existing_hunt public.hunts%rowtype;
  received_count integer;
  imported_count integer := 0;
begin
  if p_actor_user_id is null or not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_actor_user_id
      and public.role_rank(role) >= public.role_rank('editor')
  ) then raise exception 'workspace_forbidden'; end if;
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'invalid_sha256'; end if;
  if p_file_path is null or p_file_path !~ ('^' || p_workspace_id::text || '/hunts/[A-Za-z0-9._-]+[.]csv$') then raise exception 'invalid_file_path'; end if;
  if p_file_name is null or char_length(btrim(p_file_name)) not between 1 and 255 then raise exception 'invalid_file_name'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows'; end if;
  received_count := jsonb_array_length(p_rows);
  if received_count < 1 or received_count > 10000 or octet_length(p_rows::text) > 7000000 then raise exception 'invalid_rows'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'cacadas_csv' and name = p_file_path) then raise exception 'file_not_found'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || ':' || p_sha256, 0));
  select * into existing_hunt from public.hunts where workspace_id = p_workspace_id and sha256 = p_sha256;
  if found then
    return jsonb_build_object('hunt_id', existing_hunt.id, 'duplicate', true,
      'rows_received', existing_hunt.rows_received, 'rows_imported', existing_hunt.rows_imported,
      'rows_rejected', existing_hunt.rows_rejected);
  end if;

  insert into public.hunts (workspace_id, created_by, original_file_name, source_file_path, sha256, engine_version, status, rows_received)
  values (p_workspace_id, p_actor_user_id, left(btrim(p_file_name), 255), p_file_path, p_sha256,
    nullif(left(btrim(coalesce(p_engine_version, '')), 80), ''), 'processing', received_count)
  returning id into hunt_id;

  with parsed as (
    select value as raw, nullif(left(btrim(value ->> 'domain'), 253), '') as domain,
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
    select *, encode(extensions.digest(lower(domain) || '|' || lower(url_final), 'sha256'), 'hex') as fingerprint
    from parsed where domain is not null and domain ~ '^[A-Za-z0-9.-]+$' and url_final is not null
      and url_final ~ '^https?://' and title is not null and score between 0 and 100
  ), deduplicated as (
    select distinct on (fingerprint) * from valid order by fingerprint, score desc
  ), upserted as (
    insert into public.offers (workspace_id, fingerprint, domain, url_final, title, niche, priority, score, signals, screenshot_url, preview_url, ads_url, first_seen_at, last_seen_at, recurrence_count)
    select p_workspace_id, fingerprint, lower(domain), url_final, title, niche,
      case when score >= 9 then 'S' when score >= 6 then 'A' when score >= 3 then 'B' else 'C' end,
      score, signals, screenshot_url, preview_url, ads_url, now(), now(), 1 from deduplicated
    on conflict (workspace_id, fingerprint) do update set
      domain = excluded.domain, url_final = excluded.url_final, title = excluded.title, niche = excluded.niche,
      score = greatest(public.offers.score, excluded.score),
      priority = case when greatest(public.offers.score, excluded.score) >= 9 then 'S'
        when greatest(public.offers.score, excluded.score) >= 6 then 'A'
        when greatest(public.offers.score, excluded.score) >= 3 then 'B' else 'C' end,
      signals = public.merge_offer_signals(public.offers.signals, excluded.signals),
      screenshot_url = coalesce(excluded.screenshot_url, public.offers.screenshot_url),
      preview_url = coalesce(excluded.preview_url, public.offers.preview_url),
      ads_url = coalesce(excluded.ads_url, public.offers.ads_url), last_seen_at = now(),
      recurrence_count = public.offers.recurrence_count + 1
    returning id, fingerprint
  ) select count(*) into imported_count from upserted;

  with parsed as (
    select value as raw, nullif(left(btrim(value ->> 'domain'), 253), '') as domain,
      nullif(left(btrim(value ->> 'url_final'), 2000), '') as url_final,
      case when coalesce(value ->> 'score', '') ~ '^[0-9]{1,3}$' then (value ->> 'score')::smallint end as score,
      case when jsonb_typeof(value -> 'signals') = 'object' then value -> 'signals' else '{}'::jsonb end as signals
    from jsonb_array_elements(p_rows)
  ), valid as (
    select *, encode(extensions.digest(lower(domain) || '|' || lower(url_final), 'sha256'), 'hex') as fingerprint
    from parsed where domain is not null and domain ~ '^[A-Za-z0-9.-]+$' and url_final is not null
      and url_final ~ '^https?://' and score between 0 and 100
  ), deduplicated as (
    select distinct on (fingerprint) * from valid order by fingerprint, score desc
  )
  insert into public.hunt_offers (hunt_id, offer_id, workspace_id, observed_score, observed_priority, observed_signals, raw_observation)
  select hunt_id, o.id, p_workspace_id, d.score,
    case when d.score >= 9 then 'S' when d.score >= 6 then 'A' when d.score >= 3 then 'B' else 'C' end,
    d.signals, d.raw
  from deduplicated d join public.offers o on o.workspace_id = p_workspace_id and o.fingerprint = d.fingerprint;

  update public.hunts set status = 'completed', rows_imported = imported_count,
    rows_rejected = received_count - imported_count, completed_at = now() where id = hunt_id and workspace_id = p_workspace_id;
  insert into public.audit_events (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_workspace_id, p_actor_user_id, 'hunt.imported', 'hunt', hunt_id::text,
    jsonb_build_object('rows_received', received_count, 'rows_imported', imported_count));
  return jsonb_build_object('hunt_id', hunt_id, 'duplicate', false, 'rows_received', received_count,
    'rows_imported', imported_count, 'rows_rejected', received_count - imported_count);
end;
$$;

revoke all on function public.import_hunt(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.import_hunt(uuid, uuid, text, text, text, text, jsonb) to service_role;

drop policy if exists cacadas_csv_insert_editor on storage.objects;
drop policy if exists cacadas_csv_delete_owner on storage.objects;

commit;
