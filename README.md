# MarketSync ERP — Sistema ERP Local com PDV para Mercadinhos

Sistema de gestão comercial (ERP) integrado a um módulo de Frente de Caixa (PDV) para pequenos mercados, mercearias, conveniências e minimercados. Opera **100% offline**, sem necessidade de internet.

---

## Versão

**v2.1.0** — Módulo de Entrada, Repositório e Conferência de NF-e.

### Novidades v2.1.0

**NF-e — Campos fiscais completos:**
- `situacaoFiscal` (AUTORIZADA / CANCELADA / DENEGADA / DESCONHECIDA) — extraído do protocolo SEFAZ via `cStat`
- `xmlHash` SHA-256 — integridade do XML verificada no download
- `modelo` (55 = NF-e, 65 = NFC-e), `protocolo` e `dataAutorizacao` do protocolo SEFAZ
- `destinatarioCnpj` e `destinatarioNome` — validação de destino da NF-e
- Campos tributários por item: `cest`, `csosn`, `cst`, `valorIcms`, `valorIpi`, `valorPis`, `valorCofins`
- `statusIdentificacao` por item (EAN / CODIGO_FORNECEDOR / MANUAL / NAO_IDENTIFICADO) — persistido no banco

**NF-e — Novos endpoints:**
- `GET /api/compras/notas-fiscais/chave/:chave` — busca direta pela chave de 44 dígitos
- `GET /api/compras/notas-fiscais/:id/xml` — download do XML com verificação de integridade SHA-256
- `GET /api/compras/notas-fiscais/:id/eventos` — linha do tempo de eventos da NF-e
- `POST /api/compras/pedidos/:id/faturar` — transição ENVIADO → FATURADO
- Filtros avançados na listagem: número, série, chave, período, situaçãoFiscal, vinculação de pedido

**Divergências automáticas:**
- Persistidas automaticamente ao vincular pedido (não apenas calculadas em memória)
- Classificação formal: BLOQUEANTE (impede recebimento) vs ALERTA (pode ser autorizado)
- Novo tipo: `PRODUTO_FALTANTE` — item no pedido sem correspondente na NF-e
- Tabela `NfePedido` explícita com metadados de vínculo (quem vinculou, quando, observação)

**Linha do tempo (EventoNfe):**
- Todos os eventos registrados automaticamente: importação, identificação de fornecedor/produtos, vínculo, divergências, recebimento, estorno
- Estrutura preparada para futura Manifestação do Destinatário (SEFAZ)
- Exibida na aba "Histórico de Eventos" da tela de conferência

**Custo separado:**
- `precoCompra` = último custo de aquisição (preço desta NF-e)
- `custoMedio` = preço médio ponderado (acumulado ao longo do tempo)

**Frontend:**
- Tela de conferência redesenhada: abas Conferência/Eventos, contadores visuais, chave formatada com copiar
- `ImportarXmlModal` com etapas: upload → resultado (mostra fornecedor identificado + pedidos sugeridos)
- Componentes: `NfeTimeline`, `NfeChaveField`, `DivergenciaBadge`, `FornecedorStatusCard`, `PedidoSugeridoCard`

---

## Tecnologias

| Camada     | Stack                                           |
|------------|-------------------------------------------------|
| Frontend   | React 18 · Vite · TypeScript · Tailwind CSS     |
| Backend    | Node.js · Express · TypeScript · Prisma ORM     |
| Banco      | PostgreSQL (local)                              |
| Estado     | Zustand · React Query                           |
| Formulários| React Hook Form · Zod                           |
| Gráficos   | Recharts                                        |
| Segurança  | JWT · bcrypt · Helmet · Rate Limit              |
| Logs       | Winston                                         |
| Backup     | pg_dump via node-cron (22h diário)              |
| XML NF-e   | fast-xml-parser                                 |

---

## Pré-requisitos

- **Node.js** v18 ou superior → https://nodejs.org
- **PostgreSQL** v14 ou superior → https://postgresql.org
- **npm** v9 ou superior (incluído no Node.js)

---

## Instalação Rápida (Windows)

```powershell
# 1. Executar o setup (instala dependências)
cd mercadinho
.\scripts\setup.ps1

# 2. Configurar o banco — edite o arquivo:
notepad backend\.env
# Altere: DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/mercadopro_db"

# 3. Criar banco e rodar migrations
psql -U postgres -c "CREATE DATABASE mercadopro_db;"
.\scripts\migrate.ps1

# 4. Iniciar o sistema
.\scripts\start.ps1
```

---

## Instalação Manual

### Backend

```powershell
cd backend
npm install
copy .env.example .env
# Edite .env com seus dados

npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

---

## Acesso

| URL                          | Descrição        |
|------------------------------|------------------|
| http://localhost:5173        | Sistema ERP (dev)|
| http://localhost:3001        | Sistema ERP (prod)|
| http://localhost:3001/api    | Backend API      |
| http://localhost:3001/health | Health check     |

### Credenciais Padrão

| Perfil        | E-mail                  | Senha      |
|---------------|-------------------------|------------|
| Administrador | admin@mercadinho.local  | admin123   |
| Gerente       | gerente@mercadinho.local| gerente123 |
| Caixa         | caixa@mercadinho.local  | caixa123   |

> **Altere as senhas padrão em produção!**

---

## Módulos do Sistema

### Dashboard
- KPIs em tempo real: vendas do dia, semana e mês
- Ticket médio e lucro estimado
- Gráfico de produtos mais vendidos
- Alertas de estoque crítico
- Status do caixa

### PDV — Frente de Caixa
- Leitura por código de barras (teclado/scanner)
- Operação 100% por teclado com atalhos
- Múltiplas formas de pagamento
- Troco automático
- Desconto em % ou R$
- Cancelamento de itens

| Tecla | Ação               |
|-------|--------------------|
| F2    | Focar busca        |
| F3    | Selecionar cliente |
| F4    | Aplicar desconto   |
| F5    | Finalizar venda    |
| F6    | Remover item       |
| F7    | Ir para Caixa      |
| ESC   | Cancelar venda     |

### Produtos
- Cadastro completo (código de barras, categorias, fornecedor, preços)
- Controle de margem de lucro automático
- Filtros por categoria e busca inteligente
- Paginação para grandes volumes

### Estoque
- Visualização de itens críticos (abaixo do mínimo)
- Histórico completo de movimentações
- Inventário com busca
- Ajuste manual com auditoria

### Caixa
- Abertura com valor inicial
- Sangria e suprimento
- Fechamento com conferência (valor esperado vs contado)
- Histórico de movimentos em tempo real

### Compras

O módulo de compras controla o **ciclo completo de aquisição de mercadorias**:

- Pedidos de compra com itens, quantidades e preços
- Ciclo de vida controlado do pedido (Rascunho → Aberto → Enviado → Faturado → Recebido)
- Importação de NF-e através de arquivo XML
- Identificação da NF-e pela **chave de acesso de 44 dígitos** (única no banco)
- Prevenção de duplicidade — mesma chave rejeitada com detalhes
- Identificação automática de fornecedor por **CNPJ** do XML
- Identificação de produtos por **GTIN/EAN** (campo `cEAN` do XML)
- Associação de códigos de produto por fornecedor (`cProd`) para uso futuro
- Vinculação entre NF-e e pedidos (N:N — um pedido pode ter várias NF-e e vice-versa)
- Tela de **Conferência**: comparação lado a lado de pedido × NF-e × quantidade a receber
- Identificação automática de divergências (quantidade menor/maior, preço diferente, produto não solicitado, produto não identificado)
- Resolução de divergências com justificativa obrigatória
- **Confirmação do recebimento em transação atômica** (ROLLBACK em caso de falha)
- Estoque atualizado **somente após confirmação** — importar NF-e nunca altera estoque
- Atualização do **custo/preço médio ponderado** no recebimento
- Histórico de recebimentos com rastreabilidade por NF-e
- Armazenamento do XML original em `storage/notas-fiscais/AAAA/MM/<chave>.xml`
- Backup/restauração incluindo os XMLs arquivados

> **Princípio fundamental:** `Importar NF-e ≠ Dar entrada no estoque.`  
> O estoque só é alterado após a conferência e confirmação do recebimento.

### Fluxo de Recebimento de Mercadorias

O MarketSync separa o pedido de compra, a NF-e faturada e o recebimento físico da mercadoria.

```
Pedido de Compra
      ↓
Fornecedor fatura (NF-e)
      ↓
Importação do XML da NF-e
      ↓
Identificação pela chave de acesso (44 dígitos)
      ↓
Identificação do fornecedor (CNPJ)
      ↓
Identificação dos produtos (GTIN/EAN → cProd)
      ↓
Vinculação ao pedido
      ↓
Conferência (pedido × NF-e × receber)
      ↓
Tratamento de divergências
      ↓
Confirmação do recebimento (transação atômica)
      ↓
Entrada no estoque + Atualização do custo médio
      ↓
NF-e RECEBIDA
```

### NF-e de Entrada

O sistema permite importar o XML de NF-e recebidas dos fornecedores.

- A **chave de acesso de 44 dígitos** é o identificador único — não permite duplicatas
- Suporta NF-e nos formatos `nfeProc` (autorizada) e `NFeProc`
- Extrai: número, série, datas, emitente (CNPJ/nome), destinatário, **protocolo SEFAZ**, itens completos (NCM, CFOP, unidade, quantidades, valores, impostos)
- **Situação fiscal separada do status operacional** — uma NF-e denegada não pode ser recebida
- **Hash SHA-256** do XML armazenado — integridade verificada no download
- **Campos tributários** por item: ICMS, IPI, PIS, COFINS, CEST, CSOSN/CST
- **Linha do tempo de eventos** — auditoria completa de cada operação
- Funciona **100% offline** — nenhuma consulta externa à SEFAZ

### Clientes
- Cadastro completo com CPF, endereço, limite de crédito
- Histórico de compras

### Fornecedores
- Cadastro com CNPJ, contato, e-mail
- Histórico de NF-e recebidas

### Relatórios
- Vendas por período (dia/semana/mês) com gráficos
- Ranking de produtos mais vendidos
- Desempenho por operador
- Estoque crítico detalhado
- Fechamentos de caixa

---

## Estrutura do Projeto

```
mercadinho/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma           # Modelo do banco de dados
│   │   └── migrations/             # Histórico de migrações
│   ├── storage/
│   │   └── notas-fiscais/          # XMLs de NF-e arquivados (AAAA/MM/)
│   └── src/
│       ├── config/                 # Prisma client, variáveis de ambiente
│       ├── controllers/            # Lógica de negócio por módulo
│       │   ├── pedidos.controller.ts
│       │   ├── notas-fiscais.controller.ts
│       │   └── recebimentos.controller.ts
│       ├── services/               # Serviços de domínio
│       │   ├── nfe-parser.service.ts
│       │   ├── produto-identificacao.service.ts
│       │   └── recebimento.service.ts
│       ├── middlewares/            # Auth JWT, tratamento de erros
│       ├── routes/                 # Roteamento da API
│       ├── utils/                  # Logger, backup, auditoria, AppError
│       └── server.ts               # Entry point do servidor
│
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── compras/            # Componentes do módulo NF-e
│       │   │   ├── ImportarXmlModal.tsx
│       │   │   ├── IdentificarProdutoModal.tsx
│       │   │   ├── VincularPedidoModal.tsx
│       │   │   ├── ConferenciaTable.tsx
│       │   │   └── ResolverDivergenciaModal.tsx
│       │   └── ui/                 # Modal, Sidebar, TopNav, Spinner
│       ├── layouts/                # MainLayout
│       ├── pages/
│       │   └── compras/            # Módulo de compras (tabs)
│       │       ├── ComprasPage.tsx         # Página principal com tabs
│       │       ├── PedidosCompraPage.tsx   # Pedidos de compra
│       │       ├── NotasFiscaisPage.tsx    # Notas fiscais de entrada
│       │       ├── ConferenciaPage.tsx     # Tela de conferência
│       │       ├── RecebimentosPage.tsx    # Histórico de recebimentos
│       │       ├── DivergenciasPage.tsx    # Gestão de divergências
│       │       └── ComprasLegadoPage.tsx   # Entradas rápidas v1 (legado)
│       ├── services/               # api.ts (axios + services)
│       ├── stores/                 # Zustand (auth, pdv)
│       └── utils/                  # Formatadores (moeda, data, CPF...)
│
├── installer/
│   ├── MercadoPro.nsi              # Script NSIS do instalador
│   └── MercadoPro_Setup_v2.0.0.exe # Instalador Windows
├── backups/                        # Backups automáticos do PostgreSQL
└── README.md
```

---

## API — Endpoints Principais

```
POST   /api/auth/login
GET    /api/auth/perfil

GET    /api/produtos          ?q=&categoriaId=&page=&limit=
GET    /api/produtos/barras/:codigo
POST   /api/produtos
PUT    /api/produtos/:id

GET    /api/categorias
POST   /api/categorias

GET    /api/clientes
POST   /api/clientes

GET    /api/fornecedores
POST   /api/fornecedores

GET    /api/caixa/atual
POST   /api/caixa/abrir
POST   /api/caixa/fechar
POST   /api/caixa/sangria
POST   /api/caixa/suprimento

POST   /api/vendas
GET    /api/vendas
POST   /api/vendas/:id/cancelar

GET    /api/estoque/critico
GET    /api/estoque/historico
POST   /api/estoque/ajuste
```

### Compras (v1 — legado)

```
GET    /api/compras
POST   /api/compras
POST   /api/compras/:id/concluir
POST   /api/compras/:id/cancelar
```

### Pedidos de Compra

```
GET    /api/compras/pedidos
POST   /api/compras/pedidos
GET    /api/compras/pedidos/:id
PUT    /api/compras/pedidos/:id
POST   /api/compras/pedidos/:id/abrir
POST   /api/compras/pedidos/:id/enviar
POST   /api/compras/pedidos/:id/faturar           # ENVIADO → FATURADO
POST   /api/compras/pedidos/:id/cancelar
GET    /api/compras/pedidos/dashboard
```

### NF-e de Entrada

```
GET    /api/compras/notas-fiscais
POST   /api/compras/notas-fiscais/importar        # multipart/form-data (.xml)
GET    /api/compras/notas-fiscais/chave/:chave    # busca por chave de 44 dígitos
GET    /api/compras/notas-fiscais/:id
GET    /api/compras/notas-fiscais/:id/xml         # download com verificação SHA-256
GET    /api/compras/notas-fiscais/:id/eventos     # linha do tempo
POST   /api/compras/notas-fiscais/:id/vincular-pedido
POST   /api/compras/notas-fiscais/:id/identificar-produto
GET    /api/compras/notas-fiscais/:id/conferencia
POST   /api/compras/notas-fiscais/:id/receber
POST   /api/compras/notas-fiscais/:id/cancelar
POST   /api/compras/notas-fiscais/:id/estornar    # ADMINISTRADOR only
```

### Recebimentos e Divergências

```
GET    /api/compras/recebimentos
GET    /api/compras/recebimentos/:id
GET    /api/compras/recebimentos/divergencias
POST   /api/compras/recebimentos/divergencias/:id/resolver
```

### Relatórios e Backup

```
GET    /api/relatorios/dashboard
GET    /api/relatorios/vendas/periodo
GET    /api/relatorios/vendas/produtos
GET    /api/relatorios/vendas/operadores
GET    /api/relatorios/estoque/critico

POST   /api/backup/executar
POST   /api/backup/exportar-sistema
POST   /api/backup/restaurar-sistema
```

---

## Backup

Backup automático configurado para **22:00 diariamente** em produção.

O pacote `.backup` (exportação completa) inclui:
- Dump SQL do banco PostgreSQL
- XMLs de NF-e arquivados (`storage/notas-fiscais/`)
- Uploads de imagens (`uploads/`)
- `config.json` com senha mascarada
- `metadata.json` com versão e hash MD5

Restauração via interface web (Backup e Utilitários → Restaurar Sistema).

---

## Perfis de Acesso

| Permissão                       | Admin | Gerente | Caixa |
|---------------------------------|-------|---------|-------|
| Registrar vendas                | ✓     | ✓       | ✓     |
| Abrir/fechar caixa              | ✓     | ✓       | ✓     |
| Sangria/Suprimento              | ✓     | ✓       | ✓     |
| Cadastrar produtos              | ✓     | ✓       | ✗     |
| Alterar preços                  | ✓     | ✓       | ✗     |
| Criar pedidos de compra         | ✓     | ✓       | ✗     |
| Importar NF-e                   | ✓     | ✓       | ✗     |
| Conferir e receber NF-e         | ✓     | ✓       | ✗     |
| Resolver divergências           | ✓     | ✓       | ✗     |
| Ajustar estoque                 | ✓     | ✓       | ✗     |
| Cancelar vendas                 | ✓     | ✓       | ✗     |
| Estornar NF-e recebida          | ✓     | ✗       | ✗     |
| Gerenciar usuários              | ✓     | ✗       | ✗     |
| Backup e restauração            | ✓     | ✗       | ✗     |
| Relatórios completos            | ✓     | ✓       | ✗     |

---

## Segurança

- Senhas criptografadas com **bcrypt** (salt rounds: 12)
- Autenticação via **JWT** (expiração: 8h)
- **Helmet** para headers HTTP seguros
- **Rate limiting** no endpoint de login (20 req/15min)
- **Auditoria** de operações críticas (login, vendas, compras, NF-e, recebimentos)
- **Soft delete** em todas as entidades (registros preservados)
- **Transações atômicas** em recebimentos (ROLLBACK automático em falhas)
- Chave de acesso NF-e com **constraint UNIQUE** no banco

---

## Banco de Dados — Principais Models

| Model               | Descrição                                           |
|---------------------|-----------------------------------------------------|
| `Usuario`           | Usuários do sistema com perfis                      |
| `Produto`           | Cadastro de produtos com EAN/GTIN                   |
| `Fornecedor`        | Fornecedores com CNPJ único                         |
| `Venda`             | Cabeçalho de vendas                                 |
| `Compra`            | Compras rápidas (legado v1)                         |
| `PedidoCompra`      | Pedidos de compra com ciclo de vida                 |
| `NotaFiscalEntrada` | NF-e importadas com chave de acesso única           |
| `NotaFiscalItem`    | Itens da NF-e com identificação de produto          |
| `ProdutoFornecedor` | Associação produto × código do fornecedor           |
| `Recebimento`       | Confirmação de recebimento com transação atômica    |
| `RecebimentoItem`   | Itens efetivamente recebidos                        |
| `Divergencia`       | Divergências identificadas na conferência           |
| `MovimentoEstoque`  | Histórico de todas as movimentações de estoque      |
| `Auditoria`         | Log de operações críticas                           |
