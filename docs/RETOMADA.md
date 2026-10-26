# Ponto de retomada

Atualizado em **26/10/2026** após a retomada, atualização dos READMEs e implementação dos dois lotes locais aprovados de Nodemailer/PM2. O usuário solicitou enviar as alterações ao GitHub. Este registro acompanha o código e as evidências; não autoriza deploy ou mudanças em produção.

## Estado entregue

- Passport Local, sessões persistentes MySQL, autorização administrativa/por avaliador, CSRF, limitação, expiração/revogação, troca de senha, CLI e interface de login implementados.
- Cadeia completa de 11 migrations validada somente em MySQL 8.0.44 isolado, com as duas correções aprovadas e contas fictícias.
- Backup criptografado e restauração em schema separado aprovados no lote anterior. Recuperação em outro host ainda pendente.
- Cinco problemas visuais corrigidos e revalidados; submissão da avaliação permanece desativada.
- Contrato de validação/paginação aprovado e implementado: notas 1–5 em passos de 0,5, consistência de média/nível/desconto, textos até 255 caracteres, IDs válidos, page=1/limit=25 e teto 100 em `/registros2`; entrada inválida retorna 400.
- READMEs da raiz/backend/frontend descrevem funcionalidades, acessos, telas/API, execução local e limites reais. O frontend usa `npm start`, sem script `dev`.
- Nodemailer **10.2.1** e PM2 **7.1.1**, fixados após aprovação. Corrigida a aspa ausente no remetente de `mail2.js`, preservando o endereço. Cadeias npm OpenCensus/uuid e get-uri/basic-ftp removidas pelo PM2 novo.
- Audit online do **backend: zero entradas, código 0**, após os dois lotes. O audit **frontend zero** é o resultado do lote anterior; não foi repetido.
- Runner PM2 fictício opt-in passou **7/7**, com pipes exclusivos no Windows, ambiente sanitizado, rede bloqueada e daemon encerrado. Métricas WMI foram negadas e não estão validadas. Nenhum daemon pessoal/operacional foi usado.
- O usuário ajustou `backend/api.js` para o hostname de exemplo `api.mysite.com` e removeu comentários inativos; alteração preservada, com teste e documentação alinhados.

Validações do lote local: **113 testes aprovados**, zero falhas/skips, audit backend zero e ciclo PM2 7/7. Evidências em [DEPENDENCIAS_SEGURANCA.md](DEPENDENCIAS_SEGURANCA.md#atualizacao-principal-local-nodemailer-e-pm2). Integração SQL isolada, **48/48 verificações no Chrome** e build de desenvolvimento aprovados continuam como evidências do lote anterior, concluídas na noite de 25/10 em São Paulo (UTC dos relatórios já indica 26/10). Não foram repetidas sem mudanças nessas áreas ou nova dúvida concreta.

## Como retomar

Ler `../AGENTS.md`, [AI_CONTEXT.md](AI_CONTEXT.md), [PLANO_EVOLUCAO.md](PLANO_EVOLUCAO.md), [DEPENDENCIAS_SEGURANCA.md](DEPENDENCIAS_SEGURANCA.md) e [PLANO_VALIDACAO_API.md](PLANO_VALIDACAO_API.md). Conferir primeiro `git status`, branch e diferenças remotas; preservar qualquer trabalho posterior a este registro.

Próximo lote sugerido: **investigar vínculos legados por nome/e-mail com fixtures e preparar proposta**, preservando dados reais, schema e contratos. Qualquer correção estrutural exige plano e aprovação próprios. Os saltos locais de Nodemailer/PM2 estão concluídos; não repetir instalação/audit/testes sem mudança ou dúvida concreta. Não executar `npm audit fix --force` nem reiniciar daemon de produção.

Depois: desenhar persistência dos arrays de critérios e submissão antes de ativá-la, planejar recuperação em outro host/proteção das chaves, purga e recuperação de senha. URLs, HTTPS e proxy de produção não estão definidos; rotação das credenciais SMTP antigas depende do responsável operacional. Cluster, startup/resurrect, métricas WMI e SMTP real não foram validados pelos lotes locais.

## Reiniciar o ambiente local, se necessário

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

> Continuar conforme AGENTS.md e docs/RETOMADA.md. Conferir o Git e investigar vínculos legados por nome/e-mail usando fixtures para preparar uma proposta, sem alterar schema/dados reais ou ativar submissão. Nodemailer/PM2 já foram atualizados e validados localmente; consultar as evidências antes de repetir trabalho.
