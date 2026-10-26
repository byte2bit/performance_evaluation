# Ponto de retomada

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

Próximo lote: **planejar revisão e conciliação dos oito vínculos legados**, preservando autoria e sem associação automática por nome/e-mail. `ValidateLinks` concluiu a transição 11→12 e recusa outro baseline; não repeti-lo no schema já atualizado. O runner genérico `Validate` altera fixtures e não é consulta somente leitura. Aplicação em outros alvos exige autorização própria. Não repetir instalações/audits/testes sem mudança ou dúvida concreta.

Depois: desenhar persistência dos arrays de critérios e submissão antes de ativá-la, planejar recuperação em outro host/proteção das chaves, purga e recuperação de senha. URLs, HTTPS e proxy de produção não estão definidos; rotação das credenciais SMTP antigas depende do responsável operacional. Cluster, startup/resurrect, métricas WMI e SMTP real não foram validados pelos lotes locais.

## Reiniciar o ambiente local, se necessário

O perfil abaixo já recebeu a 12ª migration. Iniciar MySQL e API somente se os serviços estiverem parados; a aplicação foi reaberta após a validação SQL. Histórico vazio para avaliadores é esperado enquanto os oito registros legados não forem conciliados; administradores continuam vendo esses registros. Esses comandos não migram outros ambientes.

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

Os runners `Validate`, `RecoveryTest` e `VisualReview` são opt-in; ler seus guias antes de executar. `Validate` acrescenta fixtures/schemas de controle fictícios; não é uma consulta somente leitura. A ferramenta temporária de navegador pode precisar ser preparada novamente se seu diretório tiver sido removido. Não aplicar migrations em outro ambiente com base na autorização dada para o perfil isolado.

O runner `node backend/scripts/isolated-pm2.js` também é opt-in: cria perfil temporário/aplicação fictícios e daemon exclusivo, bloqueia rede e encerra somente seus processos. Não inicia a API. Perfil e relatório são preservados; ver guia em `DEPENDENCIAS_SEGURANCA.md` antes de repetir.

## Pedido para a próxima conversa

> Continuar conforme AGENTS.md e docs/RETOMADA.md. Estão concluídos os vínculos por ID e a 12ª migration no MySQL isolado, além das páginas renovadas, temas claro/escuro, menu da conta e modais. Último lote: 130 testes, build e 78 grupos Chrome simulados aprovados; validação SQL anterior preservada. Conferir Git/GitHub e serviços antes de iniciar qualquer processo. Próxima etapa: planejar revisão/conciliação dos oito registros legados sem vínculo, preservando autoria e aguardando aprovação para implementá-la. Não repetir a migration, acessar produção, associar legados automaticamente ou ativar submissão. Banco, backups e cofre DPAPI ficam fora do Git e não são recuperados pelo clone.
