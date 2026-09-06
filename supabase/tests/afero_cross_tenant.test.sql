begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'cliente-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'cliente-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'authenticated', 'authenticated', 'editor-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'authenticated', 'authenticated', 'viewer-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'authenticated', 'authenticated', 'admin-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'authenticated', 'authenticated', 'outsider@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.workspaces (id, name, slug, created_by) values
  ('11111111-1111-4111-8111-111111111111', 'Workspace A', 'workspace-a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('22222222-2222-4222-8222-222222222222', 'Workspace B', 'workspace-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner'),
  ('11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'editor'),
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'viewer'),
  ('11111111-1111-4111-8111-111111111111', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'admin'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'owner');
insert into public.hunts (id, workspace_id, created_by, original_file_name, source_file_path, sha256) values
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a.csv', '11111111-1111-4111-8111-111111111111/hunts/a.csv', repeat('a', 64)),
  ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b.csv', '22222222-2222-4222-8222-222222222222/hunts/b.csv', repeat('b', 64));
insert into public.offers (id, workspace_id, fingerprint, domain, url_final, title, priority, score) values
  ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', repeat('c', 64), 'a.example.test', 'https://a.example.test', 'Oferta A', 'A', 8),
  ('66666666-6666-4666-8666-666666666666', '22222222-2222-4222-8222-222222222222', repeat('d', 64), 'b.example.test', 'https://b.example.test', 'Oferta B', 'A', 8);
insert into public.hunt_offers (hunt_id, offer_id, workspace_id, observed_score, observed_priority) values
  ('33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 8, 'A'),
  ('44444444-4444-4444-8444-444444444444', '66666666-6666-4666-8666-666666666666', '22222222-2222-4222-8222-222222222222', 8, 'A');
insert into public.audit_events (workspace_id, actor_user_id, action, entity_type) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test.a', 'offer'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'test.b', 'offer');
insert into storage.objects (bucket_id, name, owner_id) values
  ('cacadas_csv', '11111111-1111-4111-8111-111111111111/hunts/a.csv', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('cacadas_csv', '22222222-2222-4222-8222-222222222222/hunts/b.csv', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

select throws_ok(
  $$ insert into public.hunt_offers (hunt_id, offer_id, workspace_id, observed_score, observed_priority) values ('33333333-3333-4333-8333-333333333333', '66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 8, 'A') $$,
  '23503', null, 'FK composta rejeita oferta de outro tenant'
);

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'email', 'cliente-a@example.test',
  'role', 'authenticated',
  'exp', extract(epoch from now() + interval '1 hour')::integer
)::text, true);
set local role authenticated;

select results_eq($$ select id from public.workspaces where id = '22222222-2222-4222-8222-222222222222' $$, array[]::uuid[], 'A nao lista workspace B');
select results_eq($$ select workspace_id from public.workspace_members where workspace_id = '22222222-2222-4222-8222-222222222222' $$, array[]::uuid[], 'A nao le membros B');
select results_eq($$ select id from public.hunts where workspace_id = '22222222-2222-4222-8222-222222222222' $$, array[]::uuid[], 'A nao le cacadas B');
select results_eq($$ select id from public.offers where workspace_id = '22222222-2222-4222-8222-222222222222' $$, array[]::uuid[], 'A nao le ofertas B');
select results_eq($$ select hunt_id from public.hunt_offers where workspace_id = '22222222-2222-4222-8222-222222222222' $$, array[]::uuid[], 'A nao le vinculos B');
select results_eq($$ select id from public.audit_events where workspace_id = '22222222-2222-4222-8222-222222222222' $$, array[]::bigint[], 'owner A nao le auditoria B');
select results_eq($$ select id from storage.objects where bucket_id = 'cacadas_csv' and name like '22222222-2222-4222-8222-222222222222/%' $$, array[]::uuid[], 'A nao baixa CSV B');
select throws_ok($$ insert into public.hunts (workspace_id, original_file_name, source_file_path, sha256) values ('22222222-2222-4222-8222-222222222222', 'x.csv', '22222222-2222-4222-8222-222222222222/hunts/x.csv', repeat('e', 64)) $$, '42501', null, 'cliente nao insere cacada');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('cacadas_csv', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/hunts/x.csv') $$,
  '42501', null, 'cliente nao envia CSV diretamente'
);
select throws_ok(
  $$ delete from storage.objects where bucket_id = 'cacadas_csv' $$,
  '42501', null, 'cliente nao apaga CSV diretamente'
);
select throws_ok($$ update public.offers set score = 99 where id = '55555555-5555-4555-8555-555555555555' $$, '42501', null, 'cliente nao altera score tecnico em A');
select throws_ok($$ update public.offers set signals = '{"mrr": true}'::jsonb where id = '55555555-5555-4555-8555-555555555555' $$, '42501', null, 'cliente nao altera sinais tecnicos em A');
select is((with changed as (update public.offers set status = 'saved' where id = '66666666-6666-4666-8666-666666666666' returning 1) select count(*) from changed), 0::bigint, 'A nao altera decisao B');
select throws_ok($$ delete from public.offers where id = '55555555-5555-4555-8555-555555555555' $$, '42501', null, 'cliente nao exclui oferta');
select throws_ok($$ select public.import_hunt('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111/hunts/a.csv', 'a.csv', repeat('f', 64), null, '[]'::jsonb) $$, '42501', null, 'cliente nao chama import_hunt');
select ok(
  not has_function_privilege('authenticated', 'public.import_hunt(uuid,uuid,text,text,text,text,jsonb)', 'EXECUTE'),
  'cliente nao chama import_hunt diretamente'
);

reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((with changed as (update public.offers set status = 'saved' where id = '55555555-5555-4555-8555-555555555555' returning 1) select count(*) from changed), 1::bigint, 'editor atualiza decisao A');

reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((with changed as (update public.offers set status = 'discarded' where id = '55555555-5555-4555-8555-555555555555' returning 1) select count(*) from changed), 0::bigint, 'viewer nao atualiza decisao');

reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((with changed as (update public.workspaces set name = 'Workspace A admin' where id = '11111111-1111-4111-8111-111111111111' returning 1) select count(*) from changed), 1::bigint, 'admin atualiza nome do workspace');

reset role;
select set_config('request.jwt.claims', '{}'::jsonb::text, true);
set local role authenticated;
select results_eq($$ select id from public.workspaces $$, array[]::uuid[], 'sessao sem sub nao le workspaces');

reset role;
select * from extensions.finish();
rollback;
