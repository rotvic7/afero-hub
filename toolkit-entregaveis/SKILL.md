---
name: toolkit-entregaveis
description: Use when um produto digital precisa de um entregável novo, área de membros, aplicativo de curso, PDF, página, protocolo, revisão de entrega existente ou decisão entre experiência local e autenticada.
---

# Toolkit de Entregáveis

Transformar conteúdo pronto em uma experiência coerente com o uso, os dados e a capacidade de manutenção do produto.

## Entradas obrigatórias

Localizar `modelo-de-produto.md` e `conteudo-do-produto.md` no projeto do produto. Se algum estiver ausente, copiar o respectivo modelo de `assets/` e solicitar o preenchimento. Interromper a construção enquanto houver campo essencial vazio ou conteúdo obrigatório marcado como hipótese.

Tratar os arquivos separadamente:

- `modelo-de-produto.md`: requisitos comerciais, operacionais e técnicos.
- `conteudo-do-produto.md`: material que o comprador receberá.

Aceitar conteúdo manual ou produzido por qualquer agente. Evitar dependência de caminhos, nomes ou formatos de outro sistema.

## Fluxo obrigatório

1. **Diagnosticar:** ler as duas entradas, listar ausências e confirmar o critério de sucesso.
2. **Decidir:** ler [critérios de formato](references/criterios-de-formato.md), recomendar um formato e explicar capacidades incluídas e excluídas.
3. **Planejar:** definir jornada, unidades de conteúdo, estados, persistência, acessibilidade e testes. Pedir aprovação antes de mudar arquitetura ou escopo.
4. **Construir:** implementar somente as capacidades aprovadas. Preservar a stack existente quando ela atende ao formato escolhido.
5. **Validar:** ler [controle de qualidade](references/controle-de-qualidade.md), executar o fluxo real e registrar evidências.

Consultar a [biblioteca de comandos](references/biblioteca-de-comandos.md) quando o pedido for diagnóstico, criação, revisão, evolução autenticada, validação ou preparação de publicação.

## Contrato de saída

Entregar nesta ordem:

1. diagnóstico resumido;
2. formato recomendado e justificativa;
3. escopo aprovado;
4. artefatos criados ou alterados;
5. verificações executadas e limitações restantes.

Solicitar autorização antes de publicar ou fazer deploy.

## Erros comuns

| Situação | Resposta |
|---|---|
| Conteúdo incompleto | Listar unidades ausentes e interromper a construção. |
| Login solicitado sem requisito de identidade | Explicar o custo de operação e recomendar o formato suficiente. |
| Dados sensíveis em armazenamento local | Interromper e recomendar arquitetura autenticada com proteção adequada. |
| Progresso sem frequência de uso | Pedir evidência de benefício antes de adicioná-lo. |
| Botão sem função definida | Remover o controle ou implementar o fluxo completo. |
