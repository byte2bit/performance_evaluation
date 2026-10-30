# Recuperação em outra máquina e proteção das chaves

**Estado em 29/10/2026: lote A aprovado e implementado**, após o usuário solicitar prosseguir com o protótipo apresentado. Validação somente em memória, com material sintético: **227 testes aprovados**, incluindo 17 novos casos, e medição local de custo. Isso não autoriza exportar o cofre/chave operacional, provisionar outro host, importar SQL ou alterar autenticação. Lotes B/C e testes em domínio definitivo continuam fora do escopo. [Resultado sanitizado](evidencias/recuperacao-portavel/prototype-summary.json).

## 1. Objetivo e diagnóstico comprovado

Permitir recuperar o banco fictício quando o perfil Windows original estiver indisponível, mantendo os backups existentes legíveis e a origem preservada. O ensaio inicial deve continuar local, com material inteiramente sintético.

Evidências no repositório:

| Componente | Evidência e consequência |
| --- | --- |
| `backend/scripts/isolated-recovery.js`, `seal`/`unseal` | Backup `evaluation-backup-v1` protegido com AES-256-GCM. A identidade autenticada é `profile.id + ':' + profile.database`; ela identifica a **origem** do backup e não deve ser substituída pela identidade do destino. |
| Mesmo arquivo, `recover` | Chave de 32 bytes recebida em memória do launcher; backup criptografado externo, dump em memória e restauração somente em schema novo do mesmo perfil. Não é um importador para outra máquina. |
| `backend/scripts/isolated-mysql.ps1`, `Read-Vault` | `secrets.dpapi` usa DPAPI `CurrentUser`. O arquivo depende da identidade/material de proteção do Windows original. Copiar apenas esse arquivo não demonstra recuperação independente. |
| `backend/scripts/isolated-auth.js`, `loadProfile`/`verifyServer` | Validação de perfil, diretório, UUID, porta e bind. Um perfil de destino precisa comprovar sua própria identidade, sem reutilizar UUID/diretório da origem. |
| `backend/scripts/isolated-required-department.js`, `assertStructure` | Baseline 14, nove tabelas, índices/FKs e marcador de propriedade conferidos. Um marcador copiado da origem não autoriza escrever em um novo perfil. |
| `backend/scripts/isolated-inventory.js`, `inventoryKey` | Manifestos/inventários privados usam uma chave derivada de `SESSION_SECRET` e do perfil, distinta da chave `recovery`. Recuperar o SQL não torna automaticamente esses artefatos legíveis. |
| `backend/lib/auth/config.js` e `session-store.js` | Segredos independentes de sessão/HMAC e sessões persistentes. Restaurar o SQL também restaura estado de autenticação; a política do destino precisa ser aprovada. |
| `backend/lib/auth/passwords.js` e pacote instalado `argon2` | Argon2id já está disponível; a API instalada suporta saída binária (`raw: true`). Não é necessário instalar biblioteca para o protótipo proposto. Os parâmetros do login não serão alterados. |

O último exercício restaurou **9 tabelas/52 registros** e validou autenticação/concorrência **no mesmo MySQL isolado**, em `evaluation_isolated_0f8785e64029_v2_restore_20261029a001`. [Evidências](VALIDACAO_REGISTROS_LOCAL.md). Esse backup e a cópia ficam preservados; não repetir seu aplicador. O exercício não simulou perda do perfil Windows, falha do disco ou recuperação em outro host.

DPAPI normalmente depende da mesma identidade e máquina; existem exceções documentadas, como perfis itinerantes. Não foi verificada nenhuma dessas condições neste ambiente. Por isso, a proposta não depende delas. [Microsoft: CryptProtectData](https://learn.microsoft.com/en-us/windows/desktop/api/Dpapi/nf-dpapi-cryptprotectdata).

## 2. Alternativas e decisão proposta

| Alternativa | Vantagem | Dependência/limite |
| --- | --- | --- |
| Manter somente o cofre DPAPI atual | Preserva a proteção local existente | A perda do material Windows original continua sem recuperação demonstrada. |
| Pacote da chave protegido por frase-senha, armazenado separadamente do backup | Pode permitir ensaio offline sem conta em serviço externo | Exige frase-senha forte, custódia independente, formato autenticado e ensaio de desbloqueio. Sua perda impede recuperação; sua exposição permite tentativas offline. |
| Cofre externo já disponível | Pode oferecer controle de acesso, versões e registro de acessos | Serviço, conta, permissões, recuperação do próprio cofre e conexão ainda não informados/validados. Nenhuma integração será criada implicitamente. |

**Preferência confirmada em 29/10/2026:** o usuário escolheu pacote protegido por frase-senha, guardado separadamente do backup. Essa escolha define a estratégia de custódia; não equivale à aprovação do modelo técnico ou da implementação.

**Primeiro lote aprovado posteriormente e concluído:** protótipo em memória do pacote protegido por frase-senha, usando somente chaves e backups sintéticos. Não exporta nem lê chaves do perfil existente. A aprovação do protótipo não autoriza os lotes de exportação ou restauração.

Separar a chave do backup e protegê-la com uma chave de envelopamento são orientações de referência para o desenho, não certificação desta implementação. [OWASP: armazenamento criptográfico](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html#key-storage).

## 3. Modelo técnico aprovado para o protótipo

- Preservar o formato `evaluation-backup-v1` e as funções existentes. Criar um formato separado, proposto como `evaluation-recovery-key-v1`, para proteger **somente a chave de recuperação**, nunca todo o cofre.
- Usar Argon2id do pacote já instalado para derivar uma chave de envelopamento de 32 bytes. Parâmetros propostos para a versão inicial: 64 MiB, três passagens, paralelismo 1, salt aleatório de 16 bytes. Medir custo no protótipo antes de uso operacional; manter esses parâmetros separados dos parâmetros de senha das contas.
- Proteger a chave com AES-256-GCM, nonce aleatório de 12 bytes e tag de 16 bytes. A versão, algoritmos, parâmetros, salt, identificador da chave, identidade da origem e SHA-256 do arquivo de backup criptografado devem participar dos dados autenticados, com serialização determinística.
- Validar versão, campos permitidos, codificações, comprimentos e parâmetros **antes** de derivar a chave. Admitir apenas o conjunto de parâmetros aprovado, sem aceitar custos arbitrários informados por um arquivo. Limitar o envelope a 4 KiB; o ciphertext deve representar exatamente os 32 bytes da chave.
- Frase-senha proposta: 20 a 256 caracteres Unicode, sem normalização silenciosa, com confirmação quando houver CLI. A qualidade da frase-senha e sua custódia são necessárias além do comprimento. No protótipo, usar valores sintéticos em memória. A CLI operacional, se aprovada depois, deverá coletar a frase-senha em terminal sem eco; nunca por chat, argumentos, variável de ambiente ou logs.
- Uma falha de autenticação do pacote não entrega chave parcial. Conferir o hash do backup e autenticar o backup completo antes de disponibilizar SQL ao importador. Não interpretar nem executar o dump antes dessa autenticação. [Node.js 24.12: Crypto](https://nodejs.org/download/release/v24.12.0/docs/api/crypto.html#deciphersetauthtagbuffer-encoding).
- Limpar buffers de chave/material temporário no encerramento, como melhor esforço. Não prometer eliminação absoluta de cópias internas do runtime/GC.
- Não incluir senhas SQL, senhas das contas, `SESSION_SECRET`, segredo HMAC, SMTP ou cookies. O `keyId` identifica o material de recuperação; não é uma credencial e não altera backups antigos.
- O cofre atual contém uma chave `recovery` reutilizada pelos backups daquele perfil. Vincular um pacote a um arquivo não transforma essa chave existente em chave exclusiva desse backup. Rotação/versionamento de chaves e tratamento de backups antigos precisam de lote próprio; não trocar a chave atual neste trabalho.

Modelo implementado exclusivamente no protótipo. Pacotes novos foram gerados somente como buffers sintéticos em memória nos testes; nenhum arquivo de pacote foi criado, nenhuma chave operacional foi exportada e nenhuma frase-senha real foi solicitada/armazenada. A política também recusa frase-senha composta somente de espaços e Unicode malformado, sem remover espaços válidos nem normalizar o conteúdo.

## 4. Escopo dos lotes e arquivos previstos

| Lote | Resultado e arquivos previstos | Autorização necessária |
| --- | --- | --- |
| A — protótipo local concluído | `backend/lib/recovery/key-package.js` e `backend/test/recovery-key-package.test.js`; encapsular/desencapsular chave sintética e ler backup sintético no formato existente, apenas em memória. | Aprovado e validado. Sem DPAPI, MySQL, CLI operacional, arquivos externos, novo host ou dependências novas. |
| B — exportação protegida | CLI e adaptação específica do launcher, ainda a detalhar; ler exclusivamente `recovery` do perfil aprovado, proteger o pacote e validar seu desbloqueio antes de gravar em destino novo protegido. | Aprovar perfil, backup exato, custódia/frase-senha, arquivo de destino e política de acesso. Não copiar o cofre inteiro nem alterar seu conteúdo. |
| C — ensaio de restauração independente | Novo runner de importação/validação, ainda a detalhar, sem reaproveitar os aplicadores de migrations/transição. | Aprovar máquina/identidade, perfil/UUID/porta/diretórios, schema novo, credenciais locais, política de sessões/contadores e dados fictícios do ensaio. |

O lote A não altera rotas, autenticação da aplicação, schema, contratos do backup ou arquivos operacionais. B e C terão planos específicos antes da implementação/execução. Se for escolhido um cofre externo, revisar esta divisão e as permissões necessárias antes de integrar qualquer serviço.

## 5. Sequência prevista para um ensaio independente

1. Escolher um destino isolado novo e identificá-lo explicitamente. Manter bind local e portas distintas das instâncias existentes. Não configurar domínio definitivo, DNS, proxy, HTTPS de produção ou SMTP.
2. Disponibilizar, por custódias aprovadas, backup criptografado e pacote de chave; a frase-senha não acompanhará ambos no mesmo local. O teste deverá funcionar sem acesso ao `secrets.dpapi` original. Um processo novo na mesma máquina demonstra independência do arquivo, mas não comprova recuperação em outro host/identidade.
3. Provisionar credenciais SQL próprias do destino, sem recuperar senhas SQL da origem. Não aplicar migrations sobre o banco existente nem usar `Validate`, `ValidateLinks` ou `ValidateMonthlyRecords` como importador portável.
4. Autenticar o pacote, confirmar identidade/hash do backup e autenticar o dump antes de SQL. Conferir separadamente a identidade técnica do destino. A identidade autenticada da origem é preservada, sem editar o envelope para fazê-lo parecer originado no destino.
5. Restaurar somente em schema comprovadamente novo/vazio, com conta de importação limitada a esse destino. Verificar namespace, objetos suportados e limites do dump. Impedir gravação em schemas preexistentes, provisionamento de usuários globais, acesso a arquivos do servidor e comandos administrativos fora do schema aprovado.
6. Comparar DDL e conteúdo integral antes das adaptações operacionais, incluindo as nove tabelas e o baseline 14. Preservar FKs, `colab.gerencia_id` obrigatório, vínculos, autoria, notas, datas e hashes de contas. Usar comparação interna; relatórios públicos terão somente resultados/contagens sanitizados.
7. Aplicar **somente após aprovação específica** as adaptações do destino: novo marcador técnico de propriedade, credenciais/segredos operacionais locais e revogação do estado de sessão/contadores que não deva ser reutilizado. Registrar essas diferenças previstas sem declarar igualdade integral após elas. Nunca modificar marcador, sessões ou segredos na origem.
8. Validar login/autorização por método aprovado: uso local de credencial existente pelo usuário ou conta fictícia de ensaio criada no destino, sem alterar as contas restauradas. Não presumir disponibilidade das senhas fictícias armazenadas no cofre original nem exportá-las com a chave do backup.
9. Confirmar o sistema no destino, a preservação da origem e a disponibilidade segura das chaves. Preservar evidências e artefatos. Não executar limpeza, down, publicação ou destruição de chaves por este ensaio.

Manifestos/inventários privados têm recuperação separada: se for necessário preservar sua leitura, planejar proteção da chave derivadora histórica como material de arquivo, com aprovação própria. Ela não deverá virar o segredo operacional de sessão do novo ambiente.

## 6. Testes e critérios de aceitação

Para o lote A, testes com material sintético deverão comprovar:

- Round-trip da chave e do backup original sintético, sem mudar seu formato.
- Recusa de frase-senha errada, chave/pacote/backup de outra origem, hash divergente e corrupção de tag, ciphertext ou metadados autenticados.
- Recusa de campos, versões, tamanhos, codificações e parâmetros fora da allowlist antes de trabalho caro ou acesso a qualquer serviço.
- Tratamento consistente de Unicode e comprimento da frase-senha, sem normalização oculta.
- Resultado criptográfico diferente em exportações equivalentes, com salt/nonce aleatórios.
- Ausência de chamadas a DPAPI/MySQL/SMTP/produção, leitura de `.env` ou segredos operacionais, arquivos de chave em claro e valores sensíveis em stdout/stderr.

O lote A foi concluído com testes observados e diff revisado, conforme seção 8. **Não comprova exportação operacional nem recuperação em outro host.**

Para C, acrescentar prova em máquina/identidade independente sem o cofre original, igualdade anterior às adaptações, diferenças operacionais previstas, contas/dados preservados, autenticação no destino e recuperação sem abrir o serviço à rede externa. RPO, RTO, retenção, capacidade/volume, descarte e recuperação do próprio pacote serão definidos pelo usuário; os 52 registros fictícios não determinam metas de produção.

## 7. Riscos, reversão e decisões pendentes

Principais riscos: perda/exposição da frase-senha; chave e backup concentrados no mesmo local; exportação indevida de outros segredos; confusão entre identidade da origem e autorização do destino; reutilização de sessões; importação de SQL com permissões amplas; abandono de chaves antigas ainda necessárias.

Reversão proposta: o protótipo A será aditivo; sua retirada não afetará o sistema existente. Em B, falha deixa cofre e backup originais preservados e não substitui arquivo existente. Em C, falha não autoriza sobrescrever a origem, apagar schema/artefatos ou escolher outro destino. Nenhuma política automática de remoção será introduzida.

Estratégia de custódia definida: pacote protegido por frase-senha, separado do backup. Pendências antes de B/C: local concreto de guarda independente; responsável e procedimento de acesso; destino técnico; disponibilidade legítima de credenciais para validar login; política de sessões/contadores; retenção e metas RPO/RTO. Não solicitar senhas, chaves ou cookies pelo chat.

Na fase inicial deste documento houve apenas planejamento. Após aprovação do lote A, foram executados testes sintéticos e a suíte padrão, conforme seção 8. Não houve MySQL, exportação operacional ou provisionamento neste lote. A validação SQL/Chrome anterior permanece histórica e não foi repetida por este protótipo.

## 8. Resultado do lote A e contrato interno

Implementados somente dois arquivos de código/teste, sem conectar o módulo a rotas, launcher, CLI ou aplicação em execução. Usam `node:crypto`, `node:buffer` e o pacote **argon2 0.45.1 já instalado**. O leitor/gravação antigos de `isolated-recovery.js` não foram alterados neste lote.

| Função | Entrada exata | Saída |
| --- | --- | --- |
| `wrapKey` | `{ recoveryKey, passphrase, source, backupBytes }` | Promise de Buffer UTF-8 com o pacote protegido |
| `unwrapKey` | `{ packageBytes, passphrase, source, backupBytes }` | Promise de Buffer de 32 bytes, somente após autenticar pacote e backup |
| `openBackup` | Mesma entrada de `unwrapKey` | Promise de Buffer com SQL autenticado; não interpreta nem executa o conteúdo |

`source` é `{ profileId, database }`: ID hexadecimal minúsculo de 32 caracteres e nome de schema minúsculo compatível com `[a-z][a-z0-9_]{0,63}`. A frase-senha é string; chaves/pacote/backup usam Buffers. Campos adicionais, objetos com propriedades acessoras e tipos não previstos são recusados. O erro público é `RECOVERY_KEY_PACKAGE_INVALID`, com mensagem genérica e sem anexar causa/dados de entrada.

O pacote é JSON de até **4 KiB**, com campos `format`, `cipher`, `keyId`, `source`, `backupSha256`, `kdf`, `iv`, `tag`, `data`. `data` é ciphertext hexadecimal de 32 bytes; o backup antigo mantém base64 e `evaluation-backup-v1`. Salt/nonce/tag e demais valores binários usam hexadecimal minúsculo com comprimento fixo. A ordem/indentação do JSON do pacote pode mudar: os dados autenticados são reconstruídos em ordem fixa, sem campos extras. O SHA-256 vincula os **bytes exatos do arquivo de backup criptografado**; reformatação desse arquivo não é aceita como o mesmo backup.

Limite adicional de entrada do backup: **64 MiB** para o envelope JSON/base64, compatível com o limite anterior de dump de 32 MiB. A validação de estrutura/tamanhos/custos ocorre antes do Argon2. Buffers de entrada e metadados são copiados antes de aguardar a derivação, impedindo troca durante a operação assíncrona. Na proteção da chave, o backup também é autenticado antes de gerar o pacote, evitando produzir pacote para uma chave incompatível.

Os buffers internos de senha, chave derivada e plaintext temporário são limpos em `finally`, inclusive o plaintext parcial que o GCM produz antes de verificar a tag. Buffers originais do chamador não são alterados. **O chamador deve limpar os buffers retornados e seus próprios segredos.** Strings e cópias internas do runtime/pacote nativo não têm eliminação absoluta garantida.

Validação executada:

- `node --test backend/test/recovery-key-package.test.js`: **17/17 aprovados**.
- `node --test backend/test/*.test.js frontend/test/*.test.js`: **227/227 aprovados**, zero falhas/skips.
- Testes com Argon2/GCM reais, compatibilidade com `seal`/`unseal` existentes, adulteração de dados/metadados, passphrase/Unicode, limites antes de KDF, troca de entradas durante await, limpeza de buffers e importações limitadas. Um pacote autenticamente cifrado com a chave de recuperação errada também é recusado antes de retornar chave/SQL.
- `git diff --check` sem erros. Manifestos e lockfiles preservados, sem instalação. Sem novo build/Chrome: frontend não mudou neste lote.

Medição em processo separado, Node **24.12.0**, três amostras com backup sintético pequeno: proteção **222/195/216 ms** (mediana 216 ms), abertura **219/206/194 ms** (mediana 206 ms), pacote de **581 bytes** nesse cenário. RSS inicial 53 MiB, pico observado 117 MiB. A máquina executava também testes; são medições locais, não limites garantidos, teste de carga ou dimensionamento de produção. O Argon2 usa 64 MiB por derivação; o módulo não introduz limite global de chamadas concorrentes, e backups próximos do teto terão custo de memória adicional.

Nenhuma chamada a DPAPI/MySQL/SMTP, leitura de `.env`/cofre/backup operacional, gravação de pacote ou provisionamento ocorreu. Somente a documentação/evidência sanitizada foi persistida. O próximo lote B exige planejamento específico de origem/backup, custódia, caminho novo e operação de exportação antes de sua aprovação.
