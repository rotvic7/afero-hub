# Contrato do front-end com o Supabase

## Cliente

Use `@supabase/supabase-js` fixado pela aplicação e crie uma única instância por factory com a URL do projeto e uma chave `sb_publishable_*`. A configuração inválida, vazia, secreta ou fora de `*.supabase.co`/localhost mantém o Hub em demonstração local. Todas as consultas abaixo usam a sessão do usuário e permanecem sujeitas a RLS.

## Auth

- Cadastro: `supabase.auth.signUp({ email, password, options: { data: { full_name } } })`
- Login: `supabase.auth.signInWithPassword({ email, password })`
- Google: `supabase.auth.signInWithOAuth({ provider: 'google', options: { scopes: 'openid email profile', redirectTo } })`
- Logout: `supabase.auth.signOut()`
- Recuperação: `supabase.auth.resetPasswordForEmail(email, { redirectTo })`
- Nova senha na rota de recuperação: `supabase.auth.updateUser({ password })`
- Sessão inicial: `supabase.auth.getSession()`
- Mudanças de sessão: `supabase.auth.onAuthStateChange(callback)`

O front-end deve tratar cadastro com confirmação pendente sem simular login. Não há vinculação manual por e-mail, Admin API no navegador ou escopos Google adicionais. Rotas do Painel só carregam dados depois de uma sessão válida.

## Workspaces

Listar:

```js
supabase
  .from('workspace_members')
  .select('role, created_at, workspace:workspaces(id,name,slug)')
  .order('created_at', { ascending: true })
```

Criar equipe:

```js
supabase.rpc('create_workspace', { p_name: nome })
```

## Importar CSV

```js
const body = new FormData();
body.append('workspace_id', workspaceId);
body.append('file', file);

const { data, error } = await supabase.functions.invoke('import-hunt', { body });
```

O retorno contém `hunt_id`, `duplicate`, `rows_received`, `rows_imported`, `rows_rejected`, resumo do parser e `request_id`. A tela deve conservar o `request_id` ao apresentar falhas de suporte.

O navegador não chama `import_hunt` diretamente. Essa RPC aceita somente `service_role`; a Edge Function entrega o `user_id` verificado e mantém a operação atômica.

## Painel acumulado

O catálogo é paginado por cursor. O navegador nunca pede o acervo completo:

```js
supabase
  .from('offers')
  .select('id,workspace_id,domain,url_final,title,niche,priority,score,signals,screenshot_url,preview_url,ads_url,first_seen_at,last_seen_at,recurrence_count,status,user_notes,tags', { count: 'exact' })
  .eq('workspace_id', workspaceId)
  .order('score', { ascending: false })
  .order('last_seen_at', { ascending: false })
  .order('id', { ascending: true })
  .limit(101)
```

O cliente exibe no máximo 100 linhas: a linha 101 só confirma que há próxima página. O `count: 'exact'` é solicitado apenas na primeira página e representa o recorte de filtros feitos no banco. Páginas seguintes não recalculam o total.

O cursor aceito pelo cliente é `{ score, lastSeenAt, id }`. Antes de entrar no filtro PostgREST, `score` precisa ser inteiro de 0 a 100, `lastSeenAt` precisa ser ISO UTC canônico parseável e `id` precisa ser UUID estrito. A consulta preserva a ordem abaixo e aplica keyset, nunca `offset`:

```js
supabase
  .from('offers')
  .select('id,workspace_id,domain,url_final,title,niche,priority,score,signals,screenshot_url,preview_url,ads_url,first_seen_at,last_seen_at,recurrence_count,status,user_notes,tags', { count: 'exact' })
  .eq('workspace_id', workspaceId)
  .or(`score.lt.${score},and(score.eq.${score},last_seen_at.lt."${lastSeenAt}"),and(score.eq.${score},last_seen_at.eq."${lastSeenAt}",id.gt.${id})`)
  .order('score', { ascending: false })
  .order('last_seen_at', { ascending: false })
  .order('id', { ascending: true })
  .limit(101)
  .abortSignal(signal)
```

Busca usa `title.ilike` com `%` e `_` escapados. `niche`, `priority` e `status` usam `.eq` no banco. `pixel`, `vsl`, `quiz`, `mrr`, `scaled` e `recurring` são filtros locais aplicados somente aos 100 itens já carregados; a interface deve identificá-los como `Filtros de sinais nesta página`.

Atualizar decisão:

```js
supabase
  .from('offers')
  .update({ status, user_notes, tags })
  .eq('workspace_id', workspaceId)
  .eq('id', offerId)
  .select('id,status,user_notes,tags')
  .single()
```

Privilégios de coluna impedem o navegador de alterar score, recorrência, fingerprint e evidências técnicas.

O cliente aceita somente `new`, `saved`, `discarded`, `in_copy` e `in_page`; aceita no máximo 24 tags e 10.000 caracteres em `user_notes`. Ele confirma a decisão usando exclusivamente o row retornado pelo servidor e não altera o objeto de entrada.

## URL temporária do CSV

Para abrir um original privado, o cliente valida que `path` inicia exatamente com `${workspaceId}/` e rejeita segmentos `..`. Em seguida chama apenas:

```js
supabase.storage.from('cacadas_csv').createSignedUrl(path, 60)
```

A URL assinada expira em 60 segundos e nunca pode apontar para outro prefixo de workspace.

## Histórico

- `hunts` lista arquivos e totais de cada rodada.
- `hunt_offers` recupera a observação de uma oferta dentro de uma caçada.
- `offers` alimenta o mapa e os cards com a visão consolidada.

## Equipes

Criar convite:

```js
supabase.rpc('create_workspace_invitation', {
  p_workspace_id: workspaceId,
  p_email: email,
  p_role: 'editor'
})
```

A RPC retorna o token uma vez. O serviço de e-mail futuro deve enviar um link HTTPS que mantenha esse token fora de logs e analytics. Aceitar:

```js
supabase.rpc('accept_workspace_invitation', { p_token: token })
```

Somente o dono altera o papel de um membro com `update_workspace_member_role`.
