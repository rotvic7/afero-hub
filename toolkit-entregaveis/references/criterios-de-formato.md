# Critérios de formato

Avaliar os requisitos na ordem abaixo. Registrar a evidência usada em cada decisão.

## 1. Identidade e dados

Escolher `aplicacao-autenticada` quando existir pelo menos uma destas condições:

- acesso individual controlado por assinatura ou licença;
- dados pessoais ou sensíveis persistidos;
- progresso que precisa acompanhar o usuário em vários dispositivos;
- conteúdo liberado por permissão, turma ou pagamento;
- suporte individual associado à conta.

Capacidades incluídas: autenticação, autorização, banco de dados, recuperação de acesso, estados de sessão e política de dados.

## 2. Uso recorrente sem identidade

Escolher `aplicacao-local` quando o conteúdo exigir interação repetida, checklist, progresso ou filtros, mas puder permanecer no dispositivo e não contiver dados sensíveis.

Capacidades incluídas: HTML, CSS, JavaScript, persistência local opcional, estados vazios e recuperação de dados corrompidos.

## 3. Conteúdo navegável

Escolher `pagina-estatica` quando o comprador precisar consultar seções, recursos e links, sem progresso individual ou dados persistidos.

Capacidades incluídas: navegação semântica, busca local quando o volume justificar, responsividade e impressão.

## 4. Consumo linear ou offline

Escolher `documento` quando o conteúdo for linear, estável, usado poucas vezes ou precisar ser baixado, impresso e compartilhado.

Capacidades incluídas: índice, hierarquia editorial, instruções acionáveis e exportação para o formato final solicitado.

## Desempate

Usar frequência, sensibilidade dos dados e manutenção como critérios principais. Usar ticket e recorrência comercial como sinais de viabilidade operacional. Registrar capacidades excluídas para impedir crescimento silencioso do escopo.

## Saída da decisão

```text
Formato:
Evidências:
Capacidades incluídas:
Capacidades excluídas:
Riscos:
Critério de aceite:
```
