# Backup e restauração no MySQL isolado

**Último exercício, em 29/10/2026:** backup `backup-20261029a001.evalbackup`, baseline 14, restauração de **9 tabelas/52 registros** com igualdade DDL/conteúdo e login dos dois perfis. Depois foram executadas fixtures de concorrência mensal **somente na cópia**; origem/contas preservadas e API retomada. Backup/cópia/relatórios mantidos. [Resultados sanitizados](VALIDACAO_REGISTROS_LOCAL.md). Não repetir esse identificador nem sobrescrever a cópia existente.

**Recuperação em outra máquina:** [lote A do plano](PLANO_RECUPERACAO_PORTAVEL.md#8-resultado-do-lote-a-e-contrato-interno) aprovado/implementado somente em memória e com material sintético; 227 testes aprovados. Não houve exportação de chave operacional, criação de pacote em arquivo ou provisionamento de destino. B/C precisam de planos/aprovações próprios. A recuperação local acima e o protótipo não comprovam recuperação independente em outro host. Os relatos inferiores são históricos.

**Último backup pré-ativação de gerências:** `backup-49892036b2c4.evalbackup`, com restauração/igualdade de **8 tabelas/46 registros** e login dos dois perfis confirmados em 27/10/2026 às 21:31. Origem permaneceu intacta nessa etapa. Depois da validação em cópia, a origem recebeu a 13ª migration e o mapa aprovado, sem alteração das oito avaliações/contas/campos legados. A cópia `_restore_49892036b2c4` também passou a ter o mapa; não confundir seu estado atual com o backup anterior à migration. [Resultado e artefatos](PLANO_GESTAO_GERENCIAS.md#ativação-autorizada-na-origem). Relatos abaixo são históricos.

Executado em 25/10/2026, a pedido do usuário, exclusivamente na instância fictícia descrita em [AMBIENTE_ISOLADO.md](AMBIENTE_ISOLADO.md). A origem e o serviço MySQL80 existente foram preservados. Não constitui validação de recuperação de produção.

## Procedimento reproduzível

No PowerShell 7, com o mesmo usuário Windows que criou o cofre:

```powershell
$perfilAvaliacao = Join-Path $env:LOCALAPPDATA 'EvaluationDev/mysql-isolated-0f8785e64029'
./backend/scripts/isolated-mysql.ps1 -Action Start -ProfileDirectory $perfilAvaliacao
./backend/scripts/isolated-mysql.ps1 -Action RecoveryTest -ProfileDirectory $perfilAvaliacao
```

Executar sem a API local nem outro escritor ativo sobre esse schema. O runner rejeita origens que não correspondam ao diretório/porta/UUID/bind do perfil e ao marcador de propriedade. Não importa `.env`, `knexfile.js` ou `index.js`.

`RecoveryTest` executa estas etapas:

1. Verifica tabelas InnoDB e captura estrutura, contagens e resumos SHA-256 internos do conteúdo. O verificador é limitado a schemas fictícios pequenos: até 50 tabelas e 10 mil linhas por tabela, sem views, triggers, rotinas ou eventos. A saída do cliente tem limite de 32 MiB.
2. Gera dump lógico com `mysqldump` 8.0.44, `--single-transaction`, `--quick`, `--set-gtid-purged=OFF` e `--no-tablespaces`. Não usa `--databases`: o SQL não deve selecionar nem recriar o schema de origem. Não executar DDL concorrente durante o dump; ver [documentação do mysqldump](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html).
3. Criptografa o dump em AES-256-GCM com chave aleatória independente, guardada no cofre DPAPI existente. O arquivo `backup-<id>.evalbackup` autentica também a identidade de perfil/schema. O dump SQL permanece em memória; não é gravado em texto puro.
4. Relê e descriptografa o arquivo persistido; confere integridade antes da importação. O cliente `mysql` restaura somente em um novo schema `<origem>_restore_<id>`. Destino existente, origem ou namespace não correspondente são recusados antes de qualquer gravação. Não há DROP DATABASE nem restauração sobre dados existentes.
5. Compara DDL completo das tabelas, contagens e conteúdo da cópia com a origem. Confere novamente que a origem ficou intacta. Depois testa login, sessão e logout de administrador e avaliador pela aplicação real apontada à cópia restaurada, com SMTP bloqueado.
6. Grava `recovery-report-<id>.json`, sanitizado, no perfil externo. Preserva a cópia restaurada e o backup; não executa limpeza automática desses dados.

As credenciais SQL são fornecidas por arquivo de opções temporário dentro do diretório protegido, sem senha em argumentos ou logs. O arquivo é removido no `finally`, inclusive se falhar o teste HTTP. `MYSQL_TEST_LOGIN_FILE` aponta para caminho ausente e exclusivo do teste, evitando carregar o login path pessoal; ver [opções de arquivos MySQL 8.0](https://docs.oracle.com/cd/E17952_01/mysql-8.0-en/option-file-options.html). Diagnósticos brutos dos clientes são suprimidos porque podem conter linhas privadas.

## Resultado observado

Última execução aprovada: **25/10/2026 às 17:40, horário de São Paulo**.

| Verificação | Resultado |
| --- | --- |
| Origem | `evaluation_isolated_0f8785e64029_v2` |
| Destino novo | `evaluation_isolated_0f8785e64029_v2_restore_4cc8d8390ab6` |
| Backup persistido | `backup-4cc8d8390ab6.evalbackup`, no perfil externo |
| Comparação | 8 tabelas, 36 registros; DDL e conteúdo coincidentes |
| Origem após todo o exercício | Sem alteração |
| Autenticação recuperada | Login/sessão/logout dos dois perfis aprovados |
| Arquivos temporários de credenciais/cofre | Nenhum remanescente na verificação final |
| Serviço MySQL80 existente | Permaneceu em execução |

A suíte padrão passou com **102 testes**, incluindo recusa de destinos existentes e testes de chave incorreta, identidade divergente e ciphertext adulterado. Build do frontend em modo development aprovado em diretório novo dentro de `node_modules/.cache`, preservando `frontend/dist`.

## Limites de recuperação

O arquivo criptografado exige a chave `recovery` do cofre correspondente. DPAPI CurrentUser vincula esse cofre à identidade Windows; copiar somente o backup não valida recuperação em outra máquina/conta. Proteção independente das chaves, cópia fora da máquina, retenção, rotação e restauração em outro host precisam de planejamento operacional próprio.

Este exercício recupera tabelas e dados do schema fictício, incluindo hashes de contas, sessões e contadores. Não exporta usuários SQL/grants, configuração do servidor ou cofre: o runner usa o provisionamento isolado existente e concede somente DML à aplicação na cópia nova. Política de revogação de sessões após uma recuperação operacional deve ser definida antes de produção.

Não houve simulação de perda do disco, recuperação point-in-time/binlog, restauração de produção ou teste com volume real. Não se infere RPO/RTO de produção a partir deste conjunto pequeno. Os cinco achados da revisão visual foram corrigidos após aprovação e validados com 48/48 verificações no Chrome, conforme [REVISAO_VISUAL.md](REVISAO_VISUAL.md).

## Backup anterior à 12ª migration — 26/10/2026

Após autorização para aplicar a pendência de vínculos, `RecoveryTest` confirmou **8 tabelas e 43 registros coincidentes**, incluindo DDL/conteúdo, com origem preservada e login de administrador/avaliador na cópia. O backup final usado foi `backup-2cf943c9fdd6.evalbackup`, mantido no perfil externo, e o destino novo foi `evaluation_isolated_0f8785e64029_v2_restore_2cf943c9fdd6`. A evidência de igualdade é anterior à migration e às fixtures de validação dessa cópia.

O teste de FK inicialmente esperava apenas os erros 1452/1451; o MySQL com a conta restrita retornou as variantes 1216/1217. O teste foi ajustado para reconhecer as rejeições equivalentes, mantendo falha para qualquer outro erro ou ausência de rejeição. [Referência oficial dos erros](https://dev.mysql.com/doc/mysql-errors/8.0/en/server-error-reference.html). Foram geradas cópias novas após falhas de teste; as anteriores foram preservadas e nenhuma tentativa modificou o schema original antes da aprovação de toda a validação na cópia.

Depois dos testes completos, a origem recebeu somente a 12ª migration. Contas, profissionais, autoria e oito avaliações foram comparados e preservados; os vínculos antigos permanecem nulos. Nenhum backfill foi executado. Zero arquivos temporários `recovery-client-*.cnf` ou `secrets.recovery.tmp` remanesceram na conferência final. A instância isolada foi parada ao encerrar, voltando ao estado anterior. [Relatório SQL](evidencias/vinculos-demandante-atual/mysql-validation-report.json) e [plano de vínculos](PLANO_VINCULOS.md).

## Backup anterior à conciliação confirmada — 27/10/2026

Após confirmação específica do mapa R01–R08 → P01, a API local foi suspensa. `RecoveryTest` gerou `backup-f1c9e61f498e.evalbackup` e restaurou em `evaluation_isolated_0f8785e64029_v2_restore_f1c9e61f498e`, com **8 tabelas/46 registros**, DDL/conteúdo coincidentes, origem preservada e login dos dois perfis recuperado. A contagem inclui sessões/limites; continuam sendo oito avaliações. Conclusão do backup em **27/10/2026 às 20:14, horário de São Paulo**, já com 12 migrations e antes dos vínculos. Relatório externo: `recovery-report-f1c9e61f498e.json`.

A cópia só foi alterada depois dessa igualdade. Após rollback, concorrência/repetição e HTTP reais passarem nela, o aplicador revalidou origem e aplicou seus oito vínculos sem modificar demais campos de negócio. A cópia preservada passou a conter os vínculos/testes e já não é uma cópia integralmente igual ao backup anterior. O backup criptografado e o manifesto privado com estado anterior foram preservados, sem limpeza de schemas.

API retomada, MySQL/frontend mantidos. Nenhuma migration ou SMTP novo. **152 testes aprovados**, além da validação real da aplicação e inventário final. Mesmos limites de recuperação em outro host/DPAPI descritos acima; nenhuma restauração automática sobre a origem foi executada. [Resultado e resumo sanitizado](REVISAO_CONCILIACAO.md#aplicação-confirmada-e-executada).
