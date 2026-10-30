# Ponto de retomada

## Checkpoint para continuar depois — 30/10/2026

Usuário solicitou preparar a retomada e enviar os arquivos ao GitHub. Destino conferido: `byte2bit/performance_evaluation`, branch `master`. Este checkpoint reúne as mudanças de Registros, regra mensal, recuperação portável em memória, compatibilidade/acesso/mapas da cópia MySQL e redefinição solicitada da conta 12. Código, testes, documentação e evidências sanitizadas compõem o envio; banco, cofres, backups, `.env`, logs, caches e capturas locais ficam fora do Git. A `.gitignore` também passou a recusar os formatos operacionais privados.

**Última validação executada:** 321/321 testes aprovados, zero falhas/skips, após a redefinição; nenhum código de execução mudou depois dessa suíte. Build e revisões de Registros/SQL/HTTP/UI foram executados nos lotes documentados abaixo; não precisam ser repetidos apenas para retomar a conversa. Revisão do diff, JSON, sintaxes e conteúdo pendente realizada para o checkpoint. A busca local por formatos de credenciais/dados individuais não encontrou ocorrências; a tentativa de scanner do GitHub ficou indisponível por ausência de GitHub Advanced Security, sem declarar varredura remota aprovada.

Para retomar nesta máquina:

1. Ler este bloco e as duas atualizações seguintes. Conferir Git e serviços antes de iniciar duplicatas; a disponibilidade descrita abaixo é a última observação, não uma garantia futura.
2. Usar `local-inova-preview.ps1 -Action Status` com a confirmação E3 abaixo; se necessário, trocar somente a ação por `Start`. A prévia usa frontend **5174** e API **8002**, conectados exclusivamente à cópia `127.0.0.1:3306/inova_nucleo_compat_20261029`. Este checkpoint não solicitou nem executou parada dos serviços.
3. Para consultar as credenciais redefinidas da conta **12**, usar `./backend/scripts/local-inova-reset-password.ps1 -Action Show` no PowerShell 7. Não executar Reset/ResumePrepared novamente. Não pedir senha pelo chat.
4. Escolher um próximo escopo pequeno: revisar os **103 registros pendentes**; implementar persistência dos critérios e submissão ainda desativada; ou planejar o pacote operacional de recuperação portável, conforme preferência anterior de frase-senha guardada separadamente. Nenhum desses trabalhos foi iniciado por este checkpoint.

**Não repetir** criação/restauração, E1, E2B, ApplyMaps, VerifyScopes ou migrations/down nos alvos já concluídos. Não modificar a origem `inova_nucleo`, trocar o perfil 50470 ou testar em domínio definitivo. Sem deploy. O GitHub guarda o projeto e relatórios sanitizados; os dados e as chaves DPAPI permanecem no perfil protegido desta máquina. Retomada em outro computador exige planejamento de recuperação, pois o clone sozinho não restaura banco ou segredos. O hash do commit será informado na conversa; esta seção não tenta incluir o hash do próprio commit.

## Atualização posterior — senha da conta 12 redefinida

Usuário pediu redefinição e confirmou **ID 12**, somente na cópia local. Concluída em `2026-10-30T03:36:56.492Z`, com backup criptografado autenticado, Argon2id e incremento de versão de sessão. Outras 24 contas, identidade/perfil/vínculos e origem preservados. Credenciais entregues apenas em janela local/cofre DPAPI; para reabrir, executar `./backend/scripts/local-inova-reset-password.ps1 -Action Show`. **Não repetir Reset/ResumePrepared.** Prévia 5174/8002 segue ativa, 25 contas habilitadas (24 bcrypt/uma Argon2id). [Resultado, diagnóstico da tentativa revertida e operação](REDEFINICAO_CONTA_LOCAL.md), [relatório](evidencias/conexao-mysql-local/password-reset-account12-20261030-report.json). As afirmações inferiores de preservação dos 25 hashes descrevem o estado anterior a esta redefinição explícita.

## Estado atual — E3 concluído e prévia em execução

Usuário autorizou este lote com “prossiga” após o [plano concreto E3](PLANO_MAPAS_PREVIA_INOVA.md). Backup atualizado de 14 tabelas/683 linhas, ensaio revertido e mapa aplicados em `2026-10-30T02:53:27.225Z`, **somente na cópia `127.0.0.1:3306/inova_nucleo_compat_20261029`**. Cinco gerências sob a conta 12, 100 profissionais e 395 avaliações vinculados; 103 avaliações continuam sem vínculo e administrativas (45 por collation/58 sem candidato). Terceira migration própria aplicada: gerência unsigned obrigatória; sete entradas legadas, 25 contas/hashes/perfis, campos históricos e origem preservados. Conta 12 já era administradora; SQL com três atores distintos confirmou 498/498/0 leituras permitidas.

**Prévia disponível: [http://localhost:5174/login](http://localhost:5174/login), API http://localhost:8002.** Cofre e cookie `evaluation.inova.local.sid` próprios, rehash bcrypt → Argon2id apenas após senha válida nesse launcher e SMTP bloqueado. Nenhum login de conta existente automatizado; o usuário digita suas credenciais atuais somente na interface. **315/315 testes, build, HTTP anônimo/CSRF/CORS, saúde dos dois processos e revisão visual anônima 1440/390 passaram.** A abertura no navegador padrão foi solicitada; capturas de QA headless ficaram no cache ignorado.

Para conferir ou retomar os serviços, no PowerShell 7 na raiz:

```powershell
./backend/scripts/local-inova-preview.ps1 -Action Status -Confirmation 'inova_nucleo_compat_20261029:3306:maps-e3-owner12-exact395-preview'
```

Trocar somente `Status` por `Start` para iniciar/reconhecer a prévia, `Check` para validar o alvo ou `Stop` para encerrar somente seus processos identificados. Não executar novamente `VerifyScopes` (relatório exclusivo já gravado), ApplyMaps, E1, E2B, criação/restauração ou down. Backup/manifests/cofre externos preservados em `%LOCALAPPDATA%/EvaluationDev/inova-nucleo-compat-20261029`, ACL restrita, nenhum CNF/falha E3. Startup não exige que hashes/versões/contagens continuem congelados após uso legítimo.

[Resultado, arquivos, comandos e limites](PLANO_MAPAS_PREVIA_INOVA.md#resultado-da-execução-e3), [resumo sanitizado](evidencias/conexao-mysql-local/maps-e3-validation-summary.json). Origem e perfil 50470 não foram trocados; API anterior 8001 respondeu, frontend 5173 não respondeu na conferência e não foi iniciado/parado neste lote. Revisar os 103 pendentes ou alterar a origem exige novo escopo. **As seções inferiores registram etapas históricas e suas pendências à época.**

## E2B aprovado/aplicado na cópia — 29/10/2026, 23:15

Usuário solicitou “continue” após a proposta concreta do [plano E2B](PLANO_ATIVACAO_ACESSO_LOCAL.md), autorizando backup, criação/limpeza das três tabelas de ensaio, SQL/HTTP e ativação das 25 contas **somente em `127.0.0.1:3306/inova_nucleo_compat_20261029`**. Implementados runner `local-mysql-access.js`, barreira de driver `local-access-guard.js`, ensaios `local-access-fixtures.js` e ações `PreflightAccess`/`ActivateAccess`. **298/298 testes passaram**, incluindo 13 novos; sintaxes/diff conferidos.

Preflight confirmou estado E1/mapa/privilégios. Backup autenticado de **14 tabelas/683 linhas** precedeu DDL. SQL/HTTP real passou: nove contas em três tabelas próprias, sessões/limites SQL, rehash, cookie/CSRF, estados inválidos/429/logout/revogação; falha injetada pré-commit com rollback real, sessão aguardando commit e alteração concorrente preservada. **Dois waiters InnoDB distintos e respostas 200/401**; 403 consultas do driver restritas às fixtures. Servidor/worker/pools encerrados, três objetos removidos por propriedade e estado das 14 tabelas comparado antes da ativação.

Ensaio dos 25 IDs revertido; ativação definitiva concluída em `2026-10-30T02:15:09.519Z` (29/10, 23:15 em São Paulo). **25 contas ativas/versão um, 25 hashes originais e dois perfis administrativos preservados**; demais campos/tabelas, 100 profissionais, 498 avaliações e origem intactos. Zero logins de contas existentes, resets, grants, migrations ou mapas. API principal permanece no perfil anterior. [Relatório real](evidencias/conexao-mysql-local/access-e2b-report.json), [resumo](evidencias/conexao-mysql-local/access-e2b-summary.json).

Backup/manifests externos preservados, ACL restrita conferida, sem CNF/artefato de falha; só relatório sanitizado no Git. **Não repetir E2B, E1, CreateCopy/InspectCopy ou down** com esses alvos/artefatos. Nenhum novo schema, domínio, SMTP, dependência, frontend/build/Chrome ou troca de API.

Próxima informação solicitada: IDs responsáveis por G01–G05 (40/23/16/20/1 profissionais). Preparado [roteiro SQL local somente leitura](REVISAO_MAPAS_INOVA.md), sem nomes/e-mails em docs; não executar suas consultas com saída individual nas ferramentas do agente. Inspeção agregada confirmou **395 candidatos binários exatos + 45 apenas por collation**, além dos 58 sem candidato já preservados. Nenhum vínculo aprovado/aplicado; precisam de revisão, plano de preenchimento/obrigatoriedade e ativação local posterior. Os registros inferiores são históricos.

**Escolhas respondidas neste lote:** usuário indicou **ID 12 para todos os cinco grupos** (disponibilidade validada em leitura) e **propor 395 vínculos binariamente exatos, mantendo 103 pendentes**. Não foi autorização de DML/schema/preview. [Plano E3 concreto preparado](PLANO_MAPAS_PREVIA_INOVA.md): backup pós-E2B, cinco gerências, 100 profissionais/395 avaliações por mapa fechado, terceira migration própria para gerência obrigatória e prévia localhost:5174/8002 com cookies/segredos separados, preservando principal/origem. **Ainda depende de aprovação de execução**. Nenhuma migration E3 escrita, mapa aplicado, cofre de prévia criado ou serviço de prévia iniciado. [Resumo sanitizado](evidencias/conexao-mysql-local/maps-selection-summary.json).

## E2A aprovado e concluído — código/testes sintéticos, 29/10/2026

Usuário aprovou o [plano E2A](PLANO_ACESSO_MYSQL_LOCAL.md), mantendo senhas e atualizando para Argon2id após login válido. Implementados serviço `lib/auth/credentials.js`, adaptador/formato/worker `legacy-bcrypt*.js` e pequena delegação na estratégia Passport. **Padrão continua Argon2id**, nenhum launcher/configuração operacional injeta o legado. Apenas `$2a$10$`, até 72 bytes UTF-8, sem NUL/UTF-16 malformado; fila/tempo/workers limitados e encerramento explícito. Rehash fora do lock, releitura bloqueada/confirmação de estado/hash/versão, update condicionado e versão incrementada antes de criar sessão. Nenhuma ativação/reset implícito.

**285/285 testes passaram**, 29 novos: criptografia real sobre fixtures públicas/sintéticas, falhas/limites do worker, conflitos de conta/rehash, SQL Knex simulado e HTTP real em loopback com DB simulado/MemoryStore de testes. Sessão espera commit, falhas não autenticam, cookie/CSRF rotacionam e versões antigas são revogadas. [Resultado e limites](PLANO_ACESSO_MYSQL_LOCAL.md#resultado-de-e2a-e-contrato-interno--29102026), [evidência](evidencias/conexao-mysql-local/access-e2a-summary.json).

**Sem acesso a MySQL/cofre/backup operacional, sem migration/conta/hash real alterado, sem dependências novas, SMTP, reinício ou troca de API**. Frontend/build/Chrome dispensados. A integração real deste fluxo em MySQL permanece pendente.

Na pergunta de planejamento seguinte, o usuário escolheu **todas as 25 contas existentes** para acesso inicial. [Plano E2B concreto preparado](PLANO_ATIVACAO_ACESSO_LOCAL.md), **ainda sem execução aprovada**: backup pós-E1/mapa privado, três tabelas de ensaio de nomes fechados na mesma cópia para SQL/HTTP, limpeza somente desses objetos e ativação condicional dos 25 IDs com hashes/perfis preservados. Sem outro schema, login de contas existentes ou troca da API; servidor efêmero de fixtures é encerrado. Não usar `accounts.js activate` (redefine senha), relaxar launcher 50470 para 3306, repetir E1 ou inferir mapas de gerências/histórico. Os registros inferiores são históricos.

## E1 aplicado e validado na cópia — 29/10/2026, 21:28

Após o usuário solicitar continuar, novo preflight retornou `ready=true`: requisito `REFERENCES` atendido, backup autenticado, origem/cópia preservadas e sem concorrentes. **Duas migrations E1 aplicadas exclusivamente em `127.0.0.1:3306/inova_nucleo_compat_20261029`**, ledger próprio batch 1. Três tabelas InnoDB; três FKs restritivas verificadas, dois updates inválidos rejeitados, sondas revertidas e campos históricos integralmente comparados. **680 linhas originais, 25 hashes/contas, 100 profissionais, 498 avaliações, outras seis tabelas e sete migrations legadas preservados. Origem intacta.** Zero contas ativas, vínculos ou rehash; sessões/limites/gerências vazios. API/perfil anterior preservados.

Execução concluída em `2026-10-30T00:28:10.725Z` (29/10, 21:28 em São Paulo). Três checkpoints criptografados/relatório preservados no perfil externo, ACL restrita conferida, sem falha parcial; somente relatório sanitizado copiado ao Git. [Resultado e evidências](PLANO_COMPATIBILIDADE_INOVA.md#resultado-da-execução-e1--29102026-2128). Nenhum código alterado neste lote; **256 testes aprovados na preparação anterior**, não repetidos agora. Sem frontend/build/Chrome/SMTP.

**Não repetir `PreflightCompatibility`/`ApplyCompatibility`, CreateCopy/InspectCopy ou `down` neste alvo**: existem artefatos de execução e o schema já diverge legitimamente do backup inicial. Não chamar migrations compartilhadas nem o launcher isolado 50470 para este alvo.

Usuário escolheu **manter as senhas atuais e atualizar para Argon2id após login válido**. Inspeção em leitura confirmou 25 `$2a$` custo 10, e-mails canônicos/válidos sem duplicação normalizada, dois administradores ainda inativos. [Plano E2A](PLANO_ACESSO_MYSQL_LOCAL.md) preparado para aprovação de código/testes sintéticos; nenhuma autenticação implementada neste lote. E2B ainda exige escolha das contas a ativar, backup pós-E1 e launcher próprio; gerências/histórico exigem mapas revisados. Origem, login operacional e ativação da aplicação continuam fora do escopo concluído. Os registros inferiores são históricos.

## E1 aprovado e preparado; falta privilégio na cópia — 29/10/2026

O usuário aprovou o [plano E1](PLANO_COMPATIBILIDADE_INOVA.md) ao solicitar “prosseguir”. Implementados duas migrations em `backend/compat/inova/migrations`, capacidade/guardas, runner `local-mysql-compat.js`, ações opt-in `PreflightCompatibility`/`ApplyCompatibility` e 14 testes novos. **256/256 testes passaram**, parser PowerShell e diff conferidos. Nenhuma dependência ou configuração da aplicação alterada.

Preflight real às 21:18 (São Paulo; 2026-10-30T00:18:56.699Z) autenticou backup e comparou origem/cópia integralmente: nove tabelas/680 linhas, sete migrations legadas, sem concorrente na cópia. **`ready=false`: falta somente `REFERENCES` no alvo `127.0.0.1:3306/inova_nucleo_compat_20261029`. Nenhum DDL, ledger E1, migration, grant, conta ou vínculo aplicado.** O `ALL PRIVILEGES` específico da conta vale para a origem, sem estender-se à cópia. Origem, cópia e API/perfil anterior intactos. [Evidência sanitizada](evidencias/conexao-mysql-local/compat-preflight-report.json), [validações](evidencias/conexao-mysql-local/compat-validation-summary.json).

Próximo passo depende de ação administrativa: conceder apenas `REFERENCES` na cópia ao usuário/host configurado, conforme SQL com placeholders no plano. Não há credencial administrativa disponibilizada; não alterar privilégios sem autorização própria nem pedir senha no chat. Depois disso, a aprovação E1 existente continua válida: preflight deve retornar `ready=true` antes de aplicar; não pedir novamente autorização para o mesmo lote/alvo. **DDL e sondas transacionais reais ainda não validados.** Preservar os artefatos existentes; não executar CreateCopy/InspectCopy, cadeia compartilhada, down, novos mapas ou ativação. Os checkpoints inferiores são históricos.

## Backup/cópia do MySQL local concluídos em 29/10/2026

O usuário autorizou prosseguir com backup e cópia somente em **`127.0.0.1:3306/inova_nucleo_compat_20261029`**. Concluído às 16:45 (São Paulo): **9 tabelas MyISAM/680 linhas**, com 25 contas/hashes, 100 profissionais e 498 avaliações preservados, DDL/conteúdo coincidentes e origem intacta. Usados bloqueios READ nas tabelas da origem, sem bloqueio global, engine alterado ou migrations. A conta já tinha os privilégios necessários; nenhum grant ou senha alterado.

Inventário privado às 16:51 confirmou 440 candidatos textuais e 58 avaliações sem candidato; G01–G05 reúnem 40/23/16/20/1 profissionais, sem candidatos de conta nas comparações usadas. **Nenhuma associação aprovada/aplicada**. Detalhes ficam criptografados fora do Git. Ferramentas em `local-mysql-copy.js/.ps1` e `local-mysql-review.js`; **242 testes aprovados**, parser/diff conferidos. [Resultado completo](PLANO_CONEXAO_MYSQL_LOCAL.md#6-inspeção-inicial-e-resultado-da-execução-autorizada), [resumo sanitizado](evidencias/conexao-mysql-local/validation-summary.json).

Pasta externa protegida `%LOCALAPPDATA%/EvaluationDev/inova-nucleo-compat-20261029` contém backup, cofre DPAPI, manifesto e candidatos. Preservar todos; zero `.cnf` temporários ao final. **Não repetir CreateCopy/InspectCopy** com esse alvo/artefatos existentes. Backend `mysql` conectou em leitura à cópia, mas **a API não foi trocada**: serviços anteriores continuam (frontend 200; API sem sessão 401).

**Próxima aprovação necessária: E1**, [plano de compatibilidade somente na cópia](PLANO_COMPATIBILIDADE_INOVA.md): converter três tabelas gerenciadas para InnoDB e adicionar estruturas/campos em trilha própria, preservando hashes/colunas antigas, sem ativar contas nem vincular registros. Nenhuma migration desse plano escrita/aplicada. Não usar a cadeia histórica, alterar ledger legado, ligar API ou modificar a origem. A integração solicitada continua pendente de schema, acesso e mapas aprovados. Exportação portável continua fora desta prioridade. Os registros abaixo são históricos.

## Prioridade atual — conectar o banco local existente, em 29/10/2026

O usuário solicitou usar o MySQL local com os dados existentes e confirmou que `inova_nucleo` contém **dados fictícios de desenvolvimento**. Conexão em `127.0.0.1:3306`, MySQL 8.0.44, validada em leitura com as credenciais já configuradas, sem mostrá-las. Contagens: **25 contas, 100 profissionais e 498 avaliações**. Sete entradas no ledger, incluindo migration de 2025 ausente do diretório/histórico local consultado. Schema anterior ao atual, sem tabelas de gerências/sessões/limites e sem campos de estado/vínculos por ID.

As 25 contas usam bcrypt; não converter ou redefinir senhas automaticamente. As 100 atribuições não coincidem exatamente com e-mails; 440 avaliações têm um candidato textual e 58 não têm candidato. Nenhum vínculo inferido/aplicado. TEXT/NULL e demais tabelas precisam ser preservados. [Diagnóstico e plano](PLANO_CONEXAO_MYSQL_LOCAL.md), [agregados sanitizados](evidencias/conexao-mysql-local/inspection.json).

**API não foi trocada**; perfil anterior e serviços preservados. Não executar `knex migrate:latest`, aplicadores do perfil anterior, login ou gravações sobre esse banco sem novo plano/aprovação. Próximo lote proposto: backup criptografado e **nova cópia `inova_nucleo_compat_20261029` no mesmo MySQL local**, sem migrations, senhas ou vínculos alterados. Esse alvo/criação ainda aguardam autorização. A solicitação atual prioriza essa conexão; a exportação portável do lote B fica pendente. Inspeções foram somente leitura; código/configuração/credenciais não alterados neste lote. Os checkpoints abaixo são históricos.

## Protótipo de pacote de chave concluído em 29/10/2026

Após escolher pacote protegido por frase-senha separado do backup e receber a proposta do lote A, o usuário solicitou prosseguir. **Lote A implementado somente em memória, com material sintético**: `backend/lib/recovery/key-package.js` e 17 testes novos. Argon2id (64 MiB, três passagens, p=1) + AES-256-GCM; pacote autentica origem/hash do backup e somente entrega chave/SQL após autenticar ambos. Preservado `evaluation-backup-v1`; sem integração com CLI/launcher/rotas.

**227/227 testes aprovados**, zero falhas/skips; diff sem erros. Medição sintética de três amostras: medianas de proteção/abertura 216/206 ms, RSS de pico 117 MiB no processo de medição; não é dimensionamento de produção. [Contrato, limites e resultado](PLANO_RECUPERACAO_PORTAVEL.md#8-resultado-do-lote-a-e-contrato-interno), [evidência sanitizada](evidencias/recuperacao-portavel/prototype-summary.json).

Nenhum cofre/backup operacional foi lido, nenhuma chave real exportada, pacote gravado ou MySQL/SMTP/serviço alterado. Sem dependências novas, frontend/build/Chrome/migrations, outro host ou domínio definitivo neste lote. **Próximo escopo: planejar B**, escolhendo origem/backup, local concreto de guarda e arquivo novo antes de aprovar exportação operacional. C (restauração independente) continua separado. Não inferir que o protótipo já exporta chaves ou demonstra recuperação em outra máquina. Os checkpoints abaixo são históricos.

## Planejamento da recuperação portável em 29/10/2026

Após concluir a validação de Registros, o usuário solicitou prosseguir. Retomada a prioridade registrada de recuperação em outra máquina/proteção das chaves, **somente com planejamento**: [diagnóstico, alternativas, modelo técnico, lotes, arquivos, testes e critérios](PLANO_RECUPERACAO_PORTAVEL.md). Confirmadas no código as dependências distintas da chave `recovery`, da identidade autenticada da origem e das chaves dos manifestos privados. Não copiar o cofre inteiro nem reutilizar a identidade da origem para autorizar um destino.

Próximo lote proposto: **A, protótipo em memória com material sintético**, preservando o formato atual dos backups e sem DPAPI/MySQL/arquivos operacionais. Ainda depende de aprovação do modelo. O usuário confirmou a preferência por **pacote protegido por frase-senha, guardado separadamente do backup**; essa resposta define a custódia, sem aprovar o modelo técnico/implementação. Exportação de chave real e restauração em novo alvo terão planos/aprovações específicos. Nenhum código, segredo, banco ou serviço alterado por este planejamento; testes anteriores não repetidos. Os checkpoints abaixo são históricos.

## Concorrência MySQL de Registros concluída em 29/10/2026

Após autorização explícita **somente da cópia `evaluation_isolated_0f8785e64029_v2_restore_20261029a001`**, execução concluída às **15:18:47, horário de São Paulo**. API principal pausada; backup/restauração de **9 tabelas/52 registros** com igualdade DDL/conteúdo e autenticação recuperada antecederam as fixtures. Duas esperas InnoDB reais observadas; requisições pelos dois POSTs resultaram em **um 204, um 409 e uma única inserção**. Duplicidade entre perfis/rotas, homônimos, transferência/autoria, data forjada e limites SQL de mês/ano/bissexto passaram. Contas e dados de negócio da origem integralmente preservados; zero migrations.

API principal retomada com o mesmo perfil e baseline 14, `/session` anônimo 401, frontend `/registros` 200 e log de erros vazio. MySQL/frontend preservados. Backup `backup-20261029a001.evalbackup`, cópia e relatórios externos mantidos; nenhum arquivo temporário de credenciais/cofre remanescente. **Não repetir `ValidateMonthlyRecords` com esse ID**, não sobrescrever/apagar artefatos nem escolher outro alvo sem aprovação própria. A cópia contém fixtures e não é mais idêntica ao backup original. [Procedimento, resultado e limites](VALIDACAO_REGISTROS_LOCAL.md), [relatório SQL/HTTP](evidencias/registros-local/mysql-validation-report.json), [recuperação](evidencias/registros-local/mysql-recovery-report.json).

Os **210 testes, build e 148 grupos Chrome** passaram na etapa imediatamente anterior; não foram repetidos nesta execução SQL, que não alterou código. Documentação/evidências atualizadas, sem commit/push/deploy ou testes em domínio definitivo. Próximos lotes de recuperação em outro host/proteção de chaves, auditoria administrativa durável e persistência dos critérios/submissão exigem planejamento/escopo próprios. Os checkpoints abaixo são históricos.

## Validação local de Registros retomada em 29/10/2026

Revisão Chrome com API integralmente simulada concluída: **148 grupos aprovados, 18 capturas, zero erros JS**, em 320/390/768/1440 px e temas claro/escuro. Inspeção visual de páginas, histórico e detalhes. Corrigido o foco por teclado no `summary` do modal e acrescentada orientação de rolagem do gráfico no celular. Ferramenta `playwright-core` 1.64.1 preparada offline apenas em cache ignorado, sem mudar dependências dos projetos nem baixar navegador. **210/210 testes**, build local, parser PowerShell e diff aprovados. [Plano e resultados](VALIDACAO_REGISTROS_LOCAL.md), [resumo sanitizado](evidencias/registros-local/summary.json).

Runner `isolated-monthly-records.js` e ação `ValidateMonthlyRecords` preparados, com barreiras testadas em mocks. **Execução MySQL ainda não autorizada/realizada**: confirmação específica solicitada para backup e nova cópia `evaluation_isolated_0f8785e64029_v2_restore_20261029a001`, sem migrations/escrita de avaliações na origem; API local será pausada e retomada no procedimento aprovado. Não executar a ação até receber essa autorização. Os serviços existentes foram preservados nesta etapa. Sem testes em domínio definitivo, SMTP, commit/push ou deploy. Os checkpoints abaixo são históricos.

## Registros: evolução aprovada em 29/10/2026

Após retomar o projeto e solicitar abertura local, o usuário determinou **não realizar testes em domínio definitivo**. Em seguida aprovou o plano de pesquisa por período, resumo completo ao clicar no profissional, gráfico notas × meses e limite de uma avaliação por profissional no mês da gravação, independente do avaliador.

Implementação em `Registros.vue`, `ProfessionalHistoryModal.vue`, `record-history.js`, CSS e `backend/lib/records.js`, com testes e documentação. A API rejeita duplicidade com 409; transação `READ COMMITTED` e bloqueio exclusivo do profissional serializam os dois endpoints de gravação. Sem migration ou alteração de avaliações antigas; arrays de critérios/submissão continuam no estado anterior. **204 testes aprovados**, zero falhas/skips, e build local em cache. [Descrição, regras, evidências e limites](REGISTROS_HISTORICO.md).

API recarregada com o perfil fictício existente e mantida em segundo plano; log `serving: true`, `/session` anônimo 401. Frontend `/registros` e módulo atualizado responderam 200 em localhost:5173. MySQL 127.0.0.1:50470 preservado; conferir portas antes de iniciar duplicatas. Logs operacionais sanitizados ficam em `backend/node_modules/.cache/local-runtime/`, ignorados pelo Git.

Concorrência real MySQL e revisão visual em navegador não foram executadas neste lote; os testes usam dados fictícios e simulação de bloqueios/DOM. Não repetir migrations, conciliação ou validações SQL antigas para testar essa regra: vários runners históricos gravam múltiplas avaliações no mesmo mês e precisarão de adequação/revisão em uma cópia autorizada. Nenhum commit/push/deploy deste lote foi solicitado. O checkpoint de Git anterior era `0713551`, em `master`; preservar alterações posteriores. Os registros abaixo são históricos.

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
