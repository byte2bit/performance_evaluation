# Proposta do segundo lote: autenticação e autorização

Data inicial: 25/10/2026; continuidade em 26/10/2026. **Estado atual: login, sessões, autorização, UI e CLI implementados; 12 migrations validadas em MySQL 8.0.44 isolado, com contas fictícias e histórico autorizado pelo demandante atual. Suíte atual com 127 testes aprovados. As 48/48 verificações no Chrome são evidência anterior, sem nova revisão visual deste lote. Produção permanece pendente.** As seções de proposta preservam o modelo aprovado; a seção 16 registra a execução e a configuração. Recuperação/convites seguem para etapa posterior.

## 1. Decisões confirmadas pelo usuário

- O sistema exige login para acesso às funcionalidades e aos dados.
- Administradores gerenciam o sistema; avaliadores acessam somente suas próprias avaliações.
- URLs, proxy reverso e HTTPS de produção ainda não estão definidos.

A política e o modelo técnico abaixo foram aprovados pelo usuário. Páginas/recursos de login e os mecanismos necessários à autenticação devem ser acessíveis antes de uma sessão autenticada; isso não abre os dados do sistema. A aprovação permanece válida para retomar após o tratamento explícito dos riscos encontrados; não é preciso aprovar novamente o modelo de autenticação.

## 2. Diagnóstico do código existente

- `config/passport.js` registra uma estratégia JWT, mas nenhuma rota ativa a utiliza. `api/auth.js` contém login parcial sem rota ativa.
- Ambos consultam `colab`, enquanto as migrations de contas declaram `users2(name, email, password, admin, deletedAt)`. Não ativar o código parcial como está.
- `src/js/store.js` tem identidade fixa e dados pessoais. Filtros de registros acontecem depois do recebimento dos dados; não restringem o acesso à API.
- `app.db` está disponível antes do Consign. Sessões podem usar a instância Knex existente, sem um serviço de banco adicional.
- O estado do schema real e a versão do servidor MySQL não foram consultados. As migrations são a evidência disponível para o desenho, não prova de tabelas já aplicadas.
- O primeiro lote está no workspace e permanece sem commit; suas alterações devem ser preservadas.

## 3. Alternativas e decisão proposta

| Opção | Impacto neste projeto |
| --- | --- |
| Passport Local + sessão Express persistente no MySQL | Reutiliza Passport e Knex; mantém credenciais de sessão fora do JavaScript do navegador; permite expiração e revogação controladas pelo servidor. Exige cookie, CSRF e armazenamento persistente. **Opção proposta.** |
| JWT no navegador, partindo do código parcial | Exige definir transporte, armazenamento, expiração, renovação e revogação; o trecho existente não resolve essas necessidades. Não foi identificada necessidade de clientes externos que justifique preferi-lo agora. |

A proposta é uma escolha para este sistema único, sem reescrever Vue/Express, trocar o driver ativo ou implantar SSO. A integração de sessões e serialização está descrita pela [documentação do Passport](https://www.passportjs.org/concepts/authentication/sessions/).

## 4. Matriz de acesso proposta

| Operação / recurso | Sem login | Avaliador | Administrador |
| --- | --- | --- | --- |
| Página de login, obter CSRF e tentar login | Permitido com limitação | Permitido | Permitido |
| Consultar sessão, sair e alterar a própria senha | Negado | Próprio usuário | Próprio usuário |
| Formulário e resumo | Negado | Permitido | Permitido |
| `GET /colab` e `GET /colab/:id` | Negado | Somente profissionais associados ao seu e-mail em `demandante` | Todos |
| `POST /colab`, `DELETE /colab/:id` | Negado | Negado | Permitido |
| `GET /registros`, `GET /registros2`, `GET /registros/:id` | Negado | Histórico vinculado aos IDs dos profissionais de que é demandante atual; autoria não concede acesso | Todas, inclusive legados sem vínculo |
| `POST /registros`, `POST /registros2` | Negado | Apenas no próprio escopo e para profissional autorizado | Permitido no escopo validado |
| `DELETE /registros/:id` | Negado | Negado | Permitido |
| Exportação XLS pela interface existente | Negado | Negado | Permitido, preservando o comportamento atual |
| `POST /mail`, `POST /mail2` | Negado | Negado neste lote | Permitido com sessão, CSRF e limitação |
| Criar/desativar contas ou mudar perfil | Negado | Negado | Operação administrativa explícita, sem cadastro público |

Os detalhes de profissionais, exportação e envio acima são propostas conservadoras para revisão. O envio por avaliadores deve ser associado a uma avaliação persistida e a destinatários autorizados em uma etapa posterior; não basta autenticar e confiar no corpo da requisição.

Regras de autorização:

- Aplicar filtros na consulta Knex **antes** de obter dados, incluindo consultas por ID, paginação e caminhos alternativos da mesma funcionalidade.
- A mudança de visibilidade foi aprovada posteriormente: o demandante anterior perde acesso, salvo se for administrador. `registros.demandante` preserva o autor e `colab.demandante` controla o escopo atual por `registros.colab_id`. A 12ª migration e a regressão de autenticação foram validadas em MySQL isolado após nova autorização; ver [PLANO_VINCULOS.md](PLANO_VINCULOS.md). Legados sem vínculo continuam administrativos até conciliação.
- Não aceitar `admin`, identidade ou escopo enviados pelo cliente. Em gravações de avaliação, o `demandante` vem do usuário autenticado, inclusive para administradores que estejam avaliando.
- Para avaliadores, validar que o profissional solicitado pertence ao seu escopo; não escolher a identidade pelo nome de colaborador ou pelo referrer.
- Não interpretar listas ou trechos de e-mail como equivalência de identidade. Usar correspondência exata com um e-mail canônico validado; a convenção de normalização deve ser igual no cadastro e na consulta. Registros antigos sem correspondência permanecem invisíveis ao avaliador até reconciliação aprovada.
- Recurso por ID fora do escopo retorna 404; operação proibida por perfil retorna 403; ausência de sessão retorna 401.
- Filtragem no Vue e guardas de navegação melhoram a interface, mas não substituem as verificações Express.

## 5. Contas e schema proposto

Manter `users2` como nome de tabela, sem converter `colab` em tabela de credenciais. Preservar `id`, `name`, `email`, `password`, `admin` e `deletedAt`.

| Mudança declarativa proposta | Finalidade |
| --- | --- |
| `users2.active`: booleano, obrigatório, padrão `false` | Ativação explícita; nenhuma conta legada se torna utilizável implicitamente |
| `users2.session_version`: inteiro sem sinal, padrão `0` | Revogar sessões após troca de senha, desativação ou mudança administrativa |
| Nova tabela `sessions`: `sid` como chave primária, `sess` como JSON, `expired` como data/hora indexada | Contrato do store de sessão MySQL |
| Nova tabela `auth_rate_limits`: `key` como chave primária, `points` inteiro, `expire` bigint sem sinal indexado | Contadores compartilhados entre processos, conforme o adaptador do limitador |
| Nova tabela `password_reset_tokens`, em etapa posterior | Digest único do token, usuário, finalidade, expiração e consumo; descrita na seção 10 |

Somente dois perfis, pelo booleano `admin` existente; não criar um sistema genérico de permissões sem necessidade demonstrada. `deletedAt` continua representando exclusão lógica; uma conta com esse campo preenchido não autentica, mesmo se `active=true`.

Antes de aplicar mudanças: comparar schema, versão do MySQL, collation, e-mails únicos e valores existentes em uma cópia isolada. Não corrigir ou normalizar e-mails antigos em massa automaticamente. O uso de JSON deve ser confirmado contra o servidor escolhido; não trocar o driver como consequência implícita.

Na implementação aprovada, criar **arquivos de migration**, sem executá-los. O store usará o `app.db` existente, tabela explícita e `createTable:false`; o limitador usará tabela/banco explícitos, `tableCreated:true` e criação automática desativada. Nenhum banco/tabela deve surgir durante o autoload ou uma requisição. Essas opções são documentadas pelos mantenedores do [store Knex](https://github.com/gx0r/connect-session-knex) e do [limitador MySQL](https://github.com/animir/node-rate-limiter-flexible/wiki/Options).

## 6. Sessão, cookie e origens

Proposta de sessão:

- Cookie contém somente o identificador opaco; estado fica no servidor. `serializeUser` armazena ID e versão de sessão; `deserializeUser` consulta os campos mínimos atuais de `users2` e valida atividade, exclusão lógica e versão.
- Regenerar a sessão na autenticação pelo mecanismo do Passport, testando que o identificador anterior deixa de funcionar. Não reutilizar CSRF anônimo após login.
- Inatividade máxima de 30 minutos e duração absoluta de 8 horas, ambas verificadas no servidor. Renovar atividade não estende o prazo absoluto.
- `resave:false`, `saveUninitialized:false`; a obtenção explícita de CSRF cria uma sessão anônima necessária ao login. Não usar `MemoryStore` em operação real.
- Logout destrói a sessão persistida e remove o cookie. Troca de senha, mudança de perfil e desativação incrementam a versão; a próxima requisição de qualquer sessão antiga é recusada.
- Falha no banco/store retorna erro de serviço genérico e não concede acesso por fallback. Respostas de autenticação usam `Cache-Control: no-store`.

| Situação | Cookie / comunicação propostos |
| --- | --- |
| Desenvolvimento atual: `localhost:5173` → `localhost:8001` | `HttpOnly`, `SameSite=Lax`, `Secure=false` somente em desenvolvimento local HTTP; `Domain` omitido e `Path=/`; Axios com `withCredentials:true`; CORS credenciado limitado à origem exata `http://localhost:5173` |
| Produção futura | HTTPS obrigatório, `Secure=true`, cookie sem `Domain` e `Path=/`. Escolher `SameSite` somente após confirmar os sites/origens efetivos. `Lax` é candidato se forem do mesmo site; domínios de sites diferentes exigem nova avaliação de cookies e restrições do navegador. |

Origens diferentes por porta não significam sites diferentes. Cookies não isolam portas; a configuração local precisa de CORS exato e CSRF. Não usar wildcard CORS com credenciais nem ampliar `Domain` para compartilhar a sessão.

Produção deve recusar inicialização com origem/segredo de sessão ausentes ou configuração HTTP insegura. O segredo de sessão será externo, independente do JWT legado, com pelo menos 32 bytes aleatórios, sem valor padrão no repositório. Quando houver proxy, `trust proxy` deve refletir seus endereços/caminhos reais; não habilitar confiança irrestrita automaticamente. O detalhamento dessas opções está na [documentação Express Session](https://expressjs.com/en/resources/middleware/session/) e no [guia de proxies do Express](https://expressjs.com/en/guide/behind-proxies/).

## 7. CSRF e limitação de tentativas

CSRF proposto: token aleatório de 32 bytes associado à sessão, retornado por `GET /csrf-token`, enviado pelo cliente em `X-CSRF-Token` e comparado de forma segura. Guardar o token apenas em memória no frontend. Renovar no login e após mudanças de sessão.

Requisições que alteram estado, inclusive login e logout, devem exigir token válido e origem explicitamente permitida. Aceitar parsing JSON nas rotas previstas, sem permitir mudanças por GET. Token ausente/inválido ou origem indevida retorna 403. `SameSite` é uma camada adicional, não substitui o token. O padrão de token associado à sessão é descrito pela [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

Limites iniciais propostos, ajustáveis após medir uso:

- Login: 5 tentativas por combinação e-mail/IP em 15 minutos e 100 por IP em 15 minutos, incluindo usuários inexistentes e sem depender de consulta que revele existência da conta.
- CSRF anônimo e recuperação: limitar criação de sessões e volume por IP; recuperação também terá limite por e-mail, com a mesma resposta para contas existentes/inexistentes.
- E-mail administrativo: 10 requisições por minuto por conta, com limite adicional por IP. Isso reduz abuso, mas não aprova envio arbitrário de conteúdo/destinatários.
- Excesso retorna 429 com `Retry-After`; indisponibilidade do armazenamento do limitador retorna 503, sem desabilitar a proteção.
- Persistir chaves derivadas por HMAC de e-mail/IP com segredo externo, em vez de armazenar os identificadores brutos nos contadores. Descartar contadores expirados por tarefa controlada; nos testes, nenhuma limpeza real será executada.

O adaptador MySQL do limitador aceita Knex; a versão escolhida precisa ser testada com Knex 3.1.0 e `mysql` 2.18.1. Não introduzir Redis ou depender de contadores apenas em memória para uma futura execução com múltiplos processos.

## 8. Contratos de autenticação propostos

| Endpoint | Corpo / sucesso | Falhas principais |
| --- | --- | --- |
| `GET /csrf-token` | 200 `{ csrfToken }`, sem dados de usuário | 429 ou 503 |
| `POST /signin` | `{ email, password }`; 200 com `{ id, name, email, admin }` e cookie de sessão | 400 para estrutura inválida; 401 genérico para credenciais incorretas, conta inativa/excluída ou inexistente; 403 para CSRF/origem; 429 ou 503 |
| `GET /session` | 200 com `{ id, name, email, admin }` da sessão atual | 401 ou 503 |
| `POST /signout` | 204 e remoção da sessão/cookie | 401, 403 ou 503 |
| `POST /change-password` | `{ currentPassword, newPassword }`; 204, revoga sessões e exige novo login | 400 para estrutura/política inválida; 401 para senha atual incorreta; 403, 429 ou 503 |

Não retornar hashes, segredos, identificadores de sessão no JSON ou tokens JWT. As rotas de negócio mantêm caminhos, métodos e payloads de sucesso existentes, adicionando as restrições de identidade/escopo aprovadas. `/validateToken` e `/signup`, atualmente inativas, continuam inativas.

O POST de avaliação continuará sem acionamento pelo formulário. Proteger os endpoints não significa aprovar sua validação completa, processamento em lote ou ativação da submissão, que seguem no plano de integridade.

## 9. Senhas e criação inicial de contas

- Usar Argon2id, inicialmente com memória de 19 MiB, duas iterações e paralelismo 1; medir custo antes de operar em produção. Parâmetros e salt ficam no hash armazenado em `users2.password`.
- Proposta de política para novas senhas: 15 a 128 caracteres, sem truncamento, sem remover espaços e sem regras arbitrárias de composição. Validar tamanho antes do processamento custoso.
- Para conta inexistente, executar verificação contra um hash fictício de custo equivalente e usar a mesma mensagem de erro. Não tratar isso como prova de tempos perfeitamente indistinguíveis; medir e testar.
- Não registrar senhas, cookies, CSRF, tokens ou corpos de login em logs.
- Não converter hashes/contas existentes automaticamente. Novas contas usam Argon2id; ativar ou recuperar uma conta antiga exige operação aprovada e definição de senha nova.
- Criação inicial por CLI administrativa explícita, sem cadastro público, seed ou conta padrão no startup. Senha lida sem eco e nunca por argumento/log. O comando deverá exigir destino explicitamente confirmado; não será executado pelo agente contra banco real.
- CLI poderá criar avaliadores, desativar contas e mudar perfil com validação, sem excluir dados de negócio e revogando sessões afetadas. Interface de gestão de contas não integra o primeiro passo de implementação.

Argon2id e o ponto de partida dos parâmetros seguem a [orientação OWASP de armazenamento de senhas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). A biblioteca Node proposta tem componente nativo; compatibilidade de instalação e execução no Node 24/Windows será verificada antes de considerar o ambiente validado, conforme o [projeto node-argon2](https://github.com/ranisalt/node-argon2).

## 10. Recuperação, convites e desativação

Planejados para uma etapa posterior, antes de considerar o ciclo operacional completo:

- `POST /forgot-password` com resposta 202 genérica, sem revelar existência de conta; limitação por IP/e-mail e resposta uniforme também em falha de envio.
- Token de 32 bytes aleatórios, validade proposta de 30 minutos, uso único. Persistir somente SHA-256 do token, usuário, finalidade, expiração e consumo; índice único no digest.
- Criar links somente com `PUBLIC_FRONTEND_ORIGIN` configurada e validada; nunca usar `Host`, `X-Forwarded-Host` ou referrer recebidos do cliente. Sem origem de produção definida, não habilitar recuperação por e-mail nesse ambiente.
- `POST /reset-password` consome o token e atualiza hash/versão em uma transação, com bloqueio que impeça uso concorrente. Não fazer login automático; exigir autenticação após redefinir senha.
- Convites de contas criadas pelo administrador usam finalidade distinta, sem compartilhar token de recuperação; desativação invalida sessões e tokens em aberto.
- Testar envio por mock, incluindo falha SMTP; não enviar e-mails reais para validar o fluxo.

Esses requisitos seguem o fluxo de tokens de recuperação da [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). Não há implementação nem autorização de envio real nesta proposta.

## 11. Dependências propostas e compatibilidade

Os cinco pacotes foram aprovados e instalados com versões exatas: `passport-local@1.0.0`, `express-session@1.19.0`, `connect-session-knex@5.0.0`, `argon2@0.45.1` e `rate-limiter-flexible@11.2.3`. O manifesto e o lockfile foram atualizados; a comparação com o lockfile anterior não encontrou mudança de versão em pacotes que já estavam registrados. As responsabilidades e impactos são:

| Pacote | Necessidade e impacto |
| --- | --- |
| `passport-local` | Estratégia de e-mail/senha sobre Passport 0.7.0 já existente; integração Connect/Express documentada pelo mantenedor |
| `express-session` | Cookie opaco, persistência e ciclo de vida da sessão; adiciona estado de autenticação ao Express 4 |
| `connect-session-knex` | Store SQL que reutiliza Knex; manifesto consultado declara Knex 3 e Node >=18, compatíveis com as versões locais declaradas; runtime ainda não testado |
| `argon2` | Hash assíncrono Argon2id; dependência nativa pode exigir binário compatível ou compilação. Não instalar ferramentas globais automaticamente se houver falha |
| `rate-limiter-flexible` | Limitação com contadores compartilhados MySQL/Knex; novo custo de consultas apenas nas rotas limitadas |

Versões publicadas conferidas no registro npm e fixadas no manifesto/lockfile. A consulta/instalação usou os certificados do Windows com `NODE_OPTIONS=--use-system-ca`, sem desabilitar validação TLS. O teste local de hash/verificação Argon2id passou no Node 24.12.0/Windows, sem exibir senha/hash. Não foram instaladas ferramentas globais. O frontend reutiliza Axios, Pinia, Vue Router, Tailwind e Flowbite existentes.

Após instalação, `npm audit --json` retornou código 1 e 24 pacotes com alertas (2 críticos, 13 altos e 9 moderados). Os casos críticos e o `body-parser` afetado já estavam no lockfile anterior; nenhuma das cinco dependências adicionadas aparece como entrada de vulnerabilidade no relatório consultado. Isso não certifica ausência de vulnerabilidades. Os 53 testes preexistentes passaram novamente após a instalação; testes de autenticação ainda não existem e não foram declarados aprovados.

Não remover `passport-jwt`, `jwt-simple` ou `bcrypt-nodejs` neste lote por limpeza estética. Isolar os módulos parciais para que não reativem estratégia JWT por acidente.

Referências de compatibilidade: [Passport Local](https://www.passportjs.org/packages/passport-local/), [manifesto do store Knex](https://raw.githubusercontent.com/gx0r/connect-session-knex/main/package.json) e [limitador MySQL](https://github.com/animir/node-rate-limiter-flexible/wiki/MySQL). Compatibilidade declarada não substitui testes no projeto.

## 12. Arquivos e ordem de inicialização previstos

| Área | Alterações previstas após aprovação |
| --- | --- |
| Bootstrap/Consign | `backend/index.js`, `config/middlewares.js`, `config/passport.js`: separar configuração da estratégia da montagem dos middlewares; manter `app.db` antes das fábricas e rotas por último |
| API | `api/auth.js`, `config/routes.js`, `config/admin.js`, `api/user.js`, `api/registros.js`; proteger também ambos os caminhos de avaliação e os dois endpoints SMTP |
| Helpers | Novos módulos fora de `api/` para configuração, sessões, CSRF, senhas, limitação e autorização, evitando autoload de utilitários |
| Persistência | Novos arquivos em `backend/migrations/`, sem modificar migrations históricas nem executar schema |
| Administração inicial | CLI separada do startup para contas; nenhum provisionamento automático |
| Frontend | Nova página de login e troca de senha, store de autenticação, guardas no roteador, Axios credenciado/CSRF e substituição da identidade fixa em `src/js/store.js` |
| Compatibilidade visual | Preservar rotas existentes, nomes de componentes, contratos e APIs Vue; adaptar exportações legadas necessárias para que recebam a identidade real sem dados pessoais fixos |
| Pacotes/testes/docs | Somente `backend/package.json`/lock para dependências; novos testes e atualização dos documentos de continuidade |

Sequência proposta: configuração explícita → `app.db` → configuração Passport Local → CORS e parsing JSON → sessão persistente → `passport.initialize()` → `passport.session()` → carregamento/validação de identidade e expiração → verificações de origem/CSRF nas rotas aplicáveis → autorização → handlers. Módulos que consomem serviços devem ser carregados antes das rotas, sem dependências circulares implícitas. Preflight deve funcionar sem exigir sessão.

## 13. Execução, testes e critérios de aceitação

Primeiro passo de implementação, após aprovação do modelo:

1. Conferir requisitos das cinco dependências, selecionar versões e instalar somente os pacotes aprovados.
2. Criar migrations de contas/sessões/limitação e CLI, **sem executá-las**.
3. Implementar login, sessão, logout, CSRF, troca de senha, expiração e autorização da matriz.
4. Integrar a identidade ao Vue e remover o mapeamento pessoal fixo do código distribuído.
5. Cobrir os contratos com mocks e dados fictícios; conferir o build local e atualizar a documentação.

Critérios de aceitação desse passo:

- Testes do primeiro lote continuam passando, com atualizações justificadas somente onde o contrato aprovado de autenticação exige.
- Usuário anônimo não recebe dados nem provoca gravação, exclusão ou envio de e-mail; usuário fora do escopo não recebe dados de outro avaliador.
- Identidade e `demandante` não podem ser forjados pelo corpo, URL, cookie editado ou estado Pinia; perfil é reavaliado no servidor.
- Login válido/inválido, conta inexistente/inativa/excluída, sessão antiga após login, logout, inatividade, duração absoluta e revogação por versão são testados.
- CSRF cobre login, logout e mutações; CORS credenciado cobre origem exata e preflight. Erros de dependências não retornam dados privados.
- Limitação testada para sucesso, excesso e falha de store, sem fallback que libere a tentativa.
- Mocks impedem acesso ao arquivo de credenciais, banco e transporte SMTP reais. Não iniciar o backend com a configuração atual para testar autenticação.
- Testes de navegação/formulário usam usuário fictício; não ativam submissão ou envio de avaliação. Nenhuma senha/token é gravado no browser storage.
- Instalação/execução de Argon2 é testada localmente após aprovação; eventual incompatibilidade é registrada antes de considerar concluída a integração.
- Testes em MySQL descartável são etapa separada, com isolamento demonstrado e autorização antes de aplicar migrations; mocks não provam o comportamento de locks, collation, JSON ou persistência real.

## 14. Implantação, backup e recuperação

Este modelo autoriza apenas o desenho até aprovação específica. Aprovar sua implementação não autoriza rodar migrations, criar usuários reais, enviar e-mails, editar `.env` de produção, publicar ou implantar.

Antes de ativar em produção: definir origens/HTTPS/proxy, confirmar schema/versão MySQL, testar restauração de backup, aprovar e aplicar migrations em janela controlada, fornecer segredos externamente e provisionar as contas explicitamente. Confirmar rotação das credenciais SMTP anteriormente versionadas; a etapa de planejamento não a comprova.

Migrations devem ser pequenas e aditivas, com índice de expiração. Backup e recuperação devem proteger as tabelas de negócio e as contas existentes. Reversões que descartem sessões/contadores exigem autorização e desconectam usuários; desfazer campos de contas perde metadados novos e não deve ser automático. Não executar `down` contra dados reais para experimentar.

Em falha de implantação, restringir o acesso e restaurar uma versão protegida validada; não voltar a expor a API anônima como mecanismo de recuperação. Nenhuma etapa deve depender de criar banco ou permissões DDL durante a inicialização normal.

## 15. Escopo aprovado e implementação interrompida

Aprovados pelo usuário: Passport Local + sessão persistente MySQL, matriz detalhada, schema aditivo, contratos de autenticação, cinco dependências e execução do primeiro passo descrito na seção 13, com migrations apenas escritas e testes isolados. Recuperação/convites por e-mail e qualquer execução contra banco real continuam para etapa própria.

Executado: instalação das cinco dependências, teste Argon2id, triagem inicial e correção adicional autorizada das dependências citadas. Express permanece na linha 4; body-parser 1.20.9, proxy-addr 2.0.8 e basic-ftp 6.2.3 não aparecem no audit posterior. Os 57 testes passaram; ainda restam 18 entradas de outros pacotes (10 altas, 8 moderadas). Ainda não executado: implementação de autenticação/autorização, UI de login, CLI e criação de arquivos de migration. O modelo continua aprovado, sem necessidade de nova aprovação; o tratamento dos demais pacotes e sua aplicabilidade devem ser acompanhados na auditoria.

Esse parágrafo registra a situação anterior à retomada: o primeiro passo de autenticação foi posteriormente implementado, conforme seção 16. Os alertas restantes não foram reavaliados por uma nova instalação/audit neste lote.

As URLs de produção podem continuar indefinidas durante a implementação/testes locais; sua definição será requisito de ativação, sem assumir domínio, proxy ou arquitetura adicionais.

## 16. Implementação concluída e configuração

Implementados: `/signin`, `/session`, `/signout`, `/csrf-token`, `/change-password`; Passport Local por instância, sessão persistente MySQL, verificação de atividade/perfil/versão no banco a cada requisição, expiração por inatividade e prazo absoluto, Argon2id, CSRF, limitadores compartilhados e matriz de autorização. A estratégia JWT anterior deixou de ser registrada; dependências legadas não foram removidas.

As duas APIs de avaliação reutilizam `lib/records.js` para aplicar a mesma autorização. Campos graváveis são explícitos; `demandante` vem da sessão; a autorização do profissional é verificada com lock compartilhado em transação. No cadastro de profissional, o e-mail do demandante é validado e normalizado. Na continuidade aprovada em [PLANO_VALIDACAO_API.md](PLANO_VALIDACAO_API.md), `/registros2` recebeu padrões page=1/limit=25 e teto 100, e ambos os handlers receberam validação de notas, consistência e comprimentos. Entradas inválidas retornam 400; listas e filtros de autorização foram preservados.

Frontend: login e troca de senha acessíveis, estado de envio/erro, guardas, cabeçalho com identidade real, logout, CSRF automático em mutações e Axios credenciado. Não há replay automático de escrita. O mapeamento pessoal fixo foi removido; respostas antigas de sessão/lista não repõem dados após troca de usuário. A seleção/resumo e a submissão desativada da avaliação foram preservados.

### Variáveis externas do processo backend

| Variável | Regra atual |
| --- | --- |
| `SESSION_SECRET` | Obrigatória inclusive em desenvolvimento; segredo de sessão externo com pelo menos 32 bytes; gerar a partir de 32 bytes criptograficamente aleatórios ou mais |
| `AUTH_RATE_LIMIT_SECRET` | Obrigatória, distinta da anterior; mesmo mínimo, usada em HMAC para chaves de IP/e-mail |
| `FRONTEND_ORIGIN` | Padrão local `http://localhost:5173`; origem exata, sem caminho/credenciais/trailing slash. Fora do ambiente local exige `NODE_ENV=production` e HTTPS |
| `NODE_ENV` | Usar `production` explicitamente fora do desenvolvimento local; produção exige origem HTTPS e recusa requisições sem HTTPS reconhecido |
| `SESSION_SAME_SITE` | `lax` em desenvolvimento; `lax`, `strict` ou `none` explícito em produção, após avaliar a topologia; `none` não é permitido no modo local HTTP |
| `TRUST_PROXY` | Ausente significa confiança desabilitada. Lista separada por vírgulas de IPs/CIDRs explícitos; não aceita `true`, contagem de hops ou prefixo zero. Definir somente após confirmar o proxy real |

Nenhum desses valores passa a ser carregado automaticamente do arquivo CommonJS `backend/.env`. O acesso MySQL existente continua por esse arquivo; os novos segredos vêm de `process.env`. Não colocar valores reais neste documento, em comandos com senha como argumento ou no repositório. Nenhum arquivo de ambiente foi alterado pela implementação.

### Migrations e contas

Arquivos criados no primeiro passo, posteriormente aplicados somente no MySQL isolado autorizado:

- `backend/migrations/20261025000100_add_auth_state_to_users2.js`: `active=false` e `session_version=0`; não ativa contas antigas.
- `backend/migrations/20261025000200_create_sessions.js`: SID, JSON de sessão e expiração indexada.
- `backend/migrations/20261025000300_create_auth_rate_limits.js`: chaves HMAC, contagem e expiração.

Aplicação isolada concluída conforme [AMBIENTE_ISOLADO.md](AMBIENTE_ISOLADO.md), incluindo duas correções aprovadas de índice/coluna e cadeia completa de 11 migrations. Para outros ambientes, ainda é necessário conferir schema/versão/JSON/índices, validar backup/restauração e obter autorização específica. O servidor não cria tabelas automaticamente; configuração obrigatória ausente impede inicialização, e store não disponível resulta em 503. O runner isolado ignora o bootstrap e o arquivo de credenciais da aplicação.

A CLI `backend/scripts/accounts.js` oferece `create-admin`, `create-evaluator`, `activate`, `disable`, `promote`, `demote`. Exige terminal interativo, arquivo de conexão explícito e confirmação do banco/ação; senhas são digitadas sem eco e confirmadas. Não há seed, conta padrão, senha em argumentos ou cadastro público. A ativação de conta antiga exige senha nova; desativação/perfil/reativação incrementam a versão; a CLI preserva pelo menos um administrador ativo.

Formato da chamada manual, somente depois de confirmar ambiente e autorizar alterações:

```powershell
node backend/scripts/accounts.js create-admin --config C:/config-local/isolated-db.cjs
```

O arquivo escolhido pelo operador deve exportar `{ client: 'mysql', connection: { ... } }` com conexão confiável e específica do alvo. A CLI não importa o bootstrap da aplicação, `.env`, seeds ou migrations. Ela não foi executada contra banco real nesta etapa.

### Testes executados e pendências

`node --test backend/test/*.test.js frontend/test/*.test.js`: **100 aprovados**. Cobrem sucesso/falha de login, isolamento, campos protegidos, administração, revogação, expiração, CSRF, HTTPS/proxy, indisponibilidade, HMAC/limitação, terminal sem eco, carregamento pelo Consign real, DDL compilado, estado Vue, navegação, formulários e guardas do runner isolado. Essa suíte usa mocks de banco; MemoryStore existe somente na fixture de teste. A validação SQL opt-in foi executada separadamente em MySQL 8.0.44 e confirmou migrations, transações, persistência, expiração, revogação e limitação concorrente; ver guia do ambiente.

Build de desenvolvimento aprovado em pasta temporária, preservando `frontend/dist`; o bundle do lote de autenticação não contém os e-mails do antigo mapeamento. Os cinco achados da revisão visual foram posteriormente corrigidos com autorização e validados no Chrome, conforme `REVISAO_VISUAL.md`. Segredos locais de autenticação e duas contas fictícias estão provisionados fora do repositório, com DPAPI/ACL. As bibliotecas persistentes estão configuradas sem limpeza automática de expirados; definir retenção/purga como etapa operacional própria, sem executar exclusões por esta implementação.

Recuperação/convites por e-mail, UI de gestão de contas, definição da infraestrutura e ativação da submissão de avaliações continuam fora deste primeiro passo. A rotação de credenciais SMTP antigas permanece pendente. Na continuidade autorizada, os 18 alertas do backend caíram para seis; o frontend ficou sem entradas no audit online final. O backend ainda requer análise das atualizações principais de Nodemailer e PM2, conforme [DEPENDENCIAS_SEGURANCA.md](DEPENDENCIAS_SEGURANCA.md).

### Continuidade: teste de recuperação

Backup criptografado do schema fictício e restauração em outro schema novo passaram, incluindo comparação de DDL/conteúdo e login/logout dos dois perfis na cópia. A origem foi preservada. Suíte daquele lote: 102 testes aprovados; novo build local aprovado após as correções de interface. Procedimento e limitações de DPAPI/recuperação em outro host em [BACKUP_RESTAURACAO.md](BACKUP_RESTAURACAO.md). Os cinco achados visuais foram corrigidos com autorização: **48/48 verificações no Chrome**, 27 capturas, exclusões somente simuladas e contratos de autenticação preservados; ver [REVISAO_VISUAL.md](REVISAO_VISUAL.md).

### Continuidade atual: dependências e entradas da API

Regras de [PLANO_VALIDACAO_API.md](PLANO_VALIDACAO_API.md) aprovadas pelo usuário e implementadas; consultas online npm dos dois projetos também autorizadas. A suíte passou em **108/108**, a integração MySQL isolada confirmou as novas rejeições/limites/Unicode e os fluxos de sessão, e **48/48 verificações visuais** e build passaram após atualizar Vue/Axios/Vite. O harness DOM foi ajustado para as APIs usadas pelo Vue atualizado; os contratos de autenticação permaneceram. Não houve nova migration, envio SMTP ou alteração de produção neste lote. Detalhes e seis alertas restantes do backend em [DEPENDENCIAS_SEGURANCA.md](DEPENDENCIAS_SEGURANCA.md).
