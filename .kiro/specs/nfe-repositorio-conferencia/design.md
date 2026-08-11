# Design — Módulo de Entrada, Repositório e Conferência de NF-e

## Estratégia geral

Evolução incremental sobre a v2.0 existente. Não reescreve o que funciona —
adiciona campos, corrige gaps e refatora onde necessário para produção.

---

## 1. Alterações no schema.prisma

### 1.1 Novo enum SituacaoFiscalNfe

```prisma
enum SituacaoFiscalNfe {
  AUTORIZADA
  CANCELADA
  DENEGADA
  DESCONHECIDA
}
```

### 1.2 Novo enum StatusIdentificacaoItem

```prisma
enum StatusIdentificacaoItem {
  IDENTIFICADO_EAN
  IDENTIFICADO_CODIGO_FORNECEDOR
  IDENTIFICADO_MANUAL
  NAO_IDENTIFICADO
}
```

### 1.3 Novo enum TipoEventoNfe

```prisma
enum TipoEventoNfe {
  // Internos
  NFE_IMPORTADA
  FORNECEDOR_IDENTIFICADO
  FORNECEDOR_NAO_ENCONTRADO
  PRODUTO_IDENTIFICADO
  PEDIDO_VINCULADO
  CONFERENCIA_INICIADA
  DIVERGENCIA_DETECTADA
  DIVERGENCIA_AUTORIZADA
  RECEBIMENTO_CONFIRMADO
  RECEBIMENTO_ESTORNADO
  NFE_CANCELADA
  // Externos (estrutura preparada para futura integração SEFAZ)
  CIENCIA_OPERACAO
  CONFIRMACAO_OPERACAO
  DESCONHECIMENTO_OPERACAO
  OPERACAO_NAO_REALIZADA
  CANCELAMENTO_SEFAZ
  CARTA_CORRECAO
}
```

### 1.4 Adicionar TipoDivergencia: PRODUTO_FALTANTE

```prisma
enum TipoDivergencia {
  QUANTIDADE_MENOR
  QUANTIDADE_MAIOR
  PRECO_DIFERENTE
  PRODUTO_NAO_SOLICITADO
  PRODUTO_NAO_IDENTIFICADO
  PRODUTO_FALTANTE  // ← novo
}
```

### 1.5 Campos adicionais em NotaFiscalEntrada

```prisma
model NotaFiscalEntrada {
  // ... campos existentes mantidos ...
  modelo              String?           // "55" = NF-e, "65" = NFC-e
  protocolo           String?           // nProt do protNFe
  dataAutorizacao     DateTime?         // dhRecbto do protNFe
  situacaoFiscal      SituacaoFiscalNfe @default(DESCONHECIDA)
  destinatarioCnpj    String?
  destinatarioNome    String?
  xmlHash             String?           // SHA-256 do XML original

  // Relações adicionais
  eventos             EventoNfe[]
  nfePedidos          NfePedido[]       // substitui relação implícita
}
```

### 1.6 Campos adicionais em NotaFiscalItem

```prisma
model NotaFiscalItem {
  // ... campos existentes mantidos ...
  statusIdentificacao StatusIdentificacaoItem @default(NAO_IDENTIFICADO)
  cest                String?
  csosn               String?
  cst                 String?
  valorIcms           Decimal? @db.Decimal(10,2)
  valorIpi            Decimal? @db.Decimal(10,2)
  valorPis            Decimal? @db.Decimal(10,2)
  valorCofins         Decimal? @db.Decimal(10,2)
}
```

### 1.7 Novo model NfePedido (substitui tabela implícita)

```prisma
model NfePedido {
  id              String            @id @default(uuid())
  nfeId           String
  pedidoId        String
  vinculadoPorId  String?
  dataVinculacao  DateTime          @default(now())
  observacao      String?

  nfe             NotaFiscalEntrada @relation(fields: [nfeId], references: [id])
  pedido          PedidoCompra      @relation(fields: [pedidoId], references: [id])
  vinculadoPor    Usuario?          @relation(fields: [vinculadoPorId], references: [id])

  @@unique([nfeId, pedidoId])
  @@map("nfe_pedidos")
}
```

### 1.8 Novo model EventoNfe

```prisma
model EventoNfe {
  id            String          @id @default(uuid())
  nfeId         String
  tipo          TipoEventoNfe
  descricao     String
  usuarioId     String?
  dados         Json?
  createdAt     DateTime        @default(now())

  nfe           NotaFiscalEntrada @relation(fields: [nfeId], references: [id])
  usuario       Usuario?          @relation(fields: [usuarioId], references: [id])

  @@map("eventos_nfe")
}
```

### 1.9 Campo custoMedio em Produto

```prisma
model Produto {
  // ... campos existentes ...
  custoMedio      Decimal?  @db.Decimal(10,2)  // preço médio ponderado
  // precoCompra existente passa a ser "último custo"
}
```

---

## 2. Alterações nos serviços

### 2.1 nfe-parser.service.ts — campos adicionais

Adicionar ao `NFeParseResult`:
```typescript
interface NFeParseResult {
  // ... campos existentes ...
  modelo: string;            // ide.mod
  protocolo: string | null;  // protNFe.infProt.nProt
  dataAutorizacao: Date | null; // protNFe.infProt.dhRecbto
  situacaoFiscal: 'AUTORIZADA' | 'CANCELADA' | 'DENEGADA' | 'DESCONHECIDA';
  destinatario: { cnpj: string; nome: string } | null;
  xmlHash: string;           // calculado com crypto.createHash('sha256')
}

interface NFeItemParseResult {
  // ... campos existentes ...
  cest: string | null;
  csosn: string | null;
  cst: string | null;
  valorIcms: number;
  valorIpi: number;
  valorPis: number;
  valorCofins: number;
}
```

Extração dos novos campos:
- `modelo`: `ide.mod` (string "55" ou "65")
- `protocolo`: `protNFe?.infProt?.nProt ?? null`
- `dataAutorizacao`: `parseData(protNFe?.infProt?.dhRecbto)`
- `situacaoFiscal`: baseado em `protNFe?.infProt?.cStat` (código 100 = AUTORIZADA, 101/151 = CANCELADA, 110/301/302 = DENEGADA)
- `destinatario`: `{ cnpj: dest.CNPJ, nome: dest.xNome }`
- `xmlHash`: `crypto.createHash('sha256').update(xmlContent).digest('hex')`

Extração dos impostos por item (det.imposto):
- ICMS: `det.imposto?.ICMS?.ICMS00?.vICMS ?? det.imposto?.ICMS?.ICMSSN102?.vICMSSTRet ?? 0`
- IPI: `det.imposto?.IPI?.IPITrib?.vIPI ?? 0`
- PIS: `det.imposto?.PIS?.PISAliq?.vPIS ?? det.imposto?.PIS?.PISNT?.vPIS ?? 0`
- COFINS: `det.imposto?.COFINS?.COFINSAliq?.vCOFINS ?? 0`

### 2.2 produto-identificacao.service.ts — persistir statusIdentificacao

Atualizar `identificarItensNfe` para persistir `statusIdentificacao` no `NotaFiscalItem`:
```typescript
// Ao identificar por EAN:
await tx.notaFiscalItem.update({ where: { id }, data: { produtoId, identificado: true, statusIdentificacao: 'IDENTIFICADO_EAN' } });

// Ao identificar por código fornecedor:
data: { produtoId, identificado: true, statusIdentificacao: 'IDENTIFICADO_CODIGO_FORNECEDOR' }
```

Atualizar `associarProduto` para setar `statusIdentificacao: 'IDENTIFICADO_MANUAL'`.

### 2.3 Novo service: nfe-eventos.service.ts

```typescript
// Criação fire-and-forget de eventos — não bloqueia o fluxo principal
export async function registrarEventoNfe(params: {
  nfeId: string;
  tipo: TipoEventoNfe;
  descricao: string;
  usuarioId?: string;
  dados?: Record<string, unknown>;
}): Promise<void>
```

Usar `.catch(() => {})` para garantir que falha no evento não propaga erro.

### 2.4 Novo service: nfe-divergencia.service.ts

```typescript
// Calcula e persiste divergências entre pedido(s) e NF-e
export async function calcularEPersistirDivergencias(
  nfeId: string,
  tx?: PrismaTransaction
): Promise<{ bloqueantes: number; alertas: number }>

// Classifica se uma divergência é bloqueante ou alerta
export function classificarDivergencia(tipo: TipoDivergencia): 'BLOQUEANTE' | 'ALERTA'
```

Lógica de `calcularEPersistirDivergencias`:
1. Buscar todos os `NotaFiscalItem` da NF-e com `produtoId` preenchido
2. Buscar pedidos vinculados (via `NfePedido`) e seus itens
3. Para cada item NF-e: comparar com item do pedido por `produtoId`
4. Criar `Divergencia` para cada diferença encontrada
5. Para itens do pedido sem correspondência na NF-e: criar `PRODUTO_FALTANTE`
6. Upsert (não criar duplicatas se já existe divergência pendente para o mesmo item)

### 2.5 recebimento.service.ts — separar custoMedio de último custo

```typescript
// Antes (atual):
const novoPreco = calcularPrecoMedio(saldoAntes, precoCompra, qtd, valorUnit);
await tx.produto.update({ data: { precoCompra: novoPreco } });

// Depois:
const custoMedioNovo = calcularPrecoMedio(saldoAntes, custoMedio ?? precoCompra, qtd, valorUnit);
await tx.produto.update({
  data: {
    precoCompra:  valorUnit,       // último custo = preço desta NF-e
    custoMedio:   custoMedioNovo,  // preço médio ponderado
  }
});
```

### 2.6 notas-fiscais.controller.ts — melhorias

**`importar`:**
- Extrair e persistir novos campos (modelo, protocolo, dataAutorizacao, situacaoFiscal, destinatarioCnpj, destinatarioNome, xmlHash)
- Ao salvar itens, incluir statusIdentificacao, cest, csosn, cst, valorIcms, valorIpi, valorPis, valorCofins
- Substituir `pedidos: { connect: [] }` por criação em `NfePedido`
- Chamar `registrarEventoNfe(NFE_IMPORTADA)` após salvar
- Chamar `registrarEventoNfe(FORNECEDOR_IDENTIFICADO)` se fornecedor encontrado
- Sugerir pedidos do mesmo fornecedor na resposta (`pedidosSugeridos`)

**`vincularPedido`:**
- Substituir `pedidos.connect` por criação de `NfePedido` com metadados
- Chamar `calcularEPersistirDivergencias` após vincular
- Chamar `registrarEventoNfe(PEDIDO_VINCULADO)`
- Atualizar status do pedido para FATURADO se estava ENVIADO

**`getConferencia`:**
- Usar divergências persistidas (do banco) em vez de calcular on-the-fly
- Retornar `classificacao` de cada divergência (BLOQUEANTE / ALERTA)

**`receber`:**
- Verificar `situacaoFiscal !== 'DENEGADA'` antes de confirmar
- Chamar `registrarEventoNfe(RECEBIMENTO_CONFIRMADO)` após transação

---

## 3. Novas rotas

```typescript
// Faturar pedido (ENVIADO → FATURADO)
router.post('/pedidos/:id/faturar', ctrl.faturar);

// Histórico de eventos de uma NF-e
router.get('/notas-fiscais/:id/eventos', ctrl.listarEventos);

// Download do XML com verificação de integridade
router.get('/notas-fiscais/:id/xml', ctrl.downloadXml);

// Buscar por chave de acesso diretamente
router.get('/notas-fiscais/chave/:chave', ctrl.buscarPorChave);
```

---

## 4. Frontend — tela de Repositório

Substituir a `NotasFiscaisPage.tsx` atual por um repositório completo com:

**Filtros em painel lateral ou barra superior:**
- Período (data início/fim com DatePicker)
- Campo de chave de acesso (44 dígitos, validação em tempo real)
- Fornecedor (select com busca)
- Número NF-e + Série
- Status operacional (multi-select)
- Situação fiscal (multi-select)
- Vinculação a pedido (com/sem/parcial)

**Grid com colunas configuráveis:**
- Ícone de conferência (✓/⚠/⛔)
- Número | Série | Chave (truncada + copiar)
- Fornecedor | CNPJ | UF
- Emissão | Entrada
- Valor total
- Pedido
- Divergências (badge com count)
- Status (badge colorido)
- Ações (Conferir / Cancelar / Download XML)

**Linha do tempo (EventoNfe):**
No detalhe da NF-e, exibir todos os eventos em ordem cronológica como uma timeline visual.

---

## 5. Frontend — tela de Conferência aprimorada

Redesenho baseado no layout do PRD (seção 25):

```
┌──────────────────────────────────────────────────────────┐
│ ← Voltar                                                  │
│ CONFERÊNCIA DE NF-e                                       │
│                                                           │
│ NF-e: 24324687  Série: 1  Status: EM CONFERÊNCIA          │
│ Fornecedor: Distribuidora ABC  CNPJ: 00.000.000/0001-00   │
│ Chave: 3126... [Copiar]   Pedido: #000145 [Alterar]       │
├──────────────────────────────────────────────────────────┤
│ ✓ 18 identificados   ⚠ 2 divergências   ⛔ 0 bloqueantes  │
├──────────────────────────────────────────────────────────┤
│ Produto  Pedido  NF-e  Receber  Valor Unit  Status        │
│ ...tabela editável com cores...                           │
├──────────────────────────────────────────────────────────┤
│ Total NF-e: R$ 2.370,10  |  A receber: R$ 2.350,10       │
│          [Resolver Divergências]  [Confirmar Recebimento] │
└──────────────────────────────────────────────────────────┘
```

Componentes novos:
- `NfeTimeline.tsx` — linha do tempo de eventos
- `NfeChaveField.tsx` — campo de chave com formatação e validação
- `DivergenciaBadge.tsx` — badge ⚠/⛔ com tooltip
- `FornecedorIdentificadoCard.tsx` — card de identificação do fornecedor
- `PedidoSugeridoCard.tsx` — sugestão automática de pedido ao importar

---

## 6. Migração de dados

A migration deverá:
1. Adicionar novos campos ao `NotaFiscalEntrada` (todos nullable para compatibilidade)
2. Adicionar novos campos ao `NotaFiscalItem` (nullable)
3. Criar tabela `nfe_pedidos` com constraint `UNIQUE(nfeId, pedidoId)`
4. Criar tabela `eventos_nfe`
5. Migrar registros existentes de `_PedidoNotasFiscais` para `nfe_pedidos` (script de migração)
6. Adicionar `custoMedio` ao `Produto` (nullable — populado apenas no próximo recebimento)
7. Dropar a tabela implícita `_PedidoNotasFiscais` após migração

### Script de migração de dados

```sql
-- Migrar relacionamentos existentes para a nova tabela
INSERT INTO nfe_pedidos (id, "nfeId", "pedidoId", "dataVinculacao")
SELECT gen_random_uuid(), "B", "A", NOW()
FROM "_PedidoNotasFiscais";

-- Atualizar statusIdentificacao baseado no campo identificado existente
UPDATE notas_fiscais_itens
SET "statusIdentificacao" = 'IDENTIFICADO_CODIGO_FORNECEDOR'
WHERE identificado = true;

UPDATE notas_fiscais_itens
SET "statusIdentificacao" = 'NAO_IDENTIFICADO'
WHERE identificado = false;
```
