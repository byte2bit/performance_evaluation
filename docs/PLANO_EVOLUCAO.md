# Plano de evolução

**Reforço concluído e implementação pausada em 28/10/2026:** usuário aprovou implementar/aplicar a migration 14 somente no MySQL fictício isolado, com backup/restauração e validação prévia em cópia. Baseline 14 ativo, `colab.gerencia_id` obrigatório; dados de negócio/contas preservados. **190/190 testes aprovados**, zero falhas/skips. Posteriormente solicitou preparar a continuidade e enviar este lote ao GitHub, autorizando seu commit/push. Ver [RETOMADA.md](RETOMADA.md). Novas implementações, outros alvos e deploy não foram aprovados.

**Próximo passo recomendado após retomar:** elaborar o plano de recuperação em outro host/proteção das chaves. Definir destino isolado, disponibilidade segura das credenciais e critérios de recuperação; obter autorização específica antes de provisionar/restaurar em outro alvo. Auditoria administrativa durável e persistência dos critérios/submissão seguem como lotes posteriores, ainda sem execução aprovada.

Atualizado em 27/10/2026. As prioridades do item 16 do AGENTS.md são critérios de ordenação; não significam aprovação automática de arquitetura, autenticação, contratos ou schema. O ponto de continuidade, ambiente local e próximo lote estão em [RETOMADA.md](RETOMADA.md).

### Reforço concluído — profissional sempre com demandante

Regra implementada na aplicação e reforçada estruturalmente para todos os profissionais, inclusive arquivados. [Plano aprovado, execução da migration 14 e evidências](PLANO_GESTAO_GERENCIAS.md#vínculo-obrigatório-de-todo-profissional--reforço-aplicado-no-perfil-isolado). Backup/restauração de 9 tabelas/49 registros, cópia com SQL/HTTP reais, revalidação e aplicação na origem passaram. Mantidos dois profissionais, uma gerência, oito avaliações e contas/campos; API retomada. Próximos escopos de critérios/submissão, recuperação em outro host e auditoria durável precisam de planejamento/aprovação próprios. Não repetir transições já concluídas nem executar `down`.

### Estado atual — gestão por gerências ativada

Ativação autorizada concluída no perfil fictício: usuário escolheu Gerência de Testes para ambos os profissionais, com o avaliador atual. Após backup/restauração atualizados e aplicação/HTTP na cópia, origem recebeu a 13ª migration e o mapa em transação. Uma gerência, dois profissionais e oito avaliações preservadas; contas/campos legados intactos. **176 testes** e nove grupos Chrome reais aprovados, mais comparação SQL final. Principal em localhost:5173/8001, prévia antiga encerrada. [Resultado e evidências](PLANO_GESTAO_GERENCIAS.md#ativação-autorizada-na-origem).

Próximo escopo a definir: critérios/submissão, recuperação em outro host/proteção de chaves ou auditoria durável de alterações administrativas. Não repetir aplicadores de baseline 12, inferir novos mapas, executar down ou operar produção. Autorizações deste lote não abrangem novos mapas/alvos, commit/push, SMTP ou submissão de avaliações.

### Histórico — preparação da ativação revisada

Confirmado/implementado o modelo conta por ID → uma ou mais gerências → profissionais, com um responsável atual por gerência e uma gerência por profissional. CRUD administrativo e arquivamento, criação de avaliadores, seleção da gerência e responsável derivado. **170 testes, build, 72 grupos Chrome** e oito grupos reais MySQL/HTTP aprovados. Migration 13 aplicada **só em cópia**, com backup/restauração autenticados e origem/schema de negócio preservados. Prévia em 127.0.0.1:5174 / API :8002. [Guia e evidências](PLANO_GESTAO_GERENCIAS.md).

Próximo lote depende de mapa revisado das gerências/contas/profissionais da origem e aprovação específica de schema/mapa/ativação. Não inferir vínculos de textos, reiniciar a API da origem com código novo antes da transição ou importar as fixtures da cópia. A origem continua com 12 migrations. Submissão e infraestrutura de produção seguem pendentes, sem ativação implícita.

### Estado mais recente — conciliação confirmada e aplicada

Mapa R01–R08 → P01 confirmado e aplicado no perfil fictício, após backup/restauração de 8 tabelas/46 registros e validação em cópia. **152 testes aprovados**, rollback dos oito updates, espera real por lock, replay recusado e HTTP reais na cópia; origem só atualizada após sucesso e revalidação. Oito vinculados, nenhum nulo/órfão, 12 migrations mantidas, demais campos/profissionais/contas preservados. API retomada, com leitura dos oito confirmada para avaliador atual/administrador na origem. P02 e matrículas ausentes inalterados. [Resultado e evidências](REVISAO_CONCILIACAO.md#aplicação-confirmada-e-executada).

Próximas etapas: planejar persistência de critérios/submissão e recuperação em outro host/proteção de chaves, com escopo/prioridade definidos pelo usuário. A submissão continua desativada. Não repetir conciliação/ValidateLinks, inferir novos mapas, migrar outros alvos ou operar produção. Lote sem nova dependência/migration, build/Chrome, commit/push ou deploy.

### Lote anterior — inventário somente leitura

Primeiro lote de conciliação aprovado e concluído: ação `Inventory`, conexão da aplicação em transação `READ ONLY`, barreiras de identidade/schema/migrations e detalhe criptografado no perfil externo. **141 testes aprovados**, incluindo 11 novos; execução MySQL isolada e releitura autenticada do artefato aprovadas. Oito registros continuam sem vínculo, cada um com candidato único por nome. Dois profissionais sem matrícula; uma atribuição sem conta correspondente. Nenhuma associação, correção de atribuição ou conta foi aplicada. [Procedimento, evidências e limites](PLANO_VINCULOS.md#inventário-somente-leitura-aprovado--27102026).

Revisão posterior concluída, com nova coleta `READ ONLY` igual nos campos inventariados: propostas R01–R08 → P01, coerentes com as fixtures. A atribuição sem conta pertence a P02, controle negativo do runner, e não integra as associações. O mapa foi posteriormente confirmado e aplicado conforme estado atual acima. A revisão inicial não alterou código nem repetiu os 141 testes; esse resultado foi sucedido pelos 152 do aplicador. Sem novas migrations, alterações de frontend ou autenticação; build/Chrome anteriores continuam históricos.

### Estado mais recente — interface, temas e checkpoint de continuidade

Concluídas as revisões visuais de registros, profissionais, cadastro, página inicial e login, seguidas de alternância de tema persistida, dropdown da conta e modais padronizados. Última validação: **130 testes**, build development e **78 grupos Chrome com API simulada** aprovados. Contratos, autorização e envio de avaliações desativado preservados. Ver [REVISAO_PAGINAS_GESTAO.md](REVISAO_PAGINAS_GESTAO.md). O usuário solicitou guardar a continuidade e enviar este conjunto ao GitHub; próximos trabalhos continuam sujeitos ao escopo/autorização próprios.

O inventário da revisão/conciliação foi posteriormente aprovado e executado, conforme o estado mais recente acima. Associações continuam pendentes de revisão e aprovação. O estado dos serviços locais deve ser conferido na retomada; eles foram reabertos após o lote SQL.

### Lote anterior — vínculo por ID e migration validados no MySQL isolado

Modelo aprovado: histórico acessível somente ao demandante atual do profissional e administradores, preservando o autor original. Implementados `colab_id`, consulta por associação atual antes da paginação, escrita por ID/compatibilidade de nome único, 409 para ambiguidade e seleção Vue por IDs. Sem vínculo, legados permanecem administrativos. A submissão segue desativada.

O lote inicial teve 123 testes e build development aprovados. Após nova autorização, backup/restauração de oito tabelas/43 registros passaram; a 12ª migration e 15 grupos de testes SQL passaram primeiro na cópia, incluindo FKs, collation e espera real de lock/transferência. Só depois a origem fictícia recebeu a migration, preservando contas, profissionais e oito avaliações históricas com vínculo nulo. Suíte ao final desse lote: **127 aprovados**, zero falhas/skips. A instância foi parada ao final, com dados persistidos, e posteriormente reaberta para uso local.

Próximo lote: planejar revisão/conciliação dos registros legados e, se solicitado, fluxo administrativo de transferência. Não associar automaticamente pelo nome/e-mail do autor. Outros ambientes, submissão e produção permanecem separados. [Modelo, compatibilidade, evidências e reversão](PLANO_VINCULOS.md).

## Primeiro lote aprovado

| Tarefa | Estado | Critério de aceitação |
| --- | --- | --- |
| Retirar credenciais literais dos módulos SMTP | Implementada | Ambiente externo obrigatório; ausência retorna 503 sem tentar envio |
| Escapar templates e encerrar respostas SMTP | Implementada | HTML dinâmico escapado; 204 após aceitação SMTP; 502 genérico em falha; resposta única |
| Corrigir `/registros2` | Implementada | Lista JSON preservada, resposta única, uma consulta, falha 500 genérica |
| Corrigir falhas no frontend | Implementada | Mensagens genéricas; cadastro preservado na falha; listas alteradas apenas após DELETE confirmado |
| Testes isolados | Executados | 53 aprovados: 25 backend e 28 frontend; nenhum serviço real utilizado |
| Compilação e revisão | Executadas | Build com configuração de desenvolvimento em pasta temporária aprovado; diff revisado e `git diff --check` aprovado |
| Documentar contexto e pendências | Implementada | `AI_CONTEXT.md`, `AUDITORIA.md` e este plano, sem segredos ou dados pessoais |

O lote não instala dependências, não ativa submissão, não protege rotas e não altera schema, configuração de produção ou histórico Git. A rotação das credenciais antigas continua a cargo do responsável operacional.

## Continuidade e próximos passos

### Lote atual concluído — dependências e validação da API

Após autorização para os audits online e aprovação explícita das regras de [PLANO_VALIDACAO_API.md](PLANO_VALIDACAO_API.md), foram atualizadas dependências dentro das linhas principais existentes e implementadas validação de profissionais/avaliações, consistência de notas/média/nível/desconto, limites de texto/IDs e paginação de `/registros2` (page=1, limit=25, teto 100). Preservados os nomes, sucessos, autorização e schema; entradas inválidas retornam 400.

Evidência atual: **108 testes aprovados**, integração real em MySQL isolado, **48/48 verificações no Chrome** e build aprovados. Audit frontend: **14 → 0** entradas; backend: **18 → 6**, sendo 1 alta e 5 moderadas. As seis entradas pertencem a Nodemailer e à cadeia PM2/OpenCensus/uuid. Impactos de atualização principal precisam de análise própria, sem modificar daemon/SMTP de produção. [Relatório e evidências](DEPENDENCIAS_SEGURANCA.md).

Atualizações principais de Nodemailer/PM2 aprovadas e concluídas localmente em etapa posterior, descrita abaixo. Próximas tarefas: investigar vínculos e dados legados usando apenas fixtures; desenhar persistência dos critérios e submissão antes de ativá-la. Recuperação em outro host, proteção externa das chaves, purga, recuperação de senha e infraestrutura de produção continuam pendentes. Os registros abaixo preservam os resultados históricos de cada lote.

### Lote posterior concluído — READMEs, Nodemailer e PM2 locais

Após aprovação explícita, os READMEs da raiz/backend/frontend foram preparados primeiro, cobrindo funcionalidades, perfis, telas, API, execução e limites. Nodemailer foi fixado em 10.2.1 e PM2 em 7.1.1, com lockfile atualizado, sem mudar script de produção ou iniciar a aplicação real. Corrigida a aspa ausente no remetente de `mail2.js`, pois o compilador real demonstrou alteração da caixa interpretada.

Resultado: **113 testes aprovados**, **audit backend online zero entradas (código 0)** e ciclo PM2 fictício **7/7**, com sockets exclusivos, ambiente sanitizado e zero tentativas de rede. As cadeias OpenCensus/uuid e get-uri/basic-ftp saíram da árvore npm. No Windows, os pipes globais do PM2 foram substituídos somente pelo harness em memória; nenhum daemon pessoal/operacional foi usado. Métricas WMI foram negadas e não estão validadas. Produção, SMTP real, cluster/startup/resurrect e instrumentação continuam fora dessa validação. Evidências, compatibilidade e reversão em [DEPENDENCIAS_SEGURANCA.md](DEPENDENCIAS_SEGURANCA.md#atualizacao-principal-local-nodemailer-e-pm2).

### Retomada aprovada: primeiro passo de autenticação implementado

Concluídos em código: Passport Local/sessão persistente MySQL, CSRF, expiração/revogação, troca de senha, limitação, autorização de todas as rotas existentes, login no Vue e CLI de contas. Três migrations aditivas foram escritas, sem execução. Foram preservados a ordem do Consign, nomes das rotas existentes e a submissão desativada da avaliação; filtros de autorização agora ocorrem antes das consultas.

Validação: 95 testes aprovados (52 backend, 43 frontend) e build de desenvolvimento aprovado em pasta temporária. A verificação do bundle não encontrou os e-mails do antigo mapeamento fixo. Nenhum MySQL/SMTP real foi acessado e nenhuma conta real foi criada/alterada. Configuração e próximos passos operacionais estão na seção 16 de `PLANO_AUTENTICACAO.md`.

Etapa seguinte concluída com autorização específica: instância MySQL 8.0.44 separada, segredos externos DPAPI/ACL, duas contas fictícias e 11 migrations aplicadas no alvo isolado. As correções aprovadas preservam migrations históricas e acrescentam índice em `colab.colab` e coluna `registros.liderancas`. Integração real passou para autorização, transações, persistência após reiniciar a aplicação, expiração, revogação e concorrência dos limitadores. A própria instância foi reiniciada e revalidada. Suíte padrão: 100 testes aprovados. Guia: [AMBIENTE_ISOLADO.md](AMBIENTE_ISOLADO.md).

Continuidade autorizada: backup/restauração isolados concluídos, com arquivo criptografado, destino novo, comparação de 8 tabelas/36 registros e login dos dois perfis na cópia. Origem preservada; guia em [BACKUP_RESTAURACAO.md](BACKUP_RESTAURACAO.md). A revisão visual original encontrou cinco problemas (19 de 30 verificações aprovadas), posteriormente corrigidos com autorização do usuário. Resultado atual: **48/48 verificações visuais**, 27 capturas, **102 testes automatizados** e novo build de desenvolvimento aprovados. Evidências antes/depois em [REVISAO_VISUAL.md](REVISAO_VISUAL.md).

Lote visual concluído: responsividade do formulário/cabeçalho, confirmação de exclusão nas duas listagens com teclado/Cancelar/Escape/foco, contraste no escuro e ID de matrícula corrigidos; rodapé no fluxo do conteúdo para não sobrepor campos. Contratos, Options API e envio desativado preservados. Sucesso/falha de exclusão foram simulados na interface, sem remover dados SQL.

Demais prioridades: validar dados/vínculos legados por nome/e-mail, planejar recuperação em outro host e proteção das chaves, recuperação de senha/convites, purga de expirados, rotação SMTP e triagem dos outros pacotes. A implantação exige origens/HTTPS/proxy definidos e aprovação operacional própria.

As subseções de preparação e interrupção abaixo registram o histórico dos lotes; não indicam que o modelo ainda dependa de aprovação ou que a implementação esteja ausente.

### Segundo lote aprovado: início da execução e interrupção por risco

Em 25/10/2026, o usuário confirmou que tudo exige login, administradores gerenciam o sistema e avaliadores acessam somente suas próprias avaliações. Informou também que URLs/proxy/HTTPS de produção ainda não estão definidos.

O usuário aprovou o modelo de `PLANO_AUTENTICACAO.md`, incluindo cinco dependências, implementação e escrita de migrations sem executá-las. As cinco dependências foram instaladas com versões fixas, o teste local Argon2id passou e os 53 testes existentes continuaram passando. A comparação dos lockfiles não encontrou mudança de versão em pacotes já registrados.

O `npm audit --json` identificou 24 pacotes com alertas: 2 críticos, 13 altos e 9 moderados. A implementação foi interrompida antes de escrever login/sessões, CLI ou migrations, seguindo o item 3.14 do AGENTS.md. A triagem em `AUDITORIA.md` distingue versões afetadas, caminhos de dependência e exploração não comprovada. Corrigir dependências preexistentes exige decisão adicional; a aprovação do modelo de autenticação permanece válida.

### Correção adicional e envio solicitados pelo usuário

O usuário autorizou corrigir as dependências citadas e enviar as alterações ao GitHub. Correções concluídas: Express 4.22.3, body-parser 1.20.9, proxy-addr 2.0.8 e basic-ftp 6.2.3. As duas dependências diretas estão fixadas no manifesto; proxy-addr usa override exato, e o override de basic-ftp limita-se a get-uri 6.0.3. A troca de linha de basic-ftp foi explicada antes da instalação para corrigir também os alertas que permanecem na linha 5, com compatibilidade do consumidor testada por mocks. PM2 e Nodemailer não foram atualizados.

Validação: 57 testes aprovados, incluindo quatro novos de dependências; audit com 18 entradas restantes (10 altas, 8 moderadas, nenhuma crítica) e sem apontamentos para os quatro pacotes corrigidos. O audit ainda retorna código 1. Autenticação, CLI e migrations continuam pendentes de implementação, já autorizadas; não foram incluídas implicitamente como trabalho concluído neste envio.

### 1. Segurança e privacidade

1. Revogar/substituir credenciais anteriormente versionadas e fornecer as novas ao processo por mecanismo externo.
2. Confirmar como frontend, API, proxy e HTTPS estão implantados; mapear páginas e operações públicas/protegidas.
3. Definir matriz de autorização: administração, avaliadores, escopo por demandante e permissões para cadastro, exclusão, exportação e e-mail.
4. Comparar opções de autenticação para o sistema único. Passport Local com sessões persistentes é uma candidata, sem decisão tomada.
5. Apresentar modelo completo para aprovação: contas, permissões, persistência, cookies/CSRF conforme topologia, senhas, limitação de tentativas, recuperação, desativação e revogação.

Aceitação: proposta revisável com matriz de acesso, impactos, arquivos, contratos, dependências, testes e plano de recuperação. Não ativar o JWT parcial nem confiar no usuário fixo do frontend. Qualquer dependência nova deve ter necessidade e compatibilidade explicadas antes da instalação.

### 2. Integridade dos dados MySQL

1. Concluído: regras de validação e campos graváveis aprovados e implementados para colaboradores e avaliações, mantendo nomes existentes.
2. Concluído: paginação de `/registros2` aprovada, implementada e testada com padrões 1/25 e teto 100.
3. Concluído no alvo isolado: cadeia de migrations, índice da FK por nome, coluna `liderancas`, tamanhos e nulabilidade. Investigar ainda duplicidade de nomes e dados legados, sem usar dados reais nos testes.
4. Propor migrations somente se necessárias, com backup, reversão e autorização específica antes de executar.

Aceitação: payloads inválidos não gravam dados; sucesso válido compatível; erros genéricos; nenhuma consulta de teste contra produção.

### 3. Preservação de comportamento e correção de bugs

1. Verificar modais de confirmação das listagens em navegador isolado e propor ajuste pontual compatível com Flowbite/Vue.
2. Definir comportamento da exportação após alterações na lista.
3. Revisar datas ausentes/inválidas, estados de carregamento e prevenção de ações repetidas.
4. Somente após regras de identidade e persistência aprovadas, especificar a submissão da avaliação, incluindo falha parcial e ordem de gravação/envio.

Aceitação: dados preservados nas falhas, tabela/exportação coerentes, navegação e seleção existentes mantidas; nenhum envio real durante testes.

### 4. Testes e recuperação

1. Manter os testes em memória atuais.
2. Planejar integração Express/Knex com banco descartável e dados fictícios, bloqueando configuração de produção.
3. Incluir cenários de autorização e autenticação quando o modelo for aprovado.
4. Confirmar procedimento de backup/restauração antes de mudanças estruturais.

Aceitação: isolamento demonstrável, execução reproduzível e resultado observado; scripts de migrations/seeds não fazem parte da validação automática atual.

### 5. Manutenção, desempenho e funcionalidades

1. Atualizar estes documentos a cada lote autorizado.
2. Medir volume, número de consultas e tempo das listagens antes de propor paginação, cache ou índices.
3. Reduzir consultas duplicadas somente com plano de sincronização entre tabela e exportação.
4. Priorizar novas funcionalidades após resolver ou aceitar explicitamente os riscos de acesso e persistência.

Aceitação: evidência antes/depois para desempenho; mudanças pequenas; nenhuma reescrita ou migração de framework por preferência.

## Validação reproduzível do primeiro lote

Com as dependências existentes instaladas, na raiz do repositório:

```powershell
node --test backend/test/*.test.js
node --test frontend/test/*.test.js
```

Esses testes substituem SMTP, banco, identidade e requisições por mocks. Não iniciar o backend real para validá-los. Não interpretar aprovação dos testes como validação da infraestrutura ou do banco implantado.

Para conferir compilação com configuração de desenvolvimento sem substituir `frontend/dist`, executar a partir de `frontend/`, escolhendo um diretório temporário novo:

```powershell
$lote1BuildOutput = Join-Path ([System.IO.Path]::GetTempPath()) ('evaluation-lote1-' + [guid]::NewGuid().ToString('N'))
npm run build -- --mode development --outDir $lote1BuildOutput
```

O build é local, não publica o site e pode incluir dados preexistentes do frontend; não compartilhar seus artefatos até remover os dados pessoais pendentes.
