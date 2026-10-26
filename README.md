# Sistema de Avaliação de Desempenho

Sistema web para avaliação de profissionais, consulta de avaliações e gestão de colaboradores. O projeto reúne um frontend Vue 3 e uma API Express com persistência MySQL, mantidos como um único sistema.

## Funcionalidades

| Área | Funcionalidades implementadas |
| --- | --- |
| Acesso | Login por e-mail e senha, logout, recuperação da sessão ao navegar e troca de senha autenticada. |
| Perfis | Administradores consultam todos os dados e executam operações administrativas; avaliadores acessam colaboradores e avaliações vinculados ao e-mail da própria conta. A autorização é aplicada pela API. |
| Colaboradores | Cadastro administrativo, listagem com pesquisa e ordenação, seleção para avaliação e exclusão administrativa com confirmação. |
| Avaliação | Formulário com qualidade, prazo, disponibilidade e responsabilidade; notas em incrementos de 0,5, observações, critérios e cálculo de média, nível e desconto. **A submissão pela interface permanece desativada.** |
| Registros | Consulta de avaliações, pesquisa, ordenação e exclusão administrativa com confirmação. A API também oferece uma listagem paginada. |
| Exportação | Exportação administrativa dos registros em XLS. |
| E-mail | Endpoints administrativos para mensagens de avaliação individual ou em grupo, com templates HTML e configuração SMTP externa. Exigem transporte configurado; envio real ainda não foi validado. |
| Contas | CLI interativa para criar administradores/avaliadores, ativar ou desativar contas e alterar o perfil, com revogação de sessões afetadas. Não há cadastro público nem senha padrão. |
| Interface | Layout responsivo, suporte ao tema escuro, mensagens de falha e modais de confirmação com navegação por teclado. |

## Estado e limites

Autenticação por Passport Local, sessões persistentes, autorização, proteção CSRF, limitação de requisições, expiração e revogação estão implementadas. Senhas usam Argon2id; cookies de sessão são HttpOnly, com regras específicas para HTTPS em produção.

As 11 migrations e os fluxos de autenticação/dados foram validados em **MySQL 8.0.44 isolado, com contas fictícias**. Backup criptografado e restauração em schema separado também foram exercitados nesse ambiente. Isso não comprova configuração ou ativação em produção.

Continuam pendentes a persistência dos arrays de critérios e a ativação da submissão, recuperação de senha por e-mail, tratamento dos vínculos legados por nome/e-mail, purga de dados expirados e recuperação em outro host. URLs, proxy e HTTPS de produção ainda precisam ser definidos. O estado das dependências e dos alertas está em [DEPENDENCIAS_SEGURANCA.md](docs/DEPENDENCIAS_SEGURANCA.md).

## Tecnologias e organização

| Camada | Tecnologias |
| --- | --- |
| Frontend | Vue 3, Vite, Vue Router, Pinia, Axios, Tailwind CSS 4 e Flowbite JS. |
| Backend | Node.js, Express 4, Consign, Knex, Passport Local, Express Session, Nodemailer e Vhost; PM2 disponível para gerenciamento de processos. |
| Banco | MySQL; driver `mysql` no Knex existente e `mysql2` nas ferramentas isoladas. |
| Testes | `node:test`, mocks e fixtures em memória; runners separados e opt-in para MySQL e navegador. |

```text
backend/       API, autenticação, migrations, ferramentas locais e testes
frontend/      Interface Vue, componentes, stores e testes
docs/          Arquitetura, contratos, planos, guias e evidências
AGENTS.md      Regras de manutenção e segurança do repositório
```

Consign carrega autenticação, middlewares, handlers e rotas nessa ordem. `backend/index.js` inicia a API diretamente; `backend/api.js` é o wrapper Vhost e delega o hostname configurado à mesma aplicação. O Vhost não representa sistemas independentes. Consulte os [detalhes do backend](backend/README.md) e o [mapa de arquitetura](docs/AI_CONTEXT.md).

## Desenvolvimento local

O ambiente registrado usa **Node.js 24.12.0**, npm 11.6.2, PowerShell 7 e MySQL 8.0.44 isolado. As dependências de frontend e backend têm manifestos e lockfiles separados. A instalação precisa preservar esses lockfiles; Argon2 possui componente nativo.

Para usar o perfil isolado **já provisionado nesta máquina**, abra um terminal na raiz do repositório:

```powershell
$perfilAvaliacao = Join-Path $env:LOCALAPPDATA 'EvaluationDev/mysql-isolated-0f8785e64029'
./backend/scripts/isolated-mysql.ps1 -Action Info -ProfileDirectory $perfilAvaliacao
./backend/scripts/isolated-mysql.ps1 -Action Start -ProfileDirectory $perfilAvaliacao
./backend/scripts/isolated-mysql.ps1 -Action Serve -ProfileDirectory $perfilAvaliacao
```

Em outro terminal, também na raiz:

```powershell
$env:VITE_API_URL = 'http://localhost:8001'
npm --prefix frontend start -- --host localhost --port 5173 --strictPort
```

Acesse `http://localhost:5173`. A API local usa `http://localhost:8001`; o Vite não configura proxy. Confira processos existentes antes de iniciar serviços nas mesmas portas.

O perfil, banco, backups e cofre DPAPI ficam fora do Git e não são recuperados por um clone. O cofre depende da identidade Windows que o criou. Sem esse perfil, siga o [guia do ambiente isolado](docs/AMBIENTE_ISOLADO.md) para planejar um provisionamento separado. Não use o bootstrap normal do backend como atalho para esse teste: ele lê a configuração de banco existente. Migrations e operações de banco exigem autorização para o destino específico.

## Validação

Na raiz, a suíte padrão usa mocks/dados fictícios e não depende de MySQL ou SMTP reais:

```powershell
node --test backend/test/*.test.js frontend/test/*.test.js
```

Os runners `Validate`, `RecoveryTest` e `VisualReview` são opt-in e têm efeitos próprios. Leia os guias antes de executá-los. Os resultados anteriores e seus limites estão nos documentos de evidência; não equivalem a testes executados após qualquer alteração futura.

## Documentação

- [Frontend: telas, componentes e comandos](frontend/README.md)
- [Backend: endpoints, autenticação e ferramentas](backend/README.md)
- [Ponto de retomada](docs/RETOMADA.md)
- [Contexto técnico e arquitetura](docs/AI_CONTEXT.md)
- [Plano de evolução](docs/PLANO_EVOLUCAO.md)
- [Autenticação e configuração](docs/PLANO_AUTENTICACAO.md)
- [Contrato de validação e paginação](docs/PLANO_VALIDACAO_API.md)
- [Ambiente MySQL isolado](docs/AMBIENTE_ISOLADO.md)
- [Backup e restauração](docs/BACKUP_RESTAURACAO.md)
- [Revisão visual](docs/REVISAO_VISUAL.md)
- [Dependências e segurança](docs/DEPENDENCIAS_SEGURANCA.md)

Credenciais, senhas, cookies e dados pessoais não devem ser incluídos em exemplos, logs ou commits. A execução local não autoriza envio de e-mails reais, publicação ou alterações em produção.
