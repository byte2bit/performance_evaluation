# Validação e paginação da API — regras aprovadas e implementadas

Proposta apresentada e posteriormente aprovada explicitamente pelo usuário. As regras abaixo foram implementadas em `backend/lib/business-validation.js`, `backend/lib/records.js` e `backend/api/user.js`, preservando rotas e autorização. O diagnóstico inicial permanece como histórico; o resultado está ao final.

## Diagnóstico e objetivo

`backend/lib/records.js` valida somente o nome do profissional antes da gravação. As migrations exigem média, nível, desconto, quatro notas e observações, todos como VARCHAR(255); entradas incompletas/tipos inesperados acabam chegando ao MySQL. `/registros2` usa `parseInt(page)` e `limit` sem padrão nem teto. `api/user.js` valida o e-mail, mas não os demais campos de profissional. Objetivo: rejeitar dados inválidos antes de gravar, preservando endpoints, lista JSON, autorização, sucesso 204 e nomes dos campos.

## Regras aprovadas

| Área | Comportamento proposto |
| --- | --- |
| Corpo | Objeto JSON; rejeitar null, arrays e valores escalares com 400. Campos graváveis permanecem explícitos. Campos de identidade/timestamps continuam ignorados ou derivados da sessão, como hoje. |
| Profissional | `colab` obrigatório, texto não vazio, até 255 caracteres; `demandante` continua sendo e-mail válido normalizado, até 254. Matrícula, PPU, serviço, função, lideranças e gerência opcionais: somente texto de até 255 caracteres ou null quando a coluna aceita. Não converter nomes existentes nem alterar dados legados. |
| Notas | Quatro notas obrigatórias de **1 a 5**, em passos de 0,5. Aceitar número JSON ou string numérica decimal compatível com os clientes atuais; rejeitar booleanos, objetos e arrays. Essa faixa foi aprovada; zero é inválido na API. A submissão da UI continua desativada, e seu componente de estrelas permanece sem alteração neste lote. |
| Média, nível e desconto | Obrigatórios e consistentes com a média aritmética das quatro notas e a classificação já usada por `Form.vue`. Não alterar as faixas nesse lote. Rejeitar discrepâncias com 400, preservando entradas válidas e persistência em strings; não corrigir silenciosamente valores recebidos. |
| Observações | Quatro strings obrigatórias, podendo ser vazias, com até 255 caracteres cada, conforme as colunas existentes. Não truncar conteúdo. |
| Itens de qualidade/disponibilidade | Campos opcionais no formato textual legado, até 255 caracteres; não aceitar objetos/arrays implicitamente nem inventar serialização. Exigir texto não vazio quando a nota correspondente for <=3, conforme validação já existente no formulário. O formato de múltiplos itens para ativar a submissão precisa de etapa própria: a UI mantém arrays e o schema atual usa VARCHAR(255). |
| Lideranças na avaliação | Opcional, texto de até 255 caracteres ou null, conforme coluna nullable. |
| Paginação `/registros2` | Padrões **page=1 e limit=25**; page inteiro positivo; limit inteiro de **1 a 100**. Rejeitar negativos, zero, frações, arrays, objetos, texto parcial e offset fora do intervalo seguro. Preservar resposta em lista JSON e filtros de autorização. |
| IDs de rotas | Inteiro positivo dentro do intervalo da chave INT UNSIGNED, até 4294967295; rejeitar formatos inválidos antes de consultar/gravar. IDs válidos inexistentes mantêm o tratamento já existente; não introduzir alteração adicional de 204/404. |
| Erros | 400 genérico para entrada inválida, sem SQL, stack ou dados privados. Respostas válidas, autorização 401/403 e tratamento de indisponibilidade permanecem. |

## Decisões, alternativas e limites

- Validar antes do banco é preferível a depender de coerção/truncamento MySQL e erros 500. Uma biblioteca nova não é necessária: helpers pequenos e testes Node existentes são suficientes.
- Recalcular e substituir silenciosamente média/nível/desconto seria alternativa, mas mudaria o que o cliente grava sem informar. A proposta prefere rejeitar inconsistências.
- Ampliar colunas ou armazenar itens em JSON exige migration/contrato próprios. Nenhuma migration ou conversão de dados integra este lote.
- O vínculo por nome continua frágil diante de duplicidades/collation. Não criar unicidade, substituir FK por ID ou mudar dados reais implicitamente. Usar apenas fixtures isoladas para investigar; propor etapa posterior quando necessário.
- A submissão de avaliações e o envio de e-mails continuam desativados nos testes/UI; este plano não autoriza sua ativação.

## Execução planejada e concluída

1. Criar helpers fora de `api/` para validação/paginação, preservando a ordem Consign.
2. Integrar em `backend/lib/records.js` e `backend/api/user.js`, sem alterar as rotas.
3. Atualizar fixtures de autorização para enviar avaliações completas válidas; a rejeição de profissional fora do escopo deve ser testada com um payload válido.
4. Cobrir corpo ausente/tipos, limites Unicode, notas fracionárias, inconsistências, campos protegidos e paginação. A conversão para números deve ocorrer somente após verificar formato e limites.
5. Executar suíte atual e testes HTTP com mocks; depois integração opt-in no MySQL isolado, com valores válidos/invalidáveis e nenhuma configuração de produção.
6. Conferir diff e documentar impacto em clientes. Formulário e payloads de sucesso aprovados devem continuar compatíveis; arrays de itens aguardam o desenho de submissão.

Aceitação: entradas inválidas retornam 400 sem gravar ou consultar quando dispensável; casos válidos mantêm 204/listas; identidade não é forjada; paginação fica limitada e determinística; nenhum dado é truncado, nenhum e-mail real é enviado e nenhum banco de produção é usado.

## Resultado e compatibilidade

**108 testes aprovados**, incluindo seis novos de validação/HTTP. Integração real no MySQL isolado confirmou rejeições 400 sem alterar linhas, paginação e Unicode de 255 caracteres em transação revertida. Os 48 casos do navegador e o novo build também passaram. Evidências e dependências atualizadas em [DEPENDENCIAS_SEGURANCA.md](DEPENDENCIAS_SEGURANCA.md).

Os inteiros de query/rota devem usar representação decimal positiva canônica; textos parciais, sinal, expoente e zeros à esquerda não são aceitos. O offset deve ser seguro em JavaScript. A lista mantém data descendente, com ID descendente como desempate. `/registros` continua sem paginação, preservando o contrato da tabela/exportação existentes.

Strings numéricas de notas/média não aceitam expoente nem espaços. As casas decimais significativas são limitadas à precisão necessária para médias em incrementos de 0,125, evitando aceitar discrepâncias escondidas por arredondamento de strings. Números JSON e strings válidos são persistidos em strings; valores de negócio discrepantes não são substituídos silenciosamente.

Exemplo fictício de avaliação válida, após login/CSRF, para `/registros` ou `/registros2`:

```json
{
  "colab": "Profissional fictício A",
  "avaliacao": "5",
  "nivel": "A",
  "desconto": "0%",
  "nota_qualidade": "5",
  "obs_qualidade": "",
  "nota_prazo": "5",
  "obs_prazo": "",
  "nota_dispon": "5",
  "obs_dispon": "",
  "nota_respon": "5",
  "obs_respon": ""
}
```

`demandante`, IDs e timestamps não são campos graváveis da avaliação; identidade vem da sessão. Observações obrigatórias podem estar vazias. Critérios são strings opcionais, mas obrigatórias e não vazias para qualidade/disponibilidade <=3; arrays aguardam desenho de persistência próprio. Clientes com dados incompletos/tipos inválidos precisam se adequar ao retorno 400; não houve mudança de schema nem migração de dados legados.
