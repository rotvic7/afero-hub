# Prompt mestre · repaginação afero hub

Gerado pelo `.agents/agentepromptengineer.md` · 27.08.2026
Alvo: `hunter-hub/lp-hunter-hub.html` → `hunter-hub/lp-afero-hub.html`
Skills aplicadas: `taste-skill` (anti-slop) · `CLAUDE.md` (vetos de estilo do Victor)

## Design Read (obrigatório antes de qualquer código)

> Redesign-overhaul de landing de venda direta para operadores de tráfego e infoprodutores BR,
> com linguagem de arquivo institucional sóbrio, tendendo a CSS nativo + GSAP já vendorizado.

**Dials:** `DESIGN_VARIANCE: 8` · `MOTION_INTENSITY: 6` · `VISUAL_DENSITY: 4`

Variance 8 porque a marca compõe em grade de tabela assimétrica (gap 2px sobre hairline).
Motion 6 porque o produto é sóbrio: revelação de scroll e feedback, nada cinematográfico.
Density 4 porque a página vende, não opera.

**Modo:** Redesign · Overhaul. A marca mudou, então o visual parte do zero.
Conteúdo, arquitetura de informação, âncoras (`#central #modulos #mecanismo #arsenal #acesso #faq`),
caminhos de imagem e eventos de clique são **preservados**.

---

[INÍCIO DO PROMPT GERADO]

**1. Contexto e Conceito Visual (Brand Concept):**

A marca deixa de ser um caçador e passa a ser um **arquivo**. Hunter Hub gritava predação: laranja
brasa sobre vazio preto, radar, mira, garimpo. afero hub fala baixo e afirma custódia. O nome vem do
latim *afferre*, trazer até. A promessa deixa de ser "eu acho antes de você" e passa a ser
"o que chega aqui já foi conferido".

A atmosfera é a de um **acervo bem cuidado sob luz de dia**: off-white de papel de arquivo, verde de
tinta permanente, o verde palmeira como a cor de quem marcou a página. O produto continua sendo
uma varredura automatizada de ofertas concorrentes, mas o visual precisa comunicar que o valor está
na **curadoria**, não na velocidade da caça. Onde o layout antigo brilhava, o novo registra.

A metáfora estrutural vem do próprio símbolo do brandbook: camadas concêntricas de sinal captado,
convergindo num marcador sólido no núcleo. Ruído entra, registro sai. Toda a página é essa leitura:
seções largas e arejadas de entrada, convergindo para o bloco de decisão.

**2. Instruções de Direção de Arte (Passo a Passo Técnico):**

*Composição e ritmo de página*

- Bookend escuro deliberado, uma vez só na página: hero em `#21342C` e rodapé em `#21342C`,
  todo o miolo em `#F7F6F1` alternando com `#EFEEE6`. Nenhum bloco escuro solto no meio.
  Essa é a composição da capa e do colofão do próprio brandbook, e é o único flip de tema permitido.
- Container `max-width: 1400px`, alinhado ao brandbook, não os 1200px do layout antigo.
- Sete seções, e nenhuma família de layout pode se repetir. Distribuição obrigatória:
  1. **hero** split assimétrico (`grid-template-columns: 1.15fr 0.85fr`), texto à esquerda, símbolo
     de marca em 320px+ à direita com opacidade baixa e o traço-com-ponto ancorando a baseline.
     O hero antigo era centralizado; com variance 8 isso está proibido.
  2. **faixa de prova** logo abaixo do hero, fundo `#EFEEE6`: as quatro especificações técnicas que
     hoje flutuam no rodapé do hero viram uma linha de 4 colunas com dado em Space Mono e rótulo em
     Hanken Grotesk. Sai do hero, vira seção de verdade.
  3. **a central**: carrossel de 3 telas, mantido. É o único carrossel da página.
  4. **os módulos**: bento de 6 células com ritmo real, `grid-template-columns: repeat(6,1fr)`
     e spans variados (2 células ocupando 3 colunas, 4 ocupando 2 ou 3), nunca 6 cards iguais.
     Ao menos 2 células carregam o screenshot como fundo tratado, não como thumbnail dentro do card.
  5. **o mecanismo**: 3 regras em pilha vertical de largura total, separadas por hairline única,
     numeradas em Space Mono grande à esquerda. Sem cards.
  6. **o arsenal**: 6 agentes em faixa de rolagem horizontal com scroll-snap, cada um em retrato
     alto (aspect 3:4). Isso quebra a repetição com o bento dos módulos.
  7. **o acesso**: 3 colunas, coluna central elevada. Mantida.
  8. **faq**: acordeão em lista com divisor único, mantido.
- Espaçamento vertical de seção: `clamp(96px, 12vw, 160px)`. O brandbook usa 100px de padding
  de seção; a landing respira mais que um documento.

*Tipografia*

- Quatro famílias com papéis fixos e sem sobreposição. Unbounded só em wordmark, títulos de seção e
  números grandes. Manrope em todo corpo e subtítulo. Hanken Grotesk 600 em nav, badges e rótulos
  estruturais. Space Mono em dado técnico, ID, contagem e recorrência.
- Headline do hero: Unbounded 700, `clamp(38px, 4.4vw, 66px)`, `letter-spacing: -0.025em`,
  `line-height: 1.05`. Máximo 2 linhas no desktop.
- Subtexto do hero: Manrope 400, máximo 20 palavras e 3 linhas, `max-width: 56ch`.
- O lockup obedece o brandbook sem exceção: `afero` em peso 800, `hub` em peso 500 na cor de acento
  do contexto. Nunca capitalizar, nunca inverter os pesos, nunca separar as palavras.
- Minúsculas obrigatórias em lockup, nav, badges, eyebrows e rótulos técnicos.
  Headlines de venda e corpo mantêm capitalização normal de frase.

*Densidade e forma*

- Raio de canto em três degraus documentados e sem desvio: `4px` em superfície de documento,
  `6px` em card de aplicação, `999px` em pílula. O `--radius: 20px` do layout antigo sai inteiro.
- Grade de tabela: gap de 2px sobre fundo `rgba(33,52,44,0.14)` produz o divisor de 1px sem borda
  em cada célula. É o gesto de grade do brandbook e substitui os cards com borda.
- Sombra apenas onde a elevação carrega hierarquia real, e sempre tingida de verde:
  `0 24px 60px rgba(33,52,44,0.10)`. Nada de sombra preta sobre off-white.

*Movimento (MOTION_INTENSITY 6, cada um justificável em uma frase)*

- Entrada do hero em stagger: estabelece a ordem de leitura.
- Revelação por scroll nas células do bento e nos cards de acesso: hierarquia de chegada.
- `:active` com `translateY(1px)` em todo botão: retorno tátil.
- Traço-com-ponto que cresce da esquerda quando o título da seção entra: assinatura da marca em
  movimento, e o único ornamento animado da página.
- Tudo com `clearProps: 'transform'` e tudo desligado sob `prefers-reduced-motion: reduce`.
- Marca-d'água de fundo com letter-spacing animado: cortada. Era decoração sem função.

**3. Paleta de Cores e Tratamento de Luz (Hex Codes & Lighting):**

```css
:root{
  --bg-0:#F7F6F1;            /* off-white, fundo base            */
  --bg-1:#EFEEE6;            /* off-white 2, seção alternada     */
  --ink:#21342C;             /* verde-tinta, texto e bookend     */
  --palmeira:#8A9C7B;        /* acento sobre escuro              */
  --alcaparra:#56603F;       /* texto secundário e rótulos       */
  --mamao:#2F654D;           /* acento de apoio, estado positivo */
  --floresta:#24696A;        /* acento sobre claro, links, dado  */
  --hairline:rgba(33,52,44,.14);
  --hairline-d:rgba(247,246,241,.16);
  --shadow:0 24px 60px rgba(33,52,44,.10);
}
```

- **Um acento por contexto, travado na página inteira.** `#24696A` é o acento sobre fundo claro,
  `#8A9C7B` é o acento sobre fundo escuro. Nenhuma seção inventa uma terceira cor de destaque.
- Luz: a página é iluminada por difusão, não por brilho. Nenhum `box-shadow` com cor de acento,
  nenhum halo, nenhum `filter: blur()` de fundo. A profundidade vem de hairline e de contraste
  de fundo entre `#F7F6F1` e `#EFEEE6`.
- Única textura aprovada, exclusiva dos dois blocos escuros:
  `radial-gradient(rgba(247,246,241,.025) 1px, transparent 1px)` com `background-size: 3px 3px`.
- Screenshots dentro de moldura: fundo da moldura em `#21342C`, borda `1px` em `--hairline`,
  raio 6px. As capturas atuais são do tema laranja e serão trocadas depois; a moldura precisa
  funcionar com ambas.

**4. O que Evitar (Strict Quality Control):**

*Vetos herdados do brandbook*

- Laranja, vermelho, neon e azul elétrico em qualquer aplicação. Todo token `--ember`, `--flare`,
  `--amber`, `--clay`, `--rubi`, `--glow` sai do arquivo, inclusive do favicon e da `meta theme-color`.
- Distorcer o lockup, tirar o lockup da paleta, aplicar o lockup sobre fundo ruidoso, ou usar
  `hub` como palavra independente.

*Vetos do CLAUDE.md (regra do Victor, acima de qualquer estética)*

- Travessão como separador de frase: zero ocorrências, incluindo o travessão longo e o médio.
  Em rótulo curto o separador é o meio-ponto `·`. O brandbook usa travessão nos próprios eyebrows;
  a LP não copia isso.
- Clichê de contraste "não é X, é Y" e variações: zero ocorrências.
- Aberturas em grupos de três forçadas, "elevar", "desbloquear", "mergulhar", "é importante notar",
  e fechos genéricos tipo "e é isso que faz toda a diferença".

*Vetos da taste-skill, cada um com o defeito correspondente já medido na LP atual*

- **Eyebrows numerados com colchetes.** A LP tem 7 (`[ 01 · A Central ]` até `[ 06 · Perguntas
  frequentes ]` mais o kicker do hero). Teto para 7 seções é 3. Cortar para no máximo 3, sem número,
  sem colchete, sem barra dupla. Onde o eyebrow sai, a headline sozinha carrega a seção.
- **Faixa de decoração no rodapé do hero.** `hero-specs` com 4 rótulos em caixa alta é o padrão
  exato que a skill proíbe. Vira seção própria abaixo do hero.
- **Hero com mais de 4 elementos de texto.** Hoje são 5. Limite: eyebrow, headline, subtexto, CTAs.
- **Grade de 3 colunas de cards iguais e repetição de família de layout.** Módulos e arsenal hoje
  são a mesma grade de 6 cards iguais. Precisam de famílias diferentes (bento com spans variados
  contra faixa horizontal com scroll-snap).
- **Rótulos de CTA duplicados para a mesma intenção.** Hoje há três: "Ativar meu Caçador agora",
  "Liberar acesso", "Liberar meu acesso vitalício". Escolher **um** rótulo de compra e repetir
  literalmente nos três pontos. O CTA do cabeçalho continua sendo âncora para `#acesso`.
- **Selo de versão em moldura de screenshot.** `hunter hub · core v2.4` vira `afero hub · acervo`.
- **Marca-d'água de fundo, cursor custom, glow externo, dot decorativo sem estado semântico,
  listener de scroll cru para animação, e `100vh` em vez de `100dvh`.**

*Desvios conscientes da taste-skill, com justificativa registrada*

- A skill pede React, Tailwind, Motion e biblioteca de ícones. Este projeto é HTML estático servido
  sob CSP `script-src 'self'`, sem build e sem npm. Mantemos CSS nativo com variáveis e o GSAP que
  já está em `vendor/`. SVG inline é a única via para ícone aqui, e o símbolo da marca é fornecido
  pelo brandbook, o que a própria skill autoriza.
- A skill exige tema duplo. O Victor travou tema único do brandbook. O toggle e o `localStorage`
  `hunter_theme` saem da página.
- O bookend escuro hero + rodapé é o device de "color block story" que a skill permite uma vez,
  e é a composição do próprio brandbook.

[FIM DO PROMPT GERADO]

---

## 5. Execução com sub-agentes

Três ondas. Nenhum agente escreve no arquivo final; cada um entrega um fragmento no scratchpad
e a montagem é centralizada, para não haver duas escritas concorrentes no mesmo HTML.

| Onda | Agente | Modelo | Entrega |
|---|---|---|---|
| 1 | `copy-afero` | haiku | `copy-afero.md`: toda string visível nova no léxico híbrido |
| 1 | `spec-afero` | sonnet | `spec-afero.md`: tokens CSS completos, mapa de layout, inventário de classes |
| 2 | `build-topo` | sonnet | `part-a.html`: head, header, hero, faixa de prova, central, módulos |
| 2 | `build-base` | sonnet | `part-b.html`: mecanismo, arsenal, acesso, faq, footer, scripts |
| 3 | orquestrador | opus | montagem, varredura de resíduos, Playwright, screenshot |

**Léxico híbrido, decidido pelo Victor:** headlines, títulos de seção, eyebrows e CTAs migram para
acervo, sinal, registro, curadoria, recorrência, varredura, rodada, workspace. Bullets, FAQ e textos
de módulo ficam como estão, com substituição pontual do nome do produto.

**Critério de sucesso (verificável, não "a sintaxe está válida"):**

1. Zero travessões longos ou médios no arquivo.
2. Contagem de eyebrows ≤ 3.
3. Nenhuma ocorrência de `hunter`, `ember`, `flare`, `rubi`, `glow`, `#e0703c` fora de comentário.
4. Um único rótulo de CTA de compra, repetido literalmente.
5. Playwright abre a página em 1440x900 e 390x844, sem erro de console, sem scroll horizontal,
   com screenshot conferido dos dois.
