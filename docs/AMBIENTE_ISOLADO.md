# MySQL isolado e autenticação local

Validado em 25/10/2026, com autorização para criar instância separada, aplicar migrations corretivas somente nela e provisionar contas fictícias. Nenhuma configuração, credencial ou dado de produção foi alterado. Nenhum e-mail foi enviado.

**Estado posterior em 26/10/2026:** após nova autorização, a **12ª migration foi aplicada e validada neste perfil isolado**, primeiro em cópia recuperada e depois no schema original. As oito avaliações anteriores foram preservadas com vínculo nulo; continuam administrativas até conciliação. A instância estava parada antes da tarefa e foi novamente encerrada ao final; API local não ficou em execução. Outros ambientes não foram alterados. [Modelo e evidências](PLANO_VINCULOS.md).

## Ambiente preparado

| Item | Valor |
| --- | --- |
| MySQL | 8.0.44, binário já instalado, processo separado do serviço MySQL80 |
| Endereço | `127.0.0.1:50070`, acesso somente por loopback |
| Perfil externo | `%LOCALAPPDATA%/EvaluationDev/mysql-isolated-0f8785e64029` |
| Schema atual | `evaluation_isolated_0f8785e64029_v2` |
| Administrador fictício | `admin@example.invalid` |
| Avaliador fictício | `reviewer@example.invalid` |
| Segredos | `secrets.dpapi`, criptografia DPAPI CurrentUser e ACL restrita ao usuário Windows atual e SYSTEM |

As senhas são aleatórias e distintas; as contas usam hashes Argon2id. Os segredos de sessão e HMAC também são independentes, gerados a partir de 32 bytes aleatórios. O launcher descriptografa o cofre em memória, fornece variáveis somente ao processo filho e restaura o ambiente ao encerrar. O cofre não é portável para outra identidade Windows; não deve ser copiado para o Git. A validação usa as credenciais internamente, sem mostrá-las em logs ou argumentos. Não há senha padrão ou cadastro público.

Os dados e logs ficam no diretório externo protegido. `profile.json` contém apenas metadados de isolamento; `validation-report.json` contém resultados sanitizados. O arquivo temporário de inicialização da senha root foi removido após o primeiro início. A conta SQL da aplicação possui somente SELECT/INSERT/UPDATE/DELETE no schema isolado; a conta de migrations tem DDL somente nos schemas fictícios. O driver Knex existente continua sendo `mysql`; as contas dessa instância 8.0.44 usam `mysql_native_password` para compatibilidade. Isso não valida compatibilidade com MySQL 8.4/9 ou com outra política de autenticação SQL.

## Comandos de uso

Executar no PowerShell 7, como o mesmo usuário Windows que criou o cofre, a partir da raiz do projeto:

```powershell
$perfilAvaliacao = Join-Path $env:LOCALAPPDATA 'EvaluationDev/mysql-isolated-0f8785e64029'
./backend/scripts/isolated-mysql.ps1 -Action Info -ProfileDirectory $perfilAvaliacao
./backend/scripts/isolated-mysql.ps1 -Action Start -ProfileDirectory $perfilAvaliacao
./backend/scripts/isolated-mysql.ps1 -Action Validate -ProfileDirectory $perfilAvaliacao
```

`Start` verifica a identidade se a porta já estiver ocupada e recusa outro servidor. `Validate` não importa `backend/.env`, `knexfile.js` ou `index.js`: usa exclusivamente o perfil externo e carrega os módulos reais pelo Consign com `app.db` isolado. Antes das operações, verifica diretório de dados, porta, UUID, bind e marcador de propriedade do schema. O transporte SMTP é bloqueado. As fixtures gravam somente dados fictícios desse perfil; cada validação acrescenta uma avaliação fictícia e um schema de controle histórico. Esses dados são preservados, sem limpeza automática.

Para executar a API com esse banco em terminal dedicado:

```powershell
./backend/scripts/isolated-mysql.ps1 -Action Serve -ProfileDirectory $perfilAvaliacao
```

A API fica em `127.0.0.1:8001`; a origem permitida é `http://localhost:5173`, SameSite=Lax e proxy não confiado. O modo é exclusivamente local HTTP. O launcher não inicia o frontend; este continua com seu comando Vite existente e URL local da API. A revisão visual e o uso manual das credenciais não fazem parte dos resultados automatizados abaixo.

Para parar somente a instância identificada:

```powershell
./backend/scripts/isolated-mysql.ps1 -Action Stop -ProfileDirectory $perfilAvaliacao
```

Para criar outro perfil independente usando o binário MySQL já instalado:

```powershell
./backend/scripts/isolated-mysql.ps1 -Action Initialize
```

O comando informa o novo diretório e porta. Use esse diretório explicitamente nos comandos seguintes. Não sobrescreve perfis existentes. `NewSchema` seleciona uma nova geração vazia, guarda cópia dos metadados/relatório anteriores e preserva todos os schemas; a criação e as migrations ocorrem no próximo `Validate`. Não equivale a backup/restauração.

## Schema e evidências observadas

As migrations históricas falhavam ao criar `registros`: MySQL retornou `ER_FK_NO_INDEX_PARENT` (1822), por ausência de índice no nome referenciado em `colab`. O runner reproduz esse erro em um schema fictício separado como controle; a falha desse controle não indica falha da cadeia corrigida.

As duas correções aprovadas são:

- `20240622215800_add_colab_name_index.js`: cria índice não único antes da migration histórica da FK; preserva índice compatível já existente. O timestamp é anterior à criação de `registros` para permitir instalação limpa.
- `20261025000400_add_liderancas_to_registros.js`: acrescenta string nullable somente se ausente, cobrindo a coluna usada pelos handlers existentes.

Os arquivos históricos foram preservados. Os dois `down` recusam remoção automática, pois podem encontrar índice ou coluna previamente criados manualmente; uma reversão exige plano específico com backup e análise da FK/valores. Não executar rollback indiscriminado.

Resultado observado no schema novo: **11 migrations aplicadas**, sem corrigir tabelas por código de fixture. Os testes HTTP com banco real confirmaram login, escopo SQL, restrições administrativas, CSRF, transação de avaliação, sessão persistida após reiniciar a aplicação, logout, troca de senha, revogação e expiração por TTL/inatividade/prazo absoluto. Limitação compartilhada entre dois pools permitiu 10 e bloqueou 5 de 15 chamadas concorrentes. A conta da aplicação recebeu erro de permissão ao tentar CREATE TABLE. A própria instância MySQL foi parada, iniciada e revalidada com sucesso.

Suíte padrão independente: `node --test backend/test/*.test.js frontend/test/*.test.js`, **100 testes aprovados**. Os testes adicionais cobrem recusa de perfil local/identidade divergente/schema sem marcador e preservação de schema preexistente nas correções. A suíte padrão não executa o runner SQL automaticamente.

Backup/restauração foi posteriormente executado com sucesso nesse alvo: 8 tabelas e 36 registros coincidentes, origem preservada e login dos dois perfis na cópia restaurada. Comando `RecoveryTest`, proteção dos artefatos e limites em [BACKUP_RESTAURACAO.md](BACKUP_RESTAURACAO.md). Suíte atual: 102 testes aprovados.

Os cinco problemas da revisão visual foram corrigidos após aprovação: **48/48 verificações no Chrome**, 27 capturas, 102 testes automatizados e novo build aprovados. Exclusões foram simuladas, sem chegar à API; ver [REVISAO_VISUAL.md](REVISAO_VISUAL.md).

## Revalidação após dependências e contrato da API

O runner `Validate` foi executado novamente após os ajustes aprovados de dependências/validação. Passaram os fluxos de autenticação, sessão, autorização, transações, limitação e privilégios mínimos. O campo `apiInputValidation` do [relatório sanitizado](evidencias/evolucao-dependencias-api/mysql-validation-report.json) registra rejeições 400 nos dois caminhos de avaliação, parâmetros/IDs inválidos e cadastro inválido sem alterar as contagens de linhas, além de paginação com escopo e limite.

Uma avaliação fictícia com texto de 255 caracteres Unicode foi gravada/lida dentro de transação e revertida com rollback, preservando linhas existentes. Isso valida o charset do alvo isolado, sem certificar produção. Nenhuma migration foi criada ou aplicada neste lote. Suíte atual: **108 testes aprovados**; Chrome **48/48** e novo build aprovados. Versões e evidências em [DEPENDENCIAS_SEGURANCA.md](DEPENDENCIAS_SEGURANCA.md). O teste de backup/restauração acima continua sendo evidência do lote anterior; não foi repetido nesta etapa.

Continuam pendentes: recuperação em outro host/volume real, dados legados e duplicidade dos nomes referenciados, políticas de retenção e configuração de produção. O índice não único conserva o contrato atual; não resolve a fragilidade do vínculo por nome. A aprovação deste ambiente não autoriza aplicar migrations em outro banco, alterar `.env` de produção ou publicar.

## Aplicação da 12ª migration e validação do demandante atual

`ValidateLinks` é um runner específico para a transição **11 → 12 migrations**, a partir de relatório de recuperação explícito do próprio perfil. Recusa baseline diferente ou qualquer migration pendente além da aprovada. Não é comando para repetir no schema já atualizado.

Na execução autorizada foram usados `RecoveryTest` e depois:

```powershell
./backend/scripts/isolated-mysql.ps1 -Action ValidateLinks -ProfileDirectory $perfilAvaliacao -RecoveryReportName 'recovery-report-2cf943c9fdd6.json'
```

O runner verifica identidade/markers, ausência de conexões selecionando origem/cópia, backup e igualdade dos dados de negócio. Aplica somente a migration de vínculo na cópia, valida autenticação/HTTP, FKs, homônimos, collation e espera real de lock. Só então migra a origem e compara novamente contas, profissionais e avaliações, sem backfill. DDL/grants limitam-se aos schemas fictícios identificados.

Resultado final: 12 migrations, tipo/índice/FK corretos em ambos os schemas, 15 grupos de verificações SQL aprovados, oito avaliações originais preservadas e todos os vínculos históricos ainda nulos. Fonte: [relatório sanitizado](evidencias/vinculos-demandante-atual/mysql-validation-report.json). Relatórios/backup/cópias de tentativas anteriores permanecem no diretório protegido, sem limpeza automática. Suíte padrão atual: **127 aprovados**, zero falhas/skips; nenhum novo build/Chrome foi necessário após a etapa anterior.
