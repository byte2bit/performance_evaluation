# Registros: período, histórico e limite mensal

Implementação local aprovada em 29/10/2026. O usuário confirmou que conta o **mês da gravação**, por profissional, independentemente do avaliador. Testes restritos ao ambiente local fictício; domínio definitivo e produção permanecem fora do escopo.

## Interface e dados

- A pesquisa permite datas inicial/final inclusivas, limites abertos e combinação com o texto da busca. Datas inválidas ou intervalo invertido exibem erro. Limpar filtros restaura a lista carregada. Os timestamps originais são preservados; apresentação e ordenação não sobrescrevem os dados recebidos.
- O filtro usa a parte de data retornada pela API, a mesma apresentada na tabela, sem converter para o fuso do navegador. O horário do resumo inclui UTC quando a resposta contém o sufixo `Z`.
- Clicar no nome abre um modal com o histórico **completo autorizado**, independentemente dos filtros da tabela. A consulta `GET /registros` é atualizada antes de apresentar detalhes. Falha de atualização não exibe o histórico anterior; transferência de escopo é respeitada pela nova resposta da API. Não há novo endpoint nem autorização baseada no nome/autor.
- O agrupamento usa exclusivamente `colab_id`. Homônimos não compartilham histórico. Registros administrativos sem vínculo por ID continuam na tabela, identificados; não são agrupados por aproximação textual.
- Cada avaliação apresenta ID, nome registrado, avaliador original, data de gravação/atualização, quatro notas e respectivos comentários, média geral, nível, desconto, liderança e critérios textuais que já estiverem armazenados. Campos ausentes ficam identificados; nenhum dado histórico é inventado. O conteúdo usa interpolação de texto, sem `v-html`.
- O gráfico SVG tem séries para quatro notas e média geral, escala fixa de 1 a 5, meses/anos, legenda selecionável e tabela acessível com valores mensais. Lacunas mensais não viram nota zero nem linhas de continuidade. Meses com múltiplas avaliações legadas exibem a média aritmética de cada campo numérico válido, com aviso, quantidade e detalhamento integral preservado.
- O modal reutiliza `useFlowbiteModal`, incluindo Escape, foco contido, devolução de foco e limpeza de instâncias/listeners. Layout e cores seguem os temas existentes. Nenhuma dependência foi instalada.
- A exportação XLS continua com seu contrato anterior: todo o histórico autorizado, sem aplicar os filtros da tabela. A persistência dos arrays de critérios e a submissão pela interface continuam pendentes de etapa própria.

## Gravação mensal na API

Ambos os POSTs, `/registros` e `/registros2`, compartilham `createRecords`:

1. Validam o corpo, a sessão e o escopo como antes, sem revelar duplicidade de um profissional fora do escopo.
2. A transação mantém a proteção da conta/gerência e adquire bloqueio exclusivo (`FOR UPDATE`) do profissional por ID. Gravações concorrentes para esse mesmo ID precisam aguardar.
3. A transação usa `READ COMMITTED` explicitamente. Assim, a consulta mensal feita depois de aguardar o bloqueio enxerga a gravação que acabou de ser confirmada, sem reutilizar um snapshot anterior de `REPEATABLE READ`.
4. Após o bloqueio, captura `CURRENT_TIMESTAMP` do MySQL em formato textual. Usa o calendário da sessão do banco, coerente com seus timestamps e padrões existentes, sem depender do relógio/fuso do navegador. Consulta o mesmo `colab_id` no intervalo `>= primeiro dia do mês` e `< primeiro dia do mês seguinte`.
5. Se houver registro, retorna **409**, texto `Este profissional já possui uma avaliação neste mês.`, sem inserir. Isso vale para administradores, autores diferentes e transferência de demandante. Avaliações antigas não são apagadas nem conciliadas automaticamente.
6. Caso contrário, persiste como `created_at` o instante capturado pelo servidor. O cliente continua sem poder escolher a data; a captura única evita que a checagem e a inserção usem meses distintos na virada. Sucesso permanece **204**.

Sem migration, índice ou coluna nova. A proteção vale para as gravações feitas por esses handlers; não é uma restrição UNIQUE no banco e não impede SQL direto ou ferramentas que a contornem. A consulta filtra por `colab_id`, que já possui índice. Excluir uma avaliação mantém o comportamento administrativo existente: se não restar outra avaliação vinculada àquele profissional no mês, uma nova gravação poderá ocupar esse mês. Registros sem vínculo não são associados por nome para aplicar a regra.

## Validação e limites

Suíte padrão executada: `node --test backend/test/*.test.js frontend/test/*.test.js`, **204 testes aprovados**, zero falhas/skips. Inclui 14 casos novos de filtros/datas, homônimos, autorização atualizada, respostas fora de ordem, gráfico/legados, renderização real Vue/Flowbite em DOM de memória, escape/foco/limpeza, bloqueio mensal entre rotas/perfis, mudança de responsável, limites de mês/ano, SQL parametrizado e corrida simultânea com bloqueios simulados.

Build Vite development executado com saída ignorada em `frontend/node_modules/.cache/records-history-build`, preservando `dist`. `git diff --check` executado. Não houve instalação de pacotes, migration, gravação de avaliações no MySQL, envio SMTP ou publicação.

API local recarregada com o launcher do mesmo perfil fictício e mantida em segundo plano. Log sanitizado confirmou `serving: true`; frontend `/registros` respondeu 200 e API `/session` sem sessão respondeu 401. O frontend também serviu o módulo atualizado com 200. MySQL isolado já estava ativo e foi preservado. Essas respostas não constituem teste visual nem teste de gravação SQL.

Na implementação inicial, concorrência InnoDB e revisão visual ainda não tinham sido executadas. A continuação concluiu o Chrome com **148 grupos aprovados, 18 capturas e zero erros JS**, incluindo inspeção visual e correção de foco/rolagem móvel. Ferramenta de teste isolada preparada offline, sem alterar dependências do projeto. Suíte atual: **210 testes aprovados**, build e parser aprovados. [Resultados e plano de SQL real](VALIDACAO_REGISTROS_LOCAL.md).

Após aprovação específica da cópia `evaluation_isolated_0f8785e64029_v2_restore_20261029a001`, a concorrência real InnoDB passou: backup/restauração de 9 tabelas/52 registros, duas esperas observadas, um 204/um 409 e uma única inserção. Duplicidade entre perfis/rotas, homônimos, transferência/autoria, timestamp do cliente e limites SQL conferidos. Contas/dados da origem preservados, sem migrations; API principal retomada. [Procedimento e relatórios sanitizados](VALIDACAO_REGISTROS_LOCAL.md). Não repetir com o mesmo ID, alterar a cópia preservada nem escolher novos alvos sem aprovação própria. Os 210 testes/build/Chrome são da etapa anterior e não foram repetidos nesta execução sem alteração de código.
