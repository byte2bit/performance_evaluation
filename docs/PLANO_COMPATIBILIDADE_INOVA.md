# Compatibilidade do banco local — E1 concluído na cópia

**E1 aprovado e aplicado em 29/10/2026, às 21:28 (São Paulo), após liberação do requisito `REFERENCES` e nova solicitação para continuar.** Duas migrations executadas **somente em `127.0.0.1:3306/inova_nucleo_compat_20261029`**, com checkpoints, preservação integral dos campos antigos e validação real de FKs/rollback. Origem `inova_nucleo`, perfil anterior em 50470 e aplicação ativa preservados. **Não repetir E1 nem os comandos históricos abaixo**. [E2A posteriormente implementado/validado com dados sintéticos](PLANO_ACESSO_MYSQL_LOCAL.md#resultado-de-e2a-e-contrato-interno--29102026); acesso operacional e mapas ainda pendentes.

## Diagnóstico e decisão proposta

A cópia reproduz nove tabelas **MyISAM**, 680 linhas, incluindo 25 contas, 100 profissionais e 498 avaliações. [Cópia conferida](evidencias/conexao-mysql-local/copy-report.json). O driver `mysql` usado pelo backend conectou e executou uma consulta de metadados nessa cópia, sem iniciar a aplicação. Isso confirma o driver/conexão, não o funcionamento de autenticação ou regras de negócio.

O código atual depende de transações e bloqueios de linha para autenticação, gestão e avaliação mensal. Por isso, copiar MyISAM sem tratar o engine não permite declarar essas garantias atendidas. A proposta é converter **apenas `users2`, `colab` e `registros` da cópia** para InnoDB e acrescentar as estruturas necessárias. Não converter as seis tabelas legadas restantes nem alterar engine na origem. [MySQL: engines e transações](https://dev.mysql.com/doc/refman/8.0/en/innodb-introduction.html).

Alternativas examinadas:

- Apontar a API diretamente ao legado: recusada neste momento, pois faltam estruturas, há hashes bcrypt incompatíveis com o verificador atual e MyISAM não fornece as garantias transacionais usadas pelo código.
- Reaplicar a cadeia compartilhada de migrations: inadequada; o ledger legado contém uma migration ausente, há diferenças de tipo/engine e a migration 13 pressupõe vínculos/FK que esse banco não tem. Não editar o ledger nem desabilitar validação para forçar a execução.
- **Trilha própria na cópia, com validação e histórico separados:** proposta para E1. Mantém as sete entradas legadas e o baseline 14 do outro perfil intactos.

## Escopo técnico de E1

| Área | Alteração proposta somente na cópia |
| --- | --- |
| Engines | Converter `users2`, `colab`, `registros` para InnoDB; manter colunas, conteúdo, índices existentes e charsets/collations. Não reduzir TEXT, converter NULL ou reescrever observações. |
| Histórico de compatibilidade | Nova trilha em `backend/compat/inova/migrations/`, com tabelas próprias `inova_compat_migrations` e `inova_compat_migrations_lock`, em InnoDB. Não inserir, excluir ou renomear registros do ledger `migrations` existente. |
| Contas | Acrescentar `active` obrigatório com default `false` e `session_version` unsigned obrigatório com default zero. Preservar os 25 hashes bcrypt, IDs, nomes/e-mails, perfil administrativo e exclusão existentes. Não ativar contas nem redefinir/rehash senhas. |
| Sessões | Criar `sessions` com `sid` de até 255, `sess` JSON e `expired` datetime indexado, em InnoDB, conforme contrato atual. Não copiar sessões do perfil anterior. |
| Limites | Criar `auth_rate_limits` com `key`, `points` e `expire`, em InnoDB, conforme contrato atual. Sem inserir contadores ou alterar segredos operacionais. |
| Gerências | Criar `gerencias` em InnoDB com nome, `demandante_id` unsigned, exclusão e timestamps; FK restritiva a `users2.id`. Deixar vazia; não transformar rótulos em responsáveis automaticamente. |
| Profissionais | Adicionar `gerencia_id` unsigned **nullable nesta transição**, `deletedAt` e índice de gerência/estado, com FK restritiva. Preservar todos os 100 profissionais e seus campos textuais originais. |
| Avaliações | Adicionar `colab_id` unsigned nullable, índice e FK restritiva a `colab.id`. Manter todas as 498 avaliações e campos originais. Não vincular os 440 candidatos nem eliminar os 58 sem candidato. |

O estado nullable é **intermediário de preparação**, sem habilitar a aplicação. A obrigatoriedade de gerência de todo profissional só será reforçada após mapa aprovado e preenchimento verificado. Não enfraquecer a regra do sistema ativo nem alterar a migration 14 já aplicada no outro perfil.

Os novos campos `active=false` não devem ser confundidos com uma decisão de habilitar as contas antigas. As senhas atuais continuarão incompatíveis com o verificador Argon2id até existir uma decisão explícita sobre acesso. E1 não altera esse verificador e não cria uma conta administrativa extra.

Arquivos propostos: duas migrations específicas nessa nova trilha (engine; estruturas aditivas), runner/ação opt-in com guardas de destino, testes de schema/orquestração e documentação. **Não alterar** o diretório compartilhado `backend/migrations`, `knexfile.js`, `.env`, rotas ou autenticação da aplicação neste lote.

## Sequência proposta e preservação

1. Conferir a identidade do servidor e o perfil protegido que criou a cópia; autenticar o manifesto privado. Recusar outro schema, origem, servidor, artefatos de execução existentes ou cópia modificada. Confirmar controle/exclusividade da cópia antes do DDL, sem interromper outros clientes automaticamente.
2. Confirmar que a cópia ainda coincide com o backup inicial, inclusive os campos originais/hashes. Preservar backup, cofre e manifestos atuais. Nenhuma cópia nova será escolhida implicitamente.
3. Registrar o estado prévio e o conjunto de alterações permitido em manifesto criptografado novo. Criar a trilha/ledger próprios exclusivamente no destino aprovado, mantendo o ledger antigo integralmente igual.
4. Converter os três engines; verificar colunas, índices, tipos, conteúdo e estado antes de passar ao lote aditivo. MySQL DDL possui commits implícitos: não prometer rollback transacional de conversão/DDL.
5. Aplicar somente as estruturas acima e comparar todos os **campos preexistentes**. Diferenças permitidas são engines dessas três tabelas, campos/índices/FKs/tabelas novos e seus defaults, sem alteração dos valores antigos. As outras seis tabelas manterão DDL/conteúdo idênticos.
6. Validar FKs e rollback transacional com sondas controladas e revertidas na cópia, sem alterar permanentemente hashes, responsáveis ou histórico. Não iniciar API, fazer login, enviar e-mail ou realizar DML na origem.
7. Preservar cópia, backup e relatório final. Se houver falha parcial, interromper e registrar o ponto; não executar down, apagar/recriar o schema ou mudar de alvo para tentar de novo. A origem e o aplicativo anterior continuam disponíveis.

## Testes e aceitação

Antes do DDL real: testes em mocks/SQL compilado devem bloquear origem/outros schemas, servidor diferente, estado alterado, ledger inesperado e tentativa de aplicar migrations compartilhadas. A geração de SQL não pode remover colunas, reduzir TEXT, mudar charsets, alterar senhas ou inferir IDs.

Na cópia: comprovar os três engines InnoDB, novos campos/defaults e FKs restritivas, 25 contas/100 profissionais/498 avaliações preservadas, sete migrations legadas intactas, outras seis tabelas inalteradas e ausência de atribuições automáticas. Toda coluna histórica será comparada, inclusive hash e observações longas/NULL. Testar rollback em cópia; não usar MyISAM da origem como prova de transação.

Não repetir build/Chrome do frontend por alteração exclusivamente de ferramentas/schema. A integração HTTP será um lote posterior, com modelo de login, mapa e fixtures explicitamente aprovados.

## Dependências para conectar a aplicação depois de E1

- Definir o acesso das 25 contas bcrypt: compatibilidade controlada e política de atualização de hash, ou ativação/redefinição individual aprovada. Não pedir senhas pelo chat nem desativar Passport/CSRF/autorização.
- Revisar os responsáveis das cinco gerências. O inventário não encontrou candidatos de conta pelas comparações usadas; grupos G01–G05 têm 40/23/16/20/1 profissionais. Detalhes individuais permanecem criptografados fora do Git.
- Aprovar o mapa dos 440 candidatos textuais e o tratamento dos 58 registros sem candidato. Não criar cadastros de preenchimento ou apagar histórico para satisfazer constraints. Avaliações sem vínculo permanecerão preservadas; sua visibilidade administrativa dependerá da regra de transição aprovada.
- Só após os mapas, preencher vínculos, reforçar gerência obrigatória e validar o histórico/autorização/bloqueio mensal em cópia.
- Definir segredos próprios e origem local do launcher, validar o alvo e aprovar eventual aplicação/ativação sobre `inova_nucleo`. A API atual continuará no perfil anterior até essa aprovação.

## Resultado da execução E1 — 29/10/2026, 21:28

O [novo preflight](evidencias/conexao-mysql-local/compat-preflight-ready-report.json) retornou `ready=true` às 21:27:55: nenhum privilégio requerido ausente, backup autenticado, origem/cópia iguais ao baseline e nenhum concorrente. O runner não concedeu privilégios. A execução aprovada concluiu em **2026-10-30T00:28:10.725Z**, sem falha parcial. [Relatório real](evidencias/conexao-mysql-local/compat-e1-report.json), [resumo de validação](evidencias/conexao-mysql-local/compat-e1-validation-summary.json).

Resultados observados:

- **Duas migrations** registradas no ledger próprio `inova_compat_migrations` (batch 1); sete entradas e conteúdo do ledger antigo intactos.
- `users2`, `colab`, `registros` convertidas para **InnoDB**, preservando tipos/collations, índices e todos os campos preexistentes. Comparação integral de **680 linhas originais**: 25 contas/hashes, 100 profissionais, 498 avaliações e demais dados. As outras seis tabelas mantiveram DDL/conteúdo idênticos; origem permaneceu igual ao backup inicial.
- Estruturas/campos aprovados presentes; sessões, limites e gerências vazios. **Zero contas ativas, zero vínculos aplicados**, todas as versões de sessão zero. Gerência de profissional e vínculo de avaliação continuam nullable somente nesta preparação.
- **Três FKs restritivas** conferidas. Dois updates com IDs inexistentes rejeitados pelo MySQL; alterações de sonda nas três tabelas InnoDB revertidas com rollback e conferência posterior de todos os campos históricos/defaults. Não houve inserção permanente de fixtures ou rehash.
- Três checkpoints criptografados e relatório final preservados na pasta externa protegida; nenhum artefato de falha. ACL continua sem herança, com duas regras (usuário atual/SYSTEM). Somente relatório sanitizado copiado ao repositório.
- Inspeção posterior em leitura confirmou 25 hashes `$2a$` de custo 10, e-mails válidos/canônicos sem grupos duplicados e dois administradores existentes, ambos ainda inativos. Sem valores individuais em logs/docs.

Nenhum código alterado nesta execução: os **256 testes** são o resultado observado da preparação anterior, não foram repetidos. Validações reais SQL acima executadas agora. Sem build/Chrome, SMTP, API nova ou alteração de `.env`, credenciais, driver, dependências ou origem. A aplicação continua no perfil anterior; E1 não conclui a integração de acesso/mapas.

O usuário escolheu manter as senhas e migrar hashes após login válido. [Plano E2A](PLANO_ACESSO_MYSQL_LOCAL.md) preparado para implementação em código/testes sintéticos; ativação de contas, launcher e mapas permanecem separados. **Não executar E1 novamente**, `down`, criação/inventário antigos ou migrations compartilhadas neste schema.

## Implementação e conferência inicial — histórico, 29/10/2026

Implementados sem dependências novas ou mudanças na aplicação:

- `backend/compat/inova/migrations/20261029000100_transactional_engines.js`: conversão qualificada exclusivamente das três tabelas aprovadas.
- `20261029000200_additive_structures.js`: campos/tabelas/índices e três FKs restritivas conforme escopo acima; sem DML, backfill, alteração de senha ou ativação.
- `backend/compat/inova/scope.js`: exige capacidade emitida pelo runner, confirmação E1, conexão exata e identidade real do servidor. Recusa execução pela cadeia compartilhada e outro alvo. `down` é recusado.
- `backend/scripts/local-mysql-compat.js` e ações opt-in `PreflightCompatibility`/`ApplyCompatibility` em `local-mysql-copy.ps1`: autenticação de backup/manifesto, comparação integral do baseline, privilégios prévios, visibilidade de conexões/metadata locks e trava cooperativa. Preflight não cria ledger nem arquivos de execução. O aplicador usa lista fechada de duas migrations e ledger InnoDB próprio, compara campos antigos e preserva checkpoints criptografados externos. Não há `GRANT`, down, exclusão, troca automática de alvo ou reinício da aplicação.
- `backend/test/local-mysql-compat.test.js`: 14 testes novos com mocks e SQL compilado; guardas de alvo, servidor, autorização, backup adulterado, estado alterado, privilégios, cadeia errada, concorrente, schema, comparação de hashes/campos e rollback das sondas. **Suíte completa: 256/256 aprovados**, sem falhas/skips. Parser PowerShell e `git diff --check` passaram.

Conferência real somente leitura concluída em **2026-10-30T00:18:56.699Z (29/10, 21:18 em São Paulo)**: backup autenticado, origem/cópia iguais ao manifesto, nove tabelas/680 linhas, sete migrations legadas e nenhuma conexão concorrente na cópia. **`ready=false`, `missingPrivileges=["REFERENCES"]`**. O usuário configurado tem os demais privilégios exigidos, mas seu `ALL PRIVILEGES` específico se aplica à origem; não se estende automaticamente à cópia. Nenhum grant foi alterado. [Relatório sanitizado](evidencias/conexao-mysql-local/compat-preflight-report.json).

**Estado naquela conferência inicial:** tabelas MyISAM, sem campos novos e sem ledger E1; DDL/FKs/sondas reais ainda pendentes. Esse estado foi sucedido pela execução concluída descrita acima. A compilação/testes não substituía a execução SQL posterior.

### Histórico do requisito externo — resolvido antes da execução

O MySQL exige `REFERENCES` na tabela pai para criar uma FK: [documentação oficial 8.0](https://dev.mysql.com/doc/refman/8.0/en/create-table-foreign-keys.html). Um administrador local deve conceder **somente esse privilégio na cópia** ao usuário/host efetivamente autenticado pela configuração do projeto. Não conceder privilégio global, modificar a origem ou enviar credenciais pelo chat. Modelo para revisão/execução no cliente administrativo local, substituindo os placeholders:

```sql
GRANT REFERENCES ON `inova_nucleo_compat_20261029`.*
TO '<usuario_configurado>'@'<host_autenticado>';
```

Este SQL **não foi executado**. A alteração de privilégios não fazia parte do escopo E1 aprovado e exige ação administrativa própria; não há credencial administrativa disponibilizada ao runner. Não elevar permissões por inferência nem usar as credenciais do MySQL isolado de outra porta.

Depois do ajuste administrativo, a autorização E1 recebida continuou válida para o mesmo alvo/escopo e foi usada, sem aprovação repetida. **Comandos históricos já executados; não repetir**:

```powershell
./backend/scripts/local-mysql-copy.ps1 -Action PreflightCompatibility -Confirmation 'inova_nucleo_compat_20261029:3306:compatibility-e1-only'
```

Após `ready=true`, backup/cópia íntegros e sem clientes concorrentes, foi executado:

```powershell
./backend/scripts/local-mysql-copy.ps1 -Action ApplyCompatibility -Confirmation 'inova_nucleo_compat_20261029:3306:compatibility-e1-only'
```

O runner recusa falta de privilégios **antes do primeiro DDL**, conferida em teste. `ApplyCompatibility` não foi invocado durante o primeiro bloqueio; foi executado uma vez após novo preflight válido, conforme resultado atual. Em falha parcial, preservar cópia, ledger e `compat-e1-*.evalinventory`/relatório de falha; não repetir ou executar down. A trava nomeada é cooperativa, não impede que um cliente externo se conecte no futuro; o runner também inspeciona sessões/metadata locks e confere preservação nos checkpoints, sem matar clientes ou prometer exclusividade permanente.

O banco ainda não está pronto para a versão atual da aplicação. Após E1, acesso bcrypt, mapas, obrigatoriedade final de gerência e ativação continuam sujeitos às decisões/autorizações descritas acima.
