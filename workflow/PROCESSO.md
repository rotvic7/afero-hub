# Processo local de remodelação · Hunter Hub

## Escopo

O Hunter Hub usa somente três agentes: Caçador de Ofertas, Copy e Páginas.

## Ordem obrigatória

1. O Hunter Hub registra a oferta e cria `contexto/briefing.md`.
2. O Agente de Copy gera `resultados/copy/copy-v1.md`.
3. O usuário revisa e aprova a copy no Hunter Hub.
4. O Agente de Páginas gera `resultados/pagina/index.html`.
5. O usuário abre a página em navegador real e decide o próximo passo.

## Estados

- `copy-pronta-para-execucao`: o projeto acabou de ser exportado.
- `copy-em-revisao`: a copy foi criada e aguarda decisão humana.
- `pagina-pronta-para-execucao`: a copy foi aprovada.
- `pagina-em-revisao`: a página foi criada e aguarda decisão humana.
- `pronto-para-exportar`: página aprovada pelo usuário.

## Regras

- Leia `projeto.json` e todos os arquivos de `contexto/` antes de trabalhar.
- Execute somente a etapa indicada em `projeto.json`.
- Preserve os checkouts vazios até o usuário fornecer URLs reais.
- Use referências externas como pesquisa de estrutura. Não copie marca, depoimentos, promessas sem comprovação ou identidade da oferta de origem.
- Não publique, faça deploy, suba arquivos ou modifique URLs externas.
- Registre cada resultado em `resultados/` e atualize `projeto.json` com a etapa de revisão correspondente.
