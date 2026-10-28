# Vínculo por ID e histórico do demandante atual

**Evolução do modelo em 27/10/2026:** usuário confirmou atribuição por gerência: um responsável por gerência, várias gerências por demandante, uma gerência por profissional. Após cópia e mapa explícito, a **origem isolada recebeu a migration 13** e a Gerência de Testes foi atribuída ao avaliador atual, incluindo ambos os profissionais. Oito avaliações e autoria preservadas. [Novo modelo, testes e ativação](PLANO_GESTAO_GERENCIAS.md#ativação-autorizada-na-origem). O restante deste documento registra o modelo/transições anteriores.

Modelo aprovado e implementado localmente em **26/10/2026**, inicialmente com autorização apenas para escrever a migration. Depois, o usuário solicitou **aplicar a pendência**, autorizando backup/cópia, aplicação e validação no perfil MySQL isolado documentado. A **12ª migration está aplicada nesse alvo**, com dados fictícios; nenhum outro ambiente ou SMTP real foi usado. A decisão inicial de manter acesso com o autor foi substituída explicitamente pela regra abaixo.

**Estado atual em 27/10/2026:** após inventário, revisão e confirmação específica, os oito vínculos R01–R08 → P01 foram aplicados nesse perfil fictício com backup atual e testes na cópia antes da origem. Oito avaliações vinculadas, nenhuma sem vínculo/órfã; demais campos/contas/profissionais preservados. **152 testes aprovados** e leitura real confirmada para avaliador atual/administrador. Relatos abaixo sobre vínculos nulos registram estados anteriores, não a situação atual. [Aplicação, evidências e limites](REVISAO_CONCILIACAO.md#aplicação-confirmada-e-executada).

## Regra de acesso

| Perfil | Histórico do profissional |
| --- | --- |
| Demandante atual | Consulta todas as avaliações vinculadas, inclusive de autores anteriores e administradores. |
| Demandante anterior | Perde acesso nas requisições seguintes, salvo se for administrador. |
| Administrador | Consulta todas, inclusive registros legados ainda não conciliados. |
| Autor original | Permanece identificado, sem permissão especial decorrente da autoria. |

`registros.demandante` continua sendo o e-mail do autor no momento da gravação; não é reescrito em transferências. `colab.demandante` identifica o responsável atual. O vínculo estável proposto é `registros.colab_id → colab.id`. A atribuição atual continua usando correspondência binária com o e-mail canônico da sessão; dados legados de atribuição com caixa/espaços divergentes precisam de revisão, sem ampliar permissões por normalização silenciosa.

Não há novo endpoint/tela de edição do demandante neste lote. A autorização lê o cadastro atual a cada requisição; os testes simulam sua alteração somente na fixture. Um fluxo administrativo de transferência pode ser especificado separadamente. Não se deve excluir e recadastrar o profissional para transferi-lo: isso troca a identidade e pode ser impedido pelas FKs.

## Diagnóstico reproduzido

A investigação anterior executou 15 verificações em memória com handlers/componentes reais: homônimos selecionados simultaneamente pelo nome, gravação sem identidade individual, e-mails legados invisíveis, cadastro sem conta provisionada e manutenção do acesso pelo autor após trocar a atribuição. Os controles de escopo continuaram rejeitando profissionais exclusivos de outra conta. Isso não comprova presença desses dados em produção.

As migrations existentes usam FK textual `registros.colab → colab.colab`, índice não único e matrícula opcional sem unicidade. Não é possível deduzir um vínculo histórico confiável apenas de nome, matrícula ou e-mail do autor. Um administrador também pode ter escrito a avaliação de profissional atribuído a outra conta.

## Implementação e compatibilidade

- `backend/lib/records.js`: as duas listas e a consulta individual usam subconsulta por IDs de profissionais atualmente autorizados, antes de paginação. Não há join por nome, filtro de leitura por autor ou fallback para autor/nome. Administradores mantêm a consulta integral.
- Registros com `colab_id` nulo ou sem profissional correspondente ficam invisíveis a avaliadores, retornando 404 na consulta individual. Permanecem acessíveis aos administradores, sem alteração dos dados.
- Respostas de avaliação passam a incluir `colab_id`; nomes dos campos anteriores são mantidos. `/colab` e `/colab/:id` incluem também a matrícula já existente no schema.
- A autoria de novas avaliações continua derivada da sessão. O ID selecionado e o nome real do profissional são persistidos em transação, com lock compartilhado na consulta de autorização.
- Vue/Pinia passam a selecionar por IDs. Nomes continuam sendo apresentados no resumo; homônimos têm matrícula ou identificador do cadastro para distinção. Uma atualização bem-sucedida da lista retira seleções que saíram do escopo; falhas preservam o estado anterior.
- `Registros.vue` e `Excel.vue` usam a lista autorizada pela API, sem refiltrar pelo autor. Na tabela, o rótulo do campo legado passa a ser **Avaliador original**.

### Contrato de gravação

Os caminhos `POST /registros` e `POST /registros2` mantêm notas, validações, autorização e sucesso 204. A submissão Vue continua desativada; não foi criado envio em lote.

| Entrada | Resultado |
| --- | --- |
| `colab_id` opcional válido, com `colab` correspondente | Seleciona por ID dentro do escopo; grava o vínculo e a autoria da sessão. |
| ID fornecido inválido, nulo, fora de INT UNSIGNED ou em formato não canônico | 400, sem gravação. |
| ID fornecido inexistente ou fora do escopo | 403, sem procurar alternativa pelo nome. |
| ID autorizado com nome divergente/desatualizado | 409, sem gravação. |
| Somente nome, com exatamente um profissional correspondente no escopo | Compatibilidade legada: grava com o ID encontrado e nome do cadastro. |
| Somente nome, sem correspondente autorizado | 403. |
| Somente nome, com mais de um correspondente no escopo | 409, sem escolher o primeiro. Administradores verificam todos os profissionais. |

`colab` permanece obrigatório. `id` da avaliação, autoria, privilégios e timestamps continuam protegidos; `colab_id` é um seletor validado, não uma identidade aceita sem autorização. Mensagens não revelam nomes, IDs alternativos ou dados de outra conta.

## Migration e aplicação isolada

Arquivo: `backend/migrations/20261026000100_link_registros_to_colab_id.js`.

Acrescenta somente `colab_id INT UNSIGNED NULL`, índice `registros_colab_id_index` e FK `registros_colab_id_foreign` para `colab.id`, com UPDATE/DELETE RESTRICT. Não altera migrations antigas, não remove a FK textual existente, não copia dados e não normaliza nomes/e-mails. A nulabilidade permite preservar avaliações ainda não conciliadas.

O `down` recusa remoção automática, pois os vínculos podem ter sido revisados manualmente. A FK textual anterior continua podendo restringir exclusões/renomeações por nome, inclusive com homônimos; sua eventual retirada exige etapa própria. Este lote não resolve essa limitação nem garante unicidade de matrícula.

**O código requer a nova coluna, já validada no perfil isolado** `evaluation_isolated_0f8785e64029_v2`, na porta 50070. Em qualquer outro schema ainda com 11 migrations, consultas/gravações podem falhar de forma genérica; não há fallback que restaure acesso por autoria. Não aplicar migrations em outro alvo com base nesta autorização. O runner genérico `Validate` também altera fixtures; não é consulta somente leitura.

## Conciliação dos registros legados

1. Com autorização para um alvo isolado, inventariar schema/collation, registros sem vínculo, profissionais homônimos, matrículas duplicadas/ausentes e demandantes não canônicos/sem conta. Usar relatórios sanitizados, sem dados pessoais na conversa/Git.
2. Produzir candidatos de associação para revisão; um nome atualmente único não prova identidade histórica. Não usar o e-mail do autor como se fosse o demandante atual e não criar unicidade artificial no nome.
3. Revisar cada correspondência com evidência confiável; manter uma trilha protegida das decisões e dos valores anteriores. Ambiguidades permanecem nulas e administrativas.
4. Só depois de aprovação específica, aplicar vínculos revisados em lotes limitados/transações, com pré-condições, contagens e verificação de identidade do alvo. Não atualizar `registros.demandante`, notas ou timestamps de negócio nessa operação.

Não foi escrito/executado script de backfill, não houve associação automática nem exclusão de avaliações.

## Plano de validação SQL e limites

O plano abaixo foi executado após autorização específica, somente no perfil isolado. Novos alvos exigem autorização própria. Antes de aplicar, fazer backup/restauração verificados conforme [BACKUP_RESTAURACAO.md](BACKUP_RESTAURACAO.md), preservar o estado de 11 migrations e preferir schema/cópia de teste novos. A recuperação no mesmo host não comprova recuperação em outra máquina.

Conferir identidade de servidor/schema, privilégios, ausência de escritores concorrentes e janela de DDL. Alterações DDL MySQL não devem ser tratadas como reversíveis por uma transação de aplicação. Medir tempo/locks no alvo fictício; não extrapolar para produção.

Foram validados em SQL real: nulabilidade/tipos/índice/FK, preservação das linhas/autores, restrição de exclusão, compatibilidade do driver, nomes/collations, transferências com sessões existentes, filtros antes da paginação e concorrência entre transferência/gravação. A espera por lock foi observada em `performance_schema.data_lock_waits`; após o commit da transferência, a gravação concorrente do demandante anterior retornou 403. Isso cobre esse cenário no alvo fictício, sem certificar outros níveis de isolamento, volume ou produção.

Em falha, manter coluna e associações revisadas, bloquear uso afetado e analisar recuperação sobre cópia nova. Não apagar vínculos por rollback nem restaurar automaticamente o filtro antigo por autor, que contrariaria a política aprovada. Uma reversão operacional precisa preservar a nova regra de confidencialidade.

## Etapa inicial — implementação local

- **123 testes aprovados**, zero falhas/skips: `node --test backend/test/*.test.js frontend/test/*.test.js`.
- Dez novos testes: oito backend e dois frontend. Cobrem transferência com sessões existentes, autores anteriores/administradores, acesso negado ao antigo demandante, homônimos, vínculos nulos/inexistentes, IDs inválidos/fora de escopo, conflito nome/ID, compatibilidade por nome e seleção/resumo por ID.
- SQL da subconsulta e DDL compilados com Knex/MySQL sem adquirir conexão. A migration não foi aplicada.
- Build Vite em modo development aprovado em diretório temporário novo, preservando `frontend/dist`. Links locais e diff conferidos.
- Sem MySQL, SMTP, instalação de dependências, audit novo, revisão Chrome, commit/push ou deploy neste lote. A edição prévia do título de `AGENTS.md` é do usuário e foi preservada.

As evidências anteriores de MySQL, backup e Chrome continuam históricas. Resumo sanitizado em [evidencias/vinculos-demandante-atual/summary.json](evidencias/vinculos-demandante-atual/summary.json).

## Etapa posterior — migration aplicada e validação SQL

Concluída em **26/10/2026 às 13:03, horário de São Paulo**, em MySQL **8.0.44**. O backup criptografado `backup-2cf943c9fdd6.evalbackup` e sua restauração confirmaram **8 tabelas/43 registros**, com DDL/conteúdo coincidentes e login dos dois perfis. Esse é o estado anterior à migration; os arquivos continuam no perfil externo protegido.

O runner `isolated-record-links.js`, invocado pela ação `ValidateLinks`, exige relatório de recuperação explícito, origem/cópia do perfil, markers, identidade do servidor, dados de negócio ainda coincidentes e nenhuma outra conexão selecionando esses schemas. Recusa baseline diferente de 11 migrations ou qualquer pendência além da migration autorizada. Migra a cópia e só alcança a origem depois de todos os testes passarem. Não repetir esse comando no alvo já atualizado.

Na cópia `evaluation_isolated_0f8785e64029_v2_restore_2cf943c9fdd6` passaram a regressão de autenticação/sessão/CSRF/limitação e **15 grupos de verificações** de vínculos. Foram exercitados autores anteriores/administradores, sessão antiga sem acesso, homônimos com IDs distintos, seleção inválida sem inserção, legados administrativos, paginação, FKs, comparação binária de atribuição e colisão José/Jose na collation `utf8mb4_0900_ai_ci`. A fixture de concorrência confirmou a espera de lock e o bloqueio de gravação pelo antigo demandante após transferência.

Uma expectativa de teste inicialmente reconhecia apenas 1452/1451; foram observadas as rejeições equivalentes 1216/1217. O teste passou a aceitar somente essas variantes, recusando sucesso indevido ou outro erro. [Referência MySQL](https://dev.mysql.com/doc/mysql-errors/8.0/en/server-error-reference.html). As três cópias das tentativas interrompidas foram preservadas; a origem não foi migrada antes da cópia final passar.

Depois, somente a 12ª migration foi aplicada na origem, em 280 ms no conjunto fictício. Contas, profissionais e **oito avaliações existentes** foram comparados e preservados; os oito `colab_id` históricos continuam nulos. A estrutura e a quantidade final de 12 migrations foram verificadas. Os testes e alterações de atribuição escreveram apenas na cópia recuperada, sem backfill na origem.

Suíte padrão final: **127 testes aprovados**, zero falhas/skips, incluindo quatro novos testes das barreiras do runner SQL. Não houve novo build/Chrome, pois a interface não mudou nesta etapa; o build de implementação anterior permanece aprovado. Zero arquivos temporários de credenciais remanescentes. A instância iniciada pela tarefa foi encerrada ao final, retornando ao estado parado anterior, com dados/migration persistidos. Não houve commit, push, deploy ou envio real de e-mail.

[Relatório SQL sanitizado](evidencias/vinculos-demandante-atual/mysql-validation-report.json). A próxima etapa é revisar a conciliação dos registros legados, sem inferir identidade pelo nome/e-mail do autor.

## Inventário somente leitura aprovado — 27/10/2026

O primeiro lote de conciliação foi aprovado e executado, limitado a implementar/testar o inventário e consultar o perfil fictício existente. Isso não autoriza aplicar associações, provisionar contas ou corrigir atribuições. A proposta de aplicação permanece uma etapa posterior.

`backend/scripts/isolated-inventory.js`, acionado por `Inventory` no launcher, usa conexão dedicada da conta SQL da aplicação, sem abrir conexão root nessa ação. Verifica perfil externo, servidor/diretório/porta/UUID/bind, schema selecionado, marcador exclusivo, tabelas InnoDB, lista exata das 12 migrations e tipo/nulabilidade de `colab_id`. Usa `REPEATABLE READ` e `START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY`, terminando com `ROLLBACK`, inclusive em falhas de leitura. Não executa DML/DDL, login, inicialização da aplicação ou SMTP. O módulo de identidade importado é puro; nenhum `.env`, `index.js` ou `knexfile.js` é carregado.

Os candidatos e grupos duplicados são consultados segundo a collation MySQL, com indicação separada das diferenças textuais exatas. A autoria não seleciona candidatos. A análise de e-mail normalizado serve apenas para diagnóstico; nenhum dado é normalizado no banco nem usado para ampliar permissões. O inventário recusa resultados acima de 10 mil linhas por consulta e se destina somente ao conjunto isolado pequeno. O snapshot de dados não substitui controle operacional contra DDL concorrente; não alterar schema durante a execução.

Com o MySQL isolado já iniciado:

```powershell
$perfilAvaliacao = Join-Path $env:LOCALAPPDATA 'EvaluationDev/mysql-isolated-0f8785e64029'
./backend/scripts/isolated-mysql.ps1 -Action Inventory -ProfileDirectory $perfilAvaliacao
```

A ação não inicia/para serviços. A API existente pode permanecer ativa: são leituras consistentes sem locks de escrita explícitos. A saída contém apenas contagens, versão, número de migrations e basename do artefato. Falhas não imprimem SQL, stack, diferenças de assertions ou linhas privadas. Não executar `Validate` ou `ValidateLinks` como substitutos.

O detalhe selecionado contém IDs, nomes, matrículas, autor/datas dos registros sem vínculo e diagnósticos de atribuição; não consulta hashes, senhas, observações ou notas. É gravado exclusivamente em `inventory-<id>.evalinventory` no perfil externo, com criação exclusiva, sem versão em texto puro. Usa AES-256-GCM e chave HKDF-SHA256 derivada do segredo de sessão existente, com contexto exclusivo de inventário e salt do perfil. A identidade de perfil/schema/artefato é autenticada. Nenhum segredo ou cofre é alterado. `decryptDetails` permite futura revisão em memória, sem comando que imprima dados privados. A rotação/perda desse segredo impede abrir relatórios anteriores sem sua versão correspondente; o cofre DPAPI continua dependente da identidade Windows e este artefato não é backup do banco.

Resultado em **27/10/2026 às 19:58, horário de São Paulo**: MySQL 8.0.44, 12 migrations, collation das tabelas consultadas `utf8mb4_0900_ai_ci`. Oito avaliações, dois profissionais e duas contas. Todos os oito vínculos permanecem nulos e cada avaliação tem um candidato pelo nome; não há candidatos múltiplos, pares apenas equivalentes por collation, nomes/matrículas duplicados ou vínculos órfãos no snapshot. Os dois profissionais estão sem matrícula e uma atribuição não encontra conta correspondente. Esses resultados não comprovam identidade histórica nem autorizam vinculação automática.

Artefato protegido: `inventory-c9ef67f5d8ab.evalinventory`. A releitura/descriptografia autenticada do arquivo persistido foi executada em memória, confirmando as contagens sem exibir dados privados. Apenas o [resumo sanitizado](evidencias/inventario-conciliacao/summary.json) está no repositório.

Validação executada: **141/141 testes**, zero falhas/skips, incluindo 11 novos testes de escopo/servidor/schema/marcador/migrations/engine/coluna, snapshot somente leitura, falha/limite de leitura, candidatos por collation, atribuições, criptografia e sanitização. Parser PowerShell: zero erros. Não houve novas dependências, migrations, escrita SQL, alteração do frontend, build/Chrome novo, envio de e-mail, commit/push ou deploy. Os serviços locais foram preservados.

Próximo lote: revisar evidências para cada associação e resolver por decisão explícita o cadastro sem conta. Ausência de matrícula e candidato único por nome continuam limitações. Casos sem evidência permanecem nulos/administrativos. Qualquer aplicação exige aprovação específica, backup atual e validação em cópia; não reutilizar o runner da transição 11→12.

## Revisão posterior das propostas

Após novo pedido para prosseguir, a revisão somente leitura confirmou igualdade dos campos inventariados e propôs R01–R08 → P01 (Profissional fictício A), ainda aguardando confirmação. O cadastro sem conta corresponde a P02 (Profissional fictício B), coerente com o controle negativo do runner, sem participação nas propostas. Não houve associação, alteração de atribuição ou provisionamento. A revisão individual protegida foi autenticada e preservada; evidências, limitações e plano de aplicação ainda não autorizado em [REVISAO_CONCILIACAO.md](REVISAO_CONCILIACAO.md).

Essa confirmação foi posteriormente recebida e a aplicação concluída, conforme o estado atual no topo e o resultado no guia de revisão. O artefato original da revisão continua imutável; o manifesto criptografado separado registra o mapa confirmado, os valores anteriores e a identidade do backup. Não repetir o lote aplicado nem reaproveitar sua autorização para outros mapas/alvos.
