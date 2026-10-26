# Achados e acompanhamento

Inspeção em 25/10/2026. Documentação autorizada no primeiro lote de implementação; não representa certificação de segurança nem inspeção do ambiente de produção. Segredos e dados pessoais foram omitidos.

## Escopo e evidências

Foram examinados os dois `package.json`, versões dos lockfiles e instalações, entradas Express/Vhost, middlewares, rotas, configuração Knex, migrations, módulos de API, configuração parcial Passport, componentes de cadastro/listagem/formulário, store, Axios, roteador, integração Tailwind/Flowbite e testes existentes. URLs locais de frontend/API foram verificadas sem divulgar segredos. O banco e os serviços externos não foram acessados.

O fluxo e as versões estão em `AI_CONTEXT.md`.

## Corrigidos no primeiro lote

| Gravidade original | Local / evidência | Impacto anterior | Resultado e teste |
| --- | --- | --- | --- |
| Crítico | `backend/api/mail.js` e `mail2.js`: credenciais SMTP literais em arquivos versionados | Exposição de segredo e possível uso indevido da conta, se válido | Valores removidos desses módulos; `lib/mail.js` usa ambiente externo. Falta de configuração retorna 503 sem transporte. **Rotação e histórico continuam pendentes.** |
| Alto | Templates de `mail.js` e `mail2.js`: interpolação direta de campos do corpo em HTML | Injeção de marcação nos e-mails e adulteração do conteúdo | Campos dinâmicos escapados, incluindo nomes, observações e itens; testes com marcação maliciosa nos dois templates |
| Médio | Handlers SMTP não chamavam `res.send`/equivalente e apenas registravam falhas | Requisições pendentes e falhas sem retorno ao cliente | Resposta única: 204, 503 ou 502; testes de espera, sucesso, falha de criação e rejeição SMTP |
| Médio | `registros.getReg` respondia dentro de `.then` e novamente depois do `await` | Dupla resposta e rejeição assíncrona; consulta de contagem desnecessária | Lista enviada uma vez, sem contagem não utilizada; 500 sanitizado; testes com banco simulado |
| Médio | `Colabs.vue` e `Registros.vue`: atualização local antes da confirmação de DELETE | Itens desapareciam mesmo com falha; lista visível de registros podia permanecer desatualizada | Atualização somente após sucesso; ambas as listas de registros sincronizadas; ID capturado antes da requisição; testes de sucesso, falha e alteração da seleção durante a espera |
| Médio | `.catch("Erro")` nas telas e `.catch(console.log(...))` no cadastro | Rejeições sem tratamento efetivo e ausência de mensagem de falha | Tratadores reais nas telas; formulário preservado após falha; mensagem genérica no store sem registrar erro bruto da API |

## Pendências por gravidade

Atualização após a retomada aprovada: os achados de rotas anônimas, identidade fixa e exposição de erros descritos abaixo registram o estado anterior. A mitigação foi validada também em MySQL isolado com dados fictícios, conforme seção seguinte. Produção não foi examinada.

### Mitigações do lote de autenticação

- Todas as rotas de negócio existentes exigem sessão no Express. Consulta por ID/lista e ambos os caminhos de avaliação aplicam escopo de demandante na query; avaliadores não recebem dados de outros. Cadastro/exclusão e e-mail possuem restrições administrativas conforme matriz aprovada.
- O login consulta `users2`, verifica Argon2id e atividade, regenera sessão e não emite JWT. Perfil e versão são reconsultados a cada requisição; logout, expiração, troca de senha e desativação revogam acesso.
- Mutações exigem origem exata, JSON e CSRF; o cookie é HttpOnly, sem Domain, com Secure obrigatório em produção. O modo local só aceita frontend local. Limitadores SQL falham com 503 quando indisponíveis, sem fallback que libere a tentativa.
- `src/js/store.js` deixou de conter mapeamento pessoal/identidade administrativa fixa; estado vem da sessão. O bundle compilado não contém os e-mails daquele mapeamento. Guardas/visibilidade no Vue complementam a autorização do backend.
- Os handlers de dados usam campos graváveis explícitos e erros genéricos. Gravações de avaliação atribuem demandante pela sessão e verificam o profissional em transação. No lote posterior aprovado, `lib/business-validation.js` acrescentou validação de regras, tipos, comprimentos Unicode e consistência, integrada também no cadastro de profissionais. Payloads inválidos retornam 400; `/registros2` passou a ter padrões 1/25 e teto 100. Ver [PLANO_VALIDACAO_API.md](PLANO_VALIDACAO_API.md).
- CLI administrativa com confirmação de alvo/ação e senha sem eco; nenhuma execução contra dados reais. Store/limitador não criam schema no startup e não executam limpeza automática de expirados.

Evidência inicial de integração: 100 testes automatizados aprovados; build de desenvolvimento aprovado no lote anterior. Integração adicional executada em MySQL 8.0.44 separado, com 11 migrations aplicadas, contas fictícias, autorização SQL/transações, persistência após reiniciar a aplicação, expiração e revogação. Concorrência do limitador: 10 permitidas e 5 bloqueadas entre 15 chamadas por dois pools. DDL da conta da aplicação negado. A instância isolada foi reiniciada e revalidada. Segredos locais externos protegidos por DPAPI/ACL; detalhes e reprodução em [AMBIENTE_ISOLADO.md](AMBIENTE_ISOLADO.md).

Atualização de recuperação: backup criptografado e restauração em outro schema isolado aprovados, com 8 tabelas/36 registros coincidentes, origem intacta e login dos dois perfis na cópia. Suíte atual: 102 testes aprovados; build de desenvolvimento aprovado. Ver [BACKUP_RESTAURACAO.md](BACKUP_RESTAURACAO.md).

Atualização visual: a inspeção original no Chrome confirmou cinco problemas, posteriormente corrigidos com autorização: responsividade da avaliação/cabeçalho, confirmações de exclusão, contraste no escuro e ID duplicado. O rodapé deixou de sobrepor campos. A nova validação passou em **48/48 verificações**, com 27 capturas, 102 testes e build de desenvolvimento aprovados. Sucesso/falha de exclusão foram simulados no navegador; o banco manteve suas linhas. Evidências originais e resultado atual em [REVISAO_VISUAL.md](REVISAO_VISUAL.md).

Atualização após o lote aprovado de dependências/validação: **108 testes aprovados**, integração MySQL isolada (incluindo rejeições 400 e Unicode com rollback), **48/48 verificações no Chrome** e build aprovados. Consultas npm online autorizadas: frontend **14 → 0**, backend **18 → 6** entradas (1 alta, 5 moderadas, nenhuma crítica). As restantes envolvem Nodemailer e PM2/OpenCensus/uuid; atualizações principais aguardam análise de compatibilidade e operação. Versões, aplicabilidade e evidências em [DEPENDENCIAS_SEGURANCA.md](DEPENDENCIAS_SEGURANCA.md). Os totais anteriores nas seções históricas abaixo não representam o estado atual.

Pendências mantidas: recuperar em outro host/volume real; avaliar vínculos por nome e registros legados contra e-mail canônico; planejar purga de expirados; definir origens/HTTPS/proxy; desenhar persistência dos critérios/submissão e recuperação de senha; confirmar rotação SMTP; tratar as seis entradas restantes de dependências do backend. Não há certificação de produção segura.

### Alto — instalação limpa bloqueada por divergências de schema, corrigida no alvo isolado

- Evidência real: a cadeia histórica falhou com `ER_FK_NO_INDEX_PARENT` (1822) em `20240622215930_create_table_registros.js`; faltava índice em `colab.colab`. Também não havia migration para a coluna `registros.liderancas` usada pelos handlers.
- Correção aprovada: migrations `20240622215800_add_colab_name_index.js` e `20261025000400_add_liderancas_to_registros.js`, preservando as históricas e elementos compatíveis preexistentes. A cadeia completa passou em schema vazio sem adaptação por fixture.
- Limite: não há comprovação do schema de produção, dados legados ou nomes duplicados. Os dois `down` recusam remoção automática para preservar valores e dependências da FK; reversão requer plano próprio.

### Crítico — segredo anteriormente versionado

- Local: histórico dos dois módulos de e-mail; remoção do código atual não elimina versões anteriores.
- Evidência: os arquivos com credenciais estavam rastreados pelo Git antes do lote.
- Impacto: possível acesso indevido enquanto o segredo continuar válido; validade e alcance não testados.
- Próximo passo: responsável deve revogar/substituir as credenciais e avaliar acesso ao histórico. Não reescrever histórico ou editar configuração de produção automaticamente.
- Confirmação necessária: registro operacional da rotação e disponibilização da nova configuração ao processo, sem compartilhar o segredo no chat.

### Alto — endpoints sem autenticação e autorização

- Local: `backend/config/routes.js`, registros de consultas, gravações, exclusões e e-mails; chamadas a `authenticate()` comentadas.
- Evidência: rotas ativas não usam o middleware Passport; login não está ativo.
- Impacto: qualquer cliente com acesso à API pode invocar essas operações. CORS não impede chamadas diretas. Exposição pública do servidor não confirmada.
- Proposta: confirmar topologia, matriz de acesso e modelo de autenticação antes de implementar; autorização obrigatória no backend.
- Testes futuros: acesso anônimo, acesso permitido/negado por perfil, escopo por demandante, expiração, logout e proteções aplicáveis ao modelo aprovado.

### Alto — identidade fixa e dados pessoais no frontend

- Local: `frontend/src/js/store.js`; filtragem em `Registros.vue` e `Excel.vue`.
- Evidência: identidade administrativa fixa e mapeamento de identidades em código distribuído; filtragem após recebimento de registros.
- Impacto: regras da interface não restringem dados retornados pelo servidor; informações pessoais presentes no bundle.
- Proposta: definir identidade autenticada e escopo de dados no backend; remover o mapeamento pessoal do bundle durante a implementação aprovada de autenticação.
- Testes futuros: resposta da API limitada ao usuário/perfil e verificação do bundle sem dados pessoais de contas reais.

### Alto — gravações sem validação e erros internos expostos

- Local: `backend/api/user.js`, `backend/api/registros.js` (demais handlers) e `backend/api/validation.js`.
- Evidência: corpo recebido copiado diretamente para `.insert`; funções de validação não exportadas; vários `.send(err)`/`.send(msg)` permanecem.
- Impacto: gravação de campos não previstos, inconsistências e exposição de detalhes do banco nas falhas. Não foi comprovada SQL injection.
- Proposta: aprovar regras e respostas de validação; permitir explicitamente campos graváveis; validar tipos, comprimentos e regras de notas; sanitizar erros sem mudar os sucessos existentes.
- Testes futuros: corpos incompletos, tipos inválidos, campos extras, limites e rejeições do banco, com dados fictícios.

## Descoberta durante a instalação aprovada do segundo lote

Em 25/10/2026, foram instalados os cinco pacotes aprovados em `PLANO_AUTENTICACAO.md`. `npm audit --json` retornou código 1 e 24 entradas de pacotes afetados: 2 críticas, 13 altas e 9 moderadas. Esses totais são classificação do relatório de dependências, não prova de 24 caminhos exploráveis na aplicação.

Comparação com `HEAD:backend/package-lock.json`: nenhuma versão de pacote previamente registrado mudou. Os pacotes abaixo já constavam do lockfile anterior. `npm explain` confirmou os caminhos; nenhuma prova de exploração foi executada e nenhum serviço real foi iniciado.

| Gravidade do advisory | Evidência local | Aplicabilidade e impacto | Correção proposta |
| --- | --- | --- | --- |
| Crítico | `proxy-addr@2.0.7`, via `express@4.21.2` | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h): determinadas sub-redes IPv6 de confiança podem permitir falsificar IP e contornar controles por IP. Não há `trust proxy` configurado nos arquivos atuais examinados; exploração atual não demonstrada. A futura configuração de proxy/limitação torna o achado relevante. | Atualização transitiva para pelo menos 2.0.8 dentro da linha 2.0.x, que cabe na faixa `~2.0.7` usada pelo Express existente. Testar confiança de proxy e IP sem alterar a topologia. |
| Crítico | `basic-ftp@5.0.4`, via `get-uri` → `pac-proxy-agent` → `proxy-agent` → `@pm2/agent` → `pm2@5.3.1` | [GHSA-5rq4-664w-9x2c](https://github.com/advisories/GHSA-5rq4-664w-9x2c): escrita fora do diretório por `downloadToDir()` contra servidor FTP malicioso. Uso desse método pela aplicação não foi encontrado no inventário; exploração não demonstrada. | A correção deste advisory começa em 5.2.0, dentro da faixa 5.x aceita pela cadeia. Há outros alertas altos de FTP em versões posteriores: atualizar somente até essa correção não torna a cadeia livre de alertas; qualquer salto para 6.x ou atualização maior de PM2 precisa de análise própria. |
| Alto | `body-parser@1.20.3` e `config/middlewares.js`: `bodyParser.json()` com opções padrão | [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828): bytes extras após corpo comprimido podem provocar exceção não capturada antes do roteamento/autenticação. A configuração descrita no advisory coincide com o middleware atual; o crash não foi provocado. | Atualização patch para 1.20.9 na linha 1.x. Conferir também cópias transitivas usadas pelo Express e manter a aplicação na linha Express 4; não executar atualização irrestrita. |

A instalação foi interrompida na fase funcional após a descoberta, conforme AGENTS.md, item 3.14. Não foram escritos código de login, CLI ou migrations e não foi usado `npm audit fix` ou `--force`. A instalação das cinco dependências aprovadas foi preservada.

### Proposta de correção adicional antes de retomar autenticação

1. Aprovar atualização patch de `body-parser` para 1.20.9 e correções transitivas compatíveis de `proxy-addr` e da falha crítica de `basic-ftp`, sem mudança de framework, Express 5, PM2 major ou Nodemailer major.
2. Revisar o diff do lockfile para impedir atualizações não relacionadas e verificar cópias antigas aninhadas. Se a correção exigir mudança fora das faixas atuais, apresentar impacto antes de ampliar o escopo.
3. Testar parsing JSON normal, tratamento de corpo comprimido inválido em processo filho isolado, fluxo de IP/proxy e os 53 testes existentes. Não usar servidor, FTP, SMTP ou MySQL reais.
4. Reexecutar audit e registrar o que permaneceu. Não declarar audit limpo: os alertas restantes precisam de triagem específica e eventual atualização maior aprovada.
5. Retomar o modelo de autenticação já aprovado após a decisão sobre os riscos, preservando os limites de migrations e dados reais.

Verificações concluídas após a instalação inicial: 53 testes existentes passaram; hash/verificação Argon2id passou no Node 24.12.0/Windows com senha fictícia. Essas verificações não testam autenticação ainda inexistente nem comprovam mitigação dos advisories.

### Correção adicional autorizada e concluída

O usuário solicitou corrigir as dependências citadas e enviar o trabalho ao GitHub. O conjunto de correções foi aplicado sem migrations, banco real ou alteração operacional de produção:

| Pacote | Antes | Depois | Motivo / compatibilidade |
| --- | --- | --- | --- |
| Express | 4.21.2 | 4.22.3 | Mantém a linha 4 e permite resolver body-parser corrigido sem conservar a cópia antiga exigida pela versão anterior; atualiza também path-to-regexp e qs na cadeia |
| body-parser | 1.20.3 | 1.20.9 | Patch da linha 1; uma única cópia no lockfile; parsing JSON e limite de tamanho preservados |
| proxy-addr | 2.0.7 | 2.0.8 | Override exato dentro da faixa compatível do Express; testa sub-redes IPv6 problemáticas e casos válidos |
| basic-ftp | 5.0.4 | 6.2.3 | Override limitado a get-uri 6.0.3. A linha 5 ainda possui alertas altos; a mudança de linha foi explicada antes da instalação. A integração usada por get-uri foi testada por mocks, preservando PM2 5.3.1 |

As versões diretas Express/body-parser foram fixadas no manifesto. Overrides transitivos estão em `backend/package.json`; não adicionar essas bibliotecas como dependências diretas apenas para atualizar o lockfile. Não há cópias antigas de body-parser, proxy-addr ou basic-ftp no lockfile atual. O diff inclui dependências auxiliares relacionadas às atualizações; não houve atualização irrestrita nem `npm audit fix --force`.

Testes em `backend/test/dependency-security.test.js`:

- Parsing JSON e gzip válidos, limite de tamanho e sobrevivência após gzip com bytes extras, em processo filho usando apenas servidor loopback efêmero e dados fictícios.
- IPv4 arbitrário não é aceito por sub-redes IPv6 problemáticas; redes IPv4 e IPv4-mapeadas corretamente declaradas continuam válidas.
- Nomes de FTP com travessia de diretório são ignorados; download é simulado e não grava arquivos.
- get-uri mantém acesso, fallback de listagem, stream e data de modificação com basic-ftp 6, sem servidor FTP real.

Resultado: **57 testes aprovados** (29 backend, 28 frontend). Esses testes validam os cenários exercitados, não toda a compatibilidade operacional do PM2 ou de um provedor FTP real.

Audit posterior: **18 entradas**, sendo **10 altas, 8 moderadas e 0 críticas**; código de saída do npm audit igual a 1. Não há entradas para Express, body-parser, proxy-addr ou basic-ftp. Os demais pacotes incluem Nodemailer, mysql2, bibliotecas da cadeia PM2 e módulos legados; precisam de triagem separada. O resultado não é audit limpo nem declaração de segurança do sistema. O frontend não foi auditado por essa execução.

O bloqueio específico das dependências citadas foi tratado. Autenticação/autorização, CLI e migrations ainda não foram implementadas; o modelo permanece aprovado para continuidade.

## Hipóteses e itens não verificados

- Migrations declaram FK de `registros.colab` para nome de colaborador. A falta de índice foi reproduzida e corrigida no MySQL isolado; o vínculo por nome e o schema de produção continuam sem revisão de dados reais.
- A coluna `registros.liderancas` passou a ter migration aditiva, aplicada somente no schema isolado. Alterações manuais em outros ambientes não foram verificadas.
- Paginação de `/registros2` continua com interpretação preexistente de `page` e `limit`; limites ausentes ou inválidos podem provocar 500. Default, teto e respostas de validação precisam de contrato aprovado.
- `backend/env_file` é rastreado e tem formato de configuração. Nenhum valor foi reproduzido na documentação; não se certificou que todos os valores sejam fictícios.
- Proxy reverso, HTTPS, origem real de produção, exposição das portas, cabeçalhos operacionais, backups e recuperação não foram verificados.
- Remetentes/cópias foram preservados. Destinatário ainda deriva de `demandante`; permitir uso da API de e-mail exige autorização e política de destinatários, não apenas escape HTML.
- Conteúdo de e-mail, SMTP real, permissões de remetente e compatibilidade TLS não foram testados contra o provedor.
- A marcação de modal incompatível das duas listagens foi substituída por `ConfirmDeleteModal.vue`, usando o controle Flowbite existente. Visibilidade administrativa, teclado, Cancelar/Escape, foco e limpeza ao desmontar passaram no Chrome; ver `REVISAO_VISUAL.md`.
- Registros e exportação fazem consultas próprias e podem ficar com cópias desatualizadas. Paginação, compartilhamento de consultas e atualização da exportação dependem de escopo posterior.
- A análise npm do backend foi iniciada na instalação do segundo lote, com triagem dos dois alertas críticos e do parsing HTTP acima. As demais entradas e as dependências do frontend ainda não foram integralmente analisadas; benchmark de desempenho não foi realizado.

## Validação realizada

25 testes backend e 28 frontend aprovados, com mocks e execução em memória. Os casos novos estão em `backend/test/mail.test.js`, `backend/test/registros.test.js` e `frontend/test/request-failures.test.js`. Nenhum teste abriu conexão MySQL ou SMTP, nem leu credenciais de produção.

Build do frontend aprovado em modo de desenvolvimento, usando uma pasta temporária nova para preservar `frontend/dist`. Não comprova a configuração implantada. `git diff --check` aprovado; somente avisos sobre normalização futura de finais de linha nos módulos SMTP. Dependências e arquivos de ambiente não foram alterados.

As verificações anteriores com dados fictícios reproduziram resposta duplicada e ausência de resposta SMTP. A hipótese de lacunas de classificação nas notas foi descartada para as 6.561 combinações de quatro notas entre 1 e 5, em passos de 0,5; nenhuma regra de cálculo foi alterada.
