# Design — Evolução do Módulo de Compras, NF-e e Recebimento

## Arquitetura Geral

O módulo é implementado em cima da stack existente:
- **Backend:** Node.js + Express + TypeScript + Prisma ORM + PostgreSQL
- **Frontend:** React + TypeScript + TailwindCSS + @tanstack/react-query + Axios
- **Nova dependência:** `fast-xml-parser` para parsing de XML NF-e

A estratégia é **adição sem quebra**: novos models e rotas coexistem com os existentes. O model `Compra` e o endpoint `POST /api/compras/:id/concluir` são preservados.

---

## 1. Schema Prisma — Novos Models

Adicionar ao `backend/prisma/schema.prisma`:

```prisma
// ─── NOVOS ENUMS ────────────────────────────────────────────

enum StatusPedidoCompra {
  RASCUNHO
  ABERTO
  ENVIADO
  FATURADO
  EM_CONFERENCIA
  PARCIAL
  RECEBIDO
  CONCLUIDO
  CANCELADO
  DIVERGENTE
}

enum StatusNotaFiscal {
  IMPORTADA
  AGUARDANDO_VINCULO
  EM_CONFERENCIA
  COM_DIVERGENCIA
  APROVADA
  RECEBIDA
  CANCELADA
}

enum StatusRecebimento {
  PENDENTE
  CONCLUIDO
  CANCELADO
}

enum TipoDivergencia {
  QUANTIDADE_MENOR
  QUANTIDADE_MAIOR
  PRECO_DIFERENTE
  PRODUTO_NAO_SOLICITADO
  PRODUTO_NAO_IDENTIFICADO
}

enum StatusDivergencia {
  PENDENTE
  RESOLVIDA
  IGNORADA
}

// Adicionar ao enum TipoMovimentoEstoque existente:
// ENTRADA_NFE (entrada via NF-e confirmada)
// SAIDA_ESTORNO_NFE (estorno de NF-e recebida)

// ─── NOVOS MODELS ───────────────────────────────────────────

model PedidoCompra {
  id           String               @id @default(uuid())
  numero       Int                  @unique @default(autoincrement())
  fornecedorId String?
  usuarioId    String
  status       StatusPedidoCompra   @default(RASCUNHO)
  total        Decimal              @db.Decimal(10, 2) @default(0)
  observacao   String?
  createdAt    DateTime             @default(now())
  updatedAt    DateTime             @updatedAt
  deletedAt    DateTime?

  fornecedor   Fornecedor?          @relation(fields: [fornecedorId], references: [id])
  usuario      Usuario              @relation(fields: [usuarioId], references: [id])
  itens        PedidoCompraItem[]
  notasFiscais NotaFiscalEntrada[]  @relation("PedidoNotasFiscais")

  @@map("pedidos_compra")
}

model PedidoCompraItem {
  id                   String       @id @default(uuid())
  pedidoId             String
  produtoId            String
  quantidade           Float
  quantidadeRecebida   Float        @default(0)
  precoUnitario        Decimal      @db.Decimal(10, 2)
  subtotal             Decimal      @db.Decimal(10, 2)
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt

  pedido               PedidoCompra @relation(fields: [pedidoId], references: [id])
  produto              Produto      @relation(fields: [produtoId], references: [id])

  @@map("pedidos_compra_itens")
}

model NotaFiscalEntrada {
  id            String           @id @default(uuid())
  fornecedorId  String?
  chaveAcesso   String           @unique
  numero        String
  serie         String
  dataEmissao   DateTime
  dataEntrada   DateTime?
  valorTotal    Decimal          @db.Decimal(10, 2)
  status        StatusNotaFiscal @default(IMPORTADA)
  xmlPath       String?
  observacao    String?
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
  deletedAt     DateTime?

  fornecedor    Fornecedor?      @relation(fields: [fornecedorId], references: [id])
  itens         NotaFiscalItem[]
  recebimentos  Recebimento[]
  pedidos       PedidoCompra[]   @relation("PedidoNotasFiscais")
  divergencias  Divergencia[]

  @@map("notas_fiscais_entrada")
}

model NotaFiscalItem {
  id               String            @id @default(uuid())
  notaFiscalId     String
  produtoId        String?
  codigoFornecedor String
  gtin             String?
  descricao        String
  ncm              String?
  cfop             String?
  unidade          String            @default("UN")
  quantidade       Float
  valorUnitario    Decimal           @db.Decimal(10, 2)
  desconto         Decimal           @db.Decimal(10, 2) @default(0)
  valorTotal       Decimal           @db.Decimal(10, 2)
  identificado     Boolean           @default(false)
  createdAt        DateTime          @default(now())

  notaFiscal       NotaFiscalEntrada @relation(fields: [notaFiscalId], references: [id])
  produto          Produto?          @relation(fields: [produtoId], references: [id])

  @@map("notas_fiscais_itens")
}

model ProdutoFornecedor {
  id                  String      @id @default(uuid())
  produtoId           String
  fornecedorId        String
  codigoFornecedor    String
  gtin                String?
  descricaoFornecedor String?
  ativo               Boolean     @default(true)
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt

  produto             Produto     @relation(fields: [produtoId], references: [id])
  fornecedor          Fornecedor  @relation(fields: [fornecedorId], references: [id])

  @@unique([fornecedorId, codigoFornecedor])
  @@map("produto_fornecedor")
}

model Recebimento {
  id             String            @id @default(uuid())
  notaFiscalId   String
  usuarioId      String
  status         StatusRecebimento @default(PENDENTE)
  dataRecebimento DateTime          @default(now())
  observacao     String?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  notaFiscal     NotaFiscalEntrada @relation(fields: [notaFiscalId], references: [id])
  usuario        Usuario           @relation(fields: [usuarioId], references: [id])
  itens          RecebimentoItem[]

  @@map("recebimentos")
}

model RecebimentoItem {
  id            String      @id @default(uuid())
  recebimentoId String
  produtoId     String
  quantidade    Float
  valorUnitario Decimal     @db.Decimal(10, 2)
  subtotal      Decimal     @db.Decimal(10, 2)
  createdAt     DateTime    @default(now())

  recebimento   Recebimento @relation(fields: [recebimentoId], references: [id])
  produto       Produto     @relation(fields: [produtoId], references: [id])

  @@map("recebimentos_itens")
}

model Divergencia {
  id              String            @id @default(uuid())
  notaFiscalId    String
  produtoId       String?
  tipo            TipoDivergencia
  status          StatusDivergencia @default(PENDENTE)
  quantidadePedida   Float?
  quantidadeNfe      Float?
  quantidadeAceita   Float?
  precoPedido     Decimal?          @db.Decimal(10, 2)
  precoNfe        Decimal?          @db.Decimal(10, 2)
  descricaoItem   String?
  resolvidoPorId  String?
  resolvidoEm     DateTime?
  observacao      String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  notaFiscal      NotaFiscalEntrada @relation(fields: [notaFiscalId], references: [id])
  produto         Produto?          @relation(fields: [produtoId], references: [id])
  resolvidoPor    Usuario?          @relation(fields: [resolvidoPorId], references: [id])

  @@map("divergencias")
}
```

Adicionar relações inversas nos models existentes:
- `Produto`: adicionar `pedidosCompraItens PedidoCompraItem[]`, `notaFiscalItens NotaFiscalItem[]`, `produtoFornecedores ProdutoFornecedor[]`, `recebimentosItens RecebimentoItem[]`, `divergencias Divergencia[]`
- `Fornecedor`: adicionar `pedidosCompra PedidoCompra[]`, `notasFiscais NotaFiscalEntrada[]`, `produtoFornecedores ProdutoFornecedor[]`
- `Usuario`: adicionar `pedidosCompra PedidoCompra[]`, `recebimentos Recebimento[]`, `divergenciasResolvidas Divergencia[]`

Adicionar ao enum `TipoMovimentoEstoque`:
```prisma
ENTRADA_NFE
SAIDA_ESTORNO_NFE
```

---

## 2. Estrutura de Arquivos

### Backend (novos arquivos)

```
backend/src/
├── controllers/
│   ├── pedidos.controller.ts          // CRUD de PedidoCompra
│   ├── notas-fiscais.controller.ts    // Import XML, listagem, conferência
│   └── recebimentos.controller.ts     // Confirmação, estorno
│
├── services/
│   ├── nfe-parser.service.ts          // Parsing XML NF-e com fast-xml-parser
│   ├── produto-identificacao.service.ts // Lógica de identificação por EAN/ProdutoFornecedor
│   └── recebimento.service.ts         // Transação de recebimento + preço médio
│
└── routes/
    ├── pedidos.routes.ts
    ├── notas-fiscais.routes.ts
    └── recebimentos.routes.ts
```

O arquivo `routes/index.ts` existente deve registrar as novas rotas:
```typescript
app.use('/api/compras/pedidos',       pedidosRoutes);
app.use('/api/compras/notas-fiscais', notasFiscaisRoutes);
app.use('/api/compras/recebimentos',  recebimentosRoutes);
```

### Frontend (novos arquivos)

```
frontend/src/
├── pages/compras/
│   ├── ComprasPage.tsx                // Existente — adicionar tabs
│   ├── PedidosCompraPage.tsx          // Lista e formulário de pedidos
│   ├── NotasFiscaisPage.tsx           // Lista NF-e, upload XML
│   ├── ConferenciaPage.tsx            // Tela de conferência item a item
│   ├── RecebimentosPage.tsx           // Histórico de recebimentos
│   └── DivergenciasPage.tsx           // Lista e resolução de divergências
│
├── services/
│   ├── pedidos.service.ts
│   ├── notasFiscais.service.ts
│   └── recebimentos.service.ts
│
└── components/compras/
    ├── ImportarXmlModal.tsx           // Upload e preview do XML
    ├── VincularPedidoModal.tsx        // Seleção de pedido para vincular
    ├── IdentificarProdutoModal.tsx    // Associar item NF-e a produto interno
    ├── ConferenciaTable.tsx           // Tabela de conferência com divergências
    └── ResolverDivergenciaModal.tsx   // UI para resolver divergência
```

---

## 3. API Endpoints

### Pedidos de Compra (`/api/compras/pedidos`)

| Método | Rota | Descrição | Perfis |
|--------|------|-----------|--------|
| GET | `/` | Listar pedidos (filtro status, fornecedor, page/limit) | ADM, GER |
| POST | `/` | Criar pedido | ADM, GER |
| GET | `/:id` | Buscar por ID com itens | ADM, GER |
| PUT | `/:id` | Atualizar pedido (somente RASCUNHO/ABERTO) | ADM, GER |
| POST | `/:id/abrir` | RASCUNHO → ABERTO | ADM, GER |
| POST | `/:id/enviar` | ABERTO → ENVIADO | ADM, GER |
| POST | `/:id/cancelar` | Cancelar pedido (não RECEBIDO/CONCLUIDO) | ADM, GER |

### Notas Fiscais (`/api/compras/notas-fiscais`)

| Método | Rota | Descrição | Perfis |
|--------|------|-----------|--------|
| GET | `/` | Listar NF-e (filtro status, fornecedor, page/limit) | ADM, GER |
| POST | `/importar` | Upload XML + parsing + armazenamento | ADM, GER |
| GET | `/:id` | Buscar NF-e com itens e divergências | ADM, GER |
| POST | `/:id/vincular-pedido` | Vincular a pedido(s) | ADM, GER |
| POST | `/:id/identificar-produto` | Associar item NF-e a produto interno | ADM, GER |
| GET | `/:id/conferencia` | Dados para tela de conferência | ADM, GER |
| POST | `/:id/conferencia` | Salvar quantidades recebidas e gerar divergências | ADM, GER |
| POST | `/:id/receber` | Confirmar recebimento (transação atômica) | ADM, GER |
| POST | `/:id/cancelar` | Cancelar NF-e (não RECEBIDA) | ADM, GER |
| POST | `/:id/estornar` | Estornar NF-e RECEBIDA | ADM |

### Divergências

| Método | Rota | Descrição | Perfis |
|--------|------|-----------|--------|
| GET | `/api/compras/divergencias` | Listar divergências pendentes | ADM, GER |
| POST | `/api/compras/divergencias/:id/resolver` | Resolver divergência | ADM, GER |

---

## 4. Serviço de Parsing XML (`nfe-parser.service.ts`)

Dependência: `fast-xml-parser` (adicionar ao `package.json`).

```typescript
// Estrutura do retorno do parser
interface NFeParseResult {
  chaveAcesso: string;     // 44 dígitos da tag <chNFe> ou extraído da tag <infNFe id="NFe...">
  numero: string;          // <nNF>
  serie: string;           // <serie>
  dataEmissao: Date;       // <dhEmi> ou <dEmi>
  dataEntrada?: Date;      // <dhSaiEnt> quando presente
  emitente: {
    cnpj: string;          // <emit/CNPJ>
    nome: string;          // <emit/xNome>
  };
  valorTotal: number;      // <ICMSTot/vNF>
  itens: NFeItemParseResult[];
}

interface NFeItemParseResult {
  codigoFornecedor: string; // <prod/cProd>
  gtin: string;             // <prod/cEAN> — '0000000000000' tratado como vazio
  descricao: string;        // <prod/xProd>
  ncm: string;              // <prod/NCM>
  cfop: string;             // <prod/CFOP>
  unidade: string;          // <prod/uCom>
  quantidade: number;       // <prod/qCom>
  valorUnitario: number;    // <prod/vUnCom>
  desconto: number;         // <prod/vDesc> ou 0
  valorTotal: number;       // <prod/vProd>
}
```

A chave de acesso pode ser extraída de:
1. Tag `<chNFe>` dentro de `<protNFe>`
2. Atributo `Id` da tag `<infNFe>` removendo o prefixo "NFe"

---

## 5. Serviço de Identificação de Produtos (`produto-identificacao.service.ts`)

```typescript
// Para cada item da NF-e, retornar resultado de identificação
interface IdentificacaoResult {
  nfeItem: NotaFiscalItem;
  produtoId: string | null;
  origem: 'EAN' | 'CODIGO_FORNECEDOR' | 'NAO_IDENTIFICADO';
}

async function identificarItensnfe(
  itens: NFeItemParseResult[],
  fornecedorId: string
): Promise<IdentificacaoResult[]>
```

Lógica:
1. Para cada item, tenta buscar por `codigoBarras = gtin` (se gtin não for '0000000000000')
2. Se não achar, tenta buscar em `ProdutoFornecedor` por `(fornecedorId, codigoFornecedor)`
3. Se achar em qualquer etapa, marca `identificado=true` e preenche `produtoId`
4. Retorna lista com origem da identificação para exibir no frontend

---

## 6. Serviço de Recebimento (`recebimento.service.ts`)

Núcleo da transação atômica de confirmação:

```typescript
async function confirmarRecebimento(
  notaFiscalId: string,
  usuarioId: string,
  itensRecebidos: { nfeItemId: string; produtoId: string; quantidade: number; valorUnitario: number }[],
  observacao?: string
): Promise<Recebimento>
```

Dentro de `prisma.$transaction(async (tx) => { ... })`:
1. Verificar que NF-e existe e status !== 'RECEBIDA' (prevenir duplicidade)
2. Criar `Recebimento` com status `CONCLUIDO`
3. Para cada item recebido:
   a. Criar `RecebimentoItem`
   b. Buscar produto atual
   c. Calcular preço médio ponderado: `(estoqueAtual * precoCompra + quantidade * valorUnit) / (estoqueAtual + quantidade)`
   d. Atualizar `produto.estoqueAtual` e `produto.precoCompra`
   e. Criar `MovimentoEstoque` tipo `ENTRADA_NFE` com `referencia = notaFiscalId`
4. Atualizar `NotaFiscalEntrada.status = 'RECEBIDA'`
5. Atualizar `PedidoCompraItem.quantidadeRecebida` para itens vinculados
6. Verificar se pedido foi totalmente atendido → atualizar status do pedido (RECEBIDO ou PARCIAL)
7. Registrar auditoria fora da transação

---

## 7. Tela de Conferência — Estrutura de Dados

O endpoint `GET /api/compras/notas-fiscais/:id/conferencia` deve retornar:

```typescript
interface ConferenciaData {
  notaFiscal: {
    id: string;
    numero: string;
    serie: string;
    chaveAcesso: string;
    fornecedor: { nome: string };
    status: StatusNotaFiscal;
  };
  itens: ConferenciaItem[];
  totalItens: number;
  totalDivergencias: number;
  podeConfirmar: boolean; // false se há itens não identificados sem resolução
}

interface ConferenciaItem {
  nfeItemId: string;
  produtoId: string | null;
  produtoNome: string | null;
  codigoFornecedor: string;
  descricaoNfe: string;
  identificado: boolean;
  quantidadePedida: number | null;  // null se não vinculado a pedido
  quantidadeNfe: number;
  quantidadeReceber: number;        // editável pelo usuário
  valorUnitario: number;
  divergencia?: {
    tipo: TipoDivergencia;
    status: StatusDivergencia;
  };
}
```

---

## 8. Armazenamento do XML

```
backend/storage/notas-fiscais/
└── 2026/
    └── 08/
        └── 35260812345678000199550010000005431234567890.xml
```

O campo `xmlPath` no model armazena o caminho relativo: `notas-fiscais/2026/08/<chave>.xml`

O backup do sistema (`exportarSistema` em `backup.ts`) deve incluir a pasta `storage/` no arquivo `.backup`, análogo ao tratamento da pasta `uploads/`.

---

## 9. Estrutura de Navegação Frontend

A página `ComprasPage.tsx` existente deve ser refatorada para usar tabs:

```
COMPRAS
  [Dashboard] [Pedidos] [Notas Fiscais] [Recebimentos] [Divergências]
```

O componente `EntradaMercadoriasModal` existente é preservado — ele opera sobre o fluxo antigo (`Compra`). Usuários que preferem o fluxo simplificado continuam podendo usá-lo.

### Fluxo de Navegação Principal

```
NotasFiscaisPage
  → [Importar XML] → ImportarXmlModal
      → Fornecedor identificado? → Sim: prosseguir / Não: VincularFornecedorModal
      → Itens identificados? → Sim: prosseguir / Não: IdentificarProdutoModal (por item)
      → [Vincular Pedido] → VincularPedidoModal (opcional)
  → [Conferir] → ConferenciaPage
      → ConferenciaTable (pedido × NF-e × receber)
      → Divergências automáticas exibidas
      → [Resolver Divergência] → ResolverDivergenciaModal
      → [Confirmar Recebimento] → chama POST /:id/receber
```

---

## 10. Dependência Nova

Adicionar ao `backend/package.json`:

```json
"fast-xml-parser": "4.3.6"
```

Instalar com: `npm install fast-xml-parser@4.3.6`

Também adicionar multer para o upload do XML (já existe no projeto para backup — reutilizar a configuração de `getUploadTempDir()`).
