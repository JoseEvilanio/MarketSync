# Requisitos — Evolução do Módulo de Compras, NF-e e Recebimento

## Contexto

O MarketSync ERP possui hoje um módulo de compras onde o fluxo é:
`Criar Compra (Rascunho) → Concluir → Estoque atualizado`

O campo `notaFiscal` na model `Compra` armazena apenas texto livre. Não há processamento de XML, controle de pedido separado da nota, nem etapa de conferência. A conclusão da compra já entra direto no estoque sem conferência.

Este spec evolui esse módulo para um ciclo completo de aquisição controlado, sem quebrar o histórico existente.

## Requisitos Funcionais

### RF-01 — Pedido de Compra
- O sistema deve permitir criar pedidos de compra com fornecedor, itens (produto, quantidade, preço unitário) e observações
- Um pedido de compra NÃO deve alterar o estoque em nenhuma hipótese
- O pedido deve ter um número sequencial único gerado automaticamente
- Apenas perfis ADMINISTRADOR e GERENTE podem criar, editar e enviar pedidos

### RF-02 — Status do Pedido
O pedido deve percorrer os seguintes estados:
- `RASCUNHO` → editável, não visível ao fornecedor
- `ABERTO` → confirmado para compra
- `ENVIADO` → transmitido ao fornecedor
- `FATURADO` → fornecedor emitiu NF-e vinculada
- `EM_CONFERENCIA` → NF-e importada, aguardando conferência
- `PARCIAL` → parte dos itens recebida
- `RECEBIDO` → todos os itens aceitos
- `CONCLUIDO` → processo encerrado
- `CANCELADO` → anulado sem movimentar estoque
- `DIVERGENTE` → possui divergências pendentes de resolução

### RF-03 — Importação de XML NF-e
- O sistema deve aceitar upload de arquivo XML de NF-e
- Deve extrair e armazenar: chave de acesso (44 dígitos), número, série, data de emissão, data de entrada (quando presente), CNPJ do emitente, valor total, e todos os itens (código fornecedor, GTIN/EAN, descrição, NCM, CFOP, unidade, quantidade, valor unitário, desconto, valor total)
- O XML original deve ser armazenado em disco: `storage/notas-fiscais/YYYY/MM/<chave_acesso>.xml`
- O campo `xml_path` na model deve apontar para esse arquivo
- A importação deve funcionar 100% offline, sem consultar SEFAZ

### RF-04 — Unicidade da Chave de Acesso
- O campo `chave_acesso` deve ter restrição UNIQUE no banco
- Ao tentar importar XML com chave já existente, o sistema deve retornar erro com status, número e chave da NF-e duplicada
- Nunca permitir duas NF-e com a mesma chave de acesso

### RF-05 — Status da NF-e
A NF-e deve percorrer os seguintes estados:
- `IMPORTADA` → XML processado, aguardando vínculo
- `AGUARDANDO_VINCULO` → fornecedor identificado, sem pedido vinculado
- `EM_CONFERENCIA` → vinculada a pedido, conferência iniciada
- `COM_DIVERGENCIA` → divergências identificadas pendentes
- `APROVADA` → conferência aprovada, aguarda confirmação
- `RECEBIDA` → recebimento confirmado, estoque atualizado
- `CANCELADA` → anulada

### RF-06 — Identificação do Fornecedor
- O sistema deve localizar o fornecedor usando o CNPJ do XML (`emit/CNPJ`)
- Se encontrado: vincular automaticamente e prosseguir
- Se não encontrado: bloquear e apresentar opção para o usuário vincular a um fornecedor existente ou cadastrar novo
- O sistema NÃO deve criar fornecedor automaticamente sem interação do usuário

### RF-07 — Identificação de Produtos
O sistema deve tentar identificar cada item da NF-e na seguinte ordem de prioridade:
1. **GTIN/EAN do XML** (`det/prod/cEAN`) → buscar no campo `codigoBarras` do Produto
2. **Associação produto-fornecedor** (`ProdutoFornecedor`) → buscar por `fornecedorId` + `codigo_fornecedor` (campo `cProd` do XML)
3. **Produto não identificado** → exibir para o usuário associar a produto existente ou cadastrar novo

### RF-08 — Tabela ProdutoFornecedor
- Criar model `ProdutoFornecedor` relacionando produto interno com código do fornecedor
- Campos: `produtoId`, `fornecedorId`, `codigo_fornecedor` (código usado pelo fornecedor), `gtin`, `descricao_fornecedor`, `ativo`
- Restrição UNIQUE em `(fornecedorId, codigo_fornecedor)`
- Ao identificar um produto por EAN ou por associação manual, salvar o relacionamento para uso futuro

### RF-09 — Vinculação NF-e ↔ Pedido
- Após importar NF-e, o sistema deve exibir pedidos em aberto do mesmo fornecedor para seleção
- Um pedido pode receber múltiplas NF-e (atendimento parcial)
- Uma NF-e pode atender itens de múltiplos pedidos
- A vinculação deve ser opcional; NF-e pode ser recebida sem pedido vinculado

### RF-10 — Tela de Conferência
- Deve exibir lado a lado: quantidade pedida × quantidade na NF-e × quantidade a receber
- Deve identificar automaticamente divergências por produto:
  - Quantidade menor que o pedido
  - Quantidade maior que o pedido
  - Preço diferente do pedido
  - Produto na NF-e não consta no pedido (não solicitado)
  - Produto não identificado no sistema
- Campo editável de quantidade recebida por item (padrão = quantidade da NF-e)

### RF-11 — Tratamento de Divergências
- Divergências não devem bloquear obrigatoriamente o recebimento
- Usuário GERENTE ou ADMINISTRADOR pode resolver divergências com as opções:
  - Receber quantidade da NF-e (aceitar diferença)
  - Receber quantidade do pedido
  - Não receber o item
  - Informar quantidade manual
- Divergências resolvidas devem ser registradas com usuário e data/hora

### RF-12 — Confirmação do Recebimento (Transação)
A confirmação do recebimento deve executar uma única transação de banco de dados atômica que:
1. Cria registro de `Recebimento`
2. Cria `RecebimentoItem` para cada produto aceito
3. Cria `MovimentoEstoque` do tipo `ENTRADA_COMPRA` vinculado à NF-e para cada item
4. Atualiza `estoqueAtual` do produto (saldo anterior + quantidade recebida)
5. Recalcula `precoCompra` (preço médio ponderado) do produto
6. Atualiza status da NF-e para `RECEBIDA`
7. Atualiza status do pedido vinculado (RECEBIDO ou PARCIAL conforme itens pendentes)
8. Registra auditoria
- Em caso de qualquer erro, toda a transação deve ser revertida (ROLLBACK)
- Uma NF-e já com status `RECEBIDA` nunca deve gerar nova entrada de estoque

### RF-13 — Princípio fundamental
**Importar NF-e NÃO movimenta estoque.** Somente a confirmação do recebimento atualiza o estoque e o custo médio. Este princípio deve ser aplicado em todas as camadas (backend + frontend).

### RF-14 — Armazenamento e Backup do XML
- O XML importado deve ser copiado para `backend/storage/notas-fiscais/YYYY/MM/<chave>.xml`
- O backup do sistema (`exportarSistema`) deve incluir a pasta `storage/notas-fiscais/` no pacote `.backup`
- A restauração deve reconstruir essa pasta junto com o banco

### RF-15 — Cancelamento e Estorno
- NF-e com status `IMPORTADA`, `AGUARDANDO_VINCULO`, `EM_CONFERENCIA` ou `COM_DIVERGENCIA` pode ser cancelada sem restrições
- NF-e com status `RECEBIDA` só pode ser estornada por ADMINISTRADOR, gerando movimentações de saída de estoque para reverter a entrada, preservando todo o histórico original
- Nunca apagar NF-e, pedidos, recebimentos ou movimentações de estoque

### RF-16 — Soft Delete e Histórico
- Todos os novos models devem ter campo `deletedAt` (soft delete)
- Nunca apagar fisicamente pedidos, NF-e, recebimentos, divergências ou movimentações
- O histórico completo deve ser preservado e auditável

### RF-17 — Permissões
| Ação | CAIXA | GERENTE | ADMINISTRADOR |
|---|---|---|---|
| Criar pedido | ✗ | ✓ | ✓ |
| Importar NF-e | ✗ | ✓ | ✓ |
| Conferir itens | ✗ | ✓ | ✓ |
| Resolver divergência | ✗ | ✓ | ✓ |
| Confirmar recebimento | ✗ | ✓ | ✓ |
| Cancelar NF-e recebida / Estornar | ✗ | ✗ | ✓ |

### RF-18 — Migração do módulo atual
- As compras existentes (`Compra`) devem ser mantidas e continuar acessíveis
- O novo módulo (`PedidoCompra`) e o modelo atual (`Compra`) coexistirão inicialmente
- O `POST /api/compras/:id/concluir` existente deve ser mantido para compatibilidade com compras antigas
- Novos recebimentos de NF-e devem usar o novo fluxo

### RF-19 — Dashboard de Compras
O módulo deve exibir na tela principal de compras:
- Pedidos em aberto (count)
- NF-e aguardando conferência (count)
- Divergências pendentes (count)
- Recebimentos realizados hoje (count)
- Pedidos com status FATURADO (count)

### RF-20 — Funcionamento Offline
- Toda a funcionalidade descrita deve operar 100% offline
- O parsing do XML deve ser feito localmente no backend, sem chamadas externas

## Requisitos Não Funcionais

- **RNF-01:** A transação de recebimento deve ser atômica — qualquer falha deve resultar em ROLLBACK completo
- **RNF-02:** A chave de acesso da NF-e deve ter constraint UNIQUE no banco PostgreSQL
- **RNF-03:** O upload do XML deve suportar arquivos de até 10 MB
- **RNF-04:** O sistema deve usar `fast-xml-parser` ou `xml2js` para parsing do XML NF-e
- **RNF-05:** Todos os valores monetários devem usar `Decimal(10,2)` no banco (Prisma `@db.Decimal`)
- **RNF-06:** Soft delete obrigatório em todos os novos models (`deletedAt DateTime?`)
- **RNF-07:** Auditoria obrigatória para: criação/alteração de pedido, importação de NF-e, vinculação, resolução de divergência, confirmação de recebimento, cancelamento, estorno
