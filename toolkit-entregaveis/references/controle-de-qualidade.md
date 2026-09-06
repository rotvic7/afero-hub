# Controle de qualidade

Executar somente os blocos aplicáveis ao formato escolhido. Registrar comando, resultado e evidência visual quando houver interface.

## Conteúdo

- Todas as unidades obrigatórias possuem objetivo, ação e resultado esperado.
- Hipóteses e campos pendentes permanecem identificados.
- Exemplos, números e referências possuem origem verificável.
- A linguagem corresponde ao público definido no modelo.
- Nenhuma referência pertence a outro produto ou marca.

## Interface

- Fluxo principal funciona por toque, mouse e teclado.
- Mobile funciona a partir de 320 px sem overflow horizontal.
- Foco é visível e controles possuem nome acessível.
- Estados vazio, carregando, sucesso e erro orientam a próxima ação.
- Redução de movimento preserva toda a funcionalidade.
- Console abre sem erros.

## Dados e persistência

- Dados inválidos não substituem estado válido.
- Falha de armazenamento mantém a sessão utilizável.
- A limpeza remove somente as chaves pertencentes ao entregável.
- Dados sensíveis não entram em armazenamento local ou logs.
- Autenticação e autorização são testadas separadamente quando existirem.

## Escopo

- Cada capacidade possui requisito correspondente no modelo.
- Controles visíveis possuem comportamento completo.
- Dependências externas possuem motivo e estratégia de falha.
- A manutenção cabe ao responsável definido no modelo.

## Entrega

- Executar testes automatizados relevantes.
- Abrir a interface em navegador real e exercitar o fluxo completo.
- Salvar screenshots de desktop e mobile quando houver interface.
- Informar limitações restantes.
- Solicitar autorização antes de publicar ou fazer deploy.
