# E3 — mapas aplicados e prévia local da cópia

**Atualização posterior:** o usuário solicitou e confirmou a redefinição da senha da conta 12, concluída somente na cópia em `2026-10-30T03:36:56.492Z`. As afirmações abaixo de preservação dos hashes descrevem a execução E3 anterior a esse pedido. Backup, senha/versão alterados sem mudança de perfil, outras contas/origem preservadas; prévia segue ativa. [Resultado e entrega local das credenciais](REDEFINICAO_CONTA_LOCAL.md).

**Aprovado pelo usuário ao solicitar “prossiga” após este plano concreto e executado.** Mapa e terceira migration concluídos em `2026-10-30T02:53:27.225Z`; prévia iniciada e validada posteriormente. Alvo único: `127.0.0.1:3306/inova_nucleo_compat_20261029`. Cinco gerências da conta 12, 100 profissionais vinculados, 395 avaliações conciliadas e 103 pendentes. **315 testes e build aprovados.** [Abrir login local](http://localhost:5174/login), API em `http://localhost:8002`. Origem preservada. Não repetir o aplicador E3, E1/E2B ou comandos de criação/restauração. O resultado e os comandos operacionais estão no final; a sequência abaixo registra o plano autorizado.

## Objetivo e limites

Preparar a cópia com seus dados existentes e abrir uma prévia funcional do projeto, preservando o aplicativo anterior. Alvo único de banco: **`127.0.0.1:3306/inova_nucleo_compat_20261029`**. Origem `inova_nucleo` e perfil MySQL 50470 intactos. Sem novos schemas, grants, reset de senhas, promoção de contas, SMTP ou domínio definitivo. Não repetir E1/E2B nem usar migrations compartilhadas.

Decisões propostas para aplicação:

| Grupo | Profissionais | Demandante escolhido |
| --- | ---: | ---: |
| G01 | 40 | conta 12 |
| G02 | 23 | conta 12 |
| G03 | 16 | conta 12 |
| G04 | 20 | conta 12 |
| G05 | 1 | conta 12 |

Criar cinco gerências com os rótulos legados válidos, mantendo a ordem por primeiro ID de profissional do inventário. Reservar IDs 1–5 somente após comprovar que `gerencias` permanece vazia e esses IDs não foram usados. Associar os 100 IDs profissionais aos respectivos grupos, sem reescrever os campos textuais antigos. A interface deriva o responsável atual pelo vínculo da gerência, conforme contrato existente.

Para avaliações: mapear **somente os 395 pares únicos com igualdade binária** entre nome gravado e cadastro. Registrar os pares de IDs em manifesto privado antes de aplicar; confrontar com as consultas de [revisão local](REVISAO_MAPAS_INOVA.md). Os 45 pares apenas por collation e os 58 sem candidato — **103 registros** — ficam intactos, com `colab_id=NULL`. Não eliminar duplicidades mensais antigas, renomear pessoas, alterar autoria/datas/notas/comentários ou criar cadastros de preenchimento. Texto exato é critério da proposta escolhida, não prova universal de identidade.

A visibilidade dos 103 pendentes já é **somente de administradores**, implementada por `scopeRecords`; mantê-la, sem nova exceção. Avaliadores recebem somente histórico vinculado de profissionais das gerências sob sua responsabilidade. Administradores mantêm acesso global; a conta 12 conserva seu perfil atual. Os demais avaliadores ficarão sem gerências atribuídas nesta configuração, conforme escolha de um único responsável. Não alterar perfis para mudar esse resultado.

Alternativas: apontar imediatamente a aplicação ao schema incompleto deixaria profissionais sem gerência e história sem acesso por ID; vincular os 440 ignoraria as 45 diferenças por collation; trocar a API principal agora interromperia o perfil anterior. Proposta: mapa fechado e validado, schema reforçado e **prévia em portas separadas**.

## Arquivos e recursos previstos

- Novo runner de mapas/validação local, reutilizando guardas de perfil, snapshots, backup e criptografia. Ação opt-in de aplicação com confirmação E3 própria, sem escolher outro alvo automaticamente.
- Migration **`backend/compat/inova/migrations/20261029000300_require_colab_gerencia.js`**: somente tornar `colab.gerencia_id` unsigned obrigatório após comprovar todos os vínculos. Trilha/ledger próprios `inova_compat_migrations`, que passarão de duas para três entradas. Fonte fechada valida as duas já executadas e aplica somente a terceira; não alterar a migration 14 do perfil anterior ou o ledger legado com sete entradas.
- Novo launcher de prévia da cópia, com identidade de servidor/schema e baseline E3 conferidos, e script de frontend em `frontend/scripts/` se necessário. Não relaxar os scripts isolados de 50470 nem ligar o adaptador bcrypt ao bootstrap padrão.
- Artefatos externos novos no perfil protegido: `maps-e3-before.evalbackup`, `maps-e3-before.evalinventory`, `maps-e3-proposal.evalinventory`, `maps-e3-applied.evalinventory`, `maps-e3-report.json` e cofre separado **`inova-preview-secrets.dpapi`**. Recusar sobrescrita/execução repetida; preservar cofre e backups anteriores. IDs/nomes/detalhes do mapa permanecem criptografados, sem saída individual ou cópia para o Git.
- Prévia: frontend **`http://localhost:5174`**, API **`http://localhost:8002`**, processos vinculados ao loopback, iniciados sem janelas desnecessárias. Conferir portas livres antes de iniciar; não parar outros processos ou escolher portas diferentes sem avisar.

## Sequência de aplicação e preservação

1. Autenticar perfil, inventário e manifestos E1/E2B; conferir origem/servidor, ledger, schema, estado pós-E2B, exclusividade cooperativa/conexões, ausência de novos artefatos e dos objetos de ensaio E2B já removidos. Esperar 25 contas ativas/versão um, cinco grupos de 40/23/16/20/1, gerências vazias, 100 profissionais e 498 avaliações ainda sem vínculo. Divergências interrompem antes de escrita.
2. Fazer backup criptografado atualizado de todas as 14 tabelas da cópia, com READ locks na lista integral durante captura/readback e conferência. Sem lock global ou dependência de transação para tabelas MyISAM. Preservar os hashes/contas, ledger, demais dados e contadores no manifesto anterior.
3. Gerar mapa privado explícito: cinco gerências → conta 12; partição exata dos 100 IDs profissionais; 395 pares de avaliação/profissional binariamente idênticos e únicos; lista dos 103 pendentes. Conferir cobertura, IDs, conta ativa, rótulos válidos e snapshots com o estado aprovado. Recusar qualquer par adicional ou inferência pelo autor da avaliação.
4. Ensaiar o DML de mapa em transação InnoDB e reverter. Inserir gerências com IDs 1–5, preencher somente `colab.gerencia_id` e `registros.colab_id` dos IDs previstos; não alterar nenhum campo antigo. Comparar após rollback. **Exceção técnica explícita:** ensaio de inserções pode avançar o AUTO_INCREMENT da tabela nova `gerencias` até 6 mesmo após rollback; usar os mesmos IDs explícitos na aplicação definitiva, sem reseed ou inserção extra. Contadores das demais tabelas devem permanecer iguais.
5. Revalidar mapa/estado/exclusividade e aplicar o mesmo DML uma vez em transação, bloqueando os registros e condicionando valores prévios. Exigir cinco gerências, 100 profissionais associados, 395 avaliações vinculadas e 103 nulas. Conta 12, contas/perfis/hashes e todo conteúdo legado permanecem iguais.
6. Aplicar somente a terceira migration de compatibilidade; conferir tipo unsigned, índice/FKs restritivas preservados e `gerencia_id NOT NULL` para todos os profissionais, inclusive arquivados. O DDL tem commit implícito: se falhar após o mapa, preservar o estado, backup e relatório do ponto de falha. Não prometer rollback conjunto, executar down, recriar banco ou repetir automaticamente.
7. Conferir todos os campos históricos, vínculos/contagens esperados, outras tabelas, ledger antigo e origem. Validar leituras SQL de escopo para conta 12, administradores e outro avaliador sem gerência, sem autenticar contas existentes ou imprimir seus dados. Distinguir testes de query/escopo das provas de autenticação já obtidas com fixtures em E2B; não alegar login validado das 25 contas.
8. Preservar manifesto/relatório sanitizado e preparar a prévia somente após essas conferências. Mapa ou schema parcial não autoriza iniciar a prévia.

## Prévia de frontend e API

O frontend usa `VITE_API_URL` em `src/plugins/axios.js`; `vite.config.js` não define proxy. A topologia será de origens locais distintas por porta, com **`VITE_API_URL=http://localhost:8002`** apenas no processo da prévia e `FRONTEND_ORIGIN=http://localhost:5174` na API. Preservar `withCredentials`, CORS exato, verificação de Origin/CSRF, Passport Local e stores SQL existentes.

O launcher compõe `createAuth` com o serviço/adaptador E2A **somente para esse perfil validado**. `config/passport.js` padrão segue Argon2id; não habilitar bcrypt genericamente por ambiente/HTTP/host. Segredos de sessão/limitação serão aleatórios, distintos e próprios da prévia, no novo cofre DPAPI; não expor em argv, logs ou Git. Usar nome de cookie exclusivo, por exemplo `evaluation.inova.local.sid`: portas diferentes não isolam cookies do mesmo host. Não mudar cookies/sessões do perfil anterior.

Bootstrap preserva a ordem Consign de middlewares, validação, API e rotas; injetar a autenticação específica sem ela ser sobrescrita pelo módulo padrão. Não carregar `index.js`/`knexfile.js`/`.env` como bootstrap nem executar migrations no startup. Impedir criação/envio de transporte SMTP no processo da prévia, mesmo para administrador; não disponibilizar credenciais SMTP a esse filho.

Iniciar Vite com a configuração existente, cache separado do servidor principal e porta 5174 estrita, sem alterar arquivos `.env`; iniciar API na porta 8002 e abrir o login local no navegador disponível. Preservar localhost:5173/8001. Verificar HTTP, autenticação anônima negada, CSRF/CORS e frontend sem efetuar login com senha de conta existente. **A senha será digitada pelo usuário no navegador**, sem chat/log/captura; o primeiro login válido pode atualizar somente o hash/versão daquela conta, conforme E2A. Parar somente processos da prévia em falha.

Após a abertura, sessões/limites e contas podem evoluir legitimamente pela aplicação: o launcher de serviço valida identidade/schema/ledger e invariantes, sem reaplicar o mapa ou exigir que hashes continuem bcrypt após uso. O aplicador E3 permanece de execução única. Nenhuma submissão de avaliações será habilitada por este lote além do comportamento atual da interface.

## Validação e aceitação

- Guardas em mocks/SQL antes de executar: outro alvo/UUID/estado/ledger, artefatos preexistentes, conta 12 indisponível, mapa fora das contagens/IDs, collation-only indevida, par ambíguo, falta de backup, porta ocupada e tentativa de alterar campo histórico.
- Rollback e aplicação SQL reais nos IDs aprovados; comparação de todos os campos antigos e contas; terceira migration somente na cópia, unsigned/NOT NULL/FKs íntegros, 5/100/395/103 conferidos e origem preservada.
- Leituras de autorização por SQL e testes de autenticação/default Argon2id; nenhum bypass no Vue/backend. Registros legados duplicados preservados e novas gravações continuam sob a regra mensal por ID; não gravar avaliações de teste sobre o histórico existente.
- Build e verificação local da interface com dados simulados para qualquer ajuste necessário; não capturar dados individuais em relatório/screenshots. Preview/backend acessíveis nas portas aprovadas, sessão/CSRF e cookies separados do principal, SMTP bloqueado.
- Relatório final discrimina execução real, mocks e itens não testados. A cópia passa a ser o alvo da **prévia**; a origem `inova_nucleo` e a aplicação principal não são migradas/trocadas. Os 103 registros pendentes continuam intactos e com visibilidade administrativa até nova revisão.

## Resultado da execução E3

Preflight real em `2026-10-30T02:52:28.723Z` confirmou alvo/servidor, privilégios, estado pós-E2B, mapa e portas livres. Aplicação terminou em `2026-10-30T02:53:27.225Z` (29/10, 23:53 em São Paulo). [Relatório SQL](evidencias/conexao-mysql-local/maps-e3-report.json) e [resumo da validação](evidencias/conexao-mysql-local/maps-e3-validation-summary.json).

- Backup criptografado de **14 tabelas/683 linhas**, com READ locks na lista integral e readback autenticado, antes de qualquer alteração. Ensaio transacional revertido e comparado; DML definitivo aplicado uma vez.
- Cinco gerências, todas sob a conta **12**, e 100 profissionais vinculados, na partição 40/23/16/20/1. Exatamente **395 avaliações** receberam `colab_id`; **103 seguem nulas** (45 apenas por collation e 58 sem candidato). Nenhuma duplicidade histórica removida.
- **25 contas/hashes, perfis e campos históricos preservados**, assim como a origem `inova_nucleo`. Não houve login automatizado de conta existente. A conta 12 já era administradora; seu perfil foi mantido, portanto ela consulta as 498 avaliações, inclusive pendentes. Os demais administradores também conservam acesso global; avaliadores sem gerências atribuídas consultam zero.
- Somente a terceira migration de compatibilidade foi aplicada, no batch 2 da trilha própria: `gerencia_id` unsigned obrigatório, índices/FKs preservados. **Três entradas de compatibilidade e sete entradas legadas**, sem executar a cadeia compartilhada.
- A primeira seleção de atores de escopo repetiu a conta 12 como responsável e administrador no relatório SQL original. O helper foi corrigido para escolher outro administrador e uma **nova verificação somente leitura**, em `2026-10-30T03:03:25.909Z`, comprovou **três atores distintos** e contagens **498/498/0**. [Evidência complementar](evidencias/conexao-mysql-local/maps-e3-scopes-report.json). Mapa/migration não foram repetidos.

Arquivos implementados neste lote:

- `backend/scripts/local-inova-maps.js`, `backend/compat/inova/maps-scope.js`, terceira migration própria e ações `PreflightMaps`/`ApplyMaps` em `local-mysql-copy.ps1`: guardas, backup, manifesto fechado, rollback, aplicação e conferências.
- `backend/scripts/local-inova-preview.js` e `.ps1`: validação de identidade/schema/ledger, composição explícita de credenciais legadas, processos próprios em loopback, cofre separado, SMTP bloqueado e diagnóstico por identidade dos processos. `Status` consulta `127.0.0.1` com `-NoProxy`, sem modificar proxy/configuração de rede do computador.
- `frontend/scripts/serve-inova-preview.mjs`: Vite existente, porta estrita 5174, cache separado e API 8002 apenas no ambiente desse processo. `review-inova-preview.mjs`: revisão anônima de login em Chrome, sem submissão ou dados de negócio.
- `backend/test/local-inova-maps.test.js` e `local-inova-preview.test.js`: **17 testes novos**. Sem novas dependências, alterações de `.env`, bootstrap padrão ou política de hashes de produção.

No perfil protegido `%LOCALAPPDATA%/EvaluationDev/inova-nucleo-compat-20261029`, foram preservados os novos backups/manifestos `maps-e3-*`, relatório complementar, **`inova-preview-secrets.dpapi`**, metadados e logs próprios da prévia. ACL sem herança, somente usuário atual/SYSTEM. Não sobrou CNF temporário nem relatório de falha E3. Somente relatórios sanitizados foram copiados ao repositório; nenhum mapa individual, hash, cofre ou chave.

### Validações observadas

**315/315 testes aprovados**, zero falhas/skips, com `node --test backend/test/*.test.js frontend/test/*.test.js`. A suíte usa fixtures/mocks e HTTP local; a prova SQL real é registrada separadamente acima. Vite 6.4.4 compilou 269 módulos com `VITE_API_URL=http://localhost:8002`, saída em `frontend/node_modules/.cache/inova-e3-build`. Sintaxes JS, parser PowerShell e diff conferidos.

[HTTP real](evidencias/conexao-mysql-local/preview-http-report.json): login 200, Axios apontando a 8002, acesso anônimo `/session` 401, CORS exato de 5174 com credenciais, cookie próprio `evaluation.inova.local.sid` host-only/HttpOnly/SameSite=Lax e POST sem CSRF 403. Origem 5173 não foi autorizada na prévia. `Status` confirmou API e frontend prontos, com nonce e PID correspondentes aos processos iniciados. Cookies/segredos do perfil anterior foram preservados.

[Revisão visual anônima](evidencias/conexao-mysql-local/preview-visual-summary.json): larguras 1440 e 390, sem overflow horizontal ou erros JavaScript, campos vazios, nenhuma submissão/login, solicitações externas bloqueadas. Capturas inspecionadas localmente e mantidas apenas no cache ignorado. A integração nativa de controle do navegador estava indisponível; a abertura do login no navegador padrão foi solicitada via sistema operacional, e a inspeção visual foi realizada com Chrome headless já disponível, sem instalação.

A API anterior em 8001 respondeu 401 para sessão anônima; o frontend anterior em 5173 não respondeu na conferência. Este lote não iniciou nem parou esse frontend, e sua disponibilidade inicial não foi registrada. Configuração da aplicação principal e perfil 50470 não foram trocados. A prévia **permaneceu em execução** ao término.

Não foram testados logins com as senhas desconhecidas das 25 contas, navegação autenticada nessas contas, novas avaliações sobre o histórico existente, recuperação operacional em outra máquina ou produção. O fluxo de login/rehash já foi exercitado com fixtures SQL/HTTP em E2B. O usuário pode entrar no login local com seu e-mail e senha atuais; um login válido atualiza somente hash/versão da conta conforme E2A. Leituras de startup não exigem que hashes, contagens ou versões fiquem congelados após uso legítimo.

### Operação da prévia já preparada

No PowerShell 7, na raiz do projeto, verificar os serviços:

```powershell
./backend/scripts/local-inova-preview.ps1 -Action Status -Confirmation 'inova_nucleo_compat_20261029:3306:maps-e3-owner12-exact395-preview'
```

O mesmo launcher aceita `Check` (schema/invariantes, sem iniciar), `Start` (iniciar ou reconhecer os dois serviços próprios já ativos) e `Stop` (somente processos identificados desta prévia). `Stop` foi implementado com checagem de propriedade, mas não executado contra os serviços ativos neste lote. `VerifyScopes` é uma prova pontual já registrada com arquivo exclusivo: **não repetir** sobre o mesmo relatório. `Start` não executa migrations, mapas ou resets. Se houver divergência, preservar perfil/backup/logs e investigar, sem remover guardas ou alterar o alvo.

**Não executar novamente `ApplyMaps`, E1, E2B, CreateCopy, InspectCopy ou down.** Resolução dos 103 pendentes, outro mapa/alvo ou transição sobre a origem exigem escopo próprio. A conexão solicitada está disponível na prévia da cópia, sem domínio definitivo, SMTP real, publicação, commit ou push.
