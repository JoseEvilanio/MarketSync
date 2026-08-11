# Tarefas — Módulo de Entrada, Repositório e Conferência de NF-e

## Fase 1 — Schema e Migration

- [ ] 1. Adicionar novos enums ao schema.prisma
  - `SituacaoFiscalNfe`: AUTORIZADA, CANCELADA, DENEGADA, DESCONHECIDA
  - `StatusIdentificacaoItem`: IDENTIFICADO_EAN, IDENTIFICADO_CODIGO_FORNECEDOR, IDENTIFICADO_MANUAL, NAO_IDENTIFICADO
  - `TipoEventoNfe`: todos os eventos internos + externos preparados
  - `TipoDivergencia`: adicionar PRODUTO_FALTANTE

- [ ] 2. Adicionar campos ao model NotaFiscalEntrada
  - `modelo`, `protocolo`, `dataAutorizacao`, `situacaoFiscal` (enum com default DESCONHECIDA)
  - `destinatarioCnpj`, `destinatarioNome`, `xmlHash`
  - Adicionar relações `eventos EventoNfe[]` e `nfePedidos NfePedido[]`
  - Remover relação implícita `pedidos PedidoCompra[] @relation("PedidoNotasFiscais")`

- [ ] 3. Adicionar campos ao model NotaFiscalItem
  - `statusIdentificacao` (enum, default NAO_IDENTIFICADO)
  - `cest`, `csosn`, `cst` (String nullable)
  - `valorIcms`, `valorIpi`, `valorPis`, `valorCofins` (Decimal nullable)

- [ ] 4. Criar model NfePedido
  - Campos: id, nfeId, pedidoId, vinculadoPorId, dataVinculacao, observacao
  - @@unique([nfeId, pedidoId])
  - Adicionar relação `nfePedidos NfePedido[]` em PedidoCompra e Usuario

- [ ] 5. Criar model EventoNfe
  - Campos: id, nfeId, tipo, descricao, usuarioId, dados (Json), createdAt
  - Adicionar relação `divergenciasResolvidas` já existente em Usuario — verificar conflito

- [ ] 6. Adicionar campo custoMedio ao model Produto
  - `custoMedio Decimal? @db.Decimal(10,2)`

- [ ] 7. Gerar e executar migration Prisma
  - `npx prisma migrate dev --name nfe_repositorio_v3`
  - Script SQL de migração de dados (migrar `_PedidoNotasFiscais` → `nfe_pedidos`)
  - Setar `statusIdentificacao` baseado no `identificado` booleano existente
  - Verificar que a tabela `_PedidoNotasFiscais` pode ser dropada após migração

---

## Fase 2 — Serviços de Backend

- [ ] 8. Atualizar nfe-parser.service.ts — novos campos
  - Adicionar extração de: `modelo`, `protocolo`, `dataAutorizacao`, `situacaoFiscal`
  - Adicionar extração de: `destinatario` (CNPJ e nome do `dest`)
  - Adicionar cálculo de `xmlHash` com `crypto.createHash('sha256')`
  - Adicionar extração de impostos por item: ICMS, IPI, PIS, COFINS, CEST, CSOSN, CST
  - Mapeamento de `cStat` do protocolo para o enum `SituacaoFiscalNfe`

- [ ] 9. Atualizar produto-identificacao.service.ts
  - `identificarItensNfe`: persistir `statusIdentificacao` (IDENTIFICADO_EAN ou IDENTIFICADO_CODIGO_FORNECEDOR)
  - `associarProduto`: setar `statusIdentificacao = 'IDENTIFICADO_MANUAL'`

- [ ] 10. Criar nfe-eventos.service.ts
  - Função `registrarEventoNfe(params)` com `await prisma.eventoNfe.create(...).catch(() => {})`
  - Fire-and-forget — nunca propagar exceção para o chamador

- [ ] 11. Criar nfe-divergencia.service.ts
  - `calcularEPersistirDivergencias(nfeId, tx?)`: upsert de divergências no banco
  - Detectar: QUANTIDADE_MENOR, QUANTIDADE_MAIOR, PRECO_DIFERENTE, PRODUTO_NAO_SOLICITADO, PRODUTO_FALTANTE, PRODUTO_NAO_IDENTIFICADO
  - `classificarDivergencia(tipo)`: retorna 'BLOQUEANTE' | 'ALERTA'
  - Não criar duplicatas: upsert por `(notaFiscalId, produtoId, tipo)`

- [ ] 12. Atualizar recebimento.service.ts
  - Separar `precoCompra` (último custo) de `custoMedio` (médio ponderado)
  - Verificar `situacaoFiscal !== 'DENEGADA'` antes de confirmar
  - Chamar `registrarEventoNfe(RECEBIMENTO_CONFIRMADO)` após commit

---

## Fase 3 — Controllers e Rotas

- [ ] 13. Atualizar notas-fiscais.controller.ts — `importar`
  - Persistir novos campos do parser (modelo, protocolo, situacaoFiscal, destinatarioCnpj, xmlHash)
  - Persistir campos tributários dos itens (valorIcms, valorIpi, etc.)
  - Substituir `pedidos.connect` por inserção em `NfePedido`
  - Buscar e retornar `pedidosSugeridos` (pedidos abertos do mesmo fornecedor)
  - Chamar `registrarEventoNfe(NFE_IMPORTADA)` e `(FORNECEDOR_IDENTIFICADO/NAO_ENCONTRADO)`

- [ ] 14. Atualizar notas-fiscais.controller.ts — `vincularPedido`
  - Inserir em `NfePedido` com `vinculadoPorId` e `dataVinculacao`
  - Chamar `calcularEPersistirDivergencias` após vincular
  - Atualizar pedido para status FATURADO se estava ENVIADO
  - Chamar `registrarEventoNfe(PEDIDO_VINCULADO)`
  - Se NF-e tem divergências bloqueantes → status `COM_DIVERGENCIA`, senão `EM_CONFERENCIA`

- [ ] 15. Atualizar notas-fiscais.controller.ts — `getConferencia`
  - Usar divergências do banco (via `NfePedido` → `PedidoCompraItem`) em vez de calcular on-the-fly
  - Retornar `classificacao` ('BLOQUEANTE' / 'ALERTA') por item
  - Retornar contadores: `identificados`, `divergenciasAlerta`, `divergenciasBloqueantes`

- [ ] 16. Criar novos endpoints em notas-fiscais.controller.ts
  - `listarEventos`: `GET /:id/eventos` — retorna `EventoNfe[]` ordenados por `createdAt`
  - `downloadXml`: `GET /:id/xml` — serve o arquivo, recalcula hash e avisa se divergir
  - `buscarPorChave`: `GET /chave/:chave` — valida 44 dígitos, busca por `chaveAcesso`

- [ ] 17. Criar endpoint `faturar` em pedidos.controller.ts
  - `POST /:id/faturar`: transição ENVIADO → FATURADO
  - Adicionar rota `router.post('/:id/faturar', ctrl.faturar)`

- [ ] 18. Atualizar listar em notas-fiscais.controller.ts
  - Adicionar filtros: `numero`, `serie`, `chaveAcesso` (busca parcial), `situacaoFiscal`
  - Adicionar filtro de período: `dataEmissaoInicio`, `dataEmissaoFim`
  - Adicionar filtro de vinculação: `comPedido`, `semPedido`

---

## Fase 4 — Frontend: Componentes novos

- [ ] 19. Criar NfeTimeline.tsx
  - Lista de EventoNfe em ordem cronológica
  - Ícone por tipo de evento (upload, person, link, check, warning, etc.)
  - Exibir dados extras em accordion expansível

- [ ] 20. Criar NfeChaveField.tsx
  - Input controlado que aceita apenas 44 dígitos numéricos
  - Formata a chave visualmente (grupos separados)
  - Validação em tempo real com feedback visual
  - Botão copiar

- [ ] 21. Criar DivergenciaBadge.tsx
  - Props: `tipo`, `classificacao`, `quantidade` (count)
  - Verde/Amarelo/Vermelho conforme classificação
  - Tooltip com detalhes da divergência

- [ ] 22. Criar PedidoSugeridoCard.tsx
  - Exibe pedidos sugeridos após importação do XML
  - Botão "Vincular" por pedido
  - Botão "Pular" para continuar sem vincular

- [ ] 23. Criar FornecedorStatusCard.tsx
  - Exibe resultado da identificação do fornecedor após importação
  - Verde: "Fornecedor identificado: {nome}"
  - Amarelo: "CNPJ {cnpj} não cadastrado" + botão "Cadastrar fornecedor"

---

## Fase 5 — Frontend: Páginas

- [ ] 24. Refatorar NotasFiscaisPage.tsx → repositório completo
  - Painel de filtros: período, fornecedor, número, série, chave de acesso
  - Filtros de status operacional e situação fiscal (multi-select)
  - Filtro de vinculação de pedido
  - Grid com todas as colunas do PRD (seção 7)
  - Ícones de status de conferência (✓/⚠/⛔) na primeira coluna
  - Indicador de situação fiscal (SEFAZ) na coluna status
  - Ações: Conferir, Download XML, Cancelar

- [ ] 25. Refatorar ConferenciaPage.tsx — layout do PRD
  - Cabeçalho: NF-e, série, status, fornecedor, CNPJ, chave + botão copiar
  - Pedido vinculado com botão alterar
  - Contadores: ✓ N identificados | ⚠ N alertas | ⛔ N bloqueantes
  - Tabela com coluna `classificacao` colorida
  - Total NF-e vs Total a receber no rodapé
  - Botão "Confirmar" desabilitado se há bloqueantes
  - Aba "Eventos" com NfeTimeline

- [ ] 26. Atualizar ImportarXmlModal.tsx — pós-importação
  - Após importação bem-sucedida, exibir FornecedorStatusCard
  - Exibir PedidoSugeridoCard se houver pedidos sugeridos
  - Permitir vincular direto no modal ou pular para conferência

- [ ] 27. Atualizar PedidosCompraPage.tsx
  - Adicionar botão "Faturar" para pedidos ENVIADO (chama endpoint `/faturar`)
  - Exibir badge FATURADO no modal de detalhe com instrução de próximo passo

---

## Fase 6 — Build e Deploy

- [ ] 28. Compilar backend e frontend
  - `cd backend && npx tsc` — zero erros
  - `cd frontend && npm run build` — zero erros

- [ ] 29. Executar migration no banco instalado
  - Rodar `npx prisma migrate deploy` com DATABASE_URL correto
  - Executar script de migração de dados para `nfe_pedidos`

- [ ] 30. Atualizar serviço instalado
  - Copiar `backend/dist/` para `C:\Program Files\MercadoPro\Backend\dist\`
  - Copiar `backend/public/` para `C:\Program Files\MercadoPro\Backend\public\`
  - Copiar `backend/node_modules/.prisma/client/index.js` para serviço instalado
  - Reiniciar MercadoProService via NSSM

---

## Fase 7 — Atualizar Instalador e README

- [ ] 31. Atualizar staging e recompilar MercadoPro_Setup_v2.1.0.exe
  - Atualizar versão para 2.1.0 em `appConfig.ts` e `MercadoPro.nsi`
  - Copiar dist e public para staging
  - `makensis -DVERSION=2.1.0 MercadoPro.nsi`

- [ ] 32. Atualizar README.md
  - Seção NF-e: campos adicionados (xmlHash, situacaoFiscal, modelo, etc.)
  - Novos endpoints documentados
  - Seção EventoNfe e linha do tempo
  - Tabela de permissões atualizada

- [ ] 33. Commit e push
  - `git add` nos arquivos modificados
  - `git commit -m "feat: repositório NF-e, eventos, divergências automáticas e campos fiscais v2.1"`
  - `git push origin main`
