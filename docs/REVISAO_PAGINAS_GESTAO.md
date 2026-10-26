# Aparência das páginas de gestão

Implementado em 26/10/2026, a pedido do usuário, nas rotas `/registros`, `/colabs` e `/inserir`.

Em seguida, por nova solicitação, o mesmo estilo foi aplicado à página inicial e ao login, conforme a extensão registrada ao final deste documento.

## Alterações

- `ManagementPage.vue` compartilha título, descrição, navegação e área de ações. O CSS em `src/styles/management-pages.css` fica limitado a essas páginas.
- Listagens com busca identificada por label, total de registros carregados, painéis, tabela com rolagem horizontal, nomes destacados, paginação azul e exclusão na última coluna.
- Cadastro dividido em identificação, atuação e responsáveis, com os mesmos oito campos e payload. Atalhos entre cadastro e lista; campos e ações adaptam-se ao celular.
- Inicialmente o tema segue a preferência do sistema; o lote de cabeçalho abaixo acrescentou escolha manual persistida. Mantidos Options API, EasyDataTable, seleção, ordenação, filtros e confirmação de exclusão. Sem dependências novas ou alteração no backend de negócio.
- `Excel.vue` recebeu o estilo do botão; autorização e rotina de exportação foram preservadas. O runner visual anterior passou a localizar a busca pelo nome acessível.

## Validação executada

- **127/127 testes** em memória: `node --test backend/test/*.test.js frontend/test/*.test.js`.
- Build Vite em modo development aprovado; saída temporária fora do repositório.
- **32 grupos de verificações aprovados no Chrome headless**, sem erros JavaScript. Capturas das três páginas em 320, 390, 768 e 1440 px, mais desktop escuro: 15 imagens. Inspeção visual das telas principais e ajustes de largura das observações/paginação móvel.
- Busca por nome, resultado vazio, cancelamento dos dois modais, cadastro com falha/sucesso, exclusão com falha/sucesso e ações ocultas para avaliador. Payload e preservação dos campos/linhas conferidos. Verificados ausência de overflow da página e alinhamento das setas de paginação.

O runner `frontend/scripts/review-management.mjs` usa somente respostas HTTP fictícias, intercepta toda a API e bloqueia outros destinos externos. Não usa contas/senhas, não conecta ao MySQL e não inicia nem encerra a API/Vite existentes. Escritas de teste são atendidas pela simulação. Isso valida a interface; não constitui nova integração SQL, teste do arquivo XLS, auditoria completa de acessibilidade ou validação em outros navegadores/aparelhos físicos.

## Repetir, se necessário

Com Vite já ativo em `http://localhost:5173`, apontando para `http://localhost:8001`, e uma instalação temporária **existente** de `playwright-core` 1.64.1:

```powershell
$env:EVAL_VISUAL_TOOL_DIRECTORY = '<diretório temporário que contém node_modules/playwright-core>'
node frontend/scripts/review-management.mjs
```

Usa Chrome instalado. Imagens e `report.json` ficam em `frontend/node_modules/.cache/management-review/`, ignorados pelo Git. O script não instala pacotes. A revisão anterior de autenticação/SQL continua documentada separadamente em [REVISAO_VISUAL.md](REVISAO_VISUAL.md).

## Extensão: página inicial e login

Também em 26/10/2026, `/` e `/login` passaram a reutilizar a paleta e os controles de `management-pages.css`, com estilos próprios em `evaluation-pages.css`, limitados a `.home-page` e `.login-page`.

- `Home.vue`: título, contador de selecionados e painel de profissionais; seleção lateral no desktop e acima do formulário em telas menores.
- `Form.vue` e os quatro componentes de critérios: aviso destacado, cartões para média/nível/desconto, critérios em duas colunas no desktop e uma no celular, áreas de observação e ações padronizadas. As estrelas seguem a cor de destaque do tema.
- `ListCheckboxes.vue`: espaçamento, checkboxes e destaque visual da seleção; IDs e fluxo do store preservados.
- `Login.vue`: painel com a marca existente, formulário com os mesmos campos/limites/autocomplete, botão de largura completa e mensagens de erro/status legíveis em ambos os temas. O script de autenticação recebeu somente imports de estilos; não houve alteração no modelo, sessão, CSRF ou API.
- Os harnesses de login/navegação foram ajustados para ignorar CSS e fornecer a seleção sintética do cabeçalho. Nenhuma dependência instalada. A submissão da avaliação continua sem handler de gravação.

**127/127 testes** em memória passaram e o build development foi concluído. O novo runner `frontend/scripts/review-entry-pages.mjs` aprovou **16 grupos de verificações no Chrome**, com API inteiramente simulada: login pendente/falha/sucesso, mensagens de serviço indisponível/senha alterada, seleção individual/todos, estrelas, modais de critérios para notas baixas, média/nível/desconto, resumo com nomes/observação e ausência de POST de avaliação. Capturou 15 imagens (inicial, login e erro de login) em 320/390/768/1440 px e desktop escuro, sem erros JavaScript ou overflow horizontal da página. As principais capturas foram inspecionadas visualmente, incluindo contraste das estrelas no escuro.

Para reproduzir, com as mesmas condições e variável de ferramentas acima:

```powershell
node frontend/scripts/review-entry-pages.mjs
```

Resultados em `frontend/node_modules/.cache/entry-pages-review/`, fora do Git. Senhas preenchidas são mascaradas nas capturas; as entradas do teste são fictícias. O teste não acessa credenciais reais nem MySQL. As limitações de acessibilidade, integração SQL e navegadores da revisão anterior permanecem.

## Extensão: tema manual, menu da conta e modais

Em 26/10/2026, por solicitação do usuário:

- O cabeçalho recebeu botão com nome acessível para alternar claro/escuro. Sem escolha salva, acompanha o sistema; após alternar, salva somente `light`/`dark` na chave `evaluation-theme` do localStorage. Falha de armazenamento mantém o botão funcional na página atual. A escolha vale também para login, páginas de gestão e modais.
- `src/js/theme.js` controla a preferência e o listener do sistema; `composables/useTheme.js` integra o estado ao Vue, inicializado antes da montagem em `main.js`. Tailwind usa a classe `.dark` em `html`; `styles/theme.css` compartilha a paleta com os componentes, inclusive os modais teleportados para `body`.
- `Header.vue` reúne nome, e-mail, Alterar senha e Sair no dropdown **Minha conta**. É um disclosure com links/botões nativos, não um widget ARIA menu: Enter/espaço alternam a abertura, seta para baixo abre e foca a primeira ação; Tab segue a ordem normal. Escape fecha e retorna foco ao acionador. Clique/foco fora, mudança de rota e desmontagem encerram o menu/removem seus listeners. Falha de logout mantém a conta e exibe a mensagem dentro do dropdown.
- `SubModal.vue`, `ChecksModal.vue` e `ConfirmDeleteModal.vue` compartilham `styles/dialogs.css`: painel, bordas, cabeçalho, corpo com rolagem, rodapé e botões nos dois temas. A confirmação destrutiva tem botão vermelho. Preservados IDs, modelos, eventos, slots, ações e composable Flowbite com foco/Escape. O botão Enviar do resumo continua apenas fechando o modal; não foi ativada gravação de avaliações.
- A tela de troca de senha recebeu classes de contraste no escuro, sem alterar seu fluxo. Os seletores do runner visual de integração anterior foram alinhados ao dropdown e ao rótulo Matrícula; só sua sintaxe foi validada neste lote, sem repetir integração SQL.

Validação: **130/130 testes** em memória aprovados, incluindo três testes do controlador de tema (sistema, preferência salva, persistência, armazenamento bloqueado e descarte do listener), e build development concluído. No Chrome com API inteiramente simulada, passaram **30 grupos novos**, mais as regressões de **16 grupos** da inicial/login e **32 grupos** de gestão; nenhum erro JavaScript observado.

O novo runner usa viewports de 320/390/768/1440 px, com sistema inicialmente claro ou escuro, e percorre **ambos os temas manuais** em cada cenário. Confere persistência após reload e precedência sobre o sistema; dropdown por teclado, foco/clique fora e navegação; logout com falha/sucesso; modais de qualidade/disponibilidade, resumo e ambas as exclusões, com cancelamento, Escape, foco e ajuste de altura. Gera 60 capturas; as principais foram inspecionadas visualmente em desktop e celular. Todas as respostas de API são locais/fictícias; não há escrita de negócio, credenciais reais ou acesso SQL.

Com o mesmo Vite e a variável de ferramentas já descritos:

```powershell
node frontend/scripts/review-header-modals.mjs
```

Capturas e relatório em `frontend/node_modules/.cache/header-modals-review/`, ignorados pelo Git. Chrome instalado e Playwright temporário existentes foram reutilizados, sem instalar dependências. Não foram validados sincronização de preferência entre abas, outros navegadores, aparelho físico ou conformidade WCAG completa.
