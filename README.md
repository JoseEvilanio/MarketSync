# MarketSync ERP — Sistema ERP Local com PDV para Mercadinhos

Sistema de gestão comercial (ERP) integrado a um módulo de Frente de Caixa (PDV) para pequenos mercados, mercearias, conveniências e minimercados. Opera **100% offline**, sem necessidade de internet.

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

---

## Pré-requisitos

- **Node.js** v18 ou superior → https://nodejs.org
- **PostgreSQL** v14 ou superior → https://postgresql.org
- **npm** v9 ou superior (incluído no Node.js)

---

## Instalação Rápida (Windows)

```powershell
# 1. Executar o setup (instala dependências)
cd f:\SISTEMPDV\mercadinho
.\scripts\setup.ps1

# 2. Configurar o banco — edite o arquivo:
notepad backend\.env
# Altere: DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/mercadinho_db"

# 3. Criar banco e rodar migrations
psql -U postgres -c "CREATE DATABASE mercadinho_db;"
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

| URL                        | Descrição         |
|----------------------------|-------------------|
| http://localhost:5173      | Sistema ERP       |
| http://localhost:3001/api  | Backend API       |
| http://localhost:3001/health | Health check    |

### Credenciais Padrão

| Perfil       | E-mail                        | Senha       |
|--------------|-------------------------------|-------------|
| Administrador| admin@mercadinho.local        | admin123    |
| Gerente      | gerente@mercadinho.local      | gerente123  |
| Caixa        | caixa@mercadinho.local        | caixa123    |

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

| Tecla    | Ação              |
|----------|-------------------|
| F2       | Focar busca       |
| F3       | Selecionar cliente|
| F4       | Aplicar desconto  |
| F5       | Finalizar venda   |
| F6       | Remover item      |
| F7       | Ir para Caixa     |
| ESC      | Cancelar venda    |

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
- Cadastro de compras com itens
- Conclusão automática: entrada em estoque + atualização de preço médio
- Associação com fornecedores

### Clientes
- Cadastro completo com CPF, endereço, limite de crédito
- Histórico de compras

### Fornecedores
- Cadastro com CNPJ, contato, e-mail

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
│   │   └── schema.prisma       # Modelo do banco de dados
│   └── src/
│       ├── config/             # Prisma client, variáveis de ambiente
│       ├── controllers/        # Lógica de negócio por módulo
│       ├── middlewares/        # Auth JWT, tratamento de erros
│       ├── routes/             # Roteamento da API
│       ├── utils/              # Logger, backup, auditoria, AppError
│       └── server.ts           # Entry point do servidor
│
├── frontend/
│   └── src/
│       ├── components/ui/      # Modal, Sidebar, TopNav, Spinner
│       ├── layouts/            # MainLayout
│       ├── pages/              # Uma pasta por módulo
│       ├── services/           # api.ts (axios + services)
│       ├── stores/             # Zustand (auth, pdv)
│       └── utils/              # Formatadores (moeda, data, CPF...)
│
├── backups/                    # Backups automáticos do PostgreSQL
├── scripts/                    # Scripts PowerShell de automação
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

GET    /api/compras
POST   /api/compras
POST   /api/compras/:id/concluir

GET    /api/relatorios/dashboard
GET    /api/relatorios/vendas/periodo
GET    /api/relatorios/vendas/produtos
GET    /api/relatorios/vendas/operadores
GET    /api/relatorios/estoque/critico

POST   /api/backup/executar
```

---

## Backup

Backup automático configurado para **22:00 diariamente** em produção (`NODE_ENV=production`).

Arquivos salvos em `backups/` no formato:
```
backup_mercadinho_db_2026-07-17T22-00-00.sql
```

Backup manual via script:
```powershell
.\scripts\backup.ps1
```

---

## Perfis de Acesso

| Permissão               | Admin | Gerente | Caixa |
|-------------------------|-------|---------|-------|
| Registrar vendas        | ✓     | ✓       | ✓     |
| Abrir/fechar caixa      | ✓     | ✓       | ✓     |
| Sangria/Suprimento      | ✓     | ✓       | ✓     |
| Cadastrar produtos      | ✓     | ✓       | ✗     |
| Alterar preços          | ✓     | ✓       | ✗     |
| Compras                 | ✓     | ✓       | ✗     |
| Ajustar estoque         | ✓     | ✓       | ✗     |
| Cancelar vendas         | ✓     | ✓       | ✗     |
| Gerenciar usuários      | ✓     | ✗       | ✗     |
| Backup                  | ✓     | ✗       | ✗     |
| Relatórios completos    | ✓     | ✓       | ✗     |

---

## Segurança

- Senhas criptografadas com **bcrypt** (salt rounds: 12)
- Autenticação via **JWT** (expiração: 8h)
- **Helmet** para headers HTTP seguros
- **Rate limiting** no endpoint de login (20 req/15min)
- **Auditoria** de operações críticas (login, vendas, ajustes)
- **Soft delete** em todas as entidades (registros preservados)

---

## Versão

**v1.0.0** — Sistema em desenvolvimento ativo.

Funcionalidades futuras planejadas: NFC-e/NF-e, integração TEF, balanças, multi-loja, app mobile de inventário.
