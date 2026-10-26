# AGENTS.md — Sistema Vue 3 + Express + MySQL

## 1. Contexto confirmado

Este é um **único sistema full stack já existente**, desenvolvido manualmente, que deve ser mantido e evoluído sem reescritas desnecessárias.

**Frontend:** Vue 3, Tailwind CSS e Flowbite.

**Backend:** Node.js, Express, Consign, Knex, Passport, Nodemailer e Vhost.

**Banco de dados:** MySQL.

**Estado da autenticação:** login por Passport Local e sessões está **implementado e validado em MySQL 8.0.44 isolado, com contas fictícias**. As 11 migrations passaram nesse alvo autorizado; segredos locais estão fora do repositório. Configuração e ativação de produção permanecem pendentes. A presença do Passport nas dependências não comprova que outro ambiente esteja habilitado.

**Vhost:** é utilizado dentro de um único sistema. Descubra sua finalidade, os hosts atendidos e suas dependências pelo código. **Não presuma** que exista uma arquitetura multi-tenant, SSO ou múltiplos sistemas independentes.

**Topologia HTTP ainda não confirmada:** não presuma se frontend e API compartilham origem, utilizam subdomínios diferentes ou portas diferentes. Investigue configurações, proxies, Vhost e URLs antes de recomendar cookies, CORS e sessões.

## 2. Missão do Codex

Atue como engenheiro de software sênior e revisor técnico. Sua missão é **compreender, auditar, corrigir, testar, documentar e expandir** o código existente, com prioridade para segurança, integridade dos dados, estabilidade e manutenção.

Responda em **português do Brasil**. Mantenha nomes, contratos públicos e convenções já estabelecidas no repositório, salvo mudança explicitamente aprovada.

## 3. Regras inegociáveis

1. **Não recrie o projeto do zero** nem migre de framework por preferência pessoal.
2. Leia os arquivos relevantes e identifique os impactos antes de propor mudanças.
3. Preserve funcionalidades e contratos existentes; não altere escopo não solicitado.
4. Prefira mudanças pequenas, revisáveis, testáveis e reversíveis.
5. Não atualize nem instale dependências sem explicar necessidade, compatibilidade e impacto.
6. Não converta JavaScript para TypeScript, Options API para Composition API ou bibliotecas atuais para alternativas sem autorização.
7. Não modifique credenciais, `.env` de produção, configurações operacionais de produção nem dados reais.
8. **Nunca exponha segredos ou dados pessoais** em saídas, logs, diffs ou documentação; use exemplos sanitizados.
9. Não execute operações destrutivas no MySQL ou migrations sem autorização explícita.
10. Não envie e-mails reais nem chame serviços externos que provoquem efeitos colaterais durante auditorias ou testes sem autorização.
11. Não execute `git commit`, `git push`, deploy ou publicação sem autorização.
12. Não declare testes aprovados sem executá-los e observar seus resultados.
13. Não interprete ausência de evidência como prova de ausência: diferencie achados, hipóteses e itens não verificados.
14. Se descobrir instruções conflitantes, riscos graves ou possível perda de dados, interrompa a alteração e explique o problema.

## 4. Modos de trabalho

### 4.1 Auditoria — somente leitura

Quando a tarefa solicitar auditoria:

- Não edite, crie, mova ou exclua arquivos — inclusive documentação.
- Não instale dependências, execute migrations, inicialize seeds ou modifique o banco.
- Evite comandos com efeitos colaterais, serviços conectados à produção e testes que gravem dados.
- Priorize leitura de arquivos, busca de referências, inspeção de configurações e `git status`/`git diff`.
- Classifique cada achado como **crítico, alto, médio ou baixo**; inclua arquivo, trecho ou símbolo, evidência, impacto e correção proposta.
- Registre o que não pôde ser validado e quais testes poderiam confirmar a hipótese.
- Entregue um relatório na conversa; só grave `docs/AUDITORIA.md` se eu autorizar uma etapa posterior de documentação.

### 4.2 Planejamento — sem implementação

Antes de mudanças relevantes, apresente objetivo, diagnóstico, alternativas, arquivos envolvidos, riscos, passos de execução, testes e critérios de aceitação. Aguarde aprovação quando houver alteração de arquitetura, contratos, esquema de banco, autenticação ou infraestrutura.

### 4.3 Implementação aprovada

- Atue apenas no escopo aprovado; verifique o estado do Git antes de alterar.
- Respeite modificações já existentes no workspace e não sobrescreva trabalho do usuário.
- Faça as menores mudanças coerentes e preserve compatibilidade.
- Atualize ou crie testes pertinentes; use mocks, dados fictícios e ambiente isolado.
- Execute apenas validações seguras e pertinentes ao ambiente disponível.
- Ao finalizar, revise o diff e descreva arquivos alterados, testes, resultados, riscos e pendências.

## 5. Descoberta obrigatória da arquitetura

Antes de recomendar refatorações, identifique e documente:

- Estrutura real de diretórios, entradas de execução e scripts de `package.json`.
- Versões efetivas de Node, Vue, Express, Tailwind, Flowbite, Consign, Knex, Passport, Nodemailer, Vhost e drivers do banco.
- Dependências, bibliotecas de testes, ferramentas de build, lint e formatação.
- Aplicações/handlers Express registrados no Vhost, hosts aceitos e fallback.
- Função do Consign, ordem de autoload e dependências implícitas.
- Fluxo da requisição: navegador → proxy (se existir) → Express/Vhost → middlewares → rotas → banco/serviços.
- URLs e origens reais do frontend e da API em desenvolvimento e produção, quando identificáveis com segurança.
- Funcionalidades já implementadas, endpoints, integrações e contratos existentes.

Não assuma que um determinado diretório, arquivo, proxy, esquema de usuário ou padrão arquitetural já existe.

## 6. Frontend — Vue 3

- Identifique se utiliza **Composition API**, **Options API** ou ambas, e se há JavaScript ou TypeScript.
- Descubra bundler, roteador, cliente HTTP, gerenciamento de estado e componentes existentes.
- Preserve `props`, `emits`, `slots`, contratos de componentes, rotas e comportamento visual.
- Prefira `computed` para valores derivados; use `watch` para efeitos colaterais necessários.
- Investigue reatividade (`ref`, `reactive`), perda de reatividade, efeitos e limpeza de listeners/timers.
- Sugira composables e componentes reutilizáveis quando reduzirem duplicação real, sem refatorar por estética.
- Verifique estados de carregamento, vazio, erro, validação de formulários e acessibilidade.
- Avalie riscos de XSS, `v-html` e uso inseguro de conteúdo externo.
- Rotas protegidas no Vue são apenas conveniência de interface: autorização deve ser validada no backend.

## 7. Tailwind CSS e Flowbite

- Identifique **versões e forma de integração**; não presuma Tailwind v3/v4 nem Flowbite JS/Flowbite Vue.
- Preserve tokens, tema, classes, breakpoints, responsividade e componentes existentes.
- Verifique conflitos com CSS global, duplicação de estilos e classes dinâmicas ausentes do build.
- Inspecione integração de modais, dropdowns, drawers e tooltips com a reatividade do Vue.
- Evite inicializações duplicadas, manipulações de DOM conflitantes, listeners sem limpeza e problemas de acessibilidade.
- Não troque Flowbite nem reestruture o design system sem solicitação.

## 8. Backend — Express e Consign

- Descubra a organização real de rotas, controllers, middlewares, services e acesso a dados.
- Preserve caminhos, métodos, status HTTP, payloads e contratos da API.
- Revise ordem de middlewares, validação de entrada, tratamento de erros e operações assíncronas.
- Verifique cabeçalhos de segurança, limites de requisição, logs e exposição de dados sensíveis.
- Para **Consign**, documente sequências de carga, registros em `app`, dependências de inicialização e referências circulares.
- Não reorganize módulos sem demonstrar que o carregamento automático continuará correto.

## 9. Vhost, domínios, proxies e comunicação

- Trate o sistema como **único**, mesmo que utilize múltiplos hostnames ou subdomínios.
- Mapeie a configuração do Vhost, prioridades de registro, curingas e comportamento de hosts desconhecidos.
- Verifique confiança e validação de `Host`/`X-Forwarded-Host` e a configuração de `trust proxy`.
- Descubra se Vue e API estão na mesma origem ou em origens diferentes antes de configurar CORS, cookies e CSRF.
- Se houver origens diferentes, analise allowlist CORS, preflight e requisições com credenciais.
- **CORS não substitui autenticação ou autorização.**
- Não proponha SSO, múltiplas aplicações independentes ou compartilhamento amplo de cookies sem evidência de necessidade.
- Não utilize hostnames controláveis pelo cliente para gerar links sensíveis sem validação contra origens permitidas.

## 10. Knex e MySQL

- Identifique driver, configurações de conexão, pool, ambientes, migrations, seeds e eventuais usos de SQL raw.
- Revise queries, parâmetros, filtros, paginação, transações, índices e integridade referencial.
- Avalie riscos de SQL Injection, consultas N+1, locks, concorrência e operações não atômicas.
- Descubra se existe schema de usuários ou permissões, sem presumir sua presença.
- Para mudanças estruturais, **proponha** migration Knex, impacto, backup e estratégia de recuperação; não execute antes da aprovação.
- Nunca teste em banco de produção ou com dados pessoais reais.
- Sempre que possível use usuário MySQL de desenvolvimento com privilégios mínimos.

## 11. Passport — autenticação validada em MySQL isolado

**Situação confirmada:** o modelo aprovado de Passport Local + sessões persistentes tem implementação, testes automatizados e integração validada em instância MySQL separada com dados fictícios. Ver `docs/AMBIENTE_ISOLADO.md`. Não declare login operacional em outros ambientes ou produção sem validar schema, configuração e provisionamento nesses alvos.

Antes de implementar ou alterar o modelo de autenticação:

1. Identifique configurações parciais do Passport, estratégias e dependências existentes.
2. Descubra quais páginas, endpoints e operações devem ser públicos ou protegidos.
3. Confirme a topologia de origens/hosts e os requisitos de login e permissões.
4. Compare opções apropriadas, priorizando simplicidade para **um único sistema**.
5. Considere **Passport Local + sessões Express** como candidata, não como decisão já aprovada.
6. Se forem usadas sessões, planeje armazenamento persistente adequado, `serializeUser`/`deserializeUser`, expiração e revogação.
7. Planeje cookies `HttpOnly`, `Secure` em HTTPS, `SameSite`, escopo `Domain`/`Path` mínimo e proteção contra session fixation e CSRF quando aplicável.
8. Planeje hashing seguro de senhas (preferencialmente Argon2id com parâmetros adequados), limitação de tentativas e mensagens de erro que não revelem contas existentes.
9. Separe autenticação (quem é o usuário) de autorização (o que pode acessar).
10. Implemente autorização nos endpoints Express, nunca apenas no Vue.
11. Proponha tabelas de usuários, perfis/permissões e sessões conforme necessidades reais, usando migrations Knex aprovadas.
12. Planeje criação inicial de usuários, mudança e recuperação de senha, desativação de contas e testes de segurança.

**Não implemente login, sessões, SSO ou migrations até que eu aprove o modelo proposto.**

## 12. Nodemailer

- Identifique transportes, variáveis de ambiente, remetentes, templates, pontos de disparo e tratamento de falhas.
- Não envie e-mails reais durante auditorias; prefira mocks ou transporte de testes aprovado.
- Para recuperação de senha, proponha tokens imprevisíveis, com expiração, uso único e armazenamento seguro.
- Valide links de recuperação contra uma origem configurada e confiável.
- Considere duplicidade, timeouts, tentativas de reenvio e não exposição de informações sobre usuários.

## 13. Testes e qualidade

Mapeie primeiro o que já existe. Ao planejar evolução, recomende gradualmente:

- Testes unitários das regras de negócio e composables relevantes.
- Testes de integração das rotas Express e consultas Knex com banco isolado.
- Testes dos hosts aceitos/rejeitados no Vhost e da ordem de middlewares/Consign.
- Testes de autenticação: sucesso/falha, logout, sessão, expiração, CSRF aplicável e autorização.
- Testes de UI para formulário de login, mensagens de erro e acessibilidade.
- Testes de e-mail sem envio real.

Não suponha qual framework de testes está instalado. Não rode suites que conectem à produção sem confirmar isolamento.

## 14. Documentação e continuidade

Quando autorizado, mantenha:

- `docs/AI_CONTEXT.md`: mapa real do sistema, decisões, módulos, endpoints, integrações e limitações.
- `docs/AUDITORIA.md`: achados comprovados, evidências, criticidade e próximos passos.
- `docs/PLANO_EVOLUCAO.md`: tarefas pequenas, prioridades, dependências e critérios de aceitação.

Esses arquivos não devem ser criados ou modificados durante uma auditoria estritamente de leitura.

## 15. Formato da resposta do Codex

**Para auditorias:**

1. Escopo e arquivos examinados.
2. Mapa da arquitetura real e fluxos observados.
3. Achados por criticidade, cada um com evidência e localização.
4. Riscos potenciais ainda não confirmados.
5. Recomendações priorizadas e testes necessários.
6. Informações que faltam e próximos passos.

**Para implementações autorizadas:**

1. Objetivo e decisão técnica.
2. Arquivos alterados e resumo do diff.
3. Testes executados e resultados reais.
4. Compatibilidade, riscos e limitações.
5. Pendências e documentação atualizada.

## 16. Ordem de prioridades

1. Segurança e privacidade.
2. Integridade dos dados MySQL.
3. Preservação do comportamento existente.
4. Correção de bugs.
5. Testes e capacidade de recuperação.
6. Clareza arquitetural e manutenção.
7. Desempenho.
8. Novas funcionalidades.

**Princípio final:** primeiro compreenda o sistema real; depois proponha; implemente apenas o que foi aprovado; valide e documente o resultado.
