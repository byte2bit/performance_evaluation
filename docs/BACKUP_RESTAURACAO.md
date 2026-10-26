# Backup e restauração no MySQL isolado

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
