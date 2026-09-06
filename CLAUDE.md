# AFERO / HUNTER HUB · INSTRUÇÕES DO PROJETO

Catálogo de agentes, ferramentas de inteligência, live map e entregáveis de IA.

---

## 1. STACK E ESTRUTURA

* **Front-end:** HTML5, CSS vanilla modular (`editorial.css`), JavaScript nativo (`afero-live-map.js`, `editorial-motion.js`).
* **Back-end & Persistência:** Node.js local (`local-server.cjs`, porta 3333) e Supabase (`supabase/`).
* **Design System Canônico:** Gramática Linear + Tipografia editorial. Regras detalhadas em `../docs/specs/design-hunter-hub.md`.

---

## 2. REGRAS ESSENCIAIS DE UI DO HUB

* **Números protagonistas:** `Unbounded` com `font-variant-numeric: tabular-nums` (peso 600/700, tracking -0.03em).
* **Rótulos e Metadados:** Sans geométrica (`Outfit`), 12px, peso 600, caixa alta. `Space Mono` restrita a IDs e dados técnicos de linha.
* **Cards:** Anatomia fixa de 5 partes com alinhamento por `subgrid`. Barra de acento de 2px no topo.
* **Animações:** Nunca disparar animação de entrada sobre o destino de uma rolagem. Usar `AferoMotion.settle()`.

---

## 3. NÚCLEO UNIVERSAL DE REGRAS (Referência: ../CORE-RULES.md)

* **Estilo de Escrita:** Sem travessão (—) como separador de frases. Sem clichês "não é X, é Y". Sem metáforas de jogo ou baralho. Sem verbos inflados de IA.
* **Disciplina de Execução (Karpathy):**
  1. *Pensar antes de fazer:* Dizer as suposições em voz alta. Perguntar em caso de ambiguidade.
  2. *Simplicidade em primeiro lugar:* Entregar o mínimo sólido que resolve o pedido.
  3. *Mudança cirúrgica:* Mexer estritamente no solicitado, sem alterar código ou texto vizinho.
  4. *Critério verificável:* Validar DOM por script antes de conferência visual.
* **Aprovação de Capturas (Screenshots):** Captura de tela consome tokens e é paga. Pedir aprovação prévia ao Victor informando quantidade e motivo antes da primeira captura de cada tarefa.
* **Deploy:** Veto absoluto a deploy automático. Sempre pedir confirmação ao Victor.
