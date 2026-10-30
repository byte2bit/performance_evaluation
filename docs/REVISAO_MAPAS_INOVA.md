# Revisão local dos mapas — referência e resultado E3

**E3 aprovado e concluído:** cinco gerências sob a conta **ID 12**, 100 profissionais e **395 avaliações binariamente exatas vinculados somente na cópia**. Os **103 pendentes** (45 apenas por collation/58 sem candidato) continuam intactos, com visibilidade administrativa. Gerência unsigned obrigatória e prévia [localhost:5174/login](http://localhost:5174/login) conectada à API 8002; origem preservada. [Resultado, evidências e limites](PLANO_MAPAS_PREVIA_INOVA.md#resultado-da-execução-e3). Os mapas privados permanecem criptografados fora do Git; não repetir sua aplicação.

As consultas abaixo foram preparadas antes de E3 e continuam como referência **somente leitura** no cliente local. Afirmações inferiores de vínculos/launcher pendentes descrevem o estado anterior à aplicação. Qualquer proposta adicional para os 103 registros precisa de revisão e escopo próprio; igualdade por collation não autoriza vínculo automático.

Use as consultas **somente leitura** abaixo no cliente MySQL local já utilizado, sem enviar credenciais ou resultados com nomes/e-mails pelo chat. Todas apontam explicitamente para `inova_nucleo_compat_20261029`; não há comandos de escrita. Não executar migrations antigas, E1 ou E2B novamente. As consultas mostram os dados fictícios apenas no seu cliente local; este arquivo não contém dados individuais.

## Contas disponíveis

```sql
SELECT id AS conta_id, name, email, admin, active
FROM inova_nucleo_compat_20261029.users2
WHERE active = 1 AND deletedAt IS NULL
ORDER BY id;
```

Há 25 contas habilitadas, incluindo os dois administradores preservados. O modelo aceita uma conta ativa como demandante, inclusive administradora; uma mesma conta pode responder por mais de uma gerência. Não é necessário mudar perfis nem criar contas.

## Identificação dos cinco grupos de gerência

As aliases são ordenadas pelo primeiro ID de profissional de cada rótulo, como no inventário privado. Esperados: **G01 = 40, G02 = 23, G03 = 16, G04 = 20, G05 = 1**. O texto legado de responsável é referência para sua revisão; não foi equiparado automaticamente a uma conta.

```sql
WITH grupos AS (
    SELECT MIN(id) AS primeiro_id,
           MIN(gerencia) AS gerencia_legada,
           COUNT(*) AS profissionais,
           COUNT(DISTINCT CAST(demandante AS BINARY)) AS textos_responsavel,
           MIN(demandante) AS responsavel_textual_legado
    FROM inova_nucleo_compat_20261029.colab
    GROUP BY CAST(gerencia AS BINARY)
)
SELECT CONCAT('G', LPAD(ROW_NUMBER() OVER (ORDER BY primeiro_id), 2, '0')) AS grupo,
       gerencia_legada, profissionais, textos_responsavel, responsavel_textual_legado
FROM grupos
ORDER BY primeiro_id;
```

Informe **somente os IDs das contas** escolhidas para cada grupo:

```text
G01 → conta_id:
G02 → conta_id:
G03 → conta_id:
G04 → conta_id:
G05 → conta_id:
```

Essa resposta servirá para preparar o mapa revisável da próxima etapa. Não aplica o mapa nem modifica dados. Se as quantidades não coincidirem, interrompa a revisão e informe apenas que houve divergência.

## Candidatos de vínculo das avaliações

O inventário encontrou 440 avaliações com um candidato pelo nome e 58 sem candidato. Inspeção agregada posterior confirmou **395 pares com igualdade binária e 45 dependentes da collation**, todos ainda sem vínculo. Correspondência textual é proposta, não prova de identidade, mesmo nos 395 casos exatos. Para revisar os IDs e nomes somente no cliente local:

```sql
SELECT r.id AS avaliacao_id, r.colab AS nome_na_avaliacao,
       r.created_at, r.demandante AS autoria_legada,
       c.id AS profissional_candidato_id, c.colab AS nome_no_cadastro,
       CASE WHEN c.id IS NULL THEN 'SEM_CANDIDATO'
            WHEN CAST(r.colab AS BINARY) = CAST(c.colab AS BINARY) THEN 'TEXTO_EXATO'
            ELSE 'SOMENTE_COLLATION' END AS correspondencia
FROM inova_nucleo_compat_20261029.registros AS r
LEFT JOIN inova_nucleo_compat_20261029.colab AS c ON c.colab = r.colab
WHERE r.colab_id IS NULL
ORDER BY r.id, c.id;
```

Não apagar, atribuir a um cadastro de preenchimento ou alterar autoria/datas/notas para tratar os 58 sem candidato. Até decisão revisada, a proposta é mantê-los intactos e sem vínculo. A aplicação dos candidatos e a regra de visibilidade desses registros precisam constar do próximo plano aprovado. O mapa de gerências, o reforço de obrigatoriedade e a troca da API também continuam pendentes.
