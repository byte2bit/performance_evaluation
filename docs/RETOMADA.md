# Ponto de retomada

Registrado em **26/10/2026**, para continuar a partir de **27/10/2026**. O usuário solicitou enviar as alterações ao GitHub e preparar a continuidade. Este registro acompanha o mesmo commit do código e das evidências; não autoriza deploy ou mudanças em produção.

## Estado entregue

- Passport Local, sessões persistentes MySQL, autorização administrativa/por avaliador, CSRF, limitação, expiração/revogação, troca de senha, CLI e interface de login implementados.
- Cadeia completa de 11 migrations validada somente em MySQL 8.0.44 isolado, com as duas correções aprovadas e contas fictícias.
- Backup criptografado e restauração em schema separado aprovados no lote anterior. Recuperação em outro host ainda pendente.
- Cinco problemas visuais corrigidos e revalidados; submissão da avaliação permanece desativada.
- Contrato de validação/paginação aprovado e implementado: notas 1–5 em passos de 0,5, consistência de média/nível/desconto, textos até 255 caracteres, IDs válidos, page=1/limit=25 e teto 100 em `/registros2`; entrada inválida retorna 400.
- Dependências atualizadas com compatibilidade verificada. Audit online final autorizado: **frontend zero entradas; backend seis (uma alta e cinco moderadas)**. Permanecem Nodemailer e a cadeia PM2/OpenCensus/uuid.

Últimas validações executadas: **108 testes aprovados**, integração SQL isolada aprovada, **48/48 verificações no Chrome**, build de desenvolvimento e conferência do diff aprovados. As evidências de integração e navegador foram concluídas na noite de 25/10, horário de São Paulo; os timestamps UTC dos relatórios já indicam 26/10. Não é necessário repetir essas validações sem mudanças ou nova dúvida concreta.

## Como retomar

Ler `../AGENTS.md`, [AI_CONTEXT.md](AI_CONTEXT.md), [PLANO_EVOLUCAO.md](PLANO_EVOLUCAO.md), [DEPENDENCIAS_SEGURANCA.md](DEPENDENCIAS_SEGURANCA.md) e [PLANO_VALIDACAO_API.md](PLANO_VALIDACAO_API.md). Conferir primeiro `git status`, branch e diferenças remotas; preservar qualquer trabalho posterior a este registro.

Próximo lote sugerido: **análise e proposta de atualização principal do Nodemailer e PM2**, com inventário dos consumidores, compatibilidade, testes sem SMTP real e plano de reversão. A implementação desses saltos deve ser explicada antes de instalar dependências; alterações operacionais/infraestrutura exigem aprovação conforme AGENTS.md. Não executar `npm audit fix --force` nem reiniciar daemon de produção.

Depois: investigar vínculos legados por nome/e-mail com fixtures, desenhar persistência dos arrays de critérios e submissão antes de ativá-la, planejar recuperação em outro host/proteção das chaves, purga e recuperação de senha. URLs, HTTPS e proxy de produção não estão definidos; rotação das credenciais SMTP antigas depende do responsável operacional.

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
npm --prefix frontend run dev -- --host localhost --port 5173 --strictPort
```

Acesso em `http://localhost:5173`. Não iniciar outro processo se a porta já estiver ocupada; verificar o processo existente. Os serviços locais podem encerrar ao fechar terminais ou reiniciar o computador; o repositório e o perfil externo persistem. Não usar o bootstrap normal do backend para este teste, pois a conexão deve continuar sendo exclusivamente isolada.

As contas fictícias são `admin@example.invalid` e `reviewer@example.invalid`. Não há senha padrão: senhas e segredos permanecem no cofre DPAPI externo, sem inclusão no GitHub. Backups, datadir e credenciais também ficam fora do repositório; um clone em outra máquina não os recupera. Ver [AMBIENTE_ISOLADO.md](AMBIENTE_ISOLADO.md) e [BACKUP_RESTAURACAO.md](BACKUP_RESTAURACAO.md).

Suíte em memória, sem banco/SMTP reais:

```powershell
node --test backend/test/*.test.js frontend/test/*.test.js
```

Os runners `Validate`, `RecoveryTest` e `VisualReview` são opt-in; ler seus guias antes de executar. `Validate` acrescenta fixtures/schemas de controle fictícios; não é uma consulta somente leitura. A ferramenta temporária de navegador pode precisar ser preparada novamente se seu diretório tiver sido removido. Não aplicar migrations em outro ambiente com base na autorização dada para o perfil isolado.

## Pedido para a próxima conversa

> Continuar conforme AGENTS.md e docs/RETOMADA.md. Conferir o Git e preparar a proposta de tratamento dos seis alertas restantes do backend, começando por Nodemailer/PM2, sem acessar produção nem enviar e-mails reais.
