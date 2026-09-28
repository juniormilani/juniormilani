-- Gera leads_base a partir das views criadas em prospector/leads_base.py:
--   estabelecimentos, empresas, simples, cnaes, municipios, naturezas  (Parquet do mês)
--   alvo_cnae(cnae, segmento, prioridade, ordem)                        (targets.yaml)
--   parametros(uf, include_mei)                                         (targets.yaml)
-- Layout das colunas: ver sql/receita_layout.md.

-- leads_candidatos: tudo que casou por CNAE, inclusive MEI (usado para o relatório de excluídos)
CREATE OR REPLACE TABLE leads_candidatos AS
WITH p AS (SELECT * FROM parametros),
est AS (
    SELECT e.*,
           e.cnpj_basico || e.cnpj_ordem || e.cnpj_dv AS cnpj,
           CASE WHEN coalesce(e.cnae_fiscal_secundaria, '') = '' THEN []::VARCHAR[]
                ELSE string_split(e.cnae_fiscal_secundaria, ',') END AS secs
    FROM estabelecimentos e, p
    WHERE e.uf = p.uf AND e.situacao_cadastral = '02'
),
filiais AS (
    SELECT cnpj_basico, count(*) AS qtd_filiais FROM est GROUP BY cnpj_basico
),
-- melhor segmento vindo dos CNAEs secundários (menor prioridade, depois ordem no YAML)
sec_match AS (
    SELECT cnpj,
           arg_min(a.segmento, a.prioridade * 1000 + a.ordem) AS segmento,
           list(DISTINCT a.segmento ORDER BY a.segmento) AS segmentos_sec
    FROM (SELECT cnpj, unnest(secs) AS cnae FROM est) s
    JOIN alvo_cnae a ON a.cnae = trim(s.cnae)
    GROUP BY cnpj
),
casados AS (
    SELECT est.*,
           ap.segmento AS seg_principal,
           sm.segmento AS seg_secundario,
           coalesce(sm.segmentos_sec, []::VARCHAR[]) AS segmentos_sec
    FROM est
    LEFT JOIN alvo_cnae ap ON ap.cnae = est.cnae_fiscal_principal
    LEFT JOIN sec_match sm USING (cnpj)
    WHERE ap.cnae IS NOT NULL OR sm.cnpj IS NOT NULL
)
SELECT
    c.cnpj,
    emp.razao_social,
    nullif(trim(c.nome_fantasia), '') AS nome_fantasia,
    c.cnae_fiscal_principal AS cnae_principal,
    cn.descricao AS cnae_principal_descricao,
    c.secs AS cnaes_secundarios,
    coalesce(c.seg_principal, c.seg_secundario) AS segmento,
    CASE WHEN c.seg_principal IS NOT NULL THEN 'principal' ELSE 'secundario' END AS match_tipo,
    list_filter(c.segmentos_sec, x -> x <> coalesce(c.seg_principal, c.seg_secundario)) AS outros_segmentos,
    CASE c.identificador_matriz_filial WHEN '1' THEN 'matriz' WHEN '2' THEN 'filial' END AS matriz_filial,
    CASE emp.porte_empresa
        WHEN '01' THEN 'MICRO EMPRESA'
        WHEN '03' THEN 'EMPRESA DE PEQUENO PORTE'
        WHEN '05' THEN 'DEMAIS'
        ELSE 'NAO INFORMADO' END AS porte,
    TRY_CAST(replace(emp.capital_social, ',', '.') AS DOUBLE) AS capital_social,
    nat.descricao AS natureza_juridica,
    TRY_STRPTIME(nullif(c.data_inicio_atividade, '00000000'), '%Y%m%d')::DATE AS data_abertura,
    mun.descricao AS municipio,
    c.uf,
    nullif(trim(concat_ws(' ',
        nullif(trim(c.tipo_logradouro), ''), nullif(trim(c.logradouro), ''),
        nullif(trim(c.numero), ''), nullif(trim(c.complemento), ''))), '') AS endereco,
    nullif(trim(c.bairro), '') AS bairro,
    nullif(c.cep, '') AS cep,
    CASE WHEN coalesce(c.telefone_1, '') <> '' THEN trim(c.ddd_1) || trim(c.telefone_1) END AS telefone_receita,
    CASE WHEN coalesce(c.telefone_2, '') <> '' THEN trim(c.ddd_2) || trim(c.telefone_2) END AS telefone_receita_2,
    nullif(lower(trim(c.correio_eletronico)), '') AS email_receita,
    f.qtd_filiais,
    coalesce(s.opcao_pelo_simples = 'S', false) AS optante_simples,
    coalesce(s.opcao_mei = 'S', false) AS mei,
    'receita' AS origem
FROM casados c
JOIN filiais f USING (cnpj_basico)
LEFT JOIN empresas emp USING (cnpj_basico)
LEFT JOIN simples s USING (cnpj_basico)
LEFT JOIN cnaes cn ON cn.codigo = c.cnae_fiscal_principal
LEFT JOIN municipios mun ON mun.codigo = c.municipio
LEFT JOIN naturezas nat ON nat.codigo = emp.natureza_juridica
ORDER BY c.cnpj;

CREATE OR REPLACE TABLE leads_base AS
SELECT lc.* FROM leads_candidatos lc, parametros p
WHERE p.include_mei OR NOT lc.mei;
