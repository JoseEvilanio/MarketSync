# Requisitos — Módulo de Entrada, Repositório e Conferência de NF-e

## Contexto e estado atual

O MercadoPro v2.0 já possui uma implementação inicial do fluxo NF-e que cobre:
- Parser XML com 5 estratégias de extração de chave de acesso
- Identificação automática de produtos por EAN e código de fornecedor (`ProdutoFornecedor`)
- Transação atômica de recebimento com preço médio ponderado
- Estorno de recebimento com rastreabilidade
- Relacionamento N:N entre NF-e e Pedidos via tabela implícita do Prisma
- Models: `NotaFiscalEntrada`, `NotaFiscalItem`, `PedidoCompra`, `Recebimento`, `Divergencia`

Este spec evolui essa base para um módulo robusto e orientado ao processo, corrigindo os gaps identificados e adicionando as funcionalidades do PRD.

---

## Requisitos Funcionais

### RF-01 — Repositório de NF-e (tela principal)

O módulo deverá ter uma tela de repositório com filtros combinados:
- Período (data inicial e final de emissão ou entrada)
- Fornecedor (busca por nome ou CNPJ)
- Número da NF-e
- Série
- Chave de acesso (campo específico com validação de 44 dígitos numéricos)
- Status operacional (IMPORTADA, EM_CONFERENCIA, CONFERIDA, RECEBIDA, DIVERGENTE, CANCELADA)
- Situação fiscal (AUTORIZADA, CANCELADA, DENEGADA — quando disponível no XML)
- Pedido (com pedido vinculado / sem pedido / parcialmente vinculado)

O grid de resultados deverá exibir:
- Checkbox de seleção
- Ícone de status de conferência (✓ / ⚠ / ⛔)
- Número e série da NF-e
- Chave de acesso (truncada com opção de copiar)
- Fornecedor e CNPJ
- UF do emitente
- Data de emissão e data de entrada
- Valor total
- Pedido vinculado (número ou "—")
- Indicador de divergência
- Status atual

### RF-02 — Importação de XML

Ao importar um XML, o sistema deverá:
1. Ler e validar a estrutura do documento
2. Verificar se é NF-e modelo 55 ou NFC-e modelo 65 (campo `modelo`)
3. Extrair e validar a chave de acesso de 44 dígitos (já implementado — manter)
4. Calcular e armazenar o hash SHA-256 do XML original (`xmlHash`)
5. Verificar duplicidade pela chave de acesso (já implementado — 409)
6. Extrair dados do destinatário (CNPJ e nome) e validar se corresponde ao estabelecimento
7. Extrair protocolo de autorização SEFAZ (`protocolo`, `dataAutorizacao`)
8. Extrair situação fiscal do documento (`situacaoFiscal`)
9. Identificar fornecedor pelo CNPJ do emitente (já implementado)
10. Extrair todos os impostos dos itens: ICMS, IPI, PIS, COFINS, CEST
11. Persistir o `status_identificacao` de cada item (EAN / CODIGO_FORNECEDOR / NAO_IDENTIFICADO)
12. Sugerir automaticamente pedidos em aberto do mesmo fornecedor

### RF-03 — Integridade do XML

O campo `xmlHash` (SHA-256) deverá ser calculado no momento da importação e persistido.
Em qualquer consulta ao arquivo XML armazenado, o sistema deverá recalcular o hash e comparar.
Se divergir, exibir alerta de integridade comprometida sem bloquear a operação.

### RF-04 — Separação de status fiscal e operacional

O sistema deverá manter dois campos de status distintos em `NotaFiscalEntrada`:
- `status` (operacional): IMPORTADA → EM_CONFERENCIA → CONFERIDA → RECEBIDA / DIVERGENTE / CANCELADA
- `situacaoFiscal` (SEFAZ): AUTORIZADA / CANCELADA / DENEGADA / DESCONHECIDA

Uma NF-e com `situacaoFiscal = DENEGADA` não deve permitir confirmação de recebimento.
Uma NF-e com `situacaoFiscal = CANCELADA` deve exibir alerta mas não bloquear consulta histórica.

### RF-05 — Persistência do status de identificação por item

Cada `NotaFiscalItem` deverá armazenar o campo `statusIdentificacao` com os valores:
- `IDENTIFICADO_EAN` — produto encontrado pelo GTIN/EAN
- `IDENTIFICADO_CODIGO_FORNECEDOR` — produto encontrado pelo código do fornecedor
- `IDENTIFICADO_MANUAL` — produto associado manualmente pelo operador
- `NAO_IDENTIFICADO` — produto sem correspondência

Esse campo deverá ser atualizado sempre que o produto for associado.

### RF-06 — Persistência automática de divergências

Ao calcular a conferência (`getConferencia`), o sistema deverá criar registros em `Divergencia` para cada item com divergência detectada, em vez de apenas calculá-las em memória.

As divergências deverão ser criadas/atualizadas automaticamente quando:
- A NF-e for vinculada a um pedido
- O operador salvar a conferência
- O operador alterar a quantidade a receber

Tipos de divergência (já existem no enum, falta a criação automática):
- `QUANTIDADE_MENOR` — NF-e < Pedido
- `QUANTIDADE_MAIOR` — NF-e > Pedido
- `PRECO_DIFERENTE` — diferença > 0,01 entre preço pedido e preço NF-e
- `PRODUTO_NAO_SOLICITADO` — item na NF-e sem correspondente no pedido
- `PRODUTO_NAO_IDENTIFICADO` — bloqueante: impede confirmação de recebimento
- `PRODUTO_FALTANTE` — item no pedido sem correspondente na NF-e (novo tipo)

### RF-07 — Classificação de divergências: bloqueantes vs alertas

**Bloqueantes** (impedem confirmação de recebimento):
- `PRODUTO_NAO_IDENTIFICADO`
- `situacaoFiscal = DENEGADA`
- Item com quantidade a receber < 0

**Alertas** (podem ser autorizados por GERENTE ou ADMINISTRADOR):
- `QUANTIDADE_MENOR`
- `QUANTIDADE_MAIOR`
- `PRECO_DIFERENTE`
- `PRODUTO_NAO_SOLICITADO`
- `PRODUTO_FALTANTE`

A resolução de um alerta deverá registrar: usuário, data/hora, quantidade aceita, motivo (obrigatório).

### RF-08 — Transição de status FATURADO no pedido

Implementar o endpoint `POST /api/compras/pedidos/:id/faturar` para transição `ENVIADO → FATURADO`.
Este status indica que o fornecedor emitiu a NF-e, mas ela ainda não chegou ao sistema.
O status `FATURADO` deverá ser definido automaticamente quando uma NF-e for importada e vinculada ao pedido.

### RF-09 — Tabela de junção explícita NfePedido

Substituir o relacionamento implícito many-to-many por uma tabela de junção com model explícito `NfePedido`:
- `nfeId` — FK para NotaFiscalEntrada
- `pedidoId` — FK para PedidoCompra
- `vinculadoPorId` — FK para Usuario
- `dataVinculacao` — timestamp do vínculo
- `observacao` — texto livre opcional

### RF-10 — EventoNfe

Criar o model `EventoNfe` para registrar todos os eventos que afetam uma NF-e:

**Eventos internos (criados automaticamente pelo sistema):**
- `NFE_IMPORTADA`
- `FORNECEDOR_IDENTIFICADO` / `FORNECEDOR_NAO_ENCONTRADO`
- `PRODUTO_IDENTIFICADO` (com campo `detalhes` indicando quantos itens)
- `PEDIDO_VINCULADO`
- `CONFERENCIA_INICIADA`
- `DIVERGENCIA_DETECTADA`
- `DIVERGENCIA_AUTORIZADA`
- `RECEBIMENTO_CONFIRMADO`
- `RECEBIMENTO_ESTORNADO`
- `NFE_CANCELADA`

**Eventos externos (para futura integração fiscal — estrutura preparada):**
- `CIENCIA_OPERACAO`
- `CONFIRMACAO_OPERACAO`
- `DESCONHECIMENTO_OPERACAO`
- `OPERACAO_NAO_REALIZADA`
- `CANCELAMENTO_SEFAZ`
- `CARTA_CORRECAO`

Cada evento deverá ter: `tipo`, `descricao`, `usuarioId` (nullable), `dados` (JSON), `createdAt`.

### RF-11 — Dados do destinatário

`NotaFiscalEntrada` deverá armazenar:
- `destinatarioCnpj` — CNPJ do destinatário extraído do XML
- `destinatarioNome` — razão social do destinatário

O sistema deverá alertar (não bloquear) se o `destinatarioCnpj` do XML não corresponder ao CNPJ configurado em `Configuracao` (chave `empresa_cnpj`).

### RF-12 — Campos adicionais do protocolo SEFAZ

`NotaFiscalEntrada` deverá armazenar:
- `modelo` — String: "55" (NF-e) ou "65" (NFC-e)
- `protocolo` — número do protocolo de autorização SEFAZ
- `dataAutorizacao` — data/hora de autorização pelo SEFAZ
- `situacaoFiscal` — enum: AUTORIZADA | CANCELADA | DENEGADA | DESCONHECIDA

### RF-13 — Campos tributários por item

`NotaFiscalItem` deverá armazenar os principais campos tributários quando presentes no XML:
- `cest` — Código Especificador da Substituição Tributária
- `valorIcms` — valor do ICMS do item
- `valorIpi` — valor do IPI do item
- `valorPis` — valor do PIS do item
- `valorCofins` — valor do COFINS do item
- `csosn` — CSOSN para Simples Nacional
- `cst` — CST quando aplicável

Esses campos são `nullable` — não bloquear importação por ausência.

### RF-14 — Tela de conferência aprimorada

A tela de conferência deverá exibir:
- Cabeçalho completo: NF-e, série, status, fornecedor, CNPJ, chave (com botão copiar)
- Pedido vinculado com link para alterar
- Contadores visuais: N identificados ✓ | N divergências ⚠ | N pendentes ⛔
- Tabela: Produto | Pedido | NF-e | Receber (editável) | Valor Unit. | Status
- Rodapé: Total NF-e vs Total a receber
- Botões: Resolver Divergências (visível se há alertas) | Confirmar Recebimento (bloqueado se há itens ⛔)

Código de cores:
- Verde (✓) — OK
- Amarelo (⚠) — divergência autorizável
- Vermelho (⛔) — bloqueante

### RF-15 — Custo médio e último custo separados

Ao confirmar o recebimento, o sistema deverá atualizar:
- `precoCompra` — último custo de aquisição (preço da NF-e)
- `custoMedio` — preço médio ponderado recalculado

O campo `custoMedio` deverá ser adicionado ao model `Produto`. O `precoCompra` existente passa a representar o **último custo** (não mais o custo médio).

### RF-16 — Não atualizar preço de venda automaticamente

O recebimento de NF-e **não deverá atualizar** `precoVenda` do produto por padrão.
Criar configuração `atualizar_preco_venda_no_recebimento` (default: false) em `Configuracao`.
Se habilitada, atualizar `precoVenda` apenas se o novo custo for maior que o atual (proteção contra queda acidental de preço).

### RF-17 — Idempotência do recebimento (já implementado — manter)

A operação de confirmação já verifica `status === 'RECEBIDA'` e retorna 409.
Garantir que a mensagem de erro seja clara e inclua dados do recebimento original (data, usuário).

### RF-18 — Auditoria por evento

Além dos registros na tabela `Auditoria`, criar `EventoNfe` automaticamente para cada operação significativa (ver RF-10). O `EventoNfe` é a "linha do tempo" do documento — essencial para rastreabilidade operacional.

### RF-19 — Permissões por operação

| Operação | CAIXA | GERENTE | ADMINISTRADOR |
|---|---|---|---|
| Consultar repositório NF-e | ✗ | ✓ | ✓ |
| Importar XML | ✗ | ✓ | ✓ |
| Identificar produtos | ✗ | ✓ | ✓ |
| Iniciar conferência | ✗ | ✓ | ✓ |
| Autorizar divergência alerta | ✗ | ✓ | ✓ |
| Confirmar recebimento | ✗ | ✓ | ✓ |
| Estornar recebimento | ✗ | ✗ | ✓ |
| Cancelar NF-e não recebida | ✗ | ✓ | ✓ |
| Cancelar NF-e recebida | ✗ | ✗ | ✓ |

### RF-20 — Preparação para Manifestação do Destinatário

O model `EventoNfe` deverá suportar tipos de eventos externos (CIENCIA_OPERACAO, CONFIRMACAO_OPERACAO, etc.) sem implementar a integração com SEFAZ nesta versão. A estrutura de dados deverá ser compatível com a especificação técnica da Manifestação do Destinatário do Portal NF-e.

A implementação de integração com webservices SEFAZ é fora do escopo desta versão.

---

## Requisitos Não Funcionais

- **RNF-01:** Todas as operações que alteram estoque devem usar `prisma.$transaction` com rollback automático
- **RNF-02:** O hash SHA-256 do XML deve ser calculado com `crypto.createHash('sha256')`
- **RNF-03:** Campos tributários são nullable — nunca bloquear importação por ausência de ICMS/IPI/PIS/COFINS
- **RNF-04:** O model `EventoNfe` deve ser escrito de forma assíncrona (fire-and-forget) para não bloquear o fluxo principal
- **RNF-05:** A classificação de divergências como bloqueante ou alerta deve ser centralizada em um único service
- **RNF-06:** Não misturar lógica de manifestação fiscal com conferência interna de estoque — são processos distintos
- **RNF-07:** URLs, schemas e regras de integração SEFAZ devem ficar isolados em módulo próprio quando implementados
- **RNF-08:** O campo `xmlHash` deverá ser recalculado ao servir o XML para download (verificação de integridade)
- **RNF-09:** Soft delete obrigatório — nunca apagar NF-e, eventos, divergências ou movimentações
