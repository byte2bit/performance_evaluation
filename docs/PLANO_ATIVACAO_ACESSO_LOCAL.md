# E2B — validação e ativação concluídas somente na cópia

**Continuidade posterior:** [E3 aprovado e concluído](PLANO_MAPAS_PREVIA_INOVA.md#resultado-da-execução-e3), com mapas/gerência obrigatória e prévia separada 5174/8002 sobre a cópia. Os próximos passos citados abaixo são históricos; não repetir E2B ou ativação das contas.

**E2B aprovado pelo usuário ao solicitar “continue” após a proposta concreta, e concluído em 29/10/2026 às 23:15 (São Paulo).** Backup atualizado, SQL/HTTP reais em fixtures separadas, limpeza, rollback de ensaio e ativação das **25 contas somente na cópia** passaram. Hashes e perfis preservados. **Não repetir E2B ou os comandos históricos abaixo**. E2A permanece opt-in e a API principal continua no perfil anterior. Não pedir senhas pelo chat. Resultados no item final.

## Objetivo e alvo fechado

Validar o fluxo bcrypt → Argon2id em MySQL/HTTP reais usando fixtures separadas e, após sucesso, habilitar as 25 contas existentes **preservando os hashes**. Alvo único: **`127.0.0.1:3306/inova_nucleo_compat_20261029`**. Não modificar `inova_nucleo`, perfil 50470, API principal, `.env`, contas SQL, privilégios, domínios ou SMTP. Não criar outro schema.

Estado esperado antes de começar: E1 concluído, 14 tabelas, ledger de compatibilidade com duas entradas, sete migrations antigas preservadas, 25 contas bcrypt `$2a$10$` inativas/versão zero, dois administradores, 100 profissionais e 498 avaliações. Esses valores serão conferidos contra os manifestos privados; não assumir que permaneceram iguais desde a inspeção anterior.

Alternativas: usar `accounts.js activate` redefiniria senhas e foi descartado; testar sobre contas existentes exigiria senhas desconhecidas e alteraria hashes antes do acesso do usuário; criar outro schema exigiria novo alvo/privilégios. Proposta: fixtures em **três tabelas próprias na cópia**, com cliente restrito a elas durante HTTP, preservando as 14 tabelas de E1 até a ativação final aprovada.

## Arquivos e artefatos propostos

- Novo `backend/scripts/local-mysql-access.js` e ações opt-in no launcher local, com confirmação específica de E2B, identidade/servidor/schema/ledger e barreiras testadas antes de qualquer escrita. Não relaxar o launcher isolado ou conectar o adaptador ao bootstrap padrão.
- Testes de guardas/orquestração e atualização da documentação. Não alterar dependências, frontend ou migrations compartilhadas.
- No perfil externo já protegido: arquivos novos `access-e2b-before.evalbackup`, `access-e2b-before.evalinventory`, `access-e2b-activation.evalinventory` e `access-e2b-report.json`. Recusar preexistentes, sem sobrescrever checkpoints de E1, backup inicial ou candidatos. Backup AES-GCM autenticado com identidade própria de E2B, usando o cofre existente sem exportar chaves.
- Únicos objetos SQL de ensaio: **`e2b_accounts_fixture`, `e2b_sessions_fixture`, `e2b_limits_fixture`**. Criar vazios com schema equivalente a `users2`, `sessions`, `auth_rate_limits`, respectivamente, em InnoDB. Recusar objetos preexistentes; registrar propriedade/identidade da execução no manifesto antes de criá-los.

## Execução proposta

1. Autenticar perfil/cofre, manifestos E1 e inventário privado. Conferir identidade, estado pós-E1, privilégios necessários (inclusive criação/remoção das três tabelas de ensaio), inexistência de artefatos/fixtures anteriores e ausência de concorrentes na cópia. Trava cooperativa e inspeção de sessões/metadata locks; não matar conexões externas nem conceder privilégios automaticamente.
2. Fazer backup criptografado **atualizado de todas as 14 tabelas da cópia**, com READ locks na lista explícita durante a captura (o schema é misto MyISAM/InnoDB). Autenticar/reler o backup e conferir inventário completo. Não tratar `--single-transaction` como garantia para MyISAM. Registrar mapa privado dos 25 IDs/estado/assinatura dos campos antigos, confrontado com a escolha de todas as contas e os manifestos anteriores. Não emitir nomes/e-mails/hashes.
3. Criar somente as três tabelas de ensaio. Cliente dedicado/serviços injetados roteiam autenticação, sessão e rate limit **exclusivamente** para essas tabelas. Antes de executar HTTP, comprovar por guardas/SQL capturado que nenhum DML do teste alcança as 14 tabelas existentes; abortar caso o driver/limiter não respeite o roteamento. Não mudar contratos de produção para viabilizar o ensaio.
4. Inserir somente fixtures sintéticas identificadas nessas tabelas (ativa/inativa/excluída, bcrypt conhecido e Argon2id), sem profissionais/gerências/avaliações. Iniciar servidor Express/Passport **de autenticação apenas**, em loopback/porta efêmera, com segredos aleatórios exclusivos em memória, sessões/limites SQL nas tabelas de ensaio. Não montar rotas de negócio ou abrir frontend; cliente HTTP local usa cookies próprios.
5. Validar login/rehash/segundo login, senha errada, inativo/excluído/inexistente, limites, CSRF/Origin, rotação de cookie/token, versão/revogação/logout, falha de commit e ausência de sessão autenticada antecipada. Testar condição de atualização e esperas/concorrência SQL quando possível com conexões dedicadas ao ensaio. Não autenticar uma das 25 contas reais da cópia nem tentar descobrir senhas.
6. Encerrar servidor, worker, store e pools do ensaio. **Remover somente as três tabelas criadas e identificadas nesta execução**, com nomes fechados, como limpeza explicitamente incluída neste plano. Comparar novamente as 14 tabelas com o backup pós-E1, inclusive campos/defaults/ledger/contadores e hashes. Se houver divergência, falha de teste ou limpeza incompleta, parar **antes de ativar contas**, preservando backup/relatório; não recriar schema, executar down ou escolher outro alvo.
7. Preparar ativação condicional em transação InnoDB: reler/bloquear os 25 IDs e conferir hash/perfil/estado/versão com o mapa autenticado. Atualizar somente **`active=true` e `session_version=1`**, partindo do estado confirmado zero. Preservar senha, IDs, nomes/e-mails, os dois perfis administrativos, exclusão e todos os demais campos. Primeiro ensaiar a mesma operação com rollback e comparar; depois revalidar estado/exclusividade e executar uma vez, exigindo 25 atualizações.
8. Conferir 25 ativas, versões um, hashes ainda bcrypt originais idênticos e perfis preservados. Todas as demais tabelas/campos devem continuar iguais ao backup pós-E1. Registrar manifesto privado/relatório sanitizado, liberar conexões e preservar backup/cópia. Nenhum login existente automatizado: rehash real só acontecerá futuramente com senha válida fornecida na interface aprovada.

## Segurança, recuperação e limites

O DDL das tabelas de ensaio não tem rollback transacional; nomes/propriedade e a limpeza acima devem ser validados antes de execução. O backup atualizado é pré-requisito, sem apagar/recriar o schema como recuperação automática. Falhas preservam artefatos e exigem diagnóstico; não repetir uma ativação já registrada. A trava cooperativa não impede novos clientes externos, por isso há conferências entre fases.

Habilitar todas as contas não promove avaliadores, não concede acesso fora das gerências, não resolve os 440 candidatos/58 sem vínculo e não remove obrigações de autorização. Senhas antigas acima dos limites do adaptador ou desconhecidas continuam exigindo tratamento individual; habilitar não significa comprovar que todas as 25 pessoas conseguem autenticar. Sem reset ou senha padrão.

**Ao terminar E2B, a API principal ainda ficará no perfil anterior.** O servidor efêmero usa apenas fixtures e é encerrado. Launcher operacional da cópia, abertura de frontend, mapa de gerências/histórico, obrigatoriedade final e eventual transição da origem permanecem lotes posteriores. E2B não autoriza publicação ou testes em domínio definitivo.

## Testes e critérios de aceitação

Antes do MySQL: guardas em mocks/SQL devem recusar origem/outro alvo, UUID/ledger/estado divergente, perfil inválido, concorrentes, arquivos ou tabelas preexistentes, nomes de limpeza fora da lista e roteamento de DML para tabelas de E1. Suíte existente permanece passando.

Na execução real: backup autenticado de 14 tabelas; ensaio SQL/HTTP somente nas três fixtures, remoção somente desses objetos e igualdade integral do estado antes da ativação; rollback e aplicação condicional dos 25 IDs; 25 hashes/perfis preservados, versões um e 25 ativas; demais dados íntegros, zero SMTP e API principal intacta. Relatórios devem distinguir testes reais, mocks, verificações não executadas e falhas, sem segredos ou dados individuais.

## Resultado real — 29/10/2026

Preflight às `2026-10-30T02:12:29.760Z` confirmou as 14 tabelas/683 linhas pós-E1, mapa privado das 25 contas, origem intacta e privilégios necessários, sem fixtures preexistentes. [Relatório](evidencias/conexao-mysql-local/access-e2b-preflight-report.json). Execução concluída em **`2026-10-30T02:15:09.519Z` (29/10, 23:15 em São Paulo)**. [Relatório real SQL/HTTP/ativação](evidencias/conexao-mysql-local/access-e2b-report.json), [resumo sanitizado](evidencias/conexao-mysql-local/access-e2b-summary.json).

Implementação:

- `backend/scripts/local-mysql-access.js`: validação de identidade/estado/ledger/mapa, backup criptografado com readback autenticado, propriedade dos objetos de ensaio, limpeza fechada e ativação transacional condicionada dos 25 IDs. Sem bootstrap, migration, grant, reset ou troca de alvo.
- `local-access-guard.js`: facade da tabela de contas e barreira no driver MySQL. Somente três tabelas físicas de fixture, tipos de instrução permitidos e consulta fechada de existência de tabela. Refusa tabelas originais/outros schemas, DDL, múltiplas instruções, joins e atualizações múltiplas. Auditoria guarda somente operação/nome de tabela, sem SQL/valores.
- `local-access-fixtures.js`: Express/Passport, worker bcrypt, Argon2id, sessões SQL e limitadores reais, com nomes de tabela injetados e cliente dedicado. O limitador usa o driver diretamente, e o store emite SQL bruto; por isso o controle ocorre também nesse nível. Nenhum contrato da aplicação foi alterado para o ensaio.
- `local-mysql-copy.ps1`: ações opt-in `PreflightAccess` e `ActivateAccess` com confirmação E2B própria, cofre DPAPI e restauração/limpeza das variáveis do filho. `local-mysql-compat.js` apenas exportou os helpers de leitura existentes para reutilização, sem alteração de execução E1.
- `backend/test/local-access.test.js`: 13 testes novos de alvo/replay, mapa/estado/servidor/ledger, SQL de bibliotecas/Knex, barreira de driver, exclusividade, limpeza por propriedade, ativação, rollback e falha de commit simulada. **Suíte completa: 298/298 aprovados**, zero falhas/skips; parser PowerShell, sintaxe JS e diff passaram.

Resultados reais observados:

- Backup criptografado de **14 tabelas/683 linhas**, com READ locks na lista integral durante dump e comparação, sem lock global. Readback autenticado e inventário privado antes do primeiro DDL de fixture.
- Nove contas sintéticas somente nas três tabelas autorizadas. **403 consultas do driver de ensaio**, todas nos objetos permitidos. Sessões/limites SQL reais, login bcrypt → Argon2id, segundo login, estados inválidos, rotação de cookie/CSRF, revogação da versão anterior, logout e 429 passaram. Rotas de negócio não montadas.
- Falha **injetada antes do commit**, com rollback SQL real e ausência de sessão autenticada; não se trata de falha física de disco/rede no COMMIT. Sessão de login aguardou a conclusão da transação. Desativação concorrente no ensaio foi preservada.
- **Dois waiters InnoDB distintos** observados na tabela de contas de fixture; dois logins concorrentes retornaram **200/401**, com uma única atualização de versão/hash. Essas são evidências SQL reais, além dos mocks de E2A.
- Servidor efêmero, worker e pools encerrados; três tabelas removidas somente após conferir nomes/propriedade da execução. Estado original das 14 tabelas igual ao backup pós-E1 antes de ativar contas.
- Ensaio de ativação dos 25 IDs revertido e comparado; aplicação definitiva em transação concluída uma vez. **25 ativas/versão um, 25 hashes bcrypt idênticos e os dois perfis administrativos preservados**. Nenhuma conta existente foi autenticada, nem sua senha foi descoberta/redefinida. As demais colunas/tabelas e a origem continuam iguais ao estado anterior. Mantidos 100 profissionais e 498 avaliações, sem novos vínculos.

Artefatos externos no perfil protegido: backup, manifesto anterior e manifesto de ativação, além do relatório. ACL sem herança e com duas regras conferida; nenhum `.cnf` temporário ou artefato de falha. Somente relatório sanitizado copiado ao repositório. Sem dependências, frontend/build/Chrome, SMTP, alteração da API principal ou novos domínios.

Comandos **históricos, já executados; não repetir**:

```powershell
./backend/scripts/local-mysql-copy.ps1 -Action PreflightAccess -Confirmation 'inova_nucleo_compat_20261029:3306:access-e2b-all25'
./backend/scripts/local-mysql-copy.ps1 -Action ActivateAccess -Confirmation 'inova_nucleo_compat_20261029:3306:access-e2b-all25'
```

## Continuidade: responsáveis e vínculos ainda pendentes

As 25 contas habilitadas não significam que a aplicação principal já usa o banco. Ela permanece no perfil anterior. Faltam mapa dos responsáveis por gerência, conciliação/regras dos registros sem vínculo, obrigatoriedade final e launcher/ativação da cópia, com aprovação própria antes das alterações.

Preparado [roteiro somente leitura para revisão no cliente MySQL local](REVISAO_MAPAS_INOVA.md), sem dados individuais no arquivo. O usuário deve informar apenas os IDs das contas responsáveis por G01–G05. Nenhum desses responsáveis foi inferido.

Inspeção agregada posterior confirmou grupos de 40/23/16/20/1 profissionais, com um texto de responsável por grupo. Dos **440 pares candidatos**, apenas **395 têm texto binariamente idêntico**; **45 dependem da collation**. Isso exige revisão adicional e não autoriza vincular todos por nome. Os 58 sem candidato permanecem preservados e sem vínculo. Não criar cadastros de preenchimento ou alterar autoria/datas para satisfazer constraints.
