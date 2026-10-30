# Redefinição aprovada da conta 12 na cópia local

Em 30/10/2026, o usuário pediu “redefina a senha” e confirmou **conta ID 12**, somente na cópia `127.0.0.1:3306/inova_nucleo_compat_20261029`. Operação concluída em `2026-10-30T03:36:56.492Z`, sem alterar a origem `inova_nucleo`, perfil 50470, esquema ou dependências. [Relatório sanitizado](evidencias/conexao-mysql-local/password-reset-account12-20261030-report.json).

Foi gerada uma senha aleatória de 192 bits, com 32 caracteres, protegida por DPAPI CurrentUser no perfil local restrito, antes da gravação. Backup das 25 contas foi cifrado e relido com autenticação. A transação reutilizou o serviço de contas existente e alterou **somente `password` (Argon2id) e `session_version` (+1) da conta 12**. Perfil, e-mail, ativação, demais campos e outras 24 contas preservados. A nova versão invalida sessões anteriores nas próximas requisições. Não houve login automatizado da conta.

A primeira tentativa parou antes do update: o driver `mysql` retorna objetos `RowDataPacket`, e a comparação estrita com o JSON autenticado também comparava protótipos. Diagnóstico somente leitura comprovou todas as contas idênticas ao backup. A comparação foi corrigida para normalizar somente a representação dos objetos, preservando todos os valores. A retomada explícita reutilizou o mesmo backup e a mesma senha protegida, exigindo igualdade integral das contas sob lock antes da escrita; não recriou nem sobrescreveu o backup. Após commit, outra leitura confirmou somente os dois campos esperados na conta 12. Não repetir `Reset` ou `ResumePrepared`.

## Acessar as credenciais localmente

Uma janela local foi iniciada com o e-mail de login e a nova senha; marque **Mostrar senha**. Nenhuma dessas informações é registrada no chat, relatório, argumentos de processo ou repositório. Não há senha padrão. Acesse [o login da prévia](http://localhost:5174/login).

Para reabrir a janela, no PowerShell 7, na raiz do projeto:

```powershell
./backend/scripts/local-inova-reset-password.ps1 -Action Show
```

`Show` apenas decifra o cofre no usuário Windows atual e apresenta a janela, sem alterar o banco. O cofre não acompanha alterações futuras feitas na tela de troca de senha. Guarde a senha no seu gerenciador; não envie credenciais pelo chat.

Artefatos privados em `%LOCALAPPDATA%/EvaluationDev/inova-nucleo-compat-20261029`: `password-reset-account12-20261030.dpapi`, `password-reset-account12-20261030-before.evalinventory` e relatório sanitizado. Pasta com herança desativada e acesso somente ao usuário atual/SYSTEM. A conclusão do cofre usa arquivo temporário cifrado e substituição do arquivo, preservando a senha preparada se houver falha de entrega. Não copiar cofre, backup, e-mail ou senha ao Git.

## Código e validação

`backend/scripts/local-inova-reset-password.js` valida o alvo contra manifesto E3/schema/servidor, exige confirmação própria, recusa repetição, faz backup e reutiliza `createAccounts`. `local-inova-reset-password.ps1` gera/protege/entrega a senha em janela WinForms e transmite dados ao processo Node por pipes capturados em memória, sem repassá-los às saídas do agente. `local-inova-inspect-reset.js` é um diagnóstico somente leitura; imprime apenas contagens e nomes dos campos alterados. Nenhum bootstrap ou contrato HTTP foi modificado.

Seis testes específicos cobrem preservação dos campos e demais contas, backup anterior ao update, objetos do driver, rollback por falha de backup/hash e rejeição de alvos indisponíveis/entrada/escopo inválidos. **Suíte completa: 321/321 aprovados, zero falhas/skips**, com `node --test backend/test/*.test.js frontend/test/*.test.js`; inclui revogação de sessões. A conferência real posterior mostrou 25 contas ativas (24 bcrypt e uma Argon2id), três migrations próprias, API 8002 e frontend 5174 prontos, SMTP bloqueado. Sem necessidade de reiniciar serviços ou repetir build frontend.
