# Checklist de segurança do backend

## Implementado no código

- [x] Auth delegado ao Supabase.
- [x] Confirmação de e-mail prevista no `config.toml`.
- [x] RLS em todas as tabelas expostas.
- [x] Bucket privado com políticas por workspace.
- [x] Privilégio mínimo por tabela e por coluna.
- [x] RPC de importação inacessível ao papel `authenticated`.
- [x] Identidade do importador entregue à RPC somente pela Edge Function autenticada.
- [x] Limite de 5 MiB, 10.000 linhas e 64 colunas.
- [x] Bloqueio de fórmula fora das colunas legadas controladas.
- [x] URL allowlist HTTP/HTTPS.
- [x] SHA-256 para idempotência do arquivo.
- [x] Deduplicação por fingerprint dentro de cada workspace.
- [x] CORS por allowlist.
- [x] Rate limiting antiabuso sem Redis.
- [x] Erro genérico e request ID.
- [x] Auditoria de importação, convite, papel e decisão da oferta.
- [x] Dependência da Edge Function fixada em versão exata.
- [x] Rollback destrutivo separado e protegido por confirmação.

## Validar antes do lançamento

- [ ] Executar `supabase db reset` em ambiente local com Docker.
- [ ] Executar `supabase test db` e confirmar pgTAP verde.
- [ ] Criar dois usuários reais de teste e provar isolamento cruzado de workspaces.
- [ ] Testar upload, download e remoção no bucket com `viewer`, `editor` e usuário externo.
- [ ] Testar cadastro, confirmação, login, logout, expiração, recuperação e alteração de senha.
- [ ] Configurar domínio Vercel e redirects exatos.
- [ ] Ativar proteção de senhas vazadas e MFA quando disponível no plano.
- [ ] Configurar alertas de Auth, erros da Edge Function e uso de Storage/Banco.
- [ ] Definir rotina de backup, exportação e exclusão de conta conforme LGPD.
- [ ] Fazer revisão de segurança depois que a UI de login for integrada.

## Ameaças tratadas

- Vazamento entre contas: RLS por membership.
- Escalada de papel: alteração de role limitada ao owner em RPC.
- Bypass do parser: `import_hunt` disponível apenas a `service_role`.
- CSV injection: fórmulas rejeitadas ou convertidas em URL segura.
- Reimportação e replay: SHA-256 único por workspace.
- Abuso de upload: tamanho, MIME, extensão, quota horária e bucket privado.
- Vazamento de segredo: somente chave publicável no navegador; URLScan permanece local.
