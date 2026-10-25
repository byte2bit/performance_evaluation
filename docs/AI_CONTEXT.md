# Contexto técnico e continuidade

Atualizado em 25/10/2026. Este documento descreve o código inspecionado; não comprova a configuração implantada nem o esquema atual do MySQL.

## Escopo e decisões aprovadas

Sistema único existente, mantido em Vue 3 + Express + MySQL. As regras de trabalho estão em `../AGENTS.md`.

Primeiro lote aprovado pelo usuário nesta sessão:

- Externalizar a configuração SMTP sem modificar credenciais ou configurações de produção.
- Escapar conteúdo dinâmico dos e-mails e encerrar as respostas HTTP.
- Corrigir a resposta duplicada de `GET /registros2`, mantendo uma lista JSON.
- Tratar falhas no frontend e atualizar listas somente após confirmação de exclusão.
- Adicionar testes isolados e documentação de continuidade.

Não foram aprovados neste lote: autenticação, sessões, mudanças de schema, migrations, ativação da submissão de avaliações, deploy ou publicação. Nenhuma dependência foi instalada ou atualizada.

Na preparação do segundo lote, o usuário confirmou: tudo exige login; administradores gerenciam o sistema e avaliadores acessam somente suas próprias avaliações. URLs, proxy e HTTPS de produção ainda não estão definidos. O modelo de `PLANO_AUTENTICACAO.md` foi aprovado e suas cinco dependências foram instaladas. A implementação foi interrompida antes de alterar o código de autenticação, por alertas graves nas dependências preexistentes. O usuário autorizou corrigir as dependências citadas e enviar as alterações ao GitHub; as correções e os testes estão concluídos. Autenticação permanece aprovada para implementação, mas ainda não foi escrita. Ver acompanhamento em `AUDITORIA.md`.

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
| Vue / Vue Router / Pinia | 3.5.14 / 4.5.1 / 3.0.2 |
| Vite / Axios | 6.3.5 / 1.9.0 |
| Tailwind / integração Vite / Flowbite | 4.1.7 / 4.1.7 / 3.1.2 |
| Express / Consign | 4.22.3 / 0.1.6 |
| Knex / mysql / mysql2 | 3.1.0 / 2.18.1 / 3.12.0; `mysql2` instalado, mas não selecionado no `knexfile.js` |
| Passport / passport-jwt | 0.7.0 / 4.0.1; autenticação não ativa nas rotas |
| Nodemailer / Vhost | 6.9.14 / 3.0.2 |
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

O Vhost registra somente `api.nucleoengenharia.com.br` e delega a `index.js`. Hosts desconhecidos seguem para o 404 padrão do Express; não há fallback de aplicação registrado. Não há configuração de `trust proxy` nos arquivos de entrada examinados. O Vhost não comprova isolamento nem autentica o cliente.

`index.js` atribui `app.db` antes do Consign, nesta sequência:

1. `config/passport.js` registra uma estratégia JWT e depende de `app.db` e da configuração local de segredo.
2. `config/middlewares.js` registra CORS e parsing JSON.
3. `api/validation.js` declara funções, mas não as exporta atualmente.
4. `api/` registra os handlers sob `app.api`.
5. `config/routes.js` depende dos handlers carregados e registra as rotas.

O helper SMTP está em `lib/` para não ser tratado pelo Consign como fábrica de módulo da API. Ele não abre conexão SMTP ao ser importado.

CORS permite a origem exata de `FRONTEND_ORIGIN`, cujo padrão é `http://localhost:5173`, e requisições sem `Origin`. Não habilita credenciais. CORS não impede chamadas diretas à API e não substitui autorização.

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

As rotas de login estão comentadas e nenhuma rota ativa usa o middleware Passport. A estratégia e o código parcial de login consultam `colab`; as migrations declaram também uma tabela `users2`. Não se deve ativar esses trechos sem definir e aprovar o modelo real.

Frontend em JavaScript com Composition API e Options API; existe também um composable `.ts` preexistente. Rotas: `/`, `/inserir`, `/registros`, `/colabs`, `/excel`, `/checkall`. Tailwind 4 integra-se pelo plugin Vite e CSS; modais do formulário usam Flowbite JS por composable, com limpeza e sincronização de foco. As telas de listagem ainda contêm marcação de modal de outro padrão, cuja interação em navegador não foi validada nesta etapa.

O formulário permite seleção, notas, justificativas e resumo, mas a submissão continua desativada. A identidade administrativa fixa e o filtro por demandante em `src/js/store.js`/componentes não constituem autenticação ou autorização.

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
