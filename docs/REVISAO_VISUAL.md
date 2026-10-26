# Revisão visual e correções validadas

## Revalidação atual — dependências e API

Após as atualizações aprovadas, o runner voltou a passar em **48/48 verificações**, com 27 capturas: Vue 3.5.44, Axios 1.20.0 e Vite 6.4.4. Zero erros JavaScript de página, requisições externas da aplicação ou tentativas não simuladas de escrita de negócio. Exclusões permaneceram simuladas no navegador. A suíte passou em **108/108**, a integração MySQL isolada e o novo build também passaram; `frontend/dist` preservado.

[Relatório atual](evidencias/evolucao-dependencias-api/visual-report.json), [desktop](evidencias/evolucao-dependencias-api/04-reviewer-home-desktop.png), [celular](evidencias/evolucao-dependencias-api/10-reviewer-home-mobile.png) e [confirmação](evidencias/evolucao-dependencias-api/16-admin-colabs-confirmation.png). As 27 capturas ficam em `frontend/node_modules/.cache/visual-review-158f9d81ed5d`. Auditorias, versões, build e limites em [DEPENDENCIAS_SEGURANCA.md](DEPENDENCIAS_SEGURANCA.md).

## Histórico — correções aprovadas

Concluído em 25/10/2026 às 19:36, horário de São Paulo. O usuário aprovou corrigir os cinco achados da revisão original. **48 de 48 verificações visuais passaram**, com 27 capturas, 102 testes automatizados aprovados e novo build de desenvolvimento aprovado. Não houve instalação de dependências nesta etapa.

| Achado corrigido | Alteração e resultado observado |
| --- | --- |
| Avaliação cortada em celular/tablet | `Home.vue`, `Form.vue`, quatro cartões em `pages/form/`, `App.vue` e `style.css`: seleção acima do formulário em telas estreitas; critérios em uma/duas/quatro colunas; campos com largura disponível; remoção de alturas/overflow que ocultavam conteúdo. Rodapé após o conteúdo, no fundo da tela quando ela é curta. Artigo passou de 20/90 px para 320/390 px nessas larguras; zero cartões excedendo seu contêiner, também em 768 e desktop 1366. |
| Confirmações de exclusão | Novo `utils/ConfirmDeleteModal.vue`, reutilizando `useFlowbiteModal`; `Colabs.vue` e `Registros.vue` continuam em Options API. Modal somente administrativo, escondido inicialmente, acionador por teclado, Cancelar/Escape/foco e limpeza ao sair da rota. Cancelar recebe o foco inicial. Os mesmos handlers, URLs e atualização após resposta foram preservados. |
| Cabeçalho cortado | `Header.vue`: grade com título quebrável, identidade em outra linha no celular e menu legível. Elementos ficam dentro de 320/390/768/1366; logo branco ganhou fundo escuro local. |
| Contraste no escuro | Identidade agora `rgb(243, 244, 246)` sobre `rgb(17, 24, 39)`: **16,12:1**, anteriormente 1,21:1. Links/erro possuem cores para tema escuro. |
| ID duplicado no cadastro | `Inserir.vue`: matrícula usa `id="matricula"` e label correspondente; nenhum ID duplicado e clicar no rótulo foca o campo correto. |

[Relatório após correções](evidencias/correcoes-visuais-2026-10-25/report.json). Capturas preservadas: [desktop](evidencias/correcoes-visuais-2026-10-25/04-reviewer-home-desktop.png), [celular](evidencias/correcoes-visuais-2026-10-25/10-reviewer-home-mobile.png), [tablet](evidencias/correcoes-visuais-2026-10-25/11-home-width-768.png), [listagem sem modal exposto](evidencias/correcoes-visuais-2026-10-25/06-reviewer-colabs-desktop.png), [contraste escuro](evidencias/correcoes-visuais-2026-10-25/13-admin-home-dark.png) e [confirmação administrativa](evidencias/correcoes-visuais-2026-10-25/16-admin-registros-confirmation.png). As 27 originais ficam no cache local `frontend/node_modules/.cache/visual-review-1ab12a206745`.

O runner `backend/scripts/isolated-visual.js` foi ampliado para teclado, foco, Escape, Cancelar, limpeza ao desmontar, rodapé, resumo móvel e associação de matrícula. Quatro DELETE foram **simulados no navegador**, com respostas 503/204 nas duas listagens: falha preservou as linhas e sucesso atualizou a lista local; recarregar recuperou todas as linhas originais do banco. Nenhum desses DELETE chegou à API. Não houve tentativa não simulada de escrita de negócio, erro JavaScript de página, envio de e-mail ou alteração de credenciais. Sessões/contadores fictícios são usados pelo login real.

`node --test --test-reporter=tap backend/test/*.test.js frontend/test/*.test.js`: **102/102**. `npm run build -- --mode development --outDir <cache novo>`: aprovado, preservando `frontend/dist`; saída final em `frontend/node_modules/.cache/visual-fixes-build-43b1013c55be42eabad1420a4dc7aece`. Diff e sintaxe do runner conferidos. O harness de falhas de requisição passou a reconhecer o novo componente; a interação dele foi validada no Chrome real. Manifests/lockfiles, autenticação, schema e produção permaneceram intactos neste lote.

## Histórico — revisão antes das correções

Executada em 25/10/2026, concluída às 19:21 no horário de São Paulo. O usuário autorizou Playwright temporário após o controle de navegador permanecer indisponível. Live Server disponibilizava arquivos, sem expor controle de navegador à conversa.

**Resultado original:** 30 verificações, 19 aprovadas e 11 reprovadas, agrupadas nos cinco achados abaixo. Foram geradas 26 capturas antes das correções; evidências originais preservadas para comparação com o resultado atual acima.

## Escopo e evidências

- Chrome **156.0.8078.48**, Playwright Core **1.64.1**, Node **24.12.0**. Pacote instalado somente em pasta temporária, sem scripts de instalação ou download de navegador. Seu requisito Node >=20 é compatível com o runtime observado. Manifests e lockfiles do projeto preservados.
- Vue/Vite em `http://localhost:5173`, Express/Consign em `http://localhost:8001`, MySQL 8.0.44 isolado `evaluation_isolated_0f8785e64029_v2`. Diretório/porta/UUID/bind e marcador de propriedade do schema verificados antes do teste.
- Desktop 1366×900; celular 390×844 e largura 320; tablet 768×900. Tema claro e inspeção do cabeçalho no escuro. Emulação no Chrome desktop, sem teste em aparelho físico.
- Login, avaliação/resumo, cabeçalho/menu, profissionais, registros, cadastro e troca de senha. Somente contas e profissionais fictícios.
- [Relatório estruturado](evidencias/revisao-visual-2026-10-25/report.json), com quatro capturas representativas preservadas ao lado. As 26 originais ficam em `frontend/node_modules/.cache/visual-review-cc9964c8c4e4`, ignoradas pelo Git e sujeitas à limpeza do cache.

## Achados comprovados por prioridade

| Prioridade | Evidência e impacto | Correção proposta |
| --- | --- | --- |
| **Alto — avaliação cortada no celular/tablet** | `Home.vue:25` mantém coluna fixa de 300 px. Sobram **90 px** para o artigo em largura 390 e **20 px** em 320. Em 768, os quatro cartões ainda ultrapassam seus limites; as estrelas atravessam os cartões. `overflow-x: hidden` global esconde o excedente. Leitura/preenchimento ficam comprometidos. | Empilhar seleção e formulário nas telas estreitas; distribuir critérios em uma/duas/quatro colunas conforme o espaço; ajustar alturas/rodapé sem alterar cálculos, seleção ou submissão desativada. |
| **Alto — confirmação de exclusão sempre exposta e Cancelar sem efeito** | `Colabs.vue:29` e `Registros.vue:55` usam `modal fade`/`data-bs-*`. A confirmação aparece como conteúdo comum, inclusive para avaliadores. Clicar no ícone atualiza o nome, mas **Cancelar não fecha**, nas duas telas. Não houve exclusão nem bypass de autorização demonstrado. | Reutilizar o modal Flowbite integrado ao Vue, com visibilidade reativa, acionador acessível por teclado, Cancelar/Escape/foco e limpeza no unmount. Renderizar somente para administradores e preservar handlers/contratos. |
| **Médio — cabeçalho cortado no celular** | `Header.vue:3`/`:6`: flex sem adaptação e título com `whitespace-nowrap`. Elementos chegam a aproximadamente **562 px** em viewports 320/390. Identidade e ações ficam fora da área visível, ocultas pelo overflow global. | Permitir quebra do título e reorganizar identidade/ações em outra linha, preservando nomes, rotas e menu. Conferir legibilidade do logo branco sobre fundo claro. |
| **Médio — contraste da identidade no tema escuro** | `Header.vue`: `text-gray-800` sobre `dark:bg-gray-900`. Cores computadas `rgb(31, 41, 55)` e `rgb(17, 24, 39)`: **1,21:1**; texto visualmente quase indistinguível do fundo. | Definir cores apropriadas para identidade/links no tema escuro, mantendo tokens/tema e verificando foco/hover. Para texto comum, referência de 4,5:1 na [WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). |
| **Médio — ID duplicado no cadastro** | `Inserir.vue:64`/`:68`: nome e matrícula usam `id="profissional"`, com labels apontando ao mesmo ID. Duplicidade confirmada no DOM real; associação de rótulos é ambígua. Nenhum cadastro foi enviado. | ID exclusivo para matrícula e ajuste de seu `for`, preservando `v-model`, payload e demais campos. |

Capturas: [celular 390](evidencias/revisao-visual-2026-10-25/10-reviewer-home-mobile.png), [tablet 768](evidencias/revisao-visual-2026-10-25/11-home-width-768.png), [confirmação exposta para avaliador](evidencias/revisao-visual-2026-10-25/06-reviewer-colabs-desktop.png), [tema escuro](evidencias/revisao-visual-2026-10-25/13-admin-home-dark.png).

## Comportamentos aprovados neste escopo

- Página privada anônima redirecionou ao login; erro de credenciais foi genérico. Login coube no viewport móvel.
- Avaliador recebeu somente seu profissional fictício e não viu o link de inserção; administrador viu o link. Login/logout usaram aplicação e banco reais isolados.
- Resumo abriu com a seleção correta; Tab/Shift+Tab mantiveram foco no modal, Escape fechou e devolveu foco ao acionador.
- Menu móvel expandiu, logout desmontou o cabeçalho privado e retornou ao login.
- Filtro sem correspondência exibiu vazio. Lista vazia e falha 503 foram simuladas por interceptação local de GET `/colab`; a apresentação foi a esperada. Esses dois casos não simulam indisponibilidade real do MySQL.
- Troca de senha apresentou rótulos associados e layout inspecionado em desktop/celular. Nenhuma senha foi alterada.
- Zero erros JavaScript de página, requisições externas da aplicação ou tentativas de gravação de negócio. Submissão continuou desativada.

## Execução reproduzível

Com o frontend local executando e a porta 8001 livre, no PowerShell 7:

```powershell
$perfilAvaliacao = Join-Path $env:LOCALAPPDATA 'EvaluationDev/mysql-isolated-0f8785e64029'
$ferramentasVisuais = Join-Path $env:TEMP 'evaluation-visual-tools'
npm.cmd install --prefix $ferramentasVisuais --save-exact --ignore-scripts --no-audit --no-fund playwright-core@1.64.1
./backend/scripts/isolated-mysql.ps1 -Action Start -ProfileDirectory $perfilAvaliacao
./backend/scripts/isolated-mysql.ps1 -Action VisualReview -ProfileDirectory $perfilAvaliacao -VisualToolDirectory $ferramentasVisuais
```

O teste usa Chrome já instalado, conforme os [canais suportados pelo Playwright](https://playwright.dev/docs/browsers). O frontend precisa apontar para `http://localhost:8001`. O runner inicia sua própria API nessa porta e encerra API/Chrome ao terminar; não iniciar `Serve` simultaneamente. Não encerra Vite existente nem MySQL80.

`VisualReview` lê o cofre DPAPI internamente; credenciais não aparecem em argumentos/relatórios. Capturas mascaram campos de senha preenchidos. Somente `/signin` e `/signout` podem receber POST. Os quatro DELETE de teste são atendidos localmente com respostas simuladas, sem chegar à API; demais escritas e requisições externas são bloqueadas. SMTP é proibido na aplicação isolada. Somente contadores sintéticos conhecidos são expirados para repetir o fluxo; sessões/contadores do teste são os únicos dados SQL alterados por ele.

`executionCompleted=true` indica término do roteiro. `acceptancePassed` foi `false` na revisão original e passou a **`true` após as correções**, no escopo testado. Interrupção por infraestrutura/interação retorna erro de execução.

## Validação original e limites mantidos

Na revisão original: 102 testes aprovados, sintaxe JavaScript e parser PowerShell aprovados, sem alteração de telas. Depois da aprovação das correções, as telas foram ajustadas, os 102 testes passaram novamente e um novo build foi executado, conforme o resultado atual acima.

O lote de correções proposto foi aprovado e concluído. Critérios observados: confirmação escondida inicialmente; Cancelar/Escape/foco nas duas listagens; avaliação/cabeçalho sem recorte em 320/390/768; contraste suficiente; IDs únicos. O layout desktop, cálculos, contratos e a submissão desativada foram preservados; o rodapé passou ao fluxo do conteúdo para eliminar sobreposição.

Não foi executada auditoria completa WCAG, leitor de tela, Safari/Firefox, teste em aparelho físico, envio de e-mail, cadastro/exclusão SQL, alteração de senha ou inspeção de produção. Os testes de exclusão são simulações da interface; não aprovam exclusão real nem certificam produção.
