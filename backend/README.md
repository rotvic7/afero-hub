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
- Integração preparada para compra única Eduzz: webhook assinado, acesso verificado no banco e revogação por reembolso/chargeback. A exigência de compra permanece desligada até ativação manual.
- Publicação Vercel por allowlist em `public-site-index`, com LP na raiz e painel em `/hub`. O pacote exclui arquivos do backend, scripts locais e testes. Consulte `../README.md`.

O roteiro de ativação segura da Eduzz está em `EDUZZ-RELEASE.md`. Não ativar a trava paga antes de testar um comprador real, um não comprador e a conta do operador.

## Aplicação manual no Supabase

O CLI está disponível pelo pacote do workspace com `npx supabase`. Nenhum projeto remoto é alterado somente por editar estes arquivos.

1. Tenha o Docker Desktop em execução para a validação local.
2. Dentro de `hunter-hub`, execute `npx supabase start` e depois `npx supabase db reset`.
3. Rode `npx supabase test db` para executar o pgTAP em `supabase/tests/`.
4. Vincule o projeto com `npx supabase link --project-ref wqirnqrhfpnkmmcknxnt`.
5. Confira o plano com `npx supabase db push --dry-run`.
6. Envie a migration com `npx supabase db push`.
7. Copie `supabase/functions/.env.example` para `supabase/functions/.env`, que deve permanecer ignorado.
8. Configure `ALLOWED_ORIGINS` com `npx supabase secrets set --env-file supabase/functions/.env`.
9. Publique a função somente após aprovação explícita: `npx supabase functions deploy import-hunt`.

## Configuração do Auth no painel

- Ative e-mail e senha.
- Mantenha confirmação de e-mail ligada.
- Configure `https://afero-hub.vercel.app/hub` como Site URL.
- Adicione `https://afero-hub.vercel.app/hub`, `https://afero-hub.vercel.app/hub.html`, `http://127.0.0.1:4377/index.html` e `http://localhost:4377/index.html` em Redirect URLs.
- Use expiração curta para access tokens. O arquivo local usa 3600 segundos como referência.
- Ative proteção contra senhas vazadas e MFA quando o plano escolhido disponibilizar esses controles.

O Auth usa URLs completas: `/hub` em produção e `/index.html` no servidor local. A Edge Function usa somente origens em `ALLOWED_ORIGINS`, sem caminho: `https://afero-hub.vercel.app`, `http://127.0.0.1:4377` e `http://localhost:4377`. Atualize também o painel remoto do Supabase antes da publicação; editar `config.toml` não altera o serviço remoto.

## Variáveis do front-end

O navegador recebe somente:

- `SUPABASE_URL`
- chave publicável `sb_publishable_...`

Nunca entregue `sb_secret_...`, service role, senha do banco ou chave URLScan ao front-end. A chave URLScan continua apenas no computador do usuário.

## Rollback

O arquivo `../supabase/rollback/202608280001_afero_backend.rollback.sql` é destrutivo e não é executado automaticamente. Ele exige a confirmação de sessão `afero.allow_destructive_rollback=yes` e deve ser usado somente depois da exportação dos dados.
