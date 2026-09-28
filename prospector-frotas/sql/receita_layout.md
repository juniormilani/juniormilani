# Layout da base CNPJ (dados abertos da Receita)

Validado em 2026-09-28 contra:
- PDF oficial de metadados: https://www.gov.br/receitafederal/dados/cnpj-metadados.pdf
- amostra real do mês `2026-09-14` (primeiras 5.000 linhas de `Estabelecimentos1.zip`,
  `Empresas1.zip`, `Simples.zip`; `Cnaes.zip`, `Municipios.zip`, `Naturezas.zip` inteiros),
  baixada do espelho https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/

## Fonte
- Oficial: `https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/` (também citado um
  compartilhamento Nextcloud `.../index.php/s/YggdBLfdninEJX9`). **Bloqueia IPs fora do Brasil**
  (conexão fechada sem resposta) — não foi possível acessá-lo deste ambiente.
- Espelho usado (`RECEITA_BASE_URL`): listagem Apache com uma pasta por mês, nomeada `AAAA-MM-DD`
  (data da cópia), com os mesmos nomes de zip da Receita. Suporta `Range` e `Content-Length`.

## Formato
- Cada zip contém **um** arquivo, com nome sem extensão `.csv`
  (ex.: `K3241.K03200Y1.D60912.ESTABELE`, `F.K03200$W.SIMPLES.CSV.D60912`, `F.K03200$Z.D60912.CNAECSV`).
- Sem cabeçalho; separador `;`; **todos** os campos entre aspas; encoding latin-1; fim de linha `\n`.
- Datas `AAAAMMDD`; ausência de data = `00000000` (Simples) ou vazio.
- `capital_social` com vírgula decimal (`120000000000,00`).
- CNAE: 7 dígitos sem pontuação; secundários separados por vírgula (`9493600,9499500`).
- `situacao_cadastral` com 2 dígitos: `01` nula, `02` ativa, `03` suspensa, `04` inapta, `08` baixada.
- `porte_empresa`: `00` não informado, `01` micro, `03` EPP, `05` demais.
- `identificador_matriz_filial`: `1` matriz, `2` filial.
- `municipio`: código **Receita** de 4 dígitos (tabela Municipios), não IBGE. Ex.: 8801 PORTO ALEGRE.
- `opcao_pelo_simples` / `opcao_mei`: `S`, `N` ou vazio.

## Colunas (ordem)
- **Estabelecimentos (30):** cnpj_basico, cnpj_ordem, cnpj_dv, identificador_matriz_filial, nome_fantasia,
  situacao_cadastral, data_situacao_cadastral, motivo_situacao_cadastral, nome_cidade_exterior, pais,
  data_inicio_atividade, cnae_fiscal_principal, cnae_fiscal_secundaria, tipo_logradouro, logradouro,
  numero, complemento, bairro, cep, uf, municipio, ddd_1, telefone_1, ddd_2, telefone_2, ddd_fax, fax,
  correio_eletronico, situacao_especial, data_situacao_especial
- **Empresas (7):** cnpj_basico, razao_social, natureza_juridica, qualificacao_responsavel,
  capital_social, porte_empresa, ente_federativo_responsavel
- **Simples (7):** cnpj_basico, opcao_pelo_simples, data_opcao_simples, data_exclusao_simples,
  opcao_mei, data_opcao_mei, data_exclusao_mei
- **Cnaes / Municipios / Naturezas (2):** codigo, descricao

Todas as colunas são gravadas como VARCHAR no Parquet (preserva zeros à esquerda).
