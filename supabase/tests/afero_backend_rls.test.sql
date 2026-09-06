begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

select extensions.has_table('public', 'profiles', 'profiles existe');
select extensions.has_table('public', 'workspaces', 'workspaces existe');
select extensions.has_table('public', 'workspace_members', 'workspace_members existe');
select extensions.has_table('public', 'hunts', 'hunts existe');
select extensions.has_table('public', 'offers', 'offers existe');
select extensions.has_table('public', 'hunt_offers', 'hunt_offers existe');
select extensions.has_table('public', 'workspace_invitations', 'workspace_invitations existe');
select extensions.has_table('public', 'audit_events', 'audit_events existe');
select extensions.has_table('public', 'import_rate_limits', 'import_rate_limits existe');

select extensions.ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS em profiles');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.workspaces'::regclass), 'RLS em workspaces');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.workspace_members'::regclass), 'RLS em workspace_members');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.hunts'::regclass), 'RLS em hunts');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.offers'::regclass), 'RLS em offers');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.hunt_offers'::regclass), 'RLS em hunt_offers');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.workspace_invitations'::regclass), 'RLS em workspace_invitations');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.audit_events'::regclass), 'RLS em audit_events');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.import_rate_limits'::regclass), 'RLS em import_rate_limits');

select extensions.has_function('public', 'create_workspace', array['text'], 'RPC create_workspace existe');
select extensions.has_function('public', 'consume_import_rate_limit', array[]::text[], 'RPC consume_import_rate_limit existe');
select extensions.has_function('public', 'consume_import_rate_limit', array['uuid'], 'RPC service role consume_import_rate_limit existe');
select extensions.has_function('public', 'merge_offer_signals', array['jsonb', 'jsonb'], 'RPC merge_offer_signals existe');
select extensions.has_function('public', 'import_hunt', array['uuid', 'uuid', 'text', 'text', 'text', 'text', 'jsonb'], 'RPC import_hunt existe');
select extensions.has_function('public', 'create_workspace_invitation', array['uuid', 'text', 'text'], 'RPC create_workspace_invitation existe');
select extensions.has_function('public', 'accept_workspace_invitation', array['text'], 'RPC accept_workspace_invitation existe');

select extensions.ok(not has_table_privilege('anon', 'public.offers', 'SELECT'), 'anon não lê ofertas');
select extensions.ok(not has_table_privilege('authenticated', 'public.offers', 'INSERT'), 'cliente autenticado não insere ofertas diretamente');
select extensions.ok(not has_table_privilege('authenticated', 'public.hunts', 'INSERT'), 'cliente autenticado não insere caçadas diretamente');
select extensions.ok(has_column_privilege('authenticated', 'public.offers', 'status', 'UPDATE'), 'editor pode atualizar decisão sob RLS');
select extensions.ok(not has_function_privilege('authenticated', 'public.import_hunt(uuid,uuid,text,text,text,text,jsonb)', 'EXECUTE'), 'cliente não contorna o parser chamando import_hunt');
select extensions.ok(has_function_privilege('service_role', 'public.import_hunt(uuid,uuid,text,text,text,text,jsonb)', 'EXECUTE'), 'somente a Edge Function executa import_hunt');
select extensions.ok(not has_function_privilege('authenticated', 'public.consume_import_rate_limit(uuid)', 'EXECUTE'), 'cliente nao consome quota diretamente');
select extensions.ok(has_function_privilege('service_role', 'public.consume_import_rate_limit(uuid)', 'EXECUTE'), 'service role consome quota');

select extensions.is((select public from storage.buckets where id = 'cacadas_csv'), false, 'bucket de CSV é privado');
select extensions.is((select file_size_limit from storage.buckets where id = 'cacadas_csv'), 5242880::bigint, 'bucket limita CSV a 5 MiB');
select extensions.is((select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'cacadas_csv_%'), 1, 'Storage preserva somente policy de leitura');
select extensions.ok(exists (select 1 from pg_constraint where conname = 'hunt_offers_hunt_workspace_fkey'), 'hunt_offers protege tenant da cacada');
select extensions.ok(exists (select 1 from pg_constraint where conname = 'hunt_offers_offer_workspace_fkey'), 'hunt_offers protege tenant da oferta');
select extensions.ok(exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal), 'cadastro cria perfil e workspace pessoal');

select * from extensions.finish();
rollback;
