# Validação local de Registros — continuação em 29/10/2026

O usuário solicitou retomar a próxima etapa após implementar Registros. O trabalho de validação permanece local e fictício. Não inclui domínio definitivo, produção, migrações, SMTP ou publicação.

## Revisão visual

O runner `frontend/scripts/review-records.mjs` intercepta todas as chamadas da API, proíbe escritas e bloqueia destinos externos. Usa o Chrome instalado e `playwright-core` 1.64.1, preparado **offline**, a partir do cache npm, exclusivamente em `frontend/node_modules/.cache/records-review-tools`. Nenhum manifesto/lockfile do projeto foi alterado nem navegador foi baixado.

Cobertura: 320, 390, 768 e 1440 px, temas claro/escuro, período inclusivo e invertido, combinação com busca por data formatada, limpeza, histórico completo por ID, homônimos, registros sem vínculo, atualização de autorização, erro/retry, comentários tratados como texto, todas as notas, médias legadas, lacunas mensais, seleção de séries, tabela acessível, foco/Tab/Escape e ações administrativas ocultas para avaliador.

A primeira execução identificou que o elemento `summary` da tabela mensal não era incluído pelo seletor de foco do modal. Corrigido em `useFlowbiteModal.js`, com regressão em memória e no Chrome. Acrescentada orientação de rolagem do gráfico em telas pequenas. Capturas do modal usam a viewport para não confundir posicionamento fixo com a rolagem da página ao gerar imagem completa.

Execução final: **148 grupos de verificações aprovados, 18 capturas, zero erros JavaScript** no Chrome headless. Inspeção visual das capturas de página, histórico e detalhes em desktop/celular e temas claro/escuro; sem overflow da página/painel nos tamanhos testados. Artefatos ficam em `frontend/node_modules/.cache/records-review/`, ignorados pelo Git e contendo somente fixtures.

Suíte completa executada: **210/210 testes aprovados**, zero falhas/skips, incluindo seis novos testes de segurança do runner SQL ainda não executado. Build Vite development em cache, parser PowerShell, sintaxe JavaScript e `git diff --check` aprovados. Manifestos e lockfiles dos projetos preservados. [Resumo sanitizado](evidencias/registros-local/summary.json).

Para repetir com os serviços locais já ativos:

```powershell
$env:EVAL_VISUAL_TOOL_DIRECTORY = Join-Path (Get-Location) 'frontend/node_modules/.cache/records-review-tools'
node frontend/scripts/review-records.mjs
```

## Concorrência real — aprovada e concluída

Após confirmação explícita do usuário **somente para esta cópia local**, `backend/scripts/isolated-monthly-records.js` foi executado pela ação opt-in `ValidateMonthlyRecords`. Concluído em **29/10/2026 às 15:18:47, horário de São Paulo**, sem falhas, migrations ou mudanças no código durante a execução. A origem foi acessada somente para verificar identidade/schema, gerar o backup e comparar dados; fixtures e gravações HTTP ficaram na cópia autorizada.

Alvos autorizados nesta execução:

| Papel | Alvo |
| --- | --- |
| Perfil existente | `0f8785e640294ebbbd5490d74b01e59a`, loopback `127.0.0.1:50470` |
| Origem, somente leitura | `evaluation_isolated_0f8785e64029_v2`, baseline 14 |
| Nova cópia exclusiva | `evaluation_isolated_0f8785e64029_v2_restore_20261029a001` |
| Identificador reservado | `20261029a001`; destino existente é recusado, sem sobrescrever |
| Confirmação exigida | `records:monthly:copy-only:baseline14` |

Procedimento executado:

1. Conferir o Git, o perfil/UUID/bind/porta e o baseline 14. Suspender brevemente **somente a API local deste perfil** para garantir ausência de escritores durante o backup; frontend/MySQL permanecem ativos.
2. Gerar backup criptografado e restaurar as nove tabelas em uma nova cópia no mesmo MySQL isolado, reutilizando `recover`, com ID explícito. Dump/credenciais não são exibidos; SQL fica em memória. Recusar destino/artefato existentes. Comparar DDL/conteúdo, origem preservada e autenticação recuperada. Sem migrations.
3. Conceder à aplicação somente DML nessa cópia, como já faz a recuperação. Iniciar a aplicação na cópia em porta loopback efêmera, sem SMTP, e inserir exclusivamente nela três profissionais e uma gerência fictícios, utilizando as contas fictícias recuperadas.
4. Manter um bloqueio transacional real sobre um profissional. Enviar duas requisições concorrentes pelos dois POSTs, com sessões de avaliador/administrador. Exigir dois bloqueios observados em `performance_schema.data_lock_waits` antes de liberar a transação. Aceitar exatamente um 204, um 409 e uma inserção, com autoria/data corretas.
5. Testar duplicidade nas duas rotas/perfis, tentativa de forjar timestamp, homônimos por ID, transferência de responsável sem alterar autoria e limites de mês/ano/ano bissexto via consultas SQL reais. Os limites usam fixtures com datas explícitas **só na cópia**; relógios do sistema/MySQL e timestamps de gravação da API não são alterados.
6. Comparar integralmente os dados de negócio/contas da origem com o estado inicial. Preservar cópia, backup e relatório sanitizado; encerrar a aplicação de testes e retomar a API principal. Não executar DROP, DELETE de limpeza, down ou aplicação de migrations.

Todos os critérios de aceitação passaram: duas esperas InnoDB observadas; somente uma gravação concorrente; ambas as rotas/perfis rejeitando duplicidade; homônimos independentes; limites SQL corretos; fuso da sessão registrado; baseline 14 e origem/contas preservados; aplicativo principal retomado. Falhas não autorizam tentar em outro alvo ou remover artefatos.

Comando histórico executado — **não repetir**: o destino e os artefatos agora existem e devem ser preservados. O runner recusa sobrescrevê-los. Novos IDs/alvos exigem aprovação própria.

```powershell
$perfilAvaliacao = Join-Path $env:LOCALAPPDATA 'EvaluationDev/mysql-isolated-0f8785e64029'
./backend/scripts/isolated-mysql.ps1 -Action ValidateMonthlyRecords -ProfileDirectory $perfilAvaliacao -MonthlyCopyId 20261029a001 -ConfirmMonthlyRecords 'records:monthly:copy-only:baseline14'
```

O runner requer a origem fictícia exata, confirmação, ID, baseline e ausência de conexões da aplicação na origem antes de criar a cópia. O launcher recusa confirmação/ID ausentes antes de ler o cofre. A aprovação não se estende a outros mapas, hosts, esquemas ou dados reais. Backup/chaves e relatório externo continuam dependendo do cofre DPAPI local; este exercício não resolve recuperação em outro host.

### Resultados observados e artefatos preservados

- Backup criptografado `backup-20261029a001.evalbackup`, fora do repositório. Restauração de **9 tabelas/52 registros**, incluindo tabelas de sessão/controle, com DDL e conteúdo coincidentes e login recuperado dos dois perfis. Essa igualdade é anterior às fixtures: a cópia atual contém também os dados de teste preservados. [Relatório de recuperação sanitizado](evidencias/registros-local/mysql-recovery-report.json).
- Duas requisições, pelos dois POSTs e com sessões de avaliador/administrador, ficaram bloqueadas em InnoDB. Após liberar o bloqueio, o resultado foi **um 204, um 409 e exatamente uma inserção**. Autoria da sessão e data do banco conferidas.
- Ambas as rotas/perfis recusaram repetição, inclusive com `created_at` forjado pelo cliente. Homônimos permaneceram independentes por ID. Após transferência da gerência, o avaliador anterior recebeu 403 e o administrador atual recebeu 409, preservando as avaliações e suas autorias.
- Inclusão/exclusão dos limites de mês, dezembro/janeiro e fevereiro bissexto passaram em SQL real com fixtures na cópia. Isso verifica as consultas com datas explícitas, sem alterar relógio do sistema/MySQL nem escolher datas de gravação via HTTP. O teste HTTP concorrente usa o mês real da gravação.
- Fuso observado na sessão MySQL: `SYSTEM`, com deslocamento **UTC−03:00** nesta execução. Isso não confirma configuração de outros ambientes.
- Comparação integral das contas, gerências, profissionais e avaliações da origem antes/depois passou. Nenhuma migration executada. A aplicação de teste e suas conexões foram encerradas; cópia/backup/relatórios ficaram preservados. [Relatório SQL/HTTP sanitizado](evidencias/registros-local/mysql-validation-report.json).
- Zero arquivos `recovery-client-*.cnf` remanescentes e nenhum `secrets.recovery.tmp`. Nenhum cofre, backup ou segredo foi copiado para o Git; somente os relatórios sanitizados.
- API principal retomada pelo launcher do mesmo perfil, com baseline 14 exigido por `Serve`; log `serving: true`, stderr vazio e `/session` anônimo **401**. Frontend `/registros` **200**, MySQL existente e frontend preservados.

Nesta execução não se repetiram os 210 testes em memória, o build ou a revisão Chrome: esses resultados são da etapa imediatamente anterior, e não houve mudança no código após eles. Sem SMTP, testes em domínio definitivo, produção, commit/push ou deploy. A recuperação em outro host e a garantia de unicidade contra SQL direto continuam fora deste lote; a regra mensal é aplicada pelos dois handlers transacionais da API.
