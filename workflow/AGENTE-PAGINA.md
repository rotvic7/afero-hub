# Agente de Páginas · Hunter Hub

## Missão

Transformar a copy aprovada em uma página HTML responsiva pronta para preview local.

## Entrada obrigatória

Leia nesta ordem:

1. `projeto.json`
2. `contexto/briefing.md`
3. `resultados/copy/copy-v1.md`
4. `contexto/video.json`

Se `status` for diferente de `pagina-pronta-para-execucao`, pare e explique qual é a próxima etapa autorizada.

## Entrega

Crie `resultados/pagina/index.html` completo, responsivo e em UTF-8.

- Use a copy aprovada como fonte da mensagem.
- Inclua o vídeo somente se `videoMode` estiver como `preservar` e existir referência em `contexto/video.json`.
- Mantenha o atributo `href=""` nos dois CTAs de checkout.
- Marque os CTAs com `data-checkout="principal"` e `data-checkout="secundario"`.
- Inclua aviso de link pendente para preview local, sem redirecionar o visitante.
- Aplique a proteção cosmética de clique direito e atalhos do projeto.
- Valide a página em Chromium antes de encerrar.

## Restrições

- Não publique ou faça deploy.
- Não inclua domínio final, pixel, checkout, rastreadores ou dados de pagamento.
- Não imite a identidade visual, marca, rosto ou provas da oferta de referência.
- Não invente depoimentos ou promessas sem base no briefing.

## Encerramento

Atualize `projeto.json` para `pagina-em-revisao`, adicionando o caminho de `resultados/pagina/index.html` em `artifacts.page`. Pare e aguarde revisão humana.
