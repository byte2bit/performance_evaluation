# Contexto técnico e continuidade

**Pausa em 28/10/2026:** usuário solicitou preparar a retomada e enviar o conjunto local ao GitHub. Sem nova implementação/migration. Baseline isolado 13; reforço estrutural do vínculo obrigatório aguarda aprovação. Última suíte completa: 178 testes aprovados. O estado de parada e as instruções de reinício estão em [RETOMADA.md](RETOMADA.md); credenciais/backups privados permanecem externos.

Atualizado em 27/10/2026. Este documento descreve o código inspecionado; não comprova a configuração implantada nem o esquema do MySQL de produção. Para continuar em outra conversa, ler [RETOMADA.md](RETOMADA.md).

**Regra reafirmada:** todo profissional mantém demandante por sua gerência, inclusive arquivado. API/formulário já exigem vínculo no cadastro/edição e protegem a exclusão do responsável. Nova verificação: **178 testes aprovados**, incluindo dois novos de ausência/remoção do vínculo e responsável indisponível. `colab.gerencia_id` continua nullable na estrutura de transição; [plano de migration adicional](PLANO_GESTAO_GERENCIAS.md#vínculo-obrigatório-de-todo-profissional--reforço-pendente-de-aprovação) aguardando aprovação antes de implementação/execução. Nenhuma escrita MySQL nesta confirmação.

**Estado atual do código e perfil fictício:** gestão por gerências ativada na origem isolada com 13 migrations. Usuário escolheu explicitamente uma Gerência de Testes, ambos os profissionais e o avaliador atual como responsável. `gerencias.demandante_id → users2.id`, `colab.gerencia_id → gerencias.id`; histórico por `registros.colab_id` e responsável atual da gerência. Uma gerência, dois profissionais e oito avaliações preservadas, sem alteração de contas ou campos legados. **176 testes aprovados** e nove verificações Chrome reais na origem. Backup/restauração e cópia passaram antes da origem; comparações SQL finais preservaram os demais dados. Principal ativa em localhost:5173/8001; prévia antiga encerrada. [Arquitetura, endpoints e ativação](PLANO_GESTAO_GERENCIAS.md). Build e 72 grupos Chrome simulados do lote anterior são históricos; descrições abaixo registram etapas anteriores.

**Estado mais recente:** conciliação revisada R01–R08 → P01 confirmada e aplicada somente no MySQL fictício isolado, após backup/restauração atualizados (8 tabelas/46 registros), rollback/lock/repetição/HTTP na cópia e revalidação da origem. **8 avaliações vinculadas, 0 sem vínculo/órfãs, 12 migrations mantidas; 152 testes aprovados**. Demais campos, profissionais e contas preservados. API retomada e leitura dos oito confirmada para avaliador atual/administrador na origem. P02 sem conta e duas matrículas ausentes inalterados. [Resultado, artefatos e limites](REVISAO_CONCILIACAO.md#aplicação-confirmada-e-executada).

`isolated-reconcile.js`/`ReconcileReviewed` exigem o mapa confirmado, revisão/inventário autenticados, backup atual, estrutura/estado esperados e ausência de outros escritores. Atualizam somente os vínculos em transação com locks e comparação integral. Não geram candidatos, não executam migrations e recusam replay. Manifesto privado criptografado e backup/cópia/relatórios permanecem externos. Próximos lotes de persistência/submissão e recuperação/chaves exigem planejamento e autorização próprios; submissão desativada e sem commit/push do lote.

Vínculos por ID e histórico pelo demandante atual permanecem validados no MySQL isolado. Páginas, temas, dropdown e modais estão concluídos; build development e **78 grupos Chrome simulados** aprovados são resultados históricos do lote anterior. Nesta retomada, `master` local e remoto consultado coincidiram em `8480989`; o lote de inventário ainda não recebeu commit/push. Autenticação, contratos, schema e frontend foram preservados.

Na etapa anterior, inventário/revisão protegida e nova coleta `READ ONLY` confirmaram igualdade dos campos inventariados e propuseram R01–R08 → P01 (Profissional fictício A). P02 sem conta corresponde ao controle negativo. A confirmação e aplicação ocorreram posteriormente, conforme estado atual acima; os 141 testes eram do lote do inventário, agora sucedidos pelos 152 testes da conciliação.

## Escopo e decisões aprovadas

Sistema único existente, mantido em Vue 3 + Express + MySQL. As regras de trabalho estão em `../AGENTS.md`.

Primeiro lote aprovado pelo usuário nesta sessão:

- Externalizar a configuração SMTP sem modificar credenciais ou configurações de produção.
- Escapar conteúdo dinâmico dos e-mails e encerrar as respostas HTTP.
- Corrigir a resposta duplicada de `GET /registros2`, mantendo uma lista JSON.
- Tratar falhas no frontend e atualizar listas somente após confirmação de exclusão.
- Adicionar testes isolados e documentação de continuidade.

Não foram aprovados neste lote: autenticação, sessões, mudanças de schema, migrations, ativação da submissão de avaliações, deploy ou publicação. Nenhuma dependência foi instalada ou atualizada.

O segundo lote foi aprovado e implementado: Passport Local, sessões MySQL, autorização no Express, CSRF, limitação, troca de senha, login no Vue e CLI de contas. Na etapa posterior autorizada, a cadeia completa de 11 migrations passou em MySQL 8.0.44 separado, incluindo duas correções de schema aprovadas; duas contas fictícias foram provisionadas. URLs, proxy e HTTPS de produção ainda não estão definidos. As correções de dependências anteriores foram enviadas no commit `c06bb66`; autenticação e integração isolada são trabalho posterior no workspace.

## Estrutura, versões e execução

| Área | Entradas e ferramentas |
| --- | --- |
| Backend | `backend/index.js`: aplicação Express; `backend/api.js`: wrapper Vhost; `backend/api/`: handlers; `backend/config/`: inicialização; `backend/lib/mail.js`: utilitário fora do autoload; `backend/migrations/`: schema declarado |
| Frontend | `frontend/src/main.js`, `App.vue`, `router/index.js`, `components/pages/`, `stores/colabStore.js`, `composables/useFlowbiteModal.js` |
| Banco | Knex recebe configuração CommonJS de `backend/.env`, por meio de `knexfile.js`; driver ativo `mysql`; nenhuma conexão foi usada nesta etapa |
| Testes | `node:test`, mocks, VM e renderizadores em memória; dependências já instaladas do Vue, Flowbite e esbuild; sem scripts de teste/lint nos `package.json` |

Versões conferidas nos lockfiles e nas instalações locais:

| Dependência | Versão |
| --- | --- |
| Node local | 24.12.0; não há `engines` nos dois `package.json` |
| Vue / Vue Router / Pinia | 3.5.44 / 4.5.1 / 3.0.2 |
| Vite / Axios | 6.4.4 / 1.20.0 |
| Tailwind / integração Vite / Flowbite | 4.1.7 / 4.1.7 / 3.1.2 |
| Express / Consign | 4.22.3 / 0.1.6 |
| Knex / mysql / mysql2 | 3.1.0 / 2.18.1 / 3.24.6; `mysql2` usado pelo bootstrap isolado, mas não selecionado no `knexfile.js` |
| Passport / passport-jwt | 0.7.0 / 4.0.1; estratégia Local ativa no código; JWT legado não registrado |
| Nodemailer / Vhost | 10.2.1 / 3.0.2 |
| PM2 | 7.1.1; validação operacional somente em processo fictício isolado |
| CORS / body-parser | 2.8.5 / 1.20.9 |
| Transitivas corrigidas | proxy-addr 2.0.8; basic-ftp 6.2.3, com override limitado a get-uri 6.0.3 |
| Novas dependências aprovadas | passport-local 1.0.0; express-session 1.19.0; connect-session-knex 5.0.0; argon2 0.45.1; rate-limiter-flexible 11.2.3 |

Scripts existentes:

- Backend: `npm start` executa `nodemon`; `npm run production` executa PM2 sobre `index.js`, com o nome já configurado no projeto.
- Frontend: `npm start` executa Vite; `npm run build` compila; `npm run preview` executa o preview.
- A inicialização direta de `index.js` escuta HTTP em 8001. Importá-lo não abre porta.
- A inicialização direta de `api.js` escuta HTTP em 8000. Importá-lo não abre porta. O script `production` não inicia esse wrapper.

## Fluxo HTTP, Vhost e Consign

Desenvolvimento observado: navegador/Vite em `http://localhost:5173` → Axios com `VITE_API_URL=http://localhost:8001` na configuração local → Express → CORS → JSON body parser → rotas → Knex/MySQL ou Nodemailer.

`frontend/vite.config.js` não configura proxy. A configuração base local do frontend aponta para uma API HTTPS na porta 8000, mas `backend/api.js` cria um servidor HTTP. Não foram inspecionados proxy reverso, terminação TLS ou ambiente implantado; não é possível concluir como essa diferença é resolvida em produção, nem qual é a origem efetiva do frontend implantado.

O Vhost registra somente o hostname de exemplo `api.mysite.com`, ajustado pelo usuário em 26/10/2026, e delega a `index.js`. Hosts desconhecidos seguem para o 404 padrão do Express; não há fallback de aplicação registrado. Isso não comprova DNS/configuração implantada. Não há configuração de `trust proxy` nos arquivos de entrada examinados. O Vhost não comprova isolamento nem autentica o cliente.

`index.js` atribui `app.db` antes do Consign, nesta sequência:

1. `config/passport.js` cria o runtime de autenticação Local sobre `app.db`, com configuração externa validada e store SQL sem criação automática de schema.
2. `config/middlewares.js` registra no-store, exigência de HTTPS em produção, CORS credenciado, parsing JSON, prontidão do store, sessão, Passport e validação de expiração/revogação.
3. `api/validation.js` declara funções, mas não as exporta atualmente.
4. `api/` registra handlers sob `app.api`; `api/auth.js` expõe handlers do runtime já inicializado. Utilitários ficam em `lib/auth/` e `lib/records.js`, fora do autoload.
5. `config/routes.js` registra rotas, autenticação/autorização/CSRF/limitação e por último tratamento genérico de erros.

O helper SMTP está em `lib/` para não ser tratado pelo Consign como fábrica de módulo da API. Ele não abre conexão SMTP ao ser importado.

CORS permite a origem exata de `FRONTEND_ORIGIN`, cujo padrão local é `http://localhost:5173`, habilitando credenciais; preflight não exige login. Requisições sem `Origin` podem atravessar CORS, mas mutações exigem origem exata, JSON e token CSRF. CORS não substitui autorização. Cookie local: `evaluation.sid`, HttpOnly, SameSite=Lax; em produção, `__Host-evaluation.sid`, Secure, sem Domain, Path=/ e SameSite explícito.

## Contratos e funcionalidades observadas

| Método e caminho | Handler / comportamento |
| --- | --- |
| `GET /registros` | `user.getReg`: lista completa de avaliações |
| `POST /registros` | `user.saveReg`: insere o corpo recebido; sucesso 204 |
| `GET /registros2` | `registros.getReg`: lista com paginação existente; uma resposta JSON; falha 500 com mensagem genérica |
| `POST /registros2` | `registros.saveReg`: insere o corpo recebido; sucesso 204 |
| `GET /registros/:id` | `user.getRegById` |
| `DELETE /registros/:id` | `user.removeReg`: exclusão física; sucesso 204 |
| `GET /colab` | `user.getColab`: lista colaboradores |
| `POST /colab` | `user.newColab`: cadastro; sucesso 204 |
| `GET /colab/:id` | `user.getColabById` |
| `DELETE /colab/:id` | `user.removeColab`: exclusão física; sucesso 204 |
| `POST /mail`, `POST /mail2` | Envio SMTP: 204 após aceitação pelo transporte; 503 sem configuração válida; 502 em falha de preparação/transporte/envio; mensagens de erro genéricas |

As rotas da tabela acima exigem sessão. Profissionais são filtrados por seu `demandante` atual, comparado exatamente ao e-mail canônico da conta. Avaliações são filtradas por `colab_id` e pela atribuição atual do profissional, antes da paginação; `registros.demandante` preserva somente a autoria. Administradores consultam todos, inclusive legados sem vínculo. Cadastro/exclusão de profissionais, exclusão de registros e SMTP exigem administrador. Gravações validam o seletor `colab_id` em transação; somente nome continua aceito quando há um único candidato no escopo, com 409 para ambiguidade ou conflito nome/ID. ID da avaliação, identidade e timestamps não são aceitos arbitrariamente. Regras de negócio e limites ficam em `lib/business-validation.js`; contratos em [PLANO_VALIDACAO_API.md](PLANO_VALIDACAO_API.md) e [PLANO_VINCULOS.md](PLANO_VINCULOS.md).

Novos endpoints: `GET /csrf-token`, `POST /signin`, `GET /session`, `POST /signout` e `POST /change-password`. Login devolve somente ID/nome/e-mail/perfil, sem JWT; contas vêm de `users2`, não de `colab`. `signup` e `validateToken` seguem inativos. Sessões expiram em 30 minutos de inatividade ou 8 horas absolutas, com versão de revogação verificada a cada requisição. Configuração, contratos e CLI estão na seção 16 de `PLANO_AUTENTICACAO.md`.

Frontend em JavaScript com Composition API e Options API; existe também um composable `.ts` preexistente. Rotas: `/`, `/inserir`, `/registros`, `/colabs`, `/excel`, `/checkall`. Tailwind 4 integra-se pelo plugin Vite e CSS; modais do formulário usam Flowbite JS por composable, com limpeza e sincronização de foco. As duas listagens usam `ConfirmDeleteModal.vue`, validado no Chrome com teclado, foco e cancelamento.

As três páginas de gestão (`/registros`, `/colabs`, `/inserir`) compartilham `components/utils/ManagementPage.vue` e `styles/management-pages.css`, com estilos limitados ao wrapper. Busca identificada, tabelas com rolagem própria e cadastro em três seções; sem alteração nos contratos ou no formulário de avaliação. Revisão atual com API simulada: [REVISAO_PAGINAS_GESTAO.md](REVISAO_PAGINAS_GESTAO.md).

Após esse lote, a aparência de `Home.vue`, `Form.vue`, seus critérios, `ListCheckboxes.vue` e `Login.vue` foi alinhada à mesma paleta por solicitação do usuário. Home/login importam os controles compartilhados e `styles/evaluation-pages.css`, com seletores limitados às duas telas. Fluxos, cálculos, seleção por ID e autenticação preservados; submissão permanece desativada. Runner adicional de UI com API simulada: `frontend/scripts/review-entry-pages.mjs` (16 grupos aprovados); instruções no mesmo guia visual.

O cabeçalho agora alterna claro/escuro e agrupa a conta em dropdown com teclado/clique fora e limpeza de listeners. `main.js` inicializa `composables/useTheme.js`/`js/theme.js`; a classe `.dark` de `html` governa Tailwind e a paleta global de `styles/theme.css`. Apenas a preferência visual `evaluation-theme` é persistida; sem escolha salva, segue o sistema. `styles/dialogs.css` padroniza os três componentes de modal, com corpo rolável e foco Flowbite preservado. Troca de senha recebeu somente contraste no escuro. Ver `review-header-modals.mjs` e a extensão do guia visual: 30 grupos novos mais regressões de 16/32 grupos no Chrome com API simulada; 130 testes padrão e build aprovados.

O formulário permite seleção, notas, justificativas e resumo, mas a submissão continua desativada. A identidade fixa foi removida: `src/js/store.js` preserva exportações legadas com dados reativos recebidos da sessão. Novas telas `/login` e `/senha`; todas as rotas de negócio têm guarda, com restrição administrativa de `/inserir` e `/excel`. Tokens CSRF e identidade ficam somente em memória; logout/401/troca de conta limpam seleção e invalidam respostas antigas. A proteção efetiva está no Express, antes da leitura/escrita de dados.

## Configuração SMTP após o primeiro lote

O processo Node deve receber estas variáveis externamente:

| Variável | Regra |
| --- | --- |
| `SMTP_USER` | Obrigatória; conta SMTP, sem valor padrão |
| `SMTP_PASSWORD` | Obrigatória; segredo SMTP, sem valor padrão |
| `SMTP_HOST` | Opcional; padrão `smtp.office365.com` |
| `SMTP_PORT` | Opcional; inteiro de 1 a 65535; padrão 587 |
| `SMTP_SECURE` | `true` para TLS implícito; ausente ou `false` usa STARTTLS obrigatório |

Exemplo exclusivamente fictício: usuário `mailer@example.invalid`, host `smtp.example.invalid`, porta 587 e senha obtida de um mecanismo externo de segredos. Nunca inserir credenciais reais na documentação ou no repositório.

Essas variáveis são lidas de `process.env`; não foi instalado dotenv e o arquivo CommonJS `backend/.env` existente não passou a carregar variáveis SMTP automaticamente. O responsável pela operação deve fornecê-las ao processo antes de habilitar o envio. Sem elas, os endpoints retornam 503 e não criam transporte.

Remetentes, cópias e composição dos destinatários existentes foram preservados. A conta configurada precisa ter autorização para os remetentes existentes. A exigência de TLS substitui a antiga configuração manual de cifras; não há desativação da validação de certificados. Timeouts: conexão e greeting de 10 segundos, socket de 30 segundos. Não há retry automático; 204 indica aceitação pelo transporte, não confirmação de entrega ao destinatário.

As credenciais antigas ainda podem existir no histórico Git e precisam de rotação pelo responsável. Nenhum segredo foi revogado, alterado ou validado contra serviços reais nesta sessão.

## Validação e limites

- `node --test backend/test/*.test.js`: 25 testes aprovados.
- `node --test frontend/test/*.test.js`: 28 testes aprovados.
- Os 53 testes incluem os 29 preexistentes, preservados, e 24 novos cenários.
- SMTP, banco, identidade e HTTP são simulados; não há teste de integração com dados reais, MySQL ou provedor SMTP.
- Build do frontend aprovado com `npm run build -- --mode development --outDir <diretório temporário novo>`; `frontend/dist` preservado. A configuração de produção não foi validada por esse build.
- Revisão do diff realizada; `git diff --check` aprovado, com avisos do Git sobre normalização futura de LF para CRLF nos dois módulos de e-mail.
- Não houve execução de migrations, seeds, servidor real, envio de e-mail, commit, push ou deploy.

Na execução inicial do segundo lote, os 53 testes foram executados novamente e passaram após a instalação. O hash/verificação Argon2id com dados fictícios também passou. O `npm audit --json` retornou 24 pacotes com alertas (2 críticos, 13 altos e 9 moderados), sem aplicação automática de correções. As versões dos pacotes previamente registrados no lockfile não foram alteradas. Login, sessões, autorização, CLI e arquivos de migration ainda não foram implementados nesta etapa interrompida.

Na correção adicional autorizada, Express foi fixado em 4.22.3 e body-parser em 1.20.9; os overrides fixam proxy-addr em 2.0.8 e basic-ftp em 6.2.3 para get-uri 6.0.3. Não há cópias antigas desses três pacotes no lockfile. Os 57 testes passaram (29 backend e 28 frontend), incluindo quatro regressões de dependências. O probe HTTP usa somente loopback em processo filho com dados fictícios; FTP, SMTP e MySQL não foram acessados. O audit posterior retornou código 1: 18 entradas restantes (10 altas, 8 moderadas, nenhuma crítica), sem entradas para Express, body-parser, proxy-addr ou basic-ftp. Isso não certifica ausência de vulnerabilidades; outras dependências ainda precisam de triagem.

Próximas decisões e limitações detalhadas: `AUDITORIA.md`, `PLANO_EVOLUCAO.md` e `PLANO_AUTENTICACAO.md`.

## Resultado do lote inicial de autenticação (histórico)

- 95 testes aprovados: 52 backend e 43 frontend, incluindo os 57 anteriores com adaptações dos contratos de sessão aprovados.
- Testes HTTP usam somente loopback efêmero, banco simulado e MemoryStore injetado exclusivamente na fixture. Runtime usa ConnectSessionKnexStore sobre `app.db`, sem fallback em memória.
- Store e limitador desabilitam criação de schema e limpeza automática. Planejar purga de linhas expiradas como operação posterior aprovada; nenhuma tarefa desse tipo foi executada.
- Três migrations novas: estado de conta em `users2`, `sessions` e `auth_rate_limits`. O teste compila DDL MySQL, sem executá-lo; não comprova locks, collation ou persistência reais.
- Build de desenvolvimento aprovado em pasta temporária; verificação confirmou ausência dos e-mails pessoais do mapeamento antigo nos chunks JS. Não houve validação visual em navegador real nesta etapa.
- Não houve novas instalações neste lote, uso de MySQL/SMTP reais, execução da CLI contra contas reais ou alteração dos arquivos de ambiente. Ativação requer schema isolado validado e configuração externa; não considerar produção habilitada.

## Resultado atual: integração MySQL isolada

- 100 testes automatizados aprovados (57 backend, 43 frontend), sem banco externo na suíte padrão. O runner opt-in `backend/scripts/isolated-mysql.ps1` foi executado separadamente contra MySQL 8.0.44 real, com diretório, porta, UUID e marcador de schema verificados antes das operações.
- As 11 migrations passaram em schema novo sem adaptações de tabelas pelas fixtures. Correções aditivas aprovadas: índice não único em `colab.colab` antes da FK histórica e coluna nullable `registros.liderancas`. Migrations históricas preservadas; reversão automática das duas correções é recusada para proteger índices/valores preexistentes.
- Login, autorização SQL, gravação transacional, expiração por TTL/inatividade/prazo absoluto, troca de senha, revogação, logout e persistência após reiniciar a aplicação passaram. Limitação compartilhada entre dois pools: 10 requisições permitidas e 5 bloqueadas em 15 concorrentes. Conta da aplicação teve DDL negado.
- A instância MySQL isolada foi parada, iniciada e revalidada com sucesso. O serviço MySQL80 existente não foi alterado. Contas fictícias, segredos externos protegidos por DPAPI/ACL e comandos estão em [AMBIENTE_ISOLADO.md](AMBIENTE_ISOLADO.md).
- Nenhum novo pacote instalado, arquivo de produção alterado ou e-mail enviado nesta etapa. Produção, retenção de expirados, validação visual e demais pendências da auditoria continuam separados.

## Continuidade: recuperação isolada e revisão visual

O usuário autorizou prosseguir com backup/restauração e revisão visual. `isolated-mysql.ps1 -Action RecoveryTest` chama `isolated-recovery.js`: dump consistente, AES-256-GCM com chave independente no cofre DPAPI, restauração em schema novo e comparação de DDL/conteúdo. Resultado: 8 tabelas e 36 registros coincidentes, origem preservada e autenticação dos dois perfis na cópia aprovada. Temporários de credenciais removidos; nenhum pacote instalado. Suíte atual: 102 aprovados; build local aprovado. Detalhes e limites em [BACKUP_RESTAURACAO.md](BACKUP_RESTAURACAO.md).

A revisão visual original com Playwright temporário e Chrome confirmou cinco problemas (30 verificações: 19 aprovadas, 11 reprovadas). O usuário aprovou as correções, posteriormente concluídas: formulário/cabeçalho responsivos, `ConfirmDeleteModal.vue` compartilhado e administrativo nas duas listagens, contraste no escuro de 16,12:1, matrícula com ID/rótulo próprios e rodapé sem sobreposição. Options API, cálculos e contratos foram mantidos; submissão continua desativada.

Validação do lote visual: **48/48 verificações visuais**, 27 capturas, **102 testes aprovados** e novo build de desenvolvimento aprovado. Quatro exclusões com 503/204 foram simuladas no navegador; nenhuma chegou à API e o banco manteve suas linhas. Evidências e comandos em [REVISAO_VISUAL.md](REVISAO_VISUAL.md). Não houve alteração de dependências, autenticação, schema ou produção naquele lote. Recuperação em outro host, proteção das chaves fora da máquina, retenção e demais pendências da auditoria permanecem separadas.

## Continuidade atual — dependências e contratos aprovados da API

As consultas online npm foram autorizadas para ambos os projetos. O frontend passou de 14 entradas (2 críticas) para zero; o backend passou de 18 para 6 (1 alta, 5 moderadas, nenhuma crítica). Atualizados mysql2, Moment 2.31.0, Axios, Vue e Vite dentro das linhas principais existentes, além de transitivas direcionadas. A tabela de versões acima reflete esta etapa. Nodemailer e a cadeia PM2/OpenCensus/uuid continuam em análise para atualização principal; não considerar o backend sem alertas.

O usuário aprovou o contrato de [PLANO_VALIDACAO_API.md](PLANO_VALIDACAO_API.md). `lib/business-validation.js`, `lib/records.js` e `api/user.js` rejeitam entradas inválidas com 400, limitam textos a 255 caracteres Unicode, verificam notas/média/nível/desconto e IDs. `/registros2` usa page=1/limit=25, teto 100, com desempate por ID; `/registros` mantém lista completa. Nenhuma migration foi acrescentada ou aplicada neste lote.

Resultado atual: **108 testes aprovados**, integração MySQL 8.0.44 isolada aprovada (incluindo entradas inválidas sem alterar linhas e sonda Unicode revertida), **48/48 verificações no Chrome** e build Vite 6.4.4 aprovados. Produção e SMTP real não foram acessados. Evidências, versões e riscos restantes em [DEPENDENCIAS_SEGURANCA.md](DEPENDENCIAS_SEGURANCA.md). Submissão da avaliação, persistência dos arrays de critérios, vínculos legados por nome/e-mail e demais pendências operacionais continuam para etapas próprias.

## Continuidade atual — READMEs e atualizações principais locais

Em 26/10/2026, o usuário aprovou os dois lotes locais de Nodemailer/PM2, solicitando antes a atualização dos READMEs. Criados README principal e do backend; substituído o template Vite do frontend por funcionalidades, telas, acessos, comandos e limites reais. O comando correto do frontend é `npm --prefix frontend start`; não há script `dev`.

Nodemailer passou de 6.9.14 para **10.2.1** e PM2 de 5.3.1 para **7.1.1**, com versões exatas. Instalação direcionada, sem scripts de instalação nem audit automático, preservando os demais contratos. O remetente de `api/mail2.js` recebeu a aspa inicial ausente: o compilador real demonstrou que a sintaxe antiga mudava a caixa interpretada. Endereço/remetente de negócio e destinatários foram preservados; testes usam substituições fictícias.

PM2 removeu a cadeia npm `@pm2/io`/OpenCensus/uuid e get-uri/basic-ftp. Dois testes do consumidor FTP removido foram substituídos por uma regressão contra a reintrodução dessas cadeias; não se reinstalaram pacotes sem consumidor. Acrescentados três testes de Nodemailer real e três de PM2/isolamento. Resultado: **113 testes aprovados**, sem falhas/skips, e **audit online backend zero entradas**, código 0. O resultado frontend zero continua sendo o audit do lote anterior; não foi consultado novamente neste lote.

O runner opt-in `scripts/isolated-pm2.js` passou em sete verificações de ciclo fork, ambiente, logs e encerramento, com aplicação fictícia e rede bloqueada. No Windows, o harness precisa substituir em memória os pipes globais do PM2 por nomes exclusivos; não se alteraram os fontes do pacote nem o daemon pessoal/operacional. Zero processos vivos referenciados pelos arquivos PID dos quatro perfis fictícios na conferência final. WMI negou consulta de métricas; isso, cluster/startup/resurrect e produção não foram validados. Não houve MySQL/migrations, envio SMTP, build ou revisão visual novos; as evidências anteriores dessas áreas permanecem históricas.

Evidências, compatibilidade e reversão em [DEPENDENCIAS_SEGURANCA.md](DEPENDENCIAS_SEGURANCA.md#atualizacao-principal-local-nodemailer-e-pm2). Os commits novos observados durante a execução, incluindo READMEs e Nodemailer, foram preservados. O usuário também preparou a troca do hostname de exemplo do Vhost e removeu comentários inativos em `api.js`; teste e documentação foram alinhados sem reverter sua alteração. O envio ao GitHub foi solicitado posteriormente; deploy continua fora do escopo.

## Continuidade atual — vínculos por ID e transferência de visibilidade

Após investigação com 15 verificações em memória, o usuário substituiu a decisão de acesso pelo autor: **somente o demandante atual e administradores consultam o histórico do profissional**. A autoria permanece intacta; o anterior perde acesso, salvo se for administrador. O modelo foi aprovado para implementação local e escrita da migration sem executá-la.

`lib/records.js` usa subconsulta SQL pelos IDs de profissionais do escopo atual nos dois GETs de lista e no GET por ID. Não há fallback por autor/nome para leitura; vínculos nulos/sem profissional são administrativos até revisão. Novas gravações persistem `colab_id` autorizado, nome do cadastro e autor da sessão. Seleção Vue/Pinia usa IDs, resumo preserva nomes com identificação dos homônimos e atualização da lista limpa seleções transferidas. A tabela deixou de filtrar por autor e rotula esse campo como Avaliador original. Não foi criado endpoint/tela de alteração de demandante, backfill ou envio da avaliação.

A migration `20261026000100_link_registros_to_colab_id.js` acrescenta coluna nullable unsigned, índice e FK restritiva. Não remove a FK textual antiga nem altera linhas; `down` recusa apagar associações. **Nenhuma migration foi executada**. Sem a coluna nova, consultas/gravações podem falhar de forma genérica; não se afirma integração real desse código com o perfil anterior.

Validação: **123 testes aprovados**, zero falhas/skips, SQL/DDL compilados sem conexão, build development aprovado em diretório temporário e diff conferido. Dez testes novos cobrem transferência com sessões existentes, autoria administrativa, homônimos, conflitos/IDs inválidos, legados, paginação SQL e seleção por ID. Sem MySQL, SMTP, audit novo ou Chrome novo. Sua alteração prévia no título do AGENTS foi preservada. Modelo, plano de backup/conciliação/validação e reversão em [PLANO_VINCULOS.md](PLANO_VINCULOS.md).

## Continuidade atual — aplicação da 12ª migration autorizada

O usuário solicitou aplicar a pendência. A instância fictícia na porta 50070 foi iniciada, com diretório/UUID/bind/marker verificados; não havia API na porta 8001. Backup criptografado/restauração em schema novo confirmaram oito tabelas e 43 registros, origem intacta e login dos dois perfis. O runner `isolated-record-links.js` exige baseline de 11 migrations e relatório de recuperação explícito; não executa outras migrations ou backfill. A ação `ValidateLinks` do launcher fornece apenas as credenciais isoladas, sem carregar `.env`.

A migration passou primeiro na cópia recuperada, junto da regressão completa de autenticação e 15 grupos de verificações SQL reais, incluindo locks/transferência concorrente, FKs, collation, homônimos, paginação e autoria preservada. O teste precisou reconhecer variantes 1216/1217 dos erros de FK, além de 1452/1451; cópias interrompidas ficaram preservadas. A origem só foi migrada depois da cópia final passar.

Estado final: 12 migrations na origem isolada; contas/profissionais/oito avaliações anteriores preservados e todos os vínculos históricos ainda nulos. **127 testes padrão aprovados**, zero falhas/skips. Relatório em [mysql-validation-report.json](evidencias/vinculos-demandante-atual/mysql-validation-report.json). Sem produção, SMTP real, novo audit/build/Chrome, commit ou push. Instância novamente parada ao final, restaurando o estado anterior; arquivos/dados persistem. Conciliação e eventual fluxo administrativo de transferência seguem para etapas próprias.
