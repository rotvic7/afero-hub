# Afero Hub: landing page e painel

O projeto mantém os arquivos de edição na raiz e gera uma pasta pública completa para a Vercel. A landing page principal é `lp-afero-hub-vendas.html`; o painel continua sendo editado em `index.html`.

## Gerar a pasta para publicação

Dentro de `hunter-hub`, execute:

```powershell
node scripts/build-public.mjs
```

O comando reúne as páginas, estilos, scripts, bibliotecas, fontes locais, logo e todas as imagens de produto em `public-site-index/`. Ele confere as referências locais de HTML e CSS e interrompe o build se faltar algum arquivo. Uma nova execução atualiza a pasta e remove arquivos antigos do pacote gerado.

```text
hunter-hub/
├── lp-afero-hub-vendas.html       LP de origem
├── index.html                   Hub de origem
├── assets/                      Estilos, scripts e fontes da LP
├── prints/                      Fotos e capturas de produto
├── vendor/                      Bibliotecas do Hub
├── scripts/build-public.mjs     Empacotador e validação de dependências
├── vercel.json                  Configuração de publicação
└── public-site-index/           Pasta gerada para a Vercel
    ├── index.html               LP no endereço principal
    ├── hub.html                 Hub, acessível em /hub
    ├── lp-afero-hub-vendas.html  Endereço original da LP preservado
    ├── privacidade.html
    ├── guia-funil-afero-hub.html
    ├── assets/
    │   ├── afero-vendas.css
    │   ├── afero-vendas.js
    │   ├── fonts/               Satoshi e Manrope
    │   ├── images/afero-logo.png
    │   └── vendor/gsap.min.js
    ├── prints/                 Todas as imagens fornecidas no projeto
    ├── vendor/                 Three, GSAP, ScrollTrigger e Supabase
    └── …                       CSS e scripts usados pelo Hub
```

A pasta gerada não deve ser editada manualmente. Atualize os arquivos de origem e rode o build novamente. O Manrope da LP e o logo são copiados dos arquivos existentes para caminhos próprios de assets. A lista de publicação está em `scripts/build-public.mjs`; ao adicionar uma imagem, fonte ou página, inclua seu caminho nessa lista. Os arquivos internos, backups, testes, documentos e segredos ficam fora do pacote.

## Configuração no Vercel App

| Campo | Valor |
| --- | --- |
| Root Directory | `.` (raiz deste repositório `hunter-hub`) |
| Framework Preset | Other |
| Build Command | `node scripts/build-public.mjs` |
| Output Directory | `public-site-index` |

Conecte a pasta do projeto que contém `vercel.json` e `scripts/`, para que cada atualização gere o pacote completo. Caso conecte um repositório maior contendo este projeto, use `hunter-hub` como Root Directory. O `vercel.json` define o comando, a saída, as rotas e os headers. A Vercel serve o conteúdo de `outputDirectory`, conforme a [documentação de builds](https://vercel.com/docs/builds/configure-a-build) e de [configuração](https://vercel.com/docs/project-configuration/vercel-json).

O pacote gerado está no `.gitignore`. Para atualizar pelo Git conectado à Vercel, versione os arquivos de origem, assets, imagens, empacotador e configuração; o build recria `public-site-index` a cada publicação. Commit e push podem disparar o deploy automático do projeto conectado, portanto também dependem da aprovação para publicar.

| Endereço publicado | Página |
| --- | --- |
| `/` e `/index.html` | Landing page de vendas |
| `/hub` e `/hub.html` | Painel do Hub |
| `/vendas` e `/lp-afero-hub-vendas.html` | A mesma landing page |
| `/privacidade.html` | Política de privacidade |
| `/guia-funil-afero-hub.html` | Guia do funil |

Os rodapés conectam a LP e o Hub. O empacotador ajusta os links para as rotas publicadas, mantendo os arquivos de origem utilizáveis no servidor local.

## Validação

```powershell
node --test tests/public-deploy.test.cjs tests/backend-security-static.test.mjs
```

O teste abre o pacote gerado no Chromium, aplica os headers de produção e verifica navegação, fontes locais, scripts, menu mobile, FAQ e seleção de nichos. Usa a instalação de Playwright já existente em `../kit-ia-builder/node_modules/playwright`. Não captura screenshots nem faz deploy.

## Pendências para a publicação comercial

- A LP contém dois espaços reservados para vídeos, sem arquivos de vídeo vinculados.
- O CTA final de compra ainda aponta para `#acesso`; falta definir o checkout.
- Google Fonts e Fontshare continuam sendo provedores externos das fontes solicitadas nas páginas. Satoshi e Manrope usados localmente pela LP estão no pacote.
- No painel remoto do Supabase, configure o Site URL como `https://afero-hub.vercel.app/hub` e autorize também `/hub.html` nos Redirect URLs. Substitua o domínio se usar outro. O arquivo `supabase/config.toml` registra os novos caminhos, mas não modifica o serviço remoto.
- As ações que criam pastas e aprovam projetos em `/api/projects` dependem de `local-server.cjs` e continuam disponíveis no ambiente local. O pacote da Vercel é estático; Auth e dados em nuvem usam o Supabase já configurado. Detalhes em `backend/README.md`.

A geração do pacote não publica o site. O deploy exige confirmação de Victor conforme `AGENTS.md`.
