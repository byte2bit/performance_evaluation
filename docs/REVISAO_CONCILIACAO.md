# Revisão das correspondências do perfil fictício

Revisão solicitada em **27/10/2026**, após o inventário somente leitura. A revisão inicial abaixo foi posteriormente confirmada pelo usuário, que autorizou implementação, backup/cópia, testes e aplicação exclusivamente no perfil fictício. **R01–R08 → P01 foi aplicado com sucesso**, preservando os demais campos; [resultado e evidências](#aplicação-confirmada-e-executada). O relato inicial foi mantido como histórico, sem estender a autorização a outros dados/alvos.

## Escopo e evidências

- Perfil MySQL isolado já documentado, com dados fictícios e 12 migrations; nenhum outro alvo foi consultado.
- Artefato original `inventory-c9ef67f5d8ab.evalinventory`, descriptografado/autenticado somente em memória.
- Nova leitura pelo módulo `collect`, com conta SQL da aplicação, verificação de identidade/schema e transação `REPEATABLE READ / READ ONLY`, encerrada por `ROLLBACK`.
- O detalhe selecionado e as contagens da nova leitura coincidiram com o inventário anterior. Isso valida os campos inventariados nesse instante; não compara notas/observações ou hashes de contas, que não integram a coleta.
- `backend/scripts/isolated-auth.js`, função `fixtures` (linhas 192–205): declara os profissionais fictícios A/B e provisiona somente administrador/avaliador. A é atribuído ao avaliador; B usa outra atribuição sem conta provisionada por essa fixture.
- `validateAuthentication` (linhas 299–324): autentica o avaliador, verifica acesso somente a A, grava avaliação para A e espera 403 ao tentar gravar para B. A autoria persistida vem da sessão, apesar de o payload de teste tentar fornecer outra.
- `docs/AMBIENTE_ISOLADO.md` documenta que cada execução de validação acrescenta uma avaliação fictícia. O código foi introduzido no commit `42bb26e`; o padrão é compatível com execuções repetidas, sem comprovar quantas vezes ou qual execução criou cada linha.
- `docs/evidencias/vinculos-demandante-atual/mysql-validation-report.json` registra preservação dos oito registros e dos profissionais durante a aplicação da 12ª migration, com vínculos nulos. O relatório é evidência histórica, não um novo teste de recuperação.

Nas fontes examinadas, não foi encontrada uma trilha imutável de criação que associe cada registro diretamente ao ID histórico de um profissional. Os candidatos são coerentes com as fixtures, mas essa coerência não deve ser apresentada como prova definitiva da identidade por registro.

## Proposta individual para confirmação

Os aliases abaixo são locais à revisão: R01–R08 seguem a ordem crescente dos IDs das avaliações no artefato original; P01/P02 seguem a ordem dos profissionais. IDs concretos e demais detalhes permanecem no relatório privado criptografado. P01 corresponde ao **Profissional fictício A**; P02 ao **Profissional fictício B**. Esses rótulos são os dados de teste declarados no código.

| Caso | Candidato proposto | Nome textual exato | Autoria compatível com a sessão da fixture | Decisão na revisão inicial |
| --- | --- | --- | --- | --- |
| R01 | P01 | Sim | Sim | Aguardando confirmação |
| R02 | P01 | Sim | Sim | Aguardando confirmação |
| R03 | P01 | Sim | Sim | Aguardando confirmação |
| R04 | P01 | Sim | Sim | Aguardando confirmação |
| R05 | P01 | Sim | Sim | Aguardando confirmação |
| R06 | P01 | Sim | Sim | Aguardando confirmação |
| R07 | P01 | Sim | Sim | Aguardando confirmação |
| R08 | P01 | Sim | Sim | Aguardando confirmação |

Todas as datas de criação inventariadas antecedem a conclusão registrada da aplicação da 12ª migration. Cada registro continua com `colab_id` nulo e tem um único candidato, sem equivalência apenas por collation. O candidato P01 não apresenta a pendência de atribuição identificada pelo inventário. A autoria é apenas evidência complementar do fluxo fictício: não determina a associação nem a permissão de leitura.

Os dois profissionais estão sem matrícula. P02 não é candidato de nenhuma das oito avaliações. Sua atribuição sem conta é coerente com o controle negativo do runner; isso não autoriza provisionar conta, trocar atribuição ou excluir o cadastro. Recomenda-se preservar esse cenário neste lote.

Artefato da revisão: `inventory-review-b20980a65853.evalinventory`, preservado no perfil externo, com decisões `pending_confirmation` e `approvedForApplication: false`. Foi relido/descriptografado em memória e comparado integralmente à revisão produzida. A identidade autenticada inclui perfil, schema, finalidade `review` e ID do artefato. A proteção usa o mesmo helper criptográfico do inventário, com as mesmas limitações de disponibilidade do segredo. O [resumo sanitizado](evidencias/inventario-conciliacao/review-summary.json) vincula a revisão ao SHA-256 do arquivo criptografado original; o hash não é de nomes/e-mails ou linhas privadas.

## Plano apresentado e posteriormente autorizado

Objetivo: se o usuário confirmar as oito correspondências, preencher somente `registros.colab_id` de R01–R08 com o ID concreto de P01, preservando autoria, nomes, notas e datas. Nenhuma mudança de schema, contrato HTTP, autenticação ou infraestrutura é necessária.

Alternativas: manter todos os vínculos nulos/administrativos até evidência adicional, ou confirmar explicitamente a identidade pretendida para os dados fictícios e aplicar o mapa revisado. Não deduzir automaticamente identidades a partir de candidatos futuros.

Arquivos previstos: novo `backend/scripts/isolated-reconcile.js`, integração por ação explícita em `isolated-auth.js`/`isolated-mysql.ps1`, testes próprios em `backend/test/` e atualização das evidências/continuidade. Nenhuma dependência nova. O aplicador deve consumir somente o mapa confirmado do artefato protegido, não gerar um novo mapa por nome.

1. Registrar a confirmação específica do usuário para R01–R08 → P01 no perfil fictício e preservar o manifesto protegido com valores anteriores/identidade dos artefatos. Qualquer mudança nas correspondências exige nova revisão.
2. Identificar e suspender a API local/escritores do alvo, preservando como estavam. Gerar backup atual com `RecoveryTest`, restaurar em schema novo e verificar igualdade. O backup anterior à 12ª migration não é suficiente para esta nova operação.
3. Implementar o aplicador com recusa de alvo/UUID/marcador/schema/migrations divergentes, mapa duplicado/inválido, ausência de confirmação, artefato adulterado, estado alterado ou links já preenchidos. Conferir também FKs, triggers/automatismos de timestamps e demais características que possam afetar a preservação dos dados. Não executar migration.
4. Aplicar primeiro na cópia recém-restaurada. Em uma transação, bloquear os profissionais envolvidos e os oito registros em ordem determinística, revalidar o estado aprovado e executar updates condicionais por ID e `colab_id IS NULL`. Atualizar somente o vínculo, exigir oito linhas e comparar todos os demais campos antes do commit. Qualquer divergência provoca rollback integral, sem correção silenciosa ou sucesso parcial.
5. Na cópia, validar listas completas/paginadas e consulta por ID: avaliador atual passa a consultar os oito registros e administrador mantém acesso; autor e datas permanecem. Casos negativos, troca de responsável, concorrência, falha parcial e repetição são cobertos por testes isolados pertinentes. Não chamar o `Validate` genérico, pois ele acrescenta fixtures e altera contas/limites.
6. Somente após a cópia passar e revalidar a origem ainda igual ao backup, aplicar o mesmo mapa/transação na origem fictícia autorizada. Registrar contagens e resultado sanitizados; preservar o manifesto, backup e cópia. Retomar os serviços no estado anterior.

Critérios de aceitação: exatamente oito vínculos R01–R08 → P01; nenhuma outra avaliação modificada; nomes, autores, notas, timestamps, profissionais e contas preservados; visibilidade conforme demandante atual/administrador; falha/reexecução nunca sobrescrevem associações; testes e cópia aprovados antes da origem. P02 permanece inalterado e nenhum e-mail é enviado.

Risco principal: liberar histórico para o profissional/demandante errado. Por isso a confirmação de identidade precede a aplicação, e o alvo é revalidado sob locks. Antes do commit, falhas usam rollback. Após commit, não executar anulação ou restauração automática: qualquer recuperação precisa considerar escritores posteriores e exige plano/aprovação próprios, utilizando os artefatos preservados. Não reutilizar `ValidateLinks`, limitado à transição 11→12.

## Validação desta revisão

A releitura do banco em transação somente leitura, igualdade dos campos inventariados e autenticação/releitura integral do artefato privado foram executadas com sucesso em **27/10/2026 às 20:05, horário de São Paulo**. Sem código de aplicação alterado nesta etapa; a suíte de 141 testes do lote anterior permanece histórica e não foi repetida. Não houve backup/restauração novos, aplicação de mapa, SQL de escrita, serviços reiniciados, migrations, SMTP, commit/push ou deploy.

## Aplicação confirmada e executada

Após a pergunta explícita sobre R01–R08 → P01 e o lote com backup/cópia antes da origem, o usuário respondeu para prosseguir. A autorização foi aplicada somente ao mapa revisado e ao perfil fictício. O relatório original permanece imutável com decisões pendentes históricas; a aprovação e os valores anteriores completos de negócio foram registrados separadamente, criptografados em `reconcile-manifest-41e54f3a633f.evalinventory`, com identidade autenticada de perfil/schema/lote. O manifesto inclui dados privados e deve permanecer no perfil externo, sem impressão ou cópia para o Git.

Implementados `backend/scripts/isolated-reconcile.js`, ação `ReconcileReviewed` no launcher e 11 testes novos. O módulo fixa o perfil e o artefato revisados, autentica a revisão/inventário, confere o SHA-256 do artefato original e exige o argumento explícito `R01-R08:P01`. Não cria mapas por nome. Antes de escrever, exige backup posterior à revisão, igualdade dos dados de negócio entre origem/cópia, ausência de outras conexões selecionando esses schemas, identidade/marcador/12 migrations, InnoDB, FK restritiva e ausência de triggers/automatismos de atualização dos registros.

Cada aplicação usa conexão da conta SQL da aplicação e uma transação: leitura/bloqueio determinístico de contas (compartilhado), profissionais e avaliações (exclusivo), comparação integral ao baseline, updates por ID com `colab_id IS NULL` e comparação integral antes do commit. Somente o campo do vínculo é modificado. Dados pequenos são limitados a 10 mil linhas por tabela; não é ferramenta de conciliação genérica ou validada para produção. Root é usado na orquestração de verificação/backup e na transferência temporária de teste somente na cópia; não atualiza avaliações da origem.

Com a API local suspensa, `RecoveryTest` gerou `backup-f1c9e61f498e.evalbackup` e restaurou em `evaluation_isolated_0f8785e64029_v2_restore_f1c9e61f498e`. **8 tabelas/46 registros** tiveram DDL/conteúdo coincidentes; origem preservada e login dos dois perfis recuperado. Contagens incluem tabelas técnicas de sessão/limitação, não 46 avaliações. O relatório é `recovery-report-f1c9e61f498e.json`.

Comando **histórico, já executado — não repetir no lote aplicado**:

```powershell
./backend/scripts/isolated-mysql.ps1 -Action ReconcileReviewed -ProfileDirectory $perfilAvaliacao `
  -ReviewReportName 'inventory-review-b20980a65853.evalinventory' `
  -RecoveryReportName 'recovery-report-f1c9e61f498e.json' `
  -ConfirmReviewedMap 'R01-R08:P01'
```

Na cópia, os oito updates foram primeiro exercitados com rollback, confirmando nenhum efeito persistido. A aplicação definitiva esperou por um lock concorrente de profissional, observado em `performance_schema.data_lock_waits`, e passou após sua liberação. Repetição recusada, sem sobrescrever vínculos. HTTP real confirmou 401 anônimo; oito leituras de avaliador atual/administrador nas listas, paginação e IDs; autores/datas preservados; sessão existente do avaliador perde imediatamente o histórico ao transferir P01 temporariamente para a atribuição administrativa. A transferência foi restaurada somente na cópia e todos os dados de negócio voltaram ao esperado; não criou conta ou mudou P02.

Só depois dessa validação, com a origem ainda integralmente igual ao baseline e novamente verificada, foram aplicados seus oito vínculos em uma transação. Conclusão em **27/10/2026 às 20:14, horário de São Paulo**: **8 vinculados, 0 sem vínculo, 0 órfãos; 12 migrations mantidas**. A comparação integral de negócio confirmou nomes, autoria, notas, observações, timestamps, profissionais e contas preservados, exceto pelos oito `colab_id` aprovados.

O inventário final `inventory-61b11ed12f83.evalinventory` confirmou essas contagens em transação somente leitura. P02 sem conta e as duas matrículas ausentes foram preservados. O relatório da aplicação é `reconcile-report-41e54f3a633f.json`, no perfil externo; checkpoints registram fase e estado de commit para diagnóstico sem dados privados. Após commit não há anulação/restauração automática; qualquer recuperação exige análise de escritores posteriores e autorização própria.

A API foi retomada. Uma verificação HTTP adicional na **origem** confirmou login dos dois perfis, oito registros nas listas completa/paginada e todos os IDs acessíveis; as sessões desse teste foram encerradas. Testes de autenticação alteram somente sessões/contadores, sem edição de contas ou dados de negócio. Frontend e MySQL permaneceram em execução. Evidência pública limitada ao [resumo sanitizado da aplicação](evidencias/conciliacao-aplicada/summary.json); backup, cópia e manifesto foram preservados fora do Git.

Validação atual: **152/152 testes aprovados**, zero falhas/skips, parser PowerShell sem erros e diff conferido. Testes novos cobrem confirmação/mapa/artefatos, locks determinísticos, rollback após três updates, contagem divergente, timestamp implícito, estado desatualizado, repetição, dry run, IDs inválidos e estrutura incompatível. Sem nova dependência ou migration, SMTP, alteração de frontend, build/Chrome novo, commit/push ou deploy. Outros alvos e recuperação em outro host permanecem não validados.
