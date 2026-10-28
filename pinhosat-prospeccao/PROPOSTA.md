# Proposta — Gerador de listas de prospecção B2B da PinhoSat

**Data:** 28/10/2026 · **Situação:** protótipo funcional pronto e testado com a base oficial de outubro/2026 do Rio Grande do Sul.

Esta proposta responde aos entregáveis pedidos no briefing (seção 15): arquitetura, fontes de dados, demonstração de
uma busca real, custos, prazo, escopo e caminhos de expansão. O código do MVP está nesta pasta (`pinhosat-prospeccao/`).

---

## 1. Resumo

- **Base própria, fontes oficiais e gratuitas.** A ferramenta mantém uma cópia da base pública de CNPJ da Receita Federal
  (atualizada todo mês) cruzada com o cadastro de transportadoras da ANTT (RNTRC). Não há custo por consulta, limite
  diário nem dependência de raspagem de sites.
- **A Receita já traz telefone e e-mail.** No RS, 87% dos estabelecimentos importados têm telefone e 74% têm e-mail
  declarado. Esses contatos têm limitações reais, descritas na seção 4.
- **Classificação de potencial explicável.** Cada ponto da pontuação tem um motivo visível. Por exemplo, “Registro
  ATIVO no RNTRC (+25)” ou “Porte EPP (+10)”. O sistema não inventa a quantidade de veículos nem contatos.
- **Desempenho medido.** Buscas típicas por segmento e região levam cerca de 1 s sobre 2,4 milhões de estabelecimentos
  do RS. A exportação gera Excel/CSV na hora.
- **Custo recorrente baixo.** Entre US$ 25 e US$ 45 por mês de infraestrutura (banco + hospedagem). Os dados não custam
  nada.

---

## 2. Arquitetura

```
 Fontes oficiais (mensal)                 Servidor (Next.js)                       Equipe comercial
┌──────────────────────────┐   carga    ┌──────────────────────────────┐   HTTPS   ┌──────────────────┐
│ Receita Federal — CNPJ   │──────────▶│ PostgreSQL (Supabase)         │◀────────▶│ Navegador        │
│ (~7 GB zip, 74 mi linhas)│  importador│  empresas (RS: 2,4 mi)        │  login    │ busca · listas · │
│ ANTT — RNTRC (CSV)       │  streaming │  empresa_segmento (pré-calc.) │           │ exportação ·     │
└──────────────────────────┘            │  listas · prospecção · hist.  │           │ acompanhamento   │
                                        │ API REST + regras de pontuação│           └──────────────────┘
 Enriquecimento (opcional)              └──────────────────────────────┘
 equipe / API contratada ──contatos com fonte──▶ tabela "contatos"
```

| Camada | Tecnologia | Por quê |
|---|---|---|
| Interface + API | Next.js 16 (React 19, TypeScript) | Uma aplicação só, fácil de manter e hospedar |
| Banco | PostgreSQL 16 (Supabase ou servidor próprio) | Índices em CNAE, nome (trigramas) e localização. Consultas em SQL puro, portáveis |
| Importação | Scripts Node em streaming | Lê os .zip da Receita sem descompactar: 74 milhões de linhas em ~15 min |
| Exportação | ExcelJS / CSV com `;` e BOM | Abre direto no Excel em português, com proteção contra injeção de fórmulas |
| Acesso | Login com usuários autorizados (`APP_USERS`) | Simples para o MVP. Migra para Supabase Auth quando houver mais usuários |

**Modularidade (item 10 do briefing).** Segmentos, palavras-chave e regiões ficam no banco e são editados pela tela
“Segmentos e regiões”. Ao salvar um segmento, o sistema reclassifica as empresas em segundos, sem deploy. Um filtro
novo é uma condição no montador de consultas (`lib/busca.ts`). Uma fonte nova é um importador e, se precisar, uma
tabela.

---

## 3. Fontes de dados avaliadas

| Fonte | Busca por CNAE/cidade? | Contatos | Custo | Uso no projeto |
|---|---|---|---|---|
| **Receita Federal — Dados Abertos CNPJ** | Sim (base completa local) | Telefone 1 e 2 e e-mail declarados | Gratuito, mensal | **Base principal** |
| **ANTT — RNTRC** | Por CNPJ | — | Gratuito, mensal | **Evidência de frota** (transportadora de carga registrada) |
| BrasilAPI / Minha Receita / CNPJá (plano aberto) | Não, só consulta por CNPJ | Os mesmos da Receita | Gratuito com limite | Desnecessário: a base local já contém tudo |
| CNPJá (comercial), Casa dos Dados, Econodata, Speedio etc. | Sim | Alguns incluem contatos enriquecidos | Pago por crédito ou plano, sob cotação | **Opcional, fase 2**, se a equipe precisar de mais contatos |
| Google Places API (oficial) | Por termo e região | Telefone e site do perfil comercial | Pago por requisição | Opcional, fase 2: confirmar telefone e site de leads escolhidos |
| Raspagem de sites, Google Maps ou buscadores | — | — | — | **Descartado**: viola termos de uso e é instável (pedido do briefing, seção 9) |

**Recomendação:** começar só com as fontes oficiais gratuitas (já implementadas) e medir, depois de 1 ou 2 meses de
uso, quantos leads ficam sem contato útil. Só então decidir se vale contratar enriquecimento pago. A tabela
`contatos` já recebe contatos de qualquer origem, sempre com a fonte e a data registradas.

---

## 4. Demonstração com dados reais (base RF de out/2026 + RNTRC de set/2026)

**Base carregada:** 2.420.816 estabelecimentos do RS (ativos, suspensos e inaptos), sendo 1.761.594 ativos. A
importação levou 14 minutos e a classificação nos 27 segmentos, 12 segundos.

### Exemplo 1 do briefing
> “Transportadoras de cargas ativas no RS, principalmente na região metropolitana de Porto Alegre, que tenham telefone
> comercial disponível e ainda não estejam na minha base de prospecção.”

Filtros: segmento *Transportadoras de cargas*, região *Grande Porto Alegre (34 cidades)*, situação *Ativa*, *Excluir
MEI*, *Com telefone*, *Somente fora da minha base*.

| Resultado | Quantidade |
|---|---|
| Estabelecimentos encontrados | **15.976**, em ~1 s |
| Alto potencial | 5.222 (4.728 com RNTRC ativo na ANTT) |
| Potencial médio | 6.045 |
| A verificar | 4.709 (transporte só como CNAE secundário) |
| Modo restrito (só CNAE principal) | 6.646 (4.191 de alto potencial) |
| Com celular (possível WhatsApp, não confirmado) | 8.886 |

Primeiras linhas, ordenadas por potencial, com o motivo exibido na tela:

| Empresa | Cidade | Potencial | Principais motivos |
|---|---|---|---|
| BULKY LOG TRANSPORTES LTDA | Gravataí | Alto · 110 | CNAE principal 4930-2/02 (+40), RNTRC ativo (+25), porte Demais (+15), capital ≥ R$ 1 mi (+10) |
| CADORE TRANSPORTES E COMERCIO LTDA | Cachoeirinha | Alto · 110 | idem |
| COMPREBEM COMERCIO E TRANSPORTES LTDA | Sapucaia do Sul | Alto · 110 | idem, 2 telefones |

### Exemplo 2 do briefing
> “Empresas de desentupimento e hidrojateamento em Canoas, Esteio, Sapucaia do Sul e São Leopoldo, com contatos
> comerciais disponíveis.”

| Resultado | Quantidade |
|---|---|
| Estabelecimentos encontrados | **120**, em 0,05 s |
| Alto / médio / a verificar | 21 / 51 / 48 |
| Com RNTRC ativo (caminhões registrados para transporte de carga) | 19 |

O primeiro resultado é uma empresa de efluentes de Canoas com CNAE principal 3702-9/00, RNTRC ativo, porte Demais e
3 estabelecimentos. A lista vale para uma campanha específica e cabe numa tarde de ligações.

### O que os dados mostram sobre contatos (transportadoras ativas do RS, sem MEI, CNAE principal)

| Indicador | Valor |
|---|---|
| Têm e-mail na Receita | 72% (18.097 de 25.243) |
| …dos e-mails, de provedor gratuito (gmail, hotmail…) | 70% |
| …dos e-mails, com cara de escritório de contabilidade | 16%, sinalizados como “contador?” na tela |
| Têm celular cadastrado | 54% |

**Conclusões honestas:**
1. O telefone da Receita é o contato mais útil, mas pode estar desatualizado ou ser do contador.
2. Celular indica *possível* WhatsApp. O sistema mostra o link wa.me para conferir, mas só marca “WhatsApp confirmado”
   quando alguém da equipe registra.
3. Site: o sistema deduz o domínio de e-mails corporativos e, com um clique, confere se o site responde. Não há
   raspagem de conteúdo.
4. Quantidade de veículos: **não existe em fonte pública por empresa**. O RNTRC confirma que a empresa transporta carga
   com veículos registrados, mas os dados abertos da ANTT não trazem a frota por CNPJ.

---

## 5. Funcionalidades

### Incluídas no MVP (já implementadas e testadas)
- Busca por nome, CNPJ ou atividade. Segmentos múltiplos (27 pré-cadastrados), CNAEs avulsos, UF, regiões, cidades,
  prefixo de CEP.
- Filtros cadastrais: situação, porte, matriz/filial, tempo de atividade, capital social, excluir MEI.
- Filtros comerciais: com telefone, celular, e-mail, e-mail de domínio próprio, site verificado, RNTRC ativo,
  potencial, fora da base / não contatadas / já na base.
- Pontuação de potencial explicável e ordenação por potencial, cidade, segmento, porte, capital ou abertura.
- Seleção, remoção individual, quantidade de resultados (até 5.000 por página) e paginação.
- Listas nomeadas por campanha, adição a listas existentes e aviso de duplicados por CNPJ e por grupo (matriz/filial).
- Exportação para Excel e CSV com escolha de campos e histórico de exportações.
- Prospecção: 9 status, observações com atalhos, último contato, próximo acompanhamento, responsável, histórico e
  alteração em lote.
- Painel de acompanhamento com retornos vencidos e dos próximos 7 dias, e funil por status.
- Cadastro de segmentos (CNAEs e palavras-chave, com busca na tabela oficial de CNAE) e de regiões pela interface.
- LGPD: fonte e data em todo dado, CPF removido da razão social de MEIs, pessoas físicas do RNTRC descartadas na
  importação, exclusão e oposição com um clique (“Não prospectar” some de todas as buscas), acesso só com login.
- Atualização mensal por comando. A reimportação preserva listas e histórico.

### Fora do MVP (fases seguintes)
- Enriquecimento pago de contatos (API comercial ou Google Places) e confirmação automática de WhatsApp.
- Integração com WhatsApp Business API e automação de follow-up.
- Integração com CRM (RD Station, Pipedrive, HubSpot) ou com o PinhoSystem.
- Usuários com papéis e permissões (Supabase Auth), metas por vendedor e relatórios de conversão.
- Busca por raio a partir de um ponto (exige geocodificação dos endereços).
- Faixa de faturamento: não há fonte pública confiável.

---

## 6. Custos

### Desenvolvimento

| Etapa | Horas | Situação |
|---|---|---|
| Importadores (Receita, RNTRC), modelo de dados, classificação | 30 h | Pronto |
| Busca, filtros, pontuação, desempenho | 35 h | Pronto |
| Interface (busca, listas, ficha, acompanhamento, configurações) | 40 h | Pronto |
| Exportação, LGPD, testes | 15 h | Pronto |
| **Subtotal MVP** | **120 h** | **Protótipo funcional entregue** |
| Colocação em produção: Supabase, hospedagem, domínio, carga mensal automatizada, usuários | 16–24 h | A fazer |
| Ajustes com a equipe comercial após 2 semanas de uso (segmentos, pesos, campos) | 8–16 h | A fazer |

> Valor final = horas × valor-hora a combinar. Exemplo a R$ 100/h: MVP R$ 12.000 + produção e ajustes R$ 2.400 a
> R$ 4.000.

### Recorrentes (mensais)

| Item | Opção recomendada | Custo estimado |
|---|---|---|
| Banco de dados | Supabase Pro (8 GB de disco incluídos; o RS ocupa ~1,6 GB) | US$ 25 |
| Hospedagem da aplicação | Vercel Pro (o plano gratuito não permite uso comercial) **ou** VPS própria | US$ 20 ou ~US$ 5–10 |
| Atualização mensal dos dados | GitHub Actions ou a própria VPS (~30 min por mês) | Incluso no plano gratuito |
| Dados (Receita + ANTT) | — | **R$ 0** |
| Enriquecimento pago (opcional) | Sob cotação, por crédito ou consulta | A definir na fase 2 |
| **Total** | | **~US$ 30 a 45 por mês** |

Expandir para o Brasil inteiro (só empresas ativas) deve exigir cerca de 15 a 20 GB de disco e um banco com mais
memória. Estimativa: US$ 40 a 80 por mês. A busca não cobra por consulta e não tem limite diário ou mensal, porque a
base é própria.

---

## 7. Prazo

| Marco | Prazo |
|---|---|
| Protótipo funcional com dados reais do RS | **Concluído** |
| Produção (hospedagem, usuários, carga automática) | 1 semana após o aceite |
| Uso assistido e ajustes de segmentos e pesos | +2 semanas |
| **MVP em operação** | **~3 semanas após o aceite** |

---

## 8. Respostas aos pontos de avaliação (seção 12 do briefing)

1. **Melhor fonte em custo, cobertura e qualidade:** Receita Federal (cobertura total e gratuita) + RNTRC
   (qualificação de frota). Fontes pagas só complementam contatos.
2. **Busca por CNAE, cidade, estado e situação:** sim, com índices próprios. Ver seção 4.
3. **Enriquecimento de contatos:** contatos da Receita + verificação de site + registro manual com fonte. Fase 2: API
   paga.
4. **CNPJs duplicados entre listas:** o CNPJ é a chave. Listas e tela de busca avisam “em N listas” e “grupo já na
   base”. Há também o filtro “fora da minha base”.
5. **Dados atualizados:** reimportação mensal (upsert por CNPJ). Empresas que deixam de constar viram “baixadas”. A
   competência aparece no topo da tela e em cada registro.
6. **Custo por consulta:** zero (base própria).
7. **Limites:** nenhum de terceiros. A Receita e a ANTT atualizam uma vez por mês.
8. **Armazenamento de listas e histórico:** PostgreSQL (tabelas `listas`, `lista_itens`, `prospeccao`,
   `prospeccao_historico`, `exportacoes`).
9. **Novos usuários:** sim. Hoje por configuração, com o usuário registrado em cada ação. Na fase 2, Supabase Auth com
   papéis.
10. **Arquitetura extensível:** segmentos e regiões configuráveis, montador de consultas central e um importador por
    fonte.

---

## 9. LGPD

- **Base legal:** legítimo interesse para prospecção B2B, com dados públicos de pessoas jurídicas.
- **Minimização:** não importamos sócios (QSA), removemos o CPF que aparece na razão social de MEIs e descartamos
  transportadores pessoa física do RNTRC. MEIs ficam fora das buscas por padrão.
- **Transparência:** fonte e data de cada dado aparecem na tela e na exportação. Contatos complementares exigem a fonte.
- **Direitos do titular:** o botão “Excluir dados complementares e bloquear contato” apaga anotações, contatos e
  histórico, tira a empresa das listas e impede que ela volte a aparecer.
- **Segurança:** acesso só com login, cabeçalhos de segurança, consultas parametrizadas e proteção contra fórmulas nas
  planilhas. Em produção, use HTTPS e senhas fortes, e restrinja a exportação se necessário.

---

## 10. Próximos passos

1. Aceite da proposta e definição da hospedagem (Supabase + Vercel, ou VPS).
2. Criação dos usuários da equipe comercial.
3. Sessão de 1 h com a equipe para revisar os 27 segmentos e os pesos da pontuação.
4. Duas semanas de uso real. Depois, decidir sobre o enriquecimento pago com base nos dados de uso.
