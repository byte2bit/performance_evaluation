# Frontend — Sistema de Avaliação de Desempenho

Interface Vue 3 do [sistema de avaliação](../README.md), com Vite, Vue Router, Pinia, Axios, Tailwind CSS 4 e Flowbite JS. O código existente combina Composition API e Options API, predominantemente em JavaScript, com um exemplo de seleção em TypeScript.

## Telas e funcionalidades

| Rota | Funcionalidade | Acesso |
| --- | --- | --- |
| `/login` | Login por e-mail/senha, estado de carregamento e mensagens de falha. | Pública |
| `/senha` | Troca de senha autenticada. | Autenticado |
| `/` | Seleção de profissionais e formulário com notas de qualidade, prazo, disponibilidade e responsabilidade, observações, critérios e resumo. | Autenticado |
| `/inserir` | Cadastro de colaboradores com matrícula, PPU, serviço, função, lideranças, gerência e demandante. | Administrador |
| `/registros` | Tabela de avaliações com pesquisa, ordenação e confirmação de exclusão administrativa. | Autenticado |
| `/colabs` | Tabela de colaboradores com pesquisa, ordenação e confirmação de exclusão administrativa. | Autenticado |
| `/excel` | Exportação dos registros em XLS. | Administrador |
| `/checkall` | Exemplo auxiliar de seleção de checkboxes, incluindo selecionar todos. | Autenticado |

O formulário calcula média, nível e desconto e permite notas em passos de 0,5. Qualidade e disponibilidade incluem critérios associados. **A submissão da avaliação permanece desativada**: seu formato persistente e a ativação do envio precisam de etapa própria. A API já possui endpoints de gravação, com regras descritas em [PLANO_VALIDACAO_API.md](../docs/PLANO_VALIDACAO_API.md).

Administradores consultam todos os dados; avaliadores recebem somente colaboradores/registros vinculados ao e-mail da conta. As guardas Vue controlam a navegação; a autorização efetiva é feita pelo backend.

## Sessão e interface

- Sessão recebida da API, sem identidade fixa e sem JWT no navegador.
- Axios com credenciais, token CSRF em memória e tratamento de sessão expirada.
- Logout/troca de conta limpam seleção e impedem aplicação de respostas antigas.
- Layout responsivo, tema escuro e mensagens de erro de carregamento/operação.
- Modais Flowbite com sincronização de foco e limpeza; confirmação de exclusão compartilhada com Cancelar, Escape e retorno do foco.
- Listas são atualizadas após confirmação da exclusão pela API.

Login e sessões foram validados em MySQL 8.0.44 isolado com contas fictícias. Isso não significa que produção esteja configurada. Não há cadastro público, senha padrão ou recuperação de senha por e-mail implementada.

## Organização

```text
src/main.js               Inicialização Vue
src/router/               Rotas e guardas de acesso
src/stores/               Estado de autenticação e colaboradores
src/components/pages/     Login, senha, formulário, listagens e exportação
src/components/           Componentes compartilhados e seleção
src/composables/          Integração de modais e seleção de checkboxes
src/plugins/              Cliente Axios e integração com a API
src/js/                   Exportações legadas de estado
test/                     Testes com mocks e renderização em memória
vite.config.js            Vue, Tailwind e alias @ para src
```

## Executar localmente

Com dependências instaladas e a API isolada já preparada conforme o [guia principal](../README.md#desenvolvimento-local), execute na raiz do repositório:

```powershell
$env:VITE_API_URL = 'http://localhost:8001'
npm --prefix frontend start -- --host localhost --port 5173 --strictPort
```

Acesse `http://localhost:5173`. A variável `VITE_API_URL` define a base usada pelo Axios; o Vite não configura proxy. O backend precisa permitir essa origem exata. Não reutilize configuração ou credenciais de produção para os testes.

| Script existente | Uso |
| --- | --- |
| `npm start` | Iniciar Vite, a partir de `frontend/`. |
| `npm run build` | Compilar a interface. |
| `npm run preview` | Servir o build localmente para inspeção. |

Não existe script `dev` neste `package.json`; use `start`. URLs, HTTPS e proxy de produção continuam pendentes de definição.

## Validação

Na raiz do repositório:

```powershell
node --test frontend/test/*.test.js
```

Os testes usam mocks e renderização em memória; a revisão em navegador é separada. Para compilar em modo de desenvolvimento sem substituir `frontend/dist`:

```powershell
$buildAvaliacao = Join-Path ([System.IO.Path]::GetTempPath()) ('evaluation-build-' + [guid]::NewGuid().ToString('N'))
npm --prefix frontend run build -- --mode development --outDir $buildAvaliacao
```

O build não publica o sistema nem comprova a configuração de produção. Consulte a [revisão visual](../docs/REVISAO_VISUAL.md), o [contrato da API](../docs/PLANO_VALIDACAO_API.md) e o [estado das dependências](../docs/DEPENDENCIAS_SEGURANCA.md) para resultados e limites documentados.
