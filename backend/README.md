# Backend — API de avaliação de desempenho

API Express do [Sistema de Avaliação de Desempenho](../README.md), com Knex/MySQL, autenticação por Passport Local e sessões persistentes. Implementa as regras de acesso e validação usadas pela interface Vue.

## Funcionalidades e acesso

- Login, consulta da sessão, logout e troca de senha autenticada.
- Cadastro e consulta de colaboradores, consulta e gravação de avaliações e exclusões administrativas.
- Avaliadores limitados aos profissionais/registros associados ao e-mail canônico de sua conta; administradores consultam todos.
- Identidade da avaliação derivada da sessão e validação do profissional em transação.
- Validação de notas, média, nível, desconto, textos, IDs e paginação.
- Envio administrativo de templates HTML individuais ou em grupo por Nodemailer, com conteúdo dinâmico escapado e configuração externa.
- CLI de contas, migrations Knex e ferramentas para validação e recuperação em MySQL isolado.

A autenticação e a cadeia de 11 migrations foram validadas em MySQL 8.0.44 isolado com dados fictícios. Produção depende de configuração, schema e provisionamento próprios. A submissão da avaliação no frontend continua desativada, embora os endpoints de gravação existam.

## Endpoints

| Método e caminho | Função | Acesso |
| --- | --- | --- |
| `GET /csrf-token` | Obter token CSRF | Público, limitado |
| `POST /signin` | Autenticar por e-mail/senha | Público, com CSRF e limitação |
| `GET /session` | Consultar identidade da sessão | Autenticado |
| `POST /signout` | Encerrar sessão | Autenticado, com CSRF |
| `POST /change-password` | Trocar senha e revogar sessões | Autenticado, com CSRF e limitação |
| `GET /registros` | Listar avaliações no escopo da conta | Autenticado |
| `POST /registros` | Gravar avaliação | Autenticado, com CSRF |
| `GET /registros2` | Listar avaliações com paginação e escopo | Autenticado |
| `POST /registros2` | Gravar avaliação | Autenticado, com CSRF |
| `GET /registros/:id` | Consultar avaliação no escopo da conta | Autenticado |
| `DELETE /registros/:id` | Excluir avaliação | Administrador, com CSRF |
| `GET /colab` | Listar colaboradores no escopo da conta | Autenticado |
| `POST /colab` | Cadastrar colaborador | Administrador, com CSRF |
| `GET /colab/:id` | Consultar colaborador no escopo da conta | Autenticado |
| `DELETE /colab/:id` | Excluir colaborador | Administrador, com CSRF |
| `POST /mail` e `POST /mail2` | Enviar mensagem de avaliação | Administrador, com CSRF e limitação |

`/registros2` devolve uma lista JSON com `page=1`, `limit=25` e teto de 100 itens por página; `/registros` mantém a lista completa no escopo autorizado. Notas aceitas: 1 a 5 em passos de 0,5, com média/nível/desconto consistentes. Entradas inválidas retornam 400; detalhes e payload fictício em [PLANO_VALIDACAO_API.md](../docs/PLANO_VALIDACAO_API.md).

## Autenticação e segurança

Contas ficam em `users2`, separadas dos colaboradores. Senhas usam Argon2id; não há cadastro público, JWT ativo ou senha padrão. Sessões são persistidas pelo `connect-session-knex`, com expiração por inatividade/prazo absoluto e verificação de revogação.

Mutações exigem origem permitida, JSON e token CSRF. CORS credenciado usa a origem exata configurada; a autorização é aplicada nas rotas Express. Cookies são HttpOnly, com Secure e escopo restrito na configuração de produção. HTTPS/proxy e origens efetivamente implantadas continuam não confirmados. Consulte a configuração externa, variáveis obrigatórias e contratos na seção 16 de [PLANO_AUTENTICACAO.md](../docs/PLANO_AUTENTICACAO.md).

A CLI `scripts/accounts.js` suporta `create-admin`, `create-evaluator`, `disable`, `activate`, `promote` e `demote`. Exige terminal interativo, configuração de banco explícita e confirmação do destino; senhas são lidas sem eco. Sua execução modifica contas e exige autorização para o ambiente escolhido.

## Estrutura e inicialização

```text
index.js       Aplicação Express e entrada HTTP direta na porta 8001
api.js         Wrapper Vhost, com entrada HTTP direta na porta 8000
config/        Banco, Passport, middlewares e rotas
api/           Handlers carregados pelo Consign
lib/           Autenticação, validação, registros e helper SMTP
migrations/    Cadeia de alterações do schema
scripts/       CLI e ferramentas opt-in de ambiente isolado
test/          Testes em memória, mocks e regressões
```

`index.js` atribui `app.db` antes de carregar, via Consign: `config/passport.js` → `config/middlewares.js` → `api/validation.js` → `api/` → `config/routes.js`. Helpers em `lib/` ficam fora do autoload.

`api.js` atende somente o hostname de exemplo `api.mysite.com`, delegando à mesma aplicação; hosts desconhecidos seguem para 404. Esse hostname foi ajustado pelo usuário no código e não comprova DNS ou configuração implantada. As entradas examinadas não configuram `trust proxy`. O script PM2 inicia `index.js`, sem passar pelo wrapper Vhost. Essas entradas HTTP não comprovam a topologia ou terminação TLS de produção.

| Script existente | Comportamento |
| --- | --- |
| `npm start` | Executa Nodemon; o bootstrap normal carrega a configuração existente do banco. |
| `npm run production` | Executa PM2 sobre `index.js` com o nome `back-projetos`; é comando operacional, fora do fluxo de teste local. |

Para desenvolvimento seguro com banco fictício, use o launcher `isolated-mysql.ps1 -Action Serve`, conforme o [README principal](../README.md#desenvolvimento-local). Não iniciar o bootstrap normal para validar isolamento.

## Configuração SMTP

| Variável externa | Uso |
| --- | --- |
| `SMTP_USER` e `SMTP_PASSWORD` | Obrigatórias; sem credenciais padrão. |
| `SMTP_HOST` | Host SMTP; padrão `smtp.office365.com`. |
| `SMTP_PORT` | Porta de 1 a 65535; padrão 587. |
| `SMTP_SECURE` | `true` para TLS implícito; demais valores usam STARTTLS obrigatório. |

O helper lê `process.env`, sem carregar SMTP automaticamente do arquivo CommonJS `.env`. Sem configuração válida, retorna 503 sem criar transporte. Falhas de preparação/envio retornam 502 genérico; 204 significa aceitação pelo transporte, sem comprovar entrega final. Há timeouts e nenhum retry automático. Remetentes e cópias existentes exigem autorização da conta SMTP. Nenhum envio real integra a suíte de testes.

## Testes e ferramentas isoladas

Na raiz do repositório:

```powershell
node --test backend/test/*.test.js
```

A suíte cobre autenticação/autorização/CSRF, sessões, validação, handlers, e-mail com mocks, dependências e proteções dos runners. Não carrega o banco de produção nem envia e-mails reais.

Os testes de compatibilidade também compilam os templates com Nodemailer real e endereços fictícios, sem entrega SMTP, verificando envelope/remetente, BCC, escape HTML, parser e opções TLS. O parser de argumentos do PM2 e as barreiras de isolamento têm testes sem daemon.

O ciclo real do PM2 é opt-in:

```powershell
node backend/scripts/isolated-pm2.js
```

Esse runner cria aplicação e perfil fictícios novos no diretório temporário e executa início, reinício, parada, exclusão e encerramento do daemon exclusivo. Não inicia `index.js` nem lê `.env`. No Windows, `PM2_HOME` sozinho ainda usa pipes globais: o harness substitui os caminhos somente no cache de módulos dos filhos, antes de carregar clientes, e permite comunicação apenas pelos pipes exclusivos. Conexões TCP/HTTP/HTTPS são bloqueadas; variáveis do shell são fornecidas por allowlist, sem segredos da aplicação.

O perfil temporário e seu relatório são preservados para inspeção; os processos de teste são encerrados. A validação cobre modo fork local, sem certificar cluster, startup/resurrect, integração com PM2.io ou operação em produção. A consulta de métricas via WMI foi negada pelo ambiente e não é considerada aprovada. [Evidência e reversão](../docs/DEPENDENCIAS_SEGURANCA.md#atualizacao-principal-local-nodemailer-e-pm2).

As ações `Validate`, `RecoveryTest` e `VisualReview` são opt-in. `Validate` grava fixtures e pode aplicar migrations no perfil isolado; `RecoveryTest` cria backup criptografado e schema de restauração. Elas não são consultas somente leitura. Leia [AMBIENTE_ISOLADO.md](../docs/AMBIENTE_ISOLADO.md), [BACKUP_RESTAURACAO.md](../docs/BACKUP_RESTAURACAO.md) e [REVISAO_VISUAL.md](../docs/REVISAO_VISUAL.md) antes de executar.

Recuperação de senha por e-mail, purga de expirados, vínculos legados e configuração operacional permanecem pendentes. Acompanhe [PLANO_EVOLUCAO.md](../docs/PLANO_EVOLUCAO.md) e [DEPENDENCIAS_SEGURANCA.md](../docs/DEPENDENCIAS_SEGURANCA.md).
