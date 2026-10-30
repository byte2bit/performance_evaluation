# Conexão ao MySQL local com dados existentes

**Atualização E3 concluída:** após aprovação do plano concreto, backup/rollback/mapas e terceira migration própria aplicados em `2026-10-30T02:53:27.225Z`, somente na cópia `inova_nucleo_compat_20261029` em 127.0.0.1:3306. Cinco gerências da conta 12, 100 profissionais e 395 avaliações vinculados; 103 pendentes administrativos. Origem, contas/hashes/perfis e demais campos históricos preservados. Prévia conectada em [localhost:5174/login](http://localhost:5174/login), API 8002, cookies/segredos próprios e SMTP bloqueado. **315 testes e build passaram**; SQL/HTTP e UI anônimos verificados, sem login de contas existentes. [Resultado e operação](PLANO_MAPAS_PREVIA_INOVA.md#resultado-da-execução-e3). Não repetir lotes SQL concluídos; as inspeções e pendências abaixo são históricas.

**Atualização em 29/10/2026, 23:15:** E1 e E2A foram seguidos pelo [E2B aprovado/concluído somente na cópia](PLANO_ATIVACAO_ACESSO_LOCAL.md#resultado-real--29102026). Backup pós-E1, SQL/HTTP em fixtures próprias/limpas e ativação das **25 contas com hashes/perfis preservados** passaram. 298 testes; origem intacta. **API ainda no perfil anterior**, sem login de conta existente automatizado. Faltam responsáveis de gerências, conciliação, obrigatoriedade e launcher/ativação da aplicação. [Roteiro local de revisão](REVISAO_MAPAS_INOVA.md): 395 candidatos binários exatos, 45 só por collation e 58 sem candidato, sem vínculos inferidos. Não repetir lotes concluídos. Inspeções inferiores descrevem o estado inicial/histórico.

## 1. Alvo e resultado da inspeção

- Configuração existente: objeto `db` de `backend/.env`, consumido por `backend/knexfile.js` e `backend/config/db.js`. Não foi alterada nem exibida. O arquivo CommonJS foi interpretado estaticamente, sem executar seu conteúdo ou imprimir credenciais.
- Alvo identificado: **`inova_nucleo`, `127.0.0.1:3306`, MySQL 8.0.44**. A conexão com as credenciais existentes funcionou. O usuário SQL configurado não é `root`; privilégios para criar/restaurar outro schema ainda não foram conferidos.
- Consultas executadas em transação `READ ONLY`, encerrada com `ROLLBACK`; somente metadados e contagens agregadas. Sem conteúdo de nomes, e-mails, notas individuais, comentários, hashes ou senhas em saídas/documentação.
- A API em uso continuou com o perfil isolado anterior em `127.0.0.1:50470`. O fato de `.env` já apontar ao banco local não significa que esse launcher utilize sua configuração.

| Dados | Resultado |
| --- | --- |
| Contas `users2` | 25, todas sem exclusão lógica; duas marcadas como administradoras |
| Formatos de senha | 25 bcrypt, zero Argon2id; nenhum hash foi exibido |
| Profissionais `colab` | 100 |
| Avaliações `registros` | 498 |
| Histórico `migrations` | Sete entradas; não corresponde ao baseline de sete migrations do perfil isolado |
| Outras tabelas/objetos visíveis | Quatro além das cinco tabelas existentes dentre as oito esperadas; conteúdo/engines/objetos especiais ainda não examinados |

## 2. Incompatibilidades comprovadas

| Área | Evidência | Consequência para a troca direta |
| --- | --- | --- |
| Autenticação | `users2.active` e `session_version` ausentes; `sessions` e `auth_rate_limits` ausentes | Passport/sessões/limitadores atuais não estão provisionados nesse alvo. |
| Senhas | Todas as contas têm prefixo bcrypt; `createPasswords().verify` atual aceita somente Argon2id | As senhas existentes não são aceitas pelo modelo atual. Não converter, redefinir ou ativar contas em massa. |
| Gerências | `gerencias`, `colab.gerencia_id` e `colab.deletedAt` ausentes | O modelo de responsabilidade atual por gerência não está representado. |
| Histórico | `registros.colab_id` ausente | As consultas/gravações atuais dependem dessa coluna. |
| Histórico de schema | `20250401232552_create_liderancas_at_table_registros.js` registrado no banco, sem arquivo correspondente no diretório atual de migrations ou no histórico local consultado | Não executar `knex migrate:latest` nem desabilitar a validação/mudar o ledger para contornar a divergência. Outros refs/remotos não foram pesquisados. |
| Tipos existentes | Observações e itens são `TEXT`, vários campos aceitam NULL; `registros.liderancas` já existe | Preservar tipos, nulabilidade e conteúdo; não reduzir a VARCHAR(255) ou recriar tabelas. Limites da API para novas gravações são assunto distinto dos dados históricos. |
| FKs consultadas | Não há FKs declaradas nas tabelas `colab`/`registros` no catálogo consultado | O aplicador antigo que remove uma FK textual presumida não pode ser usado diretamente. Dependências recebidas de outras tabelas ainda precisam de inspeção. |
| Segredos de autenticação | `SESSION_SECRET` e `AUTH_RATE_LIMIT_SECRET` não estão definidos no processo de inspeção | Disponibilidade no futuro launcher ainda precisa ser configurada/verificada de forma protegida. Não reutilizar automaticamente segredos de outro perfil. |

Os arquivos relevantes examinados foram `knexfile.js`, `config/db.js`, `index.js`, `config/passport.js`, autenticação em `lib/auth`, as migrations de sessão/limites/vínculos/gerências e o reforço de gerência obrigatória. O bootstrap normal não executa migrations automaticamente, mas não deve ser iniciado sobre esse schema incompleto.

## 3. Correspondências que exigem revisão

- Zero grupos com nomes de profissionais duplicados no cadastro atual, segundo a collation do banco. Isso não comprova a identidade histórica dos registros.
- As **100 atribuições** não têm correspondência binária exata com e-mail de conta não excluída. Esse resultado não prova inexistência de responsáveis: diferenças de representação, nomes ou regras antigas não foram resolvidas. Não conceder acesso por aproximação.
- Cinco rótulos não vazios distintos de gerência. Não foram encontrados rótulos com mais de um texto distinto de demandante. Isso não determina quais IDs de contas devem ser seus responsáveis.
- **440 avaliações** têm um único candidato por comparação do nome armazenado; **58 não têm candidato** no cadastro atual. Nenhuma associação foi efetuada. Não criar profissionais fictícios de preenchimento nem descartar esses históricos sem mapa/regra aprovados.
- Há **25 grupos textuais nome/mês** com mais de um registro. Não foram classificados como duplicidades do mesmo profissional por ID. Preservar todas as avaliações; o bloqueio mensal novo não é uma instrução de exclusão retroativa.

O modelo atual já permite leitura administrativa de avaliações com vínculo nulo. Entretanto, a migration 13 histórica exige conciliação completa antes de remover a FK textual. Portanto, o caminho de transição desse alvo deverá ser planejado especificamente; não reproduzir os mapas, fixtures ou aplicadores do perfil anterior.

## 4. Backup e cópia — aprovados e concluídos, sem migrations

| Papel | Escopo proposto |
| --- | --- |
| Origem, somente leitura | `127.0.0.1:3306/inova_nucleo` |
| Cópia nova exclusiva | `127.0.0.1:3306/inova_nucleo_compat_20261029` |
| Artefatos protegidos | Novo diretório externo sob `%LOCALAPPDATA%/EvaluationDev/inova-nucleo-compat-20261029`, com ACL restrita e backup criptografado; caminhos existentes serão recusados |
| Dados admitidos | Os dados fictícios de desenvolvimento confirmados pelo usuário; preservar também os demais objetos/tabelas após inventário |
| Fora desse lote | Migrations em qualquer alvo, troca da API, login sobre a origem, criação/ativação de contas, alteração de hashes/vínculos, SMTP, limpeza, domínio definitivo ou produção |

Passos aprovados e executados para esse alvo:

1. Confirmar servidor/porta/UUID e schema, privilégios disponíveis, engines, views/triggers/rotinas/eventos, índices/FKs, demais objetos e ausência de escritores sobre a origem. Interromper diante de incompatibilidade ou mudança de alvo; não alterar grants/configurações do servidor automaticamente.
2. Preparar o armazenamento restrito e a chave de backup protegida localmente, usando o padrão de criptografia já validado no projeto. Não usar o protótipo de frase-senha como exportação operacional, nem acessar o cofre do perfil isolado anterior para esse novo alvo.
3. Gerar backup integral criptografado, sem SQL em arquivo de texto puro ou senha em argumentos/logs. Importar somente no schema novo aprovado, recusando schema/artefatos existentes. Nenhuma tabela do banco original será criada, removida ou alterada.
4. Conferir DDL/conteúdo e contagens, incluindo as 25 contas e seus hashes, 100 profissionais, 498 avaliações e outros objetos. Comparar novamente a origem; guardar somente resultados sanitizados no Git, mantendo dados/backup/chave fora do repositório.
5. Preservar cópia e backup para revisão. Preparar, sem aplicar, a trilha específica de compatibilidade e o inventário privado de candidatos para o mapa. Não conectar a aplicação com permissão de escrita à cópia antes do próximo escopo aprovado.

O usuário autorizou esse novo alvo após a apresentação deste plano. A autorização permanece restrita a backup/cópia/inventário, sem migrations, hashes/vínculos ou ativação. O banco/caminhos agora existem; não repetir `CreateCopy`, sobrescrevê-los ou escolher outro destino automaticamente.

## 5. Lotes posteriores, ainda sem autorização

**Schema/compatibilidade em cópia:** propor mudanças aditivas, preservando TEXT/NULL, histórico das migrations, hashes e avaliações. Avaliar uma trilha de compatibilidade própria desse alvo, sem inserir/retirar migrations no diretório compartilhado que invalidem o baseline 14 já validado. Não fabricar execução de migrations históricas nem alterar seu ledger. A decisão de trilha/ledger será apresentada antes de implementar.

**Acesso:** decidir explicitamente entre compatibilidade controlada de login bcrypt e política de atualização de hash, ou ativação/redefinição individual aprovada pelo fluxo existente. Uma conta sintética de ensaio na cópia poderá ser proposta separadamente, sem alterar as 25 restauradas. Não desativar Passport/CSRF/autorização para conseguir exibir os dados.

**Vínculos:** revisar responsáveis das cinco gerências, profissionais e 498 avaliações com mapa aprovado. Resolver o tratamento dos 58 registros sem candidato antes de escolher o aplicador/trilha; manter dados sem correspondência preservados e administrativos quando esse modelo for explicitamente aprovado. Não conceder visibilidade por nome/e-mail.

**Ativação na origem:** somente após testes na cópia e aprovação específica de schema/mapa/acesso. Preparar novo backup, sequência de aplicação, recuperação diante de DDL com commits implícitos e reversão de configuração. Preservar o perfil anterior; não mover seus dados ou reaplicar seus aplicadores em `inova_nucleo`.

Critérios para considerar o pedido concluído: API e frontend usando o alvo aprovado, esquema compatível, acesso autenticado e autorizado validado com contas fictícias aprovadas, 498 avaliações preservadas, responsáveis/vínculos revisados, nenhuma perda de tipos/conteúdo, rollback documentado e credenciais protegidas. Por ora foi validada **a conexão técnica em leitura**, não a integração da aplicação.

## 6. Inspeção inicial e resultado da execução autorizada

Foram executadas duas inspeções SQL em transações somente leitura, finalizadas com rollback, e leitura estática de configuração/código. Sem DML, DDL, migrations, login, SMTP, mudança de conexão ou credenciais. Não houve execução de testes contra esse banco. Os testes anteriores do sistema não comprovam compatibilidade com esse novo alvo. Nenhum dado individual foi exibido.

Esse parágrafo descreve a inspeção inicial. O preflight posterior identificou **nove tabelas MyISAM**, portanto aquelas transações não representam um snapshot consistente transacional dos dados. Na execução aprovada foi usado **`LOCK TABLES ... READ` em todas as nove tabelas da origem**, sem `READ LOCAL`, sem bloqueio global e sem `--single-transaction`. Isso impediu alterações das tabelas durante o dump/restauração/conferência. [Manual MySQL 8.0: mysqldump e MyISAM](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html).

### Resultado em 29/10/2026

- **16:45, horário de São Paulo:** cópia concluída com **9 tabelas/680 linhas**, preservando 25 contas/hashes, 100 profissionais, 498 avaliações e os dados das outras tabelas. DDL, tipos, charsets/collations, índices e conteúdo coincidentes; origem novamente comparada sob bloqueio de leitura. Não houve conversão de engine, DML na origem ou aplicação de migrations.
- Criados `backend/scripts/local-mysql-copy.js` e `.ps1`, com parse estático do CommonJS, guardas fixas de fonte/destino/UUID, limite de volume, verificação de privilégios, leitura bloqueada e senha somente em opção temporária na pasta protegida. Dump SQL permaneceu em memória, backup AES-256-GCM relido/autenticado, e somente schema novo autorizado foi criado. Não foram concedidos novos privilégios nem alteradas credenciais.
- Artefatos fora do Git em `%LOCALAPPDATA%/EvaluationDev/inova-nucleo-compat-20261029`: `profile.json`, `secrets.dpapi`, `backup.evalbackup` (**174.355 bytes**), `manifest.evalinventory`, `copy-report.json`, `candidates.evalinventory`, `review-report.json`. Chaves de backup/inventário independentes, protegidas por DPAPI CurrentUser. Pasta com herança desativada, acesso somente ao usuário atual/SYSTEM; zero arquivos `.cnf` temporários ao final. Nenhum pacote de frase-senha operacional foi utilizado/exportado.
- **16:51:** inventário da cópia concluído via `local-mysql-review.js`, com conferência do manifesto e das nove tabelas antes/depois. Cinco grupos textuais G01–G05 com 40/23/16/20/1 profissionais e zero candidatos de conta pelas comparações usadas. **440 avaliações com um candidato, 58 sem candidato, zero ambíguas e zero associações aprovadas/aplicadas**. Dados individuais não foram impressos; detalhes sem senhas ficaram criptografados.
- Driver `mysql` do backend consultou a cópia com sucesso, sem carregar aplicação/Passport ou realizar login. A API principal continua no perfil anterior; frontend `/registros` respondeu 200 e `/session` sem sessão respondeu 401.
- **242/242 testes aprovados**, zero falhas/skips; 15 casos novos de cópia/inventário. Parser PowerShell e diff conferidos. Sem instalação ou alteração de dependências, build/Chrome novos, SMTP, domínio definitivo, commit/push ou deploy.

Comandos históricos executados, **não repetir a criação ou o inventário com os artefatos existentes**:

```powershell
./backend/scripts/local-mysql-copy.ps1 -Action CreateCopy -Confirmation 'inova_nucleo:3306->inova_nucleo_compat_20261029:copy-only'
./backend/scripts/local-mysql-copy.ps1 -Action InspectCopy -Confirmation 'inova_nucleo:3306->inova_nucleo_compat_20261029:copy-only'
```

A cópia permanece com o schema legado/MyISAM, sem autenticação ou vínculos novos. [Plano E1 de compatibilidade](PLANO_COMPATIBILIDADE_INOVA.md) preparado, **ainda sem autorização para implementar/aplicar migrations**. O pedido de conectar a aplicação continua pendente dessas etapas; não declarar a aplicação integrada apenas porque o driver conectou.
