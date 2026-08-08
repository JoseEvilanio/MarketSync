# Tarefas de Implementação — Evolução do Módulo de Compras, NF-e e Recebimento

## Fase 1 — Base de Dados e Infraestrutura

- [ ] 1. Instalar dependência `fast-xml-parser@4.3.6` no backend
  - Executar `npm install fast-xml-parser@4.3.6` em `backend/`
  - Verificar que aparece em `package.json` e `package-lock.json`

- [ ] 2. Adicionar novos enums ao `schema.prisma`
  - Adicionar: `StatusPedidoCompra`, `StatusNotaFiscal`, `StatusRecebimento`, `TipoDivergencia`, `StatusDivergencia`
  - Adicionar `ENTRADA_NFE` e `SAIDA_ESTORNO_NFE` ao enum `TipoMovimentoEstoque` existente

- [ ] 3. Adicionar novos models ao `schema.prisma`
  - Adicionar em ordem (respeitando dependências de FK): `PedidoCompra`, `PedidoCompraItem`, `NotaFiscalEntrada`, `NotaFiscalItem`, `ProdutoFornecedor`, `Recebimento`, `RecebimentoItem`, `Divergencia`
  - Adicionar relações inversas nos models existentes: `Produto`, `Fornecedor`, `Usuario`

- [ ] 4. Gerar e executar migration Prisma
  - Executar `npx prisma migrate dev --name evolucao-compras-nfe`
  - Verificar que todos os novos models são criados sem erros
  - Verificar constraint `UNIQUE` em `NotaFiscalEntrada.chaveAcesso`
  - Verificar constraint `UNIQUE` em `ProdutoFornecedor.(fornecedorId, codigoFornecedor)`

- [ ] 5. Criar pasta de storage para XMLs
  - Criar `backend/storage/notas-fiscais/.gitkeep`
  - Adicionar `backend/storage/notas-fiscais/**/*.xml` ao `.gitignore`
  - Criar função `getStorageDir()` em `backend/src/utils/storage.ts` com lógica análoga a `getBackupDir()`

---

## Fase 2 — Serviços de Backend

- [ ] 6. Criar `backend/src/services/nfe-parser.service.ts`
  - Implementar `parseNFeXml(xmlContent: string): NFeParseResult`
  - Usar `fast-xml-parser` com `ignoreAttributes: false` e `attributeNamePrefix: '@_'`
  - Extrair chave de acesso de `<chNFe>` ou do atributo `Id` de `<infNFe>`
  - Tratar GTIN `'SEM GTIN'`, `'0000000000000'` e valores vazios como `null`
  - Parsear datas em formato AAAA-MM-DDTHH:MM:SS-HH:MM e formato legado AAAA-MM-DD
  - Lançar `AppError` descritivo se XML inválido ou não for NF-e

- [ ] 7. Criar `backend/src/services/produto-identificacao.service.ts`
  - Implementar `identificarItensnfe(itens, fornecedorId, tx?)` retornando `IdentificacaoResult[]`
  - Passo 1: busca em `Produto.codigoBarras` por GTIN (skip se GTIN nulo)
  - Passo 2: busca em `ProdutoFornecedor` por `(fornecedorId, codigoFornecedor)`
  - Passo 3: marcar como `NAO_IDENTIFICADO`
  - Implementar `associarProduto(nfeItemId, produtoId, salvarRelacionamento: boolean)` — salva `ProdutoFornecedor` se `salvarRelacionamento=true`

- [ ] 8. Criar `backend/src/services/recebimento.service.ts`
  - Implementar `confirmarRecebimento(params)` executando transação atômica completa
  - Guard: verificar que `notaFiscal.status !== 'RECEBIDA'` antes de abrir transação (idempotência)
  - Dentro da transação: criar Recebimento + RecebimentoItems + MovimentoEstoque (ENTRADA_NFE) + atualizar estoque + recalcular preço médio ponderado + atualizar status NF-e + atualizar quantidadeRecebida nos PedidoCompraItens + atualizar status do pedido
  - Implementar `estornarRecebimento(recebimentoId, usuarioId)` — cria movimentos SAIDA_ESTORNO_NFE e reverte estoque e preço médio, status volta para IMPORTADA

---

## Fase 3 — Controllers e Rotas de Backend

- [ ] 9. Criar `backend/src/controllers/pedidos.controller.ts`
  - Implementar: `listar`, `criar`, `buscarPorId`, `atualizar`, `abrir`, `enviar`, `cancelar`
  - Validação Zod para corpo de criação/atualização
  - `criar`: status inicial RASCUNHO, calcula total como Σ(quantidade * precoUnitario)
  - `atualizar`: bloquear edição de pedidos com status ≥ EM_CONFERENCIA
  - `cancelar`: soft-delete + status CANCELADO, bloquear se RECEBIDO ou CONCLUIDO

- [ ] 10. Criar `backend/src/routes/pedidos.routes.ts`
  - Proteger todos os endpoints com `autenticar` + `autorizar('ADMINISTRADOR', 'GERENTE')`
  - Registrar no `routes/index.ts` em `/api/compras/pedidos`

- [ ] 11. Criar `backend/src/controllers/notas-fiscais.controller.ts`
  - Implementar `importar`: recebe upload XML via multer, chama `nfe-parser.service`, salva XML em disco (`storage/notas-fiscais/YYYY/MM/<chave>.xml`), cria `NotaFiscalEntrada` + `NotaFiscalItem[]`, identifica itens via `produto-identificacao.service`, identifica fornecedor por CNPJ
  - Implementar `listar`, `buscarPorId`, `vincularPedido`, `identificarProduto`, `getConferencia`, `salvarConferencia`, `receber`, `cancelar`, `estornar`
  - `receber`: delegar para `recebimento.service.confirmarRecebimento`
  - `estornar`: apenas ADMINISTRADOR, delegar para `recebimento.service.estornarRecebimento`
  - `importar`: verificar duplicidade de chave de acesso antes de salvar (retornar 409 com dados da NF-e existente)

- [ ] 12. Criar `backend/src/routes/notas-fiscais.routes.ts`
  - Configurar multer para upload de XML (destino `getUploadTempDir()`, limite 10 MB, aceitar somente `text/xml` e `application/xml`)
  - Proteger todos os endpoints com `autenticar` + `autorizar('ADMINISTRADOR', 'GERENTE')`
  - Rota `POST /estornar` com `autorizar('ADMINISTRADOR')` exclusivo
  - Registrar no `routes/index.ts` em `/api/compras/notas-fiscais`

- [ ] 13. Criar `backend/src/controllers/recebimentos.controller.ts`
  - Implementar `listar` (filtro por fornecedor, data, page/limit) e `buscarPorId`
  - Implementar `listarDivergencias` e `resolverDivergencia`
  - `resolverDivergencia`: atualizar `Divergencia.status`, gravar `resolvidoPorId` e `resolvidoEm`

- [ ] 14. Criar `backend/src/routes/recebimentos.routes.ts`
  - Registrar no `routes/index.ts` em `/api/compras/recebimentos`

---

## Fase 4 — Atualizar Backup para incluir XMLs

- [ ] 15. Atualizar `backend/src/utils/backup.ts`
  - Função `exportarSistema`: incluir pasta `backend/storage/notas-fiscais/` no pacote `.backup` (análogo ao tratamento de `uploads/`)
  - Função `restaurarSistema`: restaurar pasta `storage/notas-fiscais/` do pacote `.backup`
  - Criar função `getStorageDirNfe()` que usa o mesmo padrão de `getBackupDir()` para resolver o caminho no instalado vs dev

---

## Fase 5 — Frontend: Serviços e Tipos

- [ ] 16. Criar `frontend/src/services/pedidos.service.ts`
  - Definir interface `PedidoCompra`, `PedidoCompraItem`
  - Implementar todos os métodos correspondentes aos endpoints da Fase 3

- [ ] 17. Criar `frontend/src/services/notasFiscais.service.ts`
  - Definir interfaces: `NotaFiscalEntrada`, `NotaFiscalItem`, `ConferenciaData`, `ConferenciaItem`
  - Implementar: `listar`, `importar` (FormData + multipart), `buscarPorId`, `vincularPedido`, `identificarProduto`, `getConferencia`, `salvarConferencia`, `receber`, `cancelar`, `estornar`

- [ ] 18. Criar `frontend/src/services/recebimentos.service.ts`
  - Definir interfaces: `Recebimento`, `RecebimentoItem`, `Divergencia`
  - Implementar: `listar`, `buscarPorId`, `listarDivergencias`, `resolverDivergencia`

---

## Fase 6 — Frontend: Componentes

- [ ] 19. Criar `frontend/src/components/compras/ImportarXmlModal.tsx`
  - Input de arquivo (`accept=".xml"`) com drag-and-drop
  - Preview dos dados extraídos do XML após upload: número NF-e, fornecedor (CNPJ + nome), total, quantidade de itens
  - Exibir alerta se fornecedor não encontrado com botão "Vincular fornecedor"
  - Exibir lista de itens com status de identificação (verde = identificado, amarelo = não identificado)
  - Botão "Confirmar Importação"

- [ ] 20. Criar `frontend/src/components/compras/IdentificarProdutoModal.tsx`
  - Exibe dados do item NF-e (código fornecedor, GTIN, descrição)
  - Campo de busca para localizar produto interno (por nome ou código de barras)
  - Checkbox "Salvar associação para próximas NF-e deste fornecedor"
  - Botão "Cadastrar novo produto" que abre o modal de cadastro existente

- [ ] 21. Criar `frontend/src/components/compras/VincularPedidoModal.tsx`
  - Lista pedidos em aberto do mesmo fornecedor
  - Exibe: número pedido, data, total, quantidade de itens
  - Permite seleção de um ou múltiplos pedidos
  - Botão "Vincular" e "Pular (sem pedido)"

- [ ] 22. Criar `frontend/src/components/compras/ConferenciaTable.tsx`
  - Tabela com colunas: Produto | Qtd Pedida | Qtd NF-e | Qtd Receber | Preço NF-e | Status
  - Campo numérico editável na coluna "Qtd Receber"
  - Linha colorida conforme status:
    - Verde: sem divergência
    - Amarelo: divergência de quantidade ou preço
    - Vermelho: produto não identificado ou não solicitado
  - Ícone de divergência com tooltip explicativo
  - Contador de divergências no rodapé

- [ ] 23. Criar `frontend/src/components/compras/ResolverDivergenciaModal.tsx`
  - Exibe tipo e detalhes da divergência
  - Botões de ação: "Receber quantidade NF-e", "Receber quantidade pedido", "Não receber", "Informar manualmente"
  - Campo de quantidade manual (visível somente na opção "Informar manualmente")
  - Campo de observação obrigatório para justificar a decisão

---

## Fase 7 — Frontend: Páginas

- [ ] 24. Criar `frontend/src/pages/compras/PedidosCompraPage.tsx`
  - Lista paginada de pedidos com filtros por status e fornecedor
  - Botão "Novo Pedido" → modal/formulário inline
  - Formulário: fornecedor (select), observação, tabela de itens (busca produto + qtd + preço)
  - Ações por linha: Ver, Enviar, Cancelar (conforme status)
  - Badge de status com cores

- [ ] 25. Criar `frontend/src/pages/compras/NotasFiscaisPage.tsx`
  - Lista paginada de NF-e com filtros por status e fornecedor
  - Botão "Importar NF-e" → abre `ImportarXmlModal`
  - Ações por linha: Ver detalhes, Conferir, Cancelar (conforme status)
  - Badge de status
  - Ao clicar em "Conferir" → navegar para `ConferenciaPage` com o ID da NF-e

- [ ] 26. Criar `frontend/src/pages/compras/ConferenciaPage.tsx`
  - Cabeçalho: dados da NF-e (número, série, chave, fornecedor)
  - Seção de vinculação de pedido (botão "Vincular Pedido" se não vinculada)
  - `ConferenciaTable` com todos os itens
  - Rodapé: total de itens, count de divergências, botão "Resolver Divergências" (se houver), botão "Confirmar Recebimento"
  - Confirmação antes de enviar recebimento ("Esta operação vai atualizar o estoque. Confirmar?")
  - Feedback de progresso durante a chamada à API

- [ ] 27. Criar `frontend/src/pages/compras/RecebimentosPage.tsx`
  - Lista histórico de recebimentos com filtros por data e fornecedor
  - Exibe: data, NF-e, fornecedor, total itens, valor total, usuário
  - Botão "Ver detalhes" → modal com RecebimentoItens e movimentos de estoque gerados

- [ ] 28. Criar `frontend/src/pages/compras/DivergenciasPage.tsx`
  - Lista divergências pendentes de resolução
  - Filtro por tipo e fornecedor
  - Botão "Resolver" → abre `ResolverDivergenciaModal`

- [ ] 29. Refatorar `frontend/src/pages/compras/ComprasPage.tsx`
  - Adicionar tabs: **Dashboard** | **Pedidos** | **Notas Fiscais** | **Recebimentos** | **Divergências**
  - Dashboard deve exibir os 5 contadores do RF-19 usando queries separadas
  - Tab "Compras (legado)" ou manter as compras antigas numa sub-seção discreta para acesso ao histórico
  - Preservar `EntradaMercadoriasModal` como opção de entrada rápida no tab legado

- [ ] 30. Atualizar `frontend/src/App.tsx` (ou arquivo de rotas)
  - Verificar se rotas de compras precisam ser atualizadas para as novas páginas
  - As sub-páginas de compras (Pedidos, NF-e, Conferência, etc.) podem ser renderizadas dentro de `ComprasPage` via tabs (sem rota própria) ou via React Router aninhado — manter consistência com padrão existente

---

## Fase 8 — Compilação, Staging e Instalador

- [ ] 31. Compilar backend e frontend
  - `cd backend && npx tsc` — zero erros TypeScript
  - `cd frontend && npm run build` — zero erros, bundle gerado em `backend/public/`

- [ ] 32. Atualizar staging e recompilar instalador
  - Copiar `backend/dist/` para `installer/staging/Backend/dist/`
  - Copiar `backend/public/` para `installer/staging/Frontend/`
  - Executar: `& "C:\Program Files (x86)\NSIS\makensis.exe" "-DVERSION=2.0.0" "MercadoPro.nsi"`
  - Aguardar conclusão e verificar integridade do `.exe`

- [ ] 33. Atualizar versão
  - Atualizar `VERSION` em `installer/MercadoPro.nsi` para `2.0.0`
  - Atualizar `sistema.versao` em `backend/config/config.json` e no default de `appConfig.ts`

---

## Fase 9 — README e Commit

- [ ] 34. Atualizar `README.md`
  - Substituir seção "Compras" pela nova descrição (RF-35 do PRD)
  - Adicionar seção "Fluxo de Recebimento de Mercadorias" (RF-36 do PRD)
  - Adicionar seção "NF-e de Entrada" (RF-37 do PRD)
  - Atualizar seção de API com os novos endpoints (RF-39 do PRD)
  - Atualizar estrutura de projeto (RF-38 do PRD)

- [ ] 35. Commitar e fazer push para o repositório
  - Stagear todos os arquivos modificados e novos
  - Criar commit: `feat: módulo de compras NF-e e recebimento controlado v2.0`
  - Push para `origin main`
