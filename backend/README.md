# Backend — API de avaliação de desempenho

**Senha da conta 12:** posteriormente a E3, redefinida a pedido do usuário somente na cópia local, com backup cifrado, Argon2id e revogação por versão. E-mail e senha aparecem apenas na janela local; reabrir com `./backend/scripts/local-inova-reset-password.ps1 -Action Show` na raiz, PowerShell 7. Não repetir Reset/ResumePrepared. [Resultado e detalhes](../docs/REDEFINICAO_CONTA_LOCAL.md).

**Prévia da cópia local E3 em execução:** API `http://localhost:8002`, frontend [localhost:5174/login](http://localhost:5174/login), banco exclusivo `127.0.0.1:3306/inova_nucleo_compat_20261029`. Cinco gerências da conta 12, 100 profissionais e 395 avaliações vinculados; 103 pendentes administrativos. Três migrations próprias, origem/histórico/hashes preservados. Launcher `scripts/local-inova-preview.ps1` compõe bcrypt/rehash somente nesse perfil, usa cofre/cookie próprios e bloqueia SMTP; bootstrap padrão segue Argon2id. **315 testes e build passaram**, sem autenticar contas existentes. [Execução, comandos e limites](../docs/PLANO_MAPAS_PREVIA_INOVA.md#resultado-da-execução-e3). O parágrafo abaixo descreve o perfil anterior: a API 8001 respondeu na conferência E3; o frontend 5173 não respondeu e não foi iniciado/parado pelo lote.

**Perfil principal anterior:** gestão por gerências ativada no MySQL isolado original, com 14 migrations. A 14ª tornou `colab.gerencia_id` obrigatório, após autorização, backup/restauração e SQL/HTTP na cópia antes da origem. API em localhost:8001, MySQL isolado em 127.0.0.1:50470; dois profissionais na Gerência de Testes do avaliador atual, oito avaliações e contas/demais campos preservados. O `Serve` desse perfil exige estrutura/baseline 14; a prévia E3 tem launcher/trilha próprios. [Modelo, endpoints, concorrência e evidências do perfil anterior](../docs/PLANO_GESTAO_GERENCIAS.md).

API Express do [Sistema de Avaliação de Desempenho](../README.md), com Knex/MySQL, autenticação por Passport Local e sessões persistentes. Implementa as regras de acesso e validação usadas pela interface Vue.

## Funcionalidades e acesso

- Login, consulta da sessão, logout e troca de senha autenticada.
- Cadastro e consulta de colaboradores, consulta e gravação de avaliações e exclusões administrativas.
- Avaliadores consultam profissionais atualmente atribuídos ao e-mail canônico de sua conta e todo o histórico ligado aos IDs desses profissionais; administradores consultam todos. Autoria anterior não concede acesso.
- Identidade da avaliação derivada da sessão e validação do profissional em transação.
- Validação de notas, média, nível, desconto, textos, IDs e paginação.
- Envio administrativo de templates HTML individuais ou em grupo por Nodemailer, com conteúdo dinâmico escapado e configuração externa.
- CLI de contas, migrations Knex e ferramentas para validação e recuperação em MySQL isolado.

A autenticação e a cadeia de 14 migrations foram validadas em MySQL 8.0.44 isolado com dados fictícios. Produção depende de configuração, schema e provisionamento próprios. A submissão da avaliação no frontend continua desativada, embora os endpoints de gravação existam.

O vínculo por `registros.colab_id` tem a **12ª migration aplicada no perfil isolado** após backup/restauração e testes reais em cópia. FKs, collation, transferência de acesso e concorrência passaram; as oito avaliações anteriores permaneceram nulas, sem associação automática. A conciliação desses registros e a aplicação em outros ambientes exigem etapas próprias. [Plano e evidências](../docs/PLANO_VINCULOS.md).

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

Os dois POSTs permitem somente uma avaliação por `colab_id` no mês da gravação, independentemente do avaliador. Duplicidade retorna 409; sucesso permanece 204. A transação usa bloqueio exclusivo do profissional e `READ COMMITTED`, sem migration ou remoção de duplicidades antigas. [Calendário, concorrência e limites](../docs/REGISTROS_HISTORICO.md).

Avaliações incluem `colab_id`; `demandante` preserva o autor original. Para novas gravações, enviar o ID e nome do profissional. Clientes antigos podem enviar somente nome quando há um único correspondente autorizado; ambiguidade ou conflito nome/ID retorna 409, sem gravação. ID inexistente/fora de escopo retorna 403, sem fallback por nome. Leituras de registros sem vínculo são administrativas até conciliação. A consulta do responsável atual ocorre na mesma instrução SQL, antes da paginação.

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

`Inventory` é somente leitura no MySQL e grava detalhe criptografado externo. `ReconcileReviewed` é uma operação de escrita específica do mapa confirmado R01–R08 → P01: os oito vínculos já foram aplicados no perfil fictício, após backup/cópia e testes. Não repetir o lote, inferir novos mapas ou usar `ValidateLinks` no schema com 12 migrations. [Autorização, comandos históricos e evidências](../docs/REVISAO_CONCILIACAO.md#aplicação-confirmada-e-executada).

Recuperação de senha por e-mail, purga de expirados, revisão de dados em outros alvos e configuração operacional permanecem pendentes. Acompanhe [PLANO_EVOLUCAO.md](../docs/PLANO_EVOLUCAO.md) e [DEPENDENCIAS_SEGURANCA.md](../docs/DEPENDENCIAS_SEGURANCA.md).

## Compatibilidade do MySQL local legado

O lote E1 foi aprovado apenas para a cópia fictícia `127.0.0.1:3306/inova_nucleo_compat_20261029`. As duas migrations específicas ficam em `compat/inova/migrations`, fora da cadeia compartilhada. A aplicação continua no perfil anterior; não apontar `knexfile.js` à cópia nem usar `knex migrate:latest` para este procedimento.

`local-mysql-copy.ps1 -Action PreflightCompatibility` confere backup, baseline, destino, concorrentes e privilégios sem DDL; `ApplyCompatibility` usa a mesma conferência antes de criar o ledger próprio/aplicar. Ambas exigem a confirmação literal descrita no [plano E1](../docs/PLANO_COMPATIBILIDADE_INOVA.md#implementação-aprovada-e-conferência-real--29102026) e acesso ao cofre DPAPI já existente. Não repetir criação/inventário anteriores.

Após o bloqueio inicial por `REFERENCES`, nova conferência retornou `ready=true` e **E1 foi aplicado/validado somente na cópia**: duas migrations, três tabelas InnoDB, três FKs e rollback reais. Dados/hashes/ledger legado e origem preservados; contas ainda inativas e nenhum vínculo aplicado. O runner não alterou privilégios. **Não repetir essas ações neste alvo**, nem criar/inventariar/apagar novamente; os artefatos e o schema preparado devem ser preservados. Os 256 testes daquela preparação foram sucedidos pelos 285 da implementação E2A abaixo.

### Compatibilidade de senhas — E2A

[E2A aprovado e concluído](../docs/PLANO_ACESSO_MYSQL_LOCAL.md#resultado-de-e2a-e-contrato-interno--29102026), originalmente em código e dados sintéticos. `createCredentials` é usado pelo Passport; o default continua Argon2id, sem rehash no login comum. A comparação `$2a$10$` exige adaptador explícito `createLegacyBcrypt`, que tem fila/tempo/workers limitados e `close()`. Em E3, somente o launcher específico da prévia local passou a injetá-lo; bootstrap padrão e perfil isolado permanecem sem o adaptador. Não habilitar por campo HTTP ou variável global.

Com o adaptador, login válido de conta ativa prepara Argon2id antes do lock, relê/bloqueia/confere a conta em transação, atualiza hash/versão condicionalmente e somente então permite criar sessão. Sem ativação, reset ou alteração de perfil. Senhas legadas são limitadas a 72 bytes UTF-8, sem truncamento/NUL; formatos diferentes seguem rejeitados. Novas senhas continuam com a política atual.

E2A passou com **285 testes** (29 novos), criptografia e HTTP reais sobre fixtures públicas/sintéticas e DB/SQL simulados. Não houve conexão operacional naquele lote. E2B posteriormente foi aprovado/aplicado conforme resultado abaixo. Não usar `accounts.js activate` para preservar senha, pois esse comando a redefine.

### E2B aplicado na cópia

[E2B concluído em 29/10/2026, 23:15](../docs/PLANO_ATIVACAO_ACESSO_LOCAL.md#resultado-real--29102026): backup atualizado/autenticado de 14 tabelas/683 linhas, SQL/HTTP real em três tabelas próprias e ativação das **25 contas existentes** com hashes/perfis preservados e versões um. Outros dados e origem intactos. **298 testes passaram**; dois waiters InnoDB e respostas 200/401 observados no ensaio. As três tabelas foram removidas, e servidor/worker/pools encerrados.

Ferramentas: `local-mysql-access.js`, `local-access-fixtures.js`, `local-access-guard.js` e ações opt-in `PreflightAccess`/`ActivateAccess`. Os comandos já foram executados; **não repetir** com esse alvo/artefatos. Nenhuma conta existente foi autenticada, a API principal não foi trocada e o bootstrap padrão continua sem adaptador legado. Backup/manifests permanecem protegidos fora do Git; sem grants, novas migrations, dependências ou SMTP.

**E3 aprovado e concluído:** cinco gerências sob a conta 12, 100 profissionais e 395 avaliações vinculados, preservando os 103 restantes (45 por collation/58 sem candidato). Terceira migration própria aplicada e prévia separada ativa em 5174/8002. [Resultado, arquivos, evidências e operação](../docs/PLANO_MAPAS_PREVIA_INOVA.md#resultado-da-execução-e3), [roteiro de revisão](../docs/REVISAO_MAPAS_INOVA.md). Não repetir mapas/migrations, inferir vínculos adicionais, alterar autoria ou apagar histórico.
