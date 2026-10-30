# Acesso às contas legadas — E2A implementado e validado com dados sintéticos

**Continuidade posterior:** E2B validou SQL/HTTP em fixtures e ativou as 25 contas preservando senhas. [E3 foi aprovado e concluído](PLANO_MAPAS_PREVIA_INOVA.md#resultado-da-execução-e3), ligando explicitamente este serviço somente à prévia da cópia em 5174/8002. Os relatos inferiores de ausência de launcher ou ativação descrevem a fase E2A. Não repetir lotes concluídos.

**E2A aprovado e concluído em 29/10/2026.** O usuário aprovou a implementação em código/testes sintéticos para **manter as senhas atuais e atualizar o hash para Argon2id após um login válido**. Serviço, adaptador/worker e testes implementados; **285/285 testes passaram**. Nenhum banco operacional, cofre ou backup foi acessado neste lote; nenhuma conta ativada ou hash real alterado. A API permanece no perfil anterior, com Argon2id como padrão. E1 já foi aplicado na cópia local; não repetir migrations. Resultado técnico no item final.

## Objetivo, diagnóstico e alternativas

Permitir uma transição controlada das contas legadas para Argon2id sem redefinir senhas ou converter hashes em lote. A inspeção em leitura após E1 confirmou **25 hashes `$2a$`, custo 10**, zero contas ativas, dois administradores existentes, e-mails válidos/canônicos e sem grupos duplicados após normalização. Nenhum valor de e-mail, hash ou senha foi registrado. A API permanece no perfil anterior e o código atual rejeita bcrypt.

O verificador padrão `lib/auth/passwords.js` continua somente Argon2id, com custo já aprovado de 19.456 KiB, duas passagens e paralelismo um. Antes de E2A, o Passport Local lia a conta/verificava a senha diretamente, sem atualização de hash; agora delega ao serviço descrito no resultado, mantendo o padrão. `lib/auth/accounts.js` trata `activate` redefinindo senha, portanto **esse comando não serve para habilitar uma conta preservando sua senha antiga**. Não usá-lo nesta transição.

Alternativas: redefinir cada senha (não escolhida); habilitar bcrypt genericamente em qualquer ambiente (não proposto); **adaptador restrito ao legado e ao perfil aprovado, com atualização após autenticação e padrão atual preservado** (proposta). Não modificar contratos HTTP, sessões, CSRF, autorização ou política de senhas novas.

Atualização após autenticação e Argon2id são coerentes com a [orientação de armazenamento de senhas da OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Isso não transforma senhas antigas fracas em senhas fortes; novas senhas continuam sujeitas à política atual.

## Escopo aprovado de E2A — código e testes sintéticos

1. Acrescentar um serviço pequeno de autenticação de credenciais, chamado pela estratégia Passport existente. Padrão continua somente Argon2id; bcrypt exige adaptador explícito. Nenhum flag HTTP, hostname fornecido pelo cliente ou ativação global por variável genérica.
2. Separar o verificador legado para aceitar apenas o formato observado e custo limitado. O pacote já instalado `bcrypt-nodejs` 0.0.3 suporta `$2a$`; será usado somente para **comparação transitória**, sem gerar hashes bcrypt de contas. Não instalar/atualizar dependências neste lote. Verificar com fixtures conhecidas ASCII/UTF-8; não presumir compatibilidade `$2b$`/`$2y$`.
3. Isolar a comparação síncrona legada em worker com concorrência, fila, tempo e tamanho limitados; o callback do pacote utiliza `process.nextTick` e executa trabalho síncrono, portanto não tratá-lo como alívio do event loop. Recusar hash malformado/custo inesperado antes de trabalho caro. Falha/limite do worker não concede acesso nem usa fallback permissivo.
4. Na entrada bcrypt, limitar a **72 bytes UTF-8**, sem truncar ou normalizar a senha; recusar NUL. O limite em bytes é distinto do limite de caracteres atual. Uma senha maior não pode ser migrada com confiança pelo caminho bcrypt truncado: requer procedimento individual futuro, sem reset automático. Argon2id mantém seu limite atual de caracteres. [Limites bcrypt: OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
5. Somente uma conta ativa, não excluída e com senha comprovadamente correta pode gerar atualização. Inativos, inexistentes, excluídos, senha errada, formato inválido ou erro não escrevem hashes. Preservar resposta genérica e percurso de verificação fictícia; não prometer tempo constante para dois algoritmos distintos.
6. Calcular Argon2id fora do bloqueio SQL; dentro de transação InnoDB, reler/bloquear a conta e conferir hash anterior, versão, estado e perfil. Atualização condicionada ao estado lido evita sobrescrever redefinição, bloqueio, mudança de perfil ou rehash concorrente. Incrementar `session_version` e usar a nova versão na sessão criada. Conflito recusa a tentativa para repetição normal; não reaproveitar identidade antiga.
7. Falha de persistência ou conflito não conclui login. Não criar sessão autenticada antes da conclusão da atualização; preservar rotação de sessão/CSRF e revogação por versão. Não exibir nem registrar senha/hash em erro, log ou resposta.
8. Testar com contas e hashes **sintéticos**, DB simulado e a infraestrutura HTTP existente. O lote E2A não conecta o adaptador a nenhum launcher operacional, não acessa backup/cofre real, não altera conta na cópia e não inicia API nova.

## Arquivos e impactos previstos

- `backend/lib/auth/index.js`: delegação pequena da verificação de credenciais ao serviço, preservando Passport Local, rotas e payloads.
- Novo serviço de credenciais e adaptador/worker em `backend/lib/auth/`, com interface explícita para ativação futura. `passwords.js` permanece com comportamento padrão Argon2id; ajustes só se necessários à composição sem aceitar bcrypt por padrão.
- Novos testes de credenciais, comparação legada, limites e concorrência em `backend/test/`; pequenas extensões do harness autenticado existente se necessárias.
- Atualizar este plano, contexto e retomada com resultados reais. Não alterar `knexfile.js`, `.env`, migrations, frontend, dependências ou serviços em execução.

## Testes e aceitação

- Padrão atual continua rejeitando bcrypt e autenticando Argon2id como antes; nenhuma escrita em login Argon2id comum.
- Adaptador opt-in verifica fixtures `$2a$10$`; senha errada, hash inválido, custo não permitido, NUL e limites de bytes são rejeitados. Caracteres multibyte e 72/73 bytes cobertos.
- Conta ativa com bcrypt válido recebe hash Argon2id verificável da mesma senha e versão incrementada, antes de criar sessão; login posterior funciona só pelo novo hash.
- Conta inativa/excluída/inexistente e falha de verificação nunca recebem atualização. Não ativar contas implicitamente.
- Duas autenticações concorrentes ou uma redefinição/desativação/mudança de perfil concorrente não sobrescrevem a decisão mais recente nem preservam sessão inválida. Falhas SQL/worker geram erro genérico sem detalhes sensíveis.
- Fila/tempo/encerramento do worker testados; ausência de sockets externos, dados reais, MySQL operacional, SMTP ou alterações de perfil/contas durante a suíte.
- Executar testes pertinentes e suíte existente; frontend/build/Chrome desnecessários se a interface não mudar. Não declarar integração real bcrypt validada com base apenas nesses testes.

## Etapas posteriores ainda separadas

**E2B — posteriormente aprovado e concluído:** o usuário escolheu todas as 25 contas e depois autorizou o plano operacional. Backup pós-E1, mapa privado, SQL/HTTP em três tabelas próprias/limpas e ativação passaram, com hashes/perfis preservados e versões um. [Resultado real](PLANO_ATIVACAO_ACESSO_LOCAL.md#resultado-real--29102026). A API principal não foi trocada; o launcher isolado 50470 continua restrito e não deve ser relaxado para 3306. Não repetir os lotes concluídos.

**E3 — posteriormente aprovado e concluído:** cinco gerências sob a conta 12, 100 profissionais e 395 avaliações vinculados, 103 pendentes administrativos, gerência obrigatória e prévia separada 5174/8002 sobre a cópia. [Resultado e operação](PLANO_MAPAS_PREVIA_INOVA.md#resultado-da-execução-e3). A origem permanece intacta; não repetir os lotes SQL concluídos.

**Ativação final:** somente depois de acesso e mapas, decidir explicitamente entre usar a cópia preparada ou aplicar transição autorizada à origem. E1 e a escolha de senhas não autorizam modificar `inova_nucleo`, trocar a API principal, testar em domínio definitivo ou publicar.

## Resultado de E2A e contrato interno — 29/10/2026

### Arquivos e comportamento implementados

- `backend/lib/auth/credentials.js`: exporta `createCredentials({ db, passwords, legacy? })`, retornando função assíncrona `(email, password) => identidade pública com versão | false`. Falhas de serviço são rejeições. Sem `legacy`, comportamento Argon2id existente preservado e nenhum rehash no login comum.
- `backend/lib/auth/index.js`: Passport Local delega ao serviço. A opção interna `credentials` permite composição explícita/testável; não é variável de ambiente, campo HTTP nem configuração automática. `config/passport.js` e todos os launchers continuam sem adaptador legado.
- `legacy-bcrypt-format.js`: somente `$2a$10$` com 60 caracteres/formato permitido; senha não vazia, até 72 bytes UTF-8, sem NUL ou UTF-16 malformado. Sem normalização, truncamento, conversão de revisão ou aumento de custo aceito por inferência. O serviço também impõe a validação de entrada antes de chamar o adaptador.
- `legacy-bcrypt.js`: exporta `createLegacyBcrypt()` com métodos `verify(stored, password)` e `close()`. Criação é preguiçosa: não há worker no import ou antes de uma comparação válida. Default **um worker ativo, quatro pedidos na fila, prazo de 5 s incluindo espera**, seguido de encerramento antes de liberar a vaga. Configuração interna limitada a dois workers/oito na fila/10 s. Sobrecarga, encerramento, timeout ou falha retornam erro genérico; input inválido retorna false. `close()` é idempotente e cancela fila/trabalho ativo.
- `legacy-bcrypt-worker.js`: uma comparação por worker, usando o `bcrypt-nodejs` 0.0.3 já instalado. Sem herdar ambiente/`execArgv` do pai, sem app/SQL/configuração/SMTP; stdout/stderr não são encaminhados. Limites V8 por worker: heap antigo 32 MiB, jovem 4 MiB e stack 2 MiB; não são medição/limite de RSS total. Referências à entrada são removidas após uso; strings JavaScript não têm garantia de limpeza física de memória.
- `passwords.js`, política de senhas novas, rotas, payloads, CSRF, stores e parâmetros Argon2id permaneceram inalterados. Nenhuma dependência adicionada ou atualizada.

Na migração opt-in, somente conta ativa e não excluída com bcrypt comprovado calcula novo Argon2id. O trabalho de hash ocorre antes da transação. A releitura `FOR UPDATE` compara todos os campos de conta lidos, inclusive hash/versão/perfil/estado/identidade, com a leitura inicial. O update parametrizado condiciona ID/versão e altera **somente senha/versão**. Divergência recusa a tentativa, sem reaproveitar identidade anterior; SQL/commit/worker falhando não cria sessão autenticada. O Passport recebe identidade após o commit e usa a versão incrementada. Não há ativação implícita, reset, backfill ou sobrescrita de redefinição concorrente.

### Verificação observada

**29 testes novos**: dez de formato/worker, doze de credenciais/SQL e sete HTTP. Vetores sintéticos ASCII, UTF-8 e limite de bytes, mais [vetor público independente dos mantenedores do bcrypt](https://github.com/kelektiv/node.bcrypt.js/blob/master/test/sync.test.js). Comparação bcrypt e geração/verificação Argon2id reais, somente com segredos fictícios conhecidos; bcrypt de contas reais não foi lido ou gerado.

Os cenários cobrem defaults, filas/prazos/encerramento, erros genéricos, senha inválida e estados inativos/excluídos, conflitos de senha/versão/perfil/identidade, dois logins concorrentes, rollback de falha de commit, versão esgotada e SQL Knex real sobre conexão inteiramente simulada. HTTP Express/Passport/sessão reais sobre loopback efêmero, `MemoryStore` apenas no teste e DB simulado: sessão aguarda commit, cookie/CSRF rotacionam, versão anterior é revogada, autenticação/autorizações anteriores continuam funcionando e falhas não expõem detalhes.

Comando observado:

```powershell
node --test backend/test/*.test.js frontend/test/*.test.js
```

**285 testes aprovados, zero falhas/skips**. Sem conexão a MySQL, banco de produção, dados pessoais, cofre/backup operacional, domínio definitivo ou SMTP; frontend/build/Chrome não foram necessários. [Resumo sanitizado](evidencias/conexao-mysql-local/access-e2a-summary.json).

### Limites e continuidade

**Limites ao terminar E2A:** a integração MySQL ainda não estava validada; as 25 contas não haviam sido alteradas e os testes de concorrência eram simulados. E2B posteriormente validou SQL/HTTP/sessões/limites/locks reais em fixtures separadas e ativou as 25 contas com hashes intactos. O adaptador continua sem ligação à API principal. O pacote bcrypt é legado já instalado, restrito a compatibilidade transitória; não é usado para novas senhas. Senhas acima do limite legado/NUL/formato não suportado exigem tratamento individual posterior, sem conversão silenciosa.

O [E2B foi aprovado/aplicado](PLANO_ATIVACAO_ACESSO_LOCAL.md#resultado-real--29102026) após E2A, com autorização própria. Gerências/histórico, obrigatoriedade final e conexão da aplicação continuam pendentes. Preparado [roteiro local para informar os IDs responsáveis por G01–G05](REVISAO_MAPAS_INOVA.md); nenhum mapa foi inferido. Entre 440 candidatos de avaliação há 395 exatos e 45 só por collation, além de 58 sem candidato preservados.
