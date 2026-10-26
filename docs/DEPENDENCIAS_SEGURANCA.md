# Continuidade — dependências e validação da API

Lote solicitado conforme `PLANO_EVOLUCAO.md`. O usuário autorizou explicitamente as consultas npm do backend/frontend ao registro público e aprovou as regras de `PLANO_VALIDACAO_API.md`. As alterações foram feitas no workspace; produção e credenciais reais não foram modificadas.

## Resultado observado

| Projeto | Antes | Depois | Saída do audit final |
| --- | --- | --- | --- |
| Backend | 18 entradas: 10 altas, 8 moderadas, nenhuma crítica | **6 entradas: 1 alta, 5 moderadas, nenhuma crítica** | Código 1; não está limpo |
| Frontend | 14 entradas: 2 críticas, 11 altas, 1 moderada | **0 entradas** no levantamento online final | Código 0 |

São entradas de pacotes no relatório npm, não contagem de caminhos exploráveis. O resultado descreve as versões instaladas e os advisories disponíveis na consulta. Uma tentativa offline sem advisories em cache não foi usada como evidência de ausência de vulnerabilidades; os totais acima vieram das consultas online autorizadas. O funcionamento e o envio de metadados do comando estão na [documentação npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/).

[Resumo sanitizado](evidencias/evolucao-dependencias-api/summary.json), [integração MySQL](evidencias/evolucao-dependencias-api/mysql-validation-report.json) e [navegador](evidencias/evolucao-dependencias-api/visual-report.json).

## Versões e compatibilidade

As versões abaixo são as efetivamente resolvidas antes/depois. Somente estas cinco dependências diretas mudaram de versão; os demais ajustes são transitivos, peers e metadados opcionais dos pacotes atualizados.

| Projeto / dependência direta | Antes | Depois | Decisão |
| --- | --- | --- | --- |
| Backend — mysql2 | 3.12.0 | 3.24.6 | Mesma versão principal; conexão real, queries e transações validadas em MySQL 8.0.44 isolado. Knex continua usando o driver `mysql` existente. |
| Backend — Moment | 2.30.1 | 2.31.0 | Mantém a linha 2, agora fixada; sem reescrita de datas. |
| Frontend — Axios | 1.9.0 | 1.20.0 | Mantém a linha 1; interceptores, CSRF, credenciais e login/logout validados no Chrome. |
| Frontend — Vue | 3.5.14 | 3.5.44 | Patch da linha 3.5; família compiler/runtime alinhada, sem conversão de API Vue ou linguagem. |
| Frontend — Vite | 6.3.5 | 6.4.4 | Mantém a linha 6 e o plugin Vue existente. Node 24.12.0 satisfaz o requisito declarado; servidor local e build aprovados. |

Overrides direcionados, sem atualização irrestrita:

- Backend: brace-expansion 1.1.21, follow-redirects 1.16.2, jws 3.2.3, lodash 4.18.1, minimatch 3.1.4, picomatch 2.3.2, systeminformation 5.33.16, ws 7.5.11, socks 2.8.10 e ip-address 10.7.5. Os overrides anteriores de proxy-addr/basic-ftp foram mantidos. A mudança ip-address 9→10 decorre do socks 2.8.10, que declara `^10.1.1`; não se forçou a versão 10 sobre o consumidor antigo `^9`.
- Frontend: form-data 4.0.6, tar 7.5.22, Rollup 4.65.0, PostCSS 8.5.31, source-map-js 1.2.2, follow-redirects 1.16.2, DOMPurify 3.4.17, Immutable 5.1.9 e picomatch 4.0.4, respeitando as linhas aceitas pelos consumidores. Tailwind e Flowbite permaneceram nas versões anteriores.

O npm resolveu dependências relacionadas, tipos/peers e pacotes opcionais de plataforma no lockfile. Isso não migrou o projeto para TypeScript. Scripts de instalação e audit automático foram desativados durante a instalação; os audits foram executados separadamente com autorização. Não se usou `npm audit fix --force`, Express 5 ou mudança global de ferramentas.

## Seis entradas que permanecem no backend

| Pacote | Versão instalada | Gravidade do relatório | Próximo tratamento |
| --- | --- | --- | --- |
| Nodemailer | 6.9.14 | Alta | O npm recomenda 10.2.1, salto principal. Preparar análise de compatibilidade de transporte, parsing de destinatários/TLS e testes sem envio real antes de propor atualização. |
| PM2 | 5.3.1 | Moderada | O advisory de ReDoS aponta correção na linha 7; requer análise própria da CLI/daemon e operação. Nenhum daemon de produção foi atualizado/reiniciado. |
| @pm2/io | 5.0.2 | Moderada | Cadeia de instrumentação PM2/OpenCensus; avaliar junto do process manager. |
| @opencensus/core | 0.0.8 e 0.0.9 | Moderada | Cadeia legada; não substituir por outra biblioteca sem avaliar o consumidor. |
| @opencensus/propagation-b3 | 0.0.8 | Moderada | Mesmo tratamento da cadeia OpenCensus. |
| uuid | 3.4.0 | Moderada | Não forçar uuid 11 sobre uma dependência `^3` sem validação. Os usos OpenCensus examinados chamam `v4()`; isso não demonstra exploração dos casos de buffers v3/v5/v6 descritos pelo advisory. |

Referências: [PM2](https://github.com/advisories/GHSA-x5gf-qvw8-r2rm), [UUID](https://github.com/advisories/GHSA-w5hq-g745-h8pq), [exemplo de parsing de destinatários Nodemailer](https://github.com/advisories/GHSA-85x2-q946-cp5h). A classificação do pacote não comprova que todas as condições sejam atingíveis pela aplicação. SMTP real não foi exercitado; liberação de produção continua separada.

## Validações executadas

- **108 testes aprovados**, zero falhas: suíte existente e seis testes novos agrupando regras de negócio, Unicode, intervalos, corpos inválidos, parâmetros repetidos, proteção de campos e HTTP. O DOM simulado dos testes ganhou `getRootNode`, `Document` e `ShadowRoot` para acompanhar a API usada pelo Vue atualizado; não se mudou a aplicação para ocultar erros dos testes.
- MySQL 8.0.44 real isolado: conexão mysql2, autorização, transações, persistência de sessão, expiração, revogação, limitação compartilhada e privilégios mínimos passaram. Foram acrescentados casos de entrada inválida com 400 e contagens de linhas invariantes, paginação limitada e uma sonda Unicode de 255 caracteres lida corretamente e revertida por rollback.
- **48/48 verificações no Chrome**, incluindo Vue/Axios atualizados, responsividade, foco e exclusões simuladas. Zero erros JavaScript de página, requisições externas da aplicação e tentativas de escrita de negócio não simuladas. [Desktop](evidencias/evolucao-dependencias-api/04-reviewer-home-desktop.png), [celular](evidencias/evolucao-dependencias-api/10-reviewer-home-mobile.png), [confirmação](evidencias/evolucao-dependencias-api/16-admin-colabs-confirmation.png).
- Novo build Vite 6.4.4 em modo development aprovado em `frontend/node_modules/.cache/evolucao-security-build-007c2c6e16c84617b0520d36f8f4289c`; `frontend/dist` preservado. O Vite local deste workspace foi identificado antes de reiniciar e teve o cache de dependências reconstruído.

## Contratos e pendências

Regras implementadas em `backend/lib/business-validation.js`, integradas em `lib/records.js` e `api/user.js`: notas 1–5 em passos de 0,5, média/nível/desconto consistentes, textos de até 255 caracteres, IDs válidos e `/registros2` com padrões page=1/limit=25 e teto 100. Entradas inválidas agora retornam 400 antes da consulta/gravação de negócio quando possível; sucessos 204, listas JSON e autorização foram preservados. A ordenação usa data e ID descendentes para desempate. [Contrato e exemplo](PLANO_VALIDACAO_API.md).

Não foram criadas/aplicadas novas migrations neste lote. Vínculos legados por nome, collation/charset/sql_mode de produção, formato persistente dos arrays de critérios, ativação da submissão e recuperação de senha seguem para etapas próprias. O teste utf8mb4 comprova o perfil isolado, sem certificar outro ambiente. A revisão operacional do PM2 e testes com SMTP real continuam pendentes de planejamento/autorização.
