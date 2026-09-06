# Backend do Afero Hub

Esta pasta documenta a conexão entre o front-end e o backend Supabase. A implementação vive em `../supabase/`.

## O que já está estruturado

- Supabase Auth para cadastro, confirmação de e-mail, login, recuperação e sessão.
- Workspace pessoal criado automaticamente após o cadastro.
- Workspaces de equipe com papéis `owner`, `admin`, `editor` e `viewer`.
- Postgres com `hunts`, `offers`, `hunt_offers`, convites e auditoria.
- Bucket privado `cacadas_csv`, limitado a 5 MiB.
- Edge Function `import-hunt` com autenticação, validação de CSV, checksum e rollback do upload em caso de falha.
- RLS no banco e no Storage.
- Deduplicação por URL canônica e idempotência por SHA-256 do arquivo.
- Limite antiabuso de 20 importações por usuário por hora. O script local permanece sem limite.

## Aplicação manual no Supabase

O Supabase CLI não está instalado neste workspace. Nenhum projeto remoto foi alterado.

1. Crie um projeto Supabase.
2. Instale o Supabase CLI e tenha Docker disponível para validação local.
3. Dentro de `hunter-hub`, execute `supabase start` e depois `supabase db reset`.
4. Rode `supabase test db` para executar o pgTAP em `supabase/tests/`.
5. Copie `supabase/functions/.env.example` para um arquivo local ignorado e troque a URL da Vercel.
6. Vincule o projeto com `supabase link --project-ref SEU_PROJECT_REF`.
7. Envie a migration com `supabase db push`.
8. Configure `ALLOWED_ORIGINS` com `supabase secrets set --env-file supabase/functions/.env`.
9. Publique a função somente após aprovação explícita: `supabase functions deploy import-hunt`.

## Configuração do Auth no painel

- Ative e-mail e senha.
- Mantenha confirmação de e-mail ligada.
- Configure a URL pública da Vercel como Site URL.
- Adicione apenas URLs controladas em Redirect URLs.
- Use expiração curta para access tokens. O arquivo local usa 3600 segundos como referência.
- Ative proteção contra senhas vazadas e MFA quando o plano escolhido disponibilizar esses controles.

## Variáveis do front-end

O navegador recebe somente:

- `SUPABASE_URL`
- chave publicável `sb_publishable_...`

Nunca entregue `sb_secret_...`, service role, senha do banco ou chave URLScan ao front-end. A chave URLScan continua apenas no computador do usuário.

## Rollback

O arquivo `../supabase/rollback/202608280001_afero_backend.rollback.sql` é destrutivo e não é executado automaticamente. Ele exige a confirmação de sessão `afero.allow_destructive_rollback=yes` e deve ser usado somente depois da exportação dos dados.
