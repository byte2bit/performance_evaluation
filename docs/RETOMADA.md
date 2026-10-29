# Ponto de retomada

## Pausa preparada e envio solicitado — 28/10/2026

O usuário pediu para **preparar a continuidade para depois e enviar as alterações ao GitHub**. Está autorizado o commit/push do lote já concluído: migration 14, aplicador isolado, launcher, testes, evidências sanitizadas e documentação, incluindo a troca autorizada da porta MySQL. Essa autorização não aprova novas implementações, outras migrations/alvos, produção ou deploy.

**Ponto de parada:** baseline 14 aplicado somente no perfil fictício isolado; `colab.gerencia_id` obrigatório, dois profissionais, uma gerência, oito avaliações e contas/demais campos preservados. Última suíte executada no lote: **190/190 aprovados**, zero falhas/skips. Não repetir testes SQL, backup, migrations ou build apenas para retomar; conferir primeiro o Git e os serviços. A submissão de avaliações permanece desativada.

**Próximo trabalho recomendado, ainda sem execução aprovada:** preparar um plano de recuperação em outro host e proteção das chaves. O backup já foi restaurado localmente, mas o cofre DPAPI depende do usuário Windows atual. Definir destino isolado, disponibilidade segura das chaves/credenciais, critérios de recuperação e autorização própria antes de provisionar ou restaurar em outro alvo. Depois, planejar auditoria administrativa durável e persistência dos critérios/submissão, conforme prioridade confirmada pelo usuário.

Para retomar: ler `AGENTS.md`, este documento e o plano de gestão; conferir `git status`, `git log -1` e a branch `master`, preservando trabalho posterior. O remoto `origin` é `byte2bit/performance_evaluation`; a consulta ao GitHub antes deste envio confirmou `master` em `c10aeb1ddf071daa670906c02249d04b03817ff8`. O commit deste checkpoint deve ser identificado pelo Git após o envio. Os serviços locais foram mantidos; não iniciar duplicatas. Um clone não contém datadir, cofre, backups ou manifestos privados. Os relatos inferiores de ausência de autorização para commit/push descrevem o estado anterior a este pedido.

Conferência para este envio: 15 arquivos de código/testes/documentação/evidência sanitizada revisados, diff sem erros de whitespace e nenhuma ocorrência dos padrões de chaves/tokens verificados. Nenhum `.env`, cofre, backup, manifesto privado ou build integra o conjunto. Frontend 200 e API sem sessão 401 reconfirmados; processos preservados. Os 190 testes são o resultado executado no lote de implementação; não foram repetidos na preparação documental, nem foram executadas novas migrations, testes SQL ou SMTP.

## Estado atual — vínculo obrigatório aplicado em 28/10/2026

O usuário retomou e **aprovou implementar/executar o plano da migration 14 somente no perfil MySQL fictício isolado, primeiro em cópia e depois na origem**. Concluído às **21:16, horário de São Paulo**: `colab.gerencia_id` obrigatório, unsigned, índice/FKs preservados. Uma Gerência de Testes, dois profissionais, oito avaliações e todas as contas/demais campos preservados. [Procedimento e evidências](PLANO_GESTAO_GERENCIAS.md#vínculo-obrigatório-de-todo-profissional--reforço-aplicado-no-perfil-isolado).

**190/190 testes aprovados**, zero falhas/skips; parser PowerShell e diff sem erros. Backup/restauração atuais de **9 tabelas/49 registros** passaram antes de testar a migration, rejeições SQL, cadastro/transferência/arquivamento e exclusão protegida na cópia. Origem revalidada antes do DDL e comparada após login/leitura por administrador e avaliador. Fonte: [resumo sanitizado](evidencias/vinculo-obrigatorio/summary.json). Build/Chrome não foram repetidos, pois o frontend não mudou; não confundir HTTP real com revisão visual.

**Serviços conferidos após retomar a API:** frontend `localhost:5173` **200**, API `localhost:8001/session` sem sessão **401**, MySQL isolado `127.0.0.1:50470`. A porta foi trocada de 50070 após aprovação porque o Windows reservou a faixa anterior; cópias da configuração ficaram no perfil protegido. `Serve` agora exige cadeia/estrutura 14. Não iniciar duplicatas nem repetir `EnforceProfessionalDepartment`, conciliação ou aplicadores históricos.

Artefatos privados externos: `backup-d22f7f4af567.evalbackup`, `recovery-report-d22f7f4af567.json`, `required-department-manifest-b54bf1288a79.evalinventory`, `required-department-report-b54bf1288a79.json` e cópia `_restore_d22f7f4af567`. Preservar para recuperação separadamente planejada; não executar `down`. DDL tem commits implícitos. Sessões/contadores mudam nos testes HTTP, mas os dados de negócio e as contas foram preservados.

No início da execução, o Git estava em `master`, `c10aeb1`, igual à referência local `origin/master`. O envio do lote e da documentação da porta foi posteriormente autorizado, conforme pausa no topo; deploy e próximos lotes não foram aprovados. Persistência de critérios/submissão, recuperação em outro host/proteção de chaves e auditoria durável precisam de escopo/aprovação próprios; submissão continua desativada. Os registros abaixo são históricos.

## Histórico — pausa solicitada em 28/10/2026

O usuário pediu para **pausar a implementação, preparar a retomada e enviar as alterações ao GitHub**. Este pedido autoriza o commit/push do conjunto local já desenvolvido (inventário, conciliação, gestão por gerências, testes e documentação), sem aprovar a migration 14 ou qualquer nova implementação. Os relatos inferiores de commit/push não autorizado registram o estado anterior a este pedido.

**Ponto de parada:** gestão por gerências implementada e ativada somente no MySQL fictício isolado, baseline 13; uma Gerência de Testes, dois profissionais, oito avaliações preservadas. A regra de todo profissional manter demandante está validada na aplicação; a obrigatoriedade de `colab.gerencia_id` no banco segue **planejada, sem migration 14 implementada/aplicada e sem autorização de execução**. Última suíte completa: 178 testes aprovados, sem falhas/skips. Build e verificações visuais anteriores estão identificados nos registros abaixo; não foram repetidos apenas para preparar a pausa.

Conferência para o envio em 28/10/2026: suíte completa reexecutada com **178/178 aprovados**, zero falhas/skips; diff sem erros de whitespace; 53 arquivos de código/testes/documentação revisados quanto a caminhos privados/gerados, tokens e chaves. Nenhum `.env`, backup, manifesto criptografado, cofre ou artefato de build integra o conjunto. Remoto existente: `origin`, repositório `byte2bit/performance_evaluation`, branch `master`.

**Instrução histórica da pausa:** ler AGENTS.md e este documento; conferir Git/branch e estado dos serviços; revisar o [plano do vínculo obrigatório](PLANO_GESTAO_GERENCIAS.md#vínculo-obrigatório-de-todo-profissional--reforço-aplicado-no-perfil-isolado). A retomada e aprovação foram posteriormente recebidas e a execução está registrada no topo. Não repetir migrations/aplicadores de transição já concluídos nem preencher associações automaticamente. A submissão de avaliações permanece desativada.

Credenciais, cofre DPAPI, datadir MySQL, backups e manifestos privados estão fora do repositório e não acompanham o envio ao GitHub. Um clone em outra máquina não restaura esse ambiente; seguir os guias de isolamento/recuperação com aprovação própria. Pausar a implementação não encerra automaticamente os serviços locais; verificar portas antes de iniciar processos novamente. Esta etapa não executa migrations, escreve dados MySQL, envia e-mails ou faz deploy.

## Regra confirmada — profissional sempre com demandante

O usuário determinou que todo profissional deve sempre manter um demandante associado. O modelo continua por gerência, inclusive no arquivamento. Na confirmação inicial, cadastro/edição e exclusão protegida já impunham o vínculo na aplicação, mas `colab.gerencia_id` aceitava nulo pela transição da migration 13. [Diagnóstico, arquivos, critérios, riscos e execução posterior do reforço estrutural](PLANO_GESTAO_GERENCIAS.md#vínculo-obrigatório-de-todo-profissional--reforço-aplicado-no-perfil-isolado). A migration 14 foi posteriormente aprovada/aplicada conforme o estado atual no topo; nenhuma nova atribuição de dados foi inferida.

Adicionados dois testes de regressão para cadastro/edição sem vínculo ou com responsável ausente/inativo/excluído, com dados fictícios e rollback no mock. Suíte completa executada nesta etapa: **178 testes aprovados, zero falhas/skips**. Alterados somente testes e documentação; sem nova migration, escrita no MySQL ou alteração do runtime.

## Estado atual — gestão por gerências ativada no perfil isolado

Concluído em **27/10/2026 às 21:33, horário de São Paulo**. Após pedir para prosseguir, o usuário escolheu a opção 1: **uma Gerência de Testes, com ambos os profissionais e o avaliador atual como demandante**. A 13ª migration e o mapa passaram primeiro em cópia nova e depois na origem fictícia. Estado final: **13 migrations, uma gerência, dois profissionais associados, oito avaliações preservadas**. Nenhum usuário foi criado/alterado; textos legados, notas, autoria e datas foram preservados. O avaliador passa a acessar também B, conforme escolha explícita.

**Aplicação principal ativa em `http://localhost:5173`, API `http://localhost:8001`.** A API antiga foi suspensa para backup/migração e retomada com o código novo. Os processos da prévia 127.0.0.1:5174/8002 foram encerrados; cópia/dados mantidos. Chrome real na origem passou nove verificações de login, telas administrativas, seleção de gerência/demandante derivado, dois profissionais, oito avaliações, restrição administrativa e logout. Conferência SQL final `READ ONLY` confirmou os demais campos/contas iguais ao manifesto protegido.

**176 testes aprovados**, zero falhas/skips, incluindo seis novos de ativação/rollback/escopo de privilégios. O frontend não mudou nesta etapa; build e 72 grupos Chrome simulados são do lote anterior. Backup atualizado de **8 tabelas/46 registros**, restauração idêntica e login recuperado antecederam a ativação. Uma tentativa inicial ficou bloqueada na cópia por falta de permissão de migrations; origem/cópia permaneceram no baseline 12. O aplicador foi corrigido para conceder DDL somente ao schema restaurado validado, com teste impedindo concessão na origem/outros schemas. Nova execução passou e preservou os checkpoints anteriores.

Artefatos externos: revisão `department-map-review-16f12bae727d.evalinventory`, aprovação `department-map-approved-da2479e94559.evalinventory`, backup `backup-49892036b2c4.evalbackup`, relatório `recovery-report-49892036b2c4.json`, manifesto `management-activation-manifest-38219e46b984.evalinventory` e resultado `management-activation-report-38219e46b984.json`. [Procedimento e limites](PLANO_GESTAO_GERENCIAS.md#ativação-autorizada-na-origem), [resumo sanitizado](evidencias/ativacao-gerencias/summary.json). Manifestos são privados/criptografados, fora do Git. Não repetir os aplicadores de transição no baseline 13 nem usar suas autorizações para outros mapas/alvos.

Há alterações locais dos lotes de inventário, conciliação e gestão; nenhum commit/push foi autorizado. Sem produção, SMTP ou instalação de dependências. Novas gerências/demandantes podem ser administrados na interface do perfil fictício; próximos trabalhos de critérios/submissão, recuperação em outro host ou auditoria durável precisam de escopo próprio. Submissão de avaliações continua desativada.

## Histórico — implementação e validação inicial em cópia

## Estado do lote anterior — gestão por gerências ainda em cópia

Modelo confirmado: administrador gerencia demandantes/gerências/profissionais; cada gerência tem um demandante atual, um demandante pode ter várias gerências e cada profissional pertence a uma. Profissionais são arquivados, com histórico preservado. Em Inserir/Editar profissional a gerência é selecionada e o responsável é derivado. Contas novas são avaliadores; criação/promoção de administrador continua na CLI existente. [Modelo, contratos e ativação](PLANO_GESTAO_GERENCIAS.md).

Código/UI e migration `20261027000100_add_management_departments.js` concluídos. **170 testes**, build development e **72 grupos Chrome com API simulada** (40 novos + 32 regressão), sem falhas/erros JS. MySQL real: oito grupos de gestão/concorrência aprovados na cópia `evaluation_isolated_0f8785e64029_v2_mgmt_5e14e8056c25`, com 13 migrations. Backup criptografado/restauração e comparação de dados de negócio/DDL passaram; schema/dados de negócio da origem permaneceram intactos e com 12 migrations. [Resumo sanitizado](evidencias/gestao-gerencias/summary.json).

**Prévia:** `http://127.0.0.1:5174`, API `http://127.0.0.1:8002`, exclusivamente nessa cópia e com cookies host-only separados do hostname localhost. `ServeManagementCopy` exige `management-report-5e14e8056c25.json`, marcador e cadeia de 13 migrations. Serviços da aplicação anterior em localhost:5173/8001 foram preservados. Suas rotas novas não estão disponíveis; a interface oculta ações de edição/arquivamento para respostas da API antiga, evitando apresentar exclusão física como arquivamento.

**Próximo passo:** revisar/cadastrar o mapa de gerências e responsáveis para os profissionais da origem e obter aprovação específica da migration/mapa/ativação. Não reiniciar a API da origem com o código novo antes dessa etapa: ele depende da estrutura nova. A migration não inventa gerências nem associa pelo nome/e-mail; profissionais sem gerência por ID ficam administrativos. A cópia tem fixtures explícitas, incluindo arquivamentos e conta adicional excluída, que não devem ser importadas como dados da origem.

Backup externo: `management-backup-5e14e8056c25.evalbackup`; relatório: `management-report-5e14e8056c25.json`. Nenhum pacote instalado, SMTP, migration na origem, commit/push ou deploy. Alterações locais anteriores de inventário/conciliação foram preservadas; o workspace contém ambos os lotes. Os relatos abaixo são históricos do modelo direto por profissional, já sucedido pelo modelo por gerências no código novo.

## Histórico — conciliação e modelo anterior

## Estado atual — conciliação autorizada e aplicada

O usuário confirmou o mapa R01–R08 → P01 e autorizou implementar/executar com backup/cópia antes da origem. Concluído em **27/10/2026 às 20:14** somente no MySQL isolado: **8 avaliações vinculadas, 0 sem vínculo, 0 órfãs, 12 migrations mantidas**. Nomes, autores, notas, observações, datas, profissionais e contas preservados. P02 sem conta e as duas matrículas ausentes continuam como estavam; nenhuma nova conta ou atribuição foi alterada na origem.

`isolated-reconcile.js`, ação `ReconcileReviewed` e 11 testes novos implementados. **152 testes aprovados**, zero falhas/skips. Backup atualizado/restauração de **8 tabelas/46 registros** passou, seguido de rollback dos oito updates, espera por lock observada, repetição recusada e HTTP real na cópia. A origem só recebeu a transação após todos os controles. API retomada; login/leitura dos oito pelo avaliador atual e administrador também confirmados na origem, com logout das sessões de teste. Frontend e MySQL preservados. Sessões/contadores são atualizados pelos testes de autenticação; contas/dados de negócio não foram modificados por esses testes.

Artefatos externos preservados: `backup-f1c9e61f498e.evalbackup`, cópia `_restore_f1c9e61f498e`, `reconcile-manifest-41e54f3a633f.evalinventory`, `reconcile-report-41e54f3a633f.json` e inventário final `inventory-61b11ed12f83.evalinventory`. [Resultado, procedimento histórico e limites](REVISAO_CONCILIACAO.md#aplicação-confirmada-e-executada), [resumo sanitizado](evidencias/conciliacao-aplicada/summary.json). O manifesto contém dados privados criptografados e não deve ser exposto. Não repetir o lote: novos vínculos/alvos exigem revisão/autorização próprias; o aplicador recusa estado diferente e links preenchidos.

Há alterações locais de código/testes/documentação, sem commit/push autorizado. Nenhuma dependência/migration nova, SMTP ou alteração de produção; build e 78 grupos Chrome continuam históricos, pois o frontend não mudou. Próximas etapas são **planejar** persistência dos arrays de critérios/submissão e recuperação em outro host/proteção de chaves, conforme prioridade definida pelo usuário. A submissão permanece desativada; nenhum próximo lote está autorizado por esta conclusão.

## Histórico das etapas de inventário e revisão

## Atualização — revisão das correspondências

Após o pedido para prosseguir, a revisão foi concluída em **27/10/2026 às 20:05**. O relatório original foi autenticado em memória e seus campos inventariados foram conferidos em nova transação `READ ONLY`; detalhe/contagens permaneciam iguais. Os oito casos R01–R08 apontam para P01 (Profissional fictício A), coerentes com as fixtures de criação e autoria. P02 (Profissional fictício B), sem conta, é coerente com o teste negativo de acesso e não recebe nenhuma proposta de vínculo. Não provisionar conta nem alterar atribuição por esse diagnóstico.

As oito propostas continuam **aguardando confirmação**, pois as fontes examinadas não fornecem trilha imutável de criação por registro/ID. A revisão com IDs concretos está criptografada em `inventory-review-b20980a65853.evalinventory` no perfil externo e foi autenticada por releitura integral. [Matriz sanitizada, evidências e plano proposto de aplicação](REVISAO_CONCILIACAO.md). Nenhum código executável foi alterado nesta etapa; 141 testes continuam sendo resultado do lote anterior, sem repetição. Nenhum vínculo/dado/conta foi alterado e não houve backup ou migration novos.

**Próximo passo:** obter confirmação específica de R01–R08 → P01 e autorização do lote de aplicação no perfil fictício. Só então implementar o aplicador transacional, fazer backup atual/restauração, validar na cópia e alcançar a origem após sucesso e revalidação. O plano prevê preservar todos os outros campos e P02; não constitui autorização por si só.

## Atualização — 27/10/2026: inventário aprovado e concluído

O usuário aprovou o primeiro lote: implementar/testar inventário somente leitura e executá-lo exclusivamente no perfil MySQL isolado existente. A ação `Inventory` usa a conta SQL da aplicação em snapshot `REPEATABLE READ / READ ONLY`, verifica identidade/schema/marcador/12 migrations e grava detalhe AES-256-GCM fora do Git. Nenhuma associação, atribuição, conta ou migration foi alterada.

Resultado: **oito registros sem vínculo**, cada um com um candidato pelo nome; dois profissionais sem matrícula e uma atribuição sem conta correspondente. Nenhum homônimo, matrícula duplicada ou vínculo órfão no snapshot. Candidato único não prova identidade histórica. Artefato `inventory-c9ef67f5d8ab.evalinventory` preservado no perfil externo e autenticado por releitura em memória, sem dados privados em saídas. **141 testes aprovados**, zero falhas/skips (11 novos de inventário); parser PowerShell sem erros. [Guia, proteção da chave e resumo sanitizado](PLANO_VINCULOS.md#inventário-somente-leitura-aprovado--27102026).

O Git estava limpo em `8480989`, confirmado também em `origin/master` por consulta remota antes deste lote. Agora há alterações locais do inventário/documentação, sem commit/push autorizado. Frontend respondeu 200 e API `/session` 401 sem sessão na retomada; serviços existentes foram preservados. Build/Chrome não foram repetidos, pois o frontend não mudou. Não confundir os 141 testes atuais com os resultados visuais históricos abaixo.

Essa revisão foi posteriormente realizada, conforme atualização no topo. As oito decisões permanecem pendentes de confirmação; não preencher IDs por inferência, criar conta ou corrigir e-mail automaticamente. Aplicação exige aprovação específica, backup atualizado e testes em cópia. Não repetir `ValidateLinks`, que exige baseline 11, nem usar `Validate` como consulta.

## Checkpoint anterior — 26/10/2026

Checkpoint consolidado em **26/10/2026**, reunindo os vínculos por ID, a aplicação autorizada da **12ª migration no MySQL isolado**, a renovação visual das páginas, os temas e o menu da conta. O usuário solicitou guardar a continuidade e autorizou commit/push deste conjunto para `origin/master`; o commit anterior era `e0848ec`. Consultar `git log -1` e as referências remotas para identificar o commit deste checkpoint e confirmar o envio. Essa autorização não abrange deploy, outros bancos, backfill, produção ou futuros commits/push sem nova solicitação.

## Estado entregue

- Cabeçalho com botão claro/escuro (preferência `evaluation-theme` no navegador) e dropdown **Minha conta** para nome/e-mail/troca de senha/saída. Modais padronizados nos dois temas, mantendo contratos e foco do Flowbite. **130/130 testes**, build e **30 grupos novos Chrome**, mais regressões de 16/32 grupos, aprovados com API simulada. [Detalhes](REVISAO_PAGINAS_GESTAO.md#extensão-tema-manual-menu-da-conta-e-modais). Sem alteração no modelo de autenticação ou ativação de envio.
- Página inicial e login também receberam o estilo das páginas de gestão: seleção e resultados em painéis, critérios organizados e acesso com a marca. **127/127 testes**, build development e **16 grupos Chrome** com API simulada passaram, incluindo login, seleção, estrelas, critérios e resumo. Autenticação e submissão desativada preservadas. [Detalhes e reprodução](REVISAO_PAGINAS_GESTAO.md#extensão-página-inicial-e-login).
- Aparência de `/registros`, `/colabs` e `/inserir` renovada: painéis, busca, tabelas responsivas e cadastro por seções, com tema escuro. **127/127 testes**, build e **32 grupos de verificações Chrome** com API inteiramente simulada passaram; ver [REVISAO_PAGINAS_GESTAO.md](REVISAO_PAGINAS_GESTAO.md). O ambiente local foi iniciado depois do lote SQL, a pedido do usuário; verificar os serviços antes de iniciá-los novamente.
- Passport Local, sessões persistentes MySQL, autorização administrativa/por avaliador, CSRF, limitação, expiração/revogação, troca de senha, CLI e interface de login implementados.
- **12 migrations aplicadas e validadas somente em MySQL 8.0.44 isolado**, primeiro na cópia recuperada e depois na origem fictícia. Backup/restauração confirmaram oito tabelas/43 registros antes da alteração. Contas, profissionais e oito avaliações históricas foram preservados; os oito vínculos antigos continuam nulos.
- Backup criptografado e restauração em schema separado aprovados no lote anterior. Recuperação em outro host ainda pendente.
- Cinco problemas visuais corrigidos e revalidados; submissão da avaliação permanece desativada.
- Contrato de validação/paginação aprovado e implementado: notas 1–5 em passos de 0,5, consistência de média/nível/desconto, textos até 255 caracteres, IDs válidos, page=1/limit=25 e teto 100 em `/registros2`; entrada inválida retorna 400.
- READMEs da raiz/backend/frontend descrevem funcionalidades, acessos, telas/API, execução local e limites reais. O frontend usa `npm start`, sem script `dev`.
- Nodemailer **10.2.1** e PM2 **7.1.1**, fixados após aprovação. Corrigida a aspa ausente no remetente de `mail2.js`, preservando o endereço. Cadeias npm OpenCensus/uuid e get-uri/basic-ftp removidas pelo PM2 novo.
- Audit online do **backend: zero entradas, código 0**, após os dois lotes. O audit **frontend zero** é o resultado do lote anterior; não foi repetido.
- Runner PM2 fictício opt-in passou **7/7**, com pipes exclusivos no Windows, ambiente sanitizado, rede bloqueada e daemon encerrado. Métricas WMI foram negadas e não estão validadas. Nenhum daemon pessoal/operacional foi usado.
- O usuário ajustou `backend/api.js` para o hostname de exemplo `api.mysite.com` e removeu comentários inativos; alteração preservada, com teste e documentação alinhados.
- Decisão atual aprovada: somente demandante atual e administradores consultam o histórico do profissional. O autor é preservado; o demandante anterior perde acesso, salvo se for administrador. Decisão inicial de manter acesso por autoria foi substituída.
- `registros.colab_id` usa a identidade do profissional; leitura não faz fallback por nome/autor. Legados sem vínculo ficam administrativos até conciliação. POST por nome único continua compatível; ambiguidade/conflito nome-ID retorna 409. Vue seleciona IDs e não refiltra o histórico pelo autor.
- Não há novo endpoint/tela para editar demandante, script de backfill, associação automática ou submissão de avaliações ativada. Sua edição no título de `AGENTS.md` foi preservada.

Última validação de código: **130 testes aprovados**, zero falhas/skips, build development e **78 grupos no Chrome com API simulada** (30 cabeçalho/modais + 16 inicial/login + 32 gestão). As verificações foram executadas no último lote de implementação; este checkpoint de documentação/envio não repete banco, migrations, instalações ou audits. Os screenshots e builds temporários não entram no Git.

Evidências SQL anteriores: backup/restauração e 15 grupos reais de vínculos passaram, incluindo FKs, collation, autoria e transferência concorrente com espera de lock observada. Modelo/evidências em [PLANO_VINCULOS.md](PLANO_VINCULOS.md). Audit zero, ciclo PM2 7/7 e 48/48 da revisão antiga de autenticação também são resultados históricos, distintos dos 78 grupos simulados atuais. O MySQL foi parado ao final da aplicação SQL e depois reiniciado para uso da aplicação; não confundir o estado histórico com o atual.

No checkpoint, o frontend respondeu **200 em `http://localhost:5173`** e a API respondeu **401 em `http://localhost:8001/session`** sem sessão, como esperado. Esses serviços foram mantidos; não iniciar duplicatas. O estado do MySQL não foi consultado novamente nesta etapa. Verificar os serviços na retomada, pois podem encerrar com o terminal/reinício do computador.

## Como retomar

Ler `../AGENTS.md`, [AI_CONTEXT.md](AI_CONTEXT.md), [PLANO_EVOLUCAO.md](PLANO_EVOLUCAO.md), [PLANO_VINCULOS.md](PLANO_VINCULOS.md), [REVISAO_PAGINAS_GESTAO.md](REVISAO_PAGINAS_GESTAO.md), [DEPENDENCIAS_SEGURANCA.md](DEPENDENCIAS_SEGURANCA.md) e [PLANO_VALIDACAO_API.md](PLANO_VALIDACAO_API.md). Conferir primeiro `git status`, branch e diferenças remotas; preservar qualquer trabalho posterior a este registro.

Conciliação R01–R08 → P01 concluída conforme estado atual no topo. Planejar próximos lotes de persistência/submissão e recuperação/proteção de chaves sem executá-los implicitamente. `ValidateLinks` concluiu a transição 11→12 e recusa outro baseline; não repeti-lo no schema já atualizado. O runner genérico `Validate` altera fixtures e não é consulta somente leitura. Outros mapas/alvos exigem revisão e autorização próprias. Não repetir instalações/audits/testes sem mudança ou dúvida concreta.

Depois: desenhar persistência dos arrays de critérios e submissão antes de ativá-la, planejar recuperação em outro host/proteção das chaves, purga e recuperação de senha. URLs, HTTPS e proxy de produção não estão definidos; rotação das credenciais SMTP antigas depende do responsável operacional. Cluster, startup/resurrect, métricas WMI e SMTP real não foram validados pelos lotes locais.

## Reiniciar o ambiente local, se necessário

O perfil abaixo já recebeu as 14 migrations, a conciliação revisada dos oito registros e a associação dos dois profissionais à Gerência de Testes; avaliador atual e administrador tiveram sua leitura confirmada. Iniciar MySQL e API somente se os serviços estiverem parados. Esses comandos não migram ou conciliam outros ambientes.

Na raiz do projeto, em PowerShell 7, com o mesmo usuário Windows que criou o cofre:

```powershell
$perfilAvaliacao = Join-Path $env:LOCALAPPDATA 'EvaluationDev/mysql-isolated-0f8785e64029'
./backend/scripts/isolated-mysql.ps1 -Action Info -ProfileDirectory $perfilAvaliacao
./backend/scripts/isolated-mysql.ps1 -Action Start -ProfileDirectory $perfilAvaliacao
./backend/scripts/isolated-mysql.ps1 -Action Serve -ProfileDirectory $perfilAvaliacao
```

`Serve` ocupa esse terminal; API em `http://localhost:8001`. Em outro terminal, ainda na raiz:

```powershell
$env:VITE_API_URL = 'http://localhost:8001'
npm --prefix frontend start -- --host localhost --port 5173 --strictPort
```

Acesso em `http://localhost:5173`. Não iniciar outro processo se a porta já estiver ocupada; verificar o processo existente. Os serviços locais podem encerrar ao fechar terminais ou reiniciar o computador; o repositório e o perfil externo persistem. Não usar o bootstrap normal do backend para este teste, pois a conexão deve continuar sendo exclusivamente isolada.

As contas fictícias são `admin@example.invalid` e `reviewer@example.invalid`. Não há senha padrão: senhas e segredos permanecem no cofre DPAPI externo, sem inclusão no GitHub. Backups, datadir e credenciais também ficam fora do repositório; um clone em outra máquina não os recupera. Ver [AMBIENTE_ISOLADO.md](AMBIENTE_ISOLADO.md) e [BACKUP_RESTAURACAO.md](BACKUP_RESTAURACAO.md).

Suíte em memória, sem banco/SMTP reais:

```powershell
node --test backend/test/*.test.js frontend/test/*.test.js
```

Os runners `Validate` e `VisualReview` antigos estão bloqueados no código atual; não executá-los como checagem do baseline 13. Os aplicadores de conciliação/gestão já concluídos também recusam repetição. `RecoveryTest` é opt-in, cria backup/cópia e testa autenticação; ler seu guia antes de executar e não tratá-lo como consulta somente leitura. A ferramenta temporária de navegador pode precisar ser preparada novamente se seu diretório tiver sido removido. Não aplicar migrations em outro ambiente com base na autorização dada para o perfil isolado.

O runner `node backend/scripts/isolated-pm2.js` também é opt-in: cria perfil temporário/aplicação fictícios e daemon exclusivo, bloqueia rede e encerra somente seus processos. Não inicia a API. Perfil e relatório são preservados; ver guia em `DEPENDENCIAS_SEGURANCA.md` antes de repetir.

## Pedido para a próxima conversa

> Retomar conforme AGENTS.md, docs/RETOMADA.md e docs/PLANO_GESTAO_GERENCIAS.md. Implementação pausada a pedido em 28/10/2026, com autorização para enviar este lote ao GitHub. Migration 14 aprovada/aplicada somente no perfil MySQL fictício isolado após backup/restauração e validação na cópia. Todo profissional mantém gerência/demandante por ID, com gerencia_id NOT NULL; uma Gerência de Testes, dois profissionais, oito avaliações e contas/demais campos preservados. Última suíte: 190/190 aprovados. API localhost:8001, frontend localhost:5173, MySQL isolado 127.0.0.1:50470; conferir Git/serviços antes de iniciar duplicatas. Próximo passo recomendado: planejar recuperação em outro host/proteção das chaves, sem executar antes de aprovar o escopo/destino. Credenciais/backups/manifestos externos; clone não restaura o ambiente. Não repetir transições, executar down, inferir mapas, tocar produção ou ativar submissão. Próximos escopos e futuros commits/pushes exigem autorização própria.
