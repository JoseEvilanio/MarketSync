/*
  Warnings:

  - You are about to drop the `pagamentos_venda` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TipoVenda" AS ENUM ('UNIDADE', 'PESO');

-- CreateEnum
CREATE TYPE "ModoPesagem" AS ENUM ('MANUAL', 'CODIGO_BARRAS_BALANCA');

-- CreateEnum
CREATE TYPE "StatusPedidoCompra" AS ENUM ('RASCUNHO', 'ABERTO', 'ENVIADO', 'FATURADO', 'EM_CONFERENCIA', 'PARCIAL', 'RECEBIDO', 'CONCLUIDO', 'CANCELADO', 'DIVERGENTE');

-- CreateEnum
CREATE TYPE "StatusNotaFiscal" AS ENUM ('IMPORTADA', 'AGUARDANDO_VINCULO', 'EM_CONFERENCIA', 'COM_DIVERGENCIA', 'APROVADA', 'RECEBIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusRecebimento" AS ENUM ('PENDENTE', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoDivergencia" AS ENUM ('QUANTIDADE_MENOR', 'QUANTIDADE_MAIOR', 'PRECO_DIFERENTE', 'PRODUTO_NAO_SOLICITADO', 'PRODUTO_NAO_IDENTIFICADO');

-- CreateEnum
CREATE TYPE "StatusDivergencia" AS ENUM ('PENDENTE', 'RESOLVIDA', 'IGNORADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FormaPagamento" ADD VALUE 'POS_DEBITO';
ALTER TYPE "FormaPagamento" ADD VALUE 'POS_CREDITO';
ALTER TYPE "FormaPagamento" ADD VALUE 'VALE_ALIMENTACAO';
ALTER TYPE "FormaPagamento" ADD VALUE 'VALE_REFEICAO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoMovimentoEstoque" ADD VALUE 'ENTRADA_NFE';
ALTER TYPE "TipoMovimentoEstoque" ADD VALUE 'SAIDA_ESTORNO_NFE';

-- DropForeignKey
ALTER TABLE "pagamentos_venda" DROP CONSTRAINT "pagamentos_venda_vendaId_fkey";

-- AlterTable
ALTER TABLE "itens_venda" ADD COLUMN     "peso" DOUBLE PRECISION,
ADD COLUMN     "valorKg" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "modoPesagem" "ModoPesagem" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "tipoVenda" "TipoVenda" NOT NULL DEFAULT 'UNIDADE';

-- DropTable
DROP TABLE "pagamentos_venda";

-- CreateTable
CREATE TABLE "venda_pagamentos" (
    "id" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "formaPagamento" "FormaPagamento" NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venda_pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_compra" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "fornecedorId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "status" "StatusPedidoCompra" NOT NULL DEFAULT 'RASCUNHO',
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pedidos_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_compra_itens" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "quantidadeRecebida" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "precoUnitario" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_compra_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_fiscais_entrada" (
    "id" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "chaveAcesso" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "dataEntrada" TIMESTAMP(3),
    "valorTotal" DECIMAL(10,2) NOT NULL,
    "status" "StatusNotaFiscal" NOT NULL DEFAULT 'IMPORTADA',
    "xmlPath" TEXT,
    "observacao" TEXT,
    "cnpjEmitente" TEXT,
    "nomeEmitente" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "notas_fiscais_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_fiscais_itens" (
    "id" TEXT NOT NULL,
    "notaFiscalId" TEXT NOT NULL,
    "produtoId" TEXT,
    "codigoFornecedor" TEXT NOT NULL,
    "gtin" TEXT,
    "descricao" TEXT NOT NULL,
    "ncm" TEXT,
    "cfop" TEXT,
    "unidade" TEXT NOT NULL DEFAULT 'UN',
    "quantidade" DOUBLE PRECISION NOT NULL,
    "valorUnitario" DECIMAL(10,2) NOT NULL,
    "desconto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(10,2) NOT NULL,
    "identificado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notas_fiscais_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto_fornecedor" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "codigoFornecedor" TEXT NOT NULL,
    "gtin" TEXT,
    "descricaoFornecedor" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produto_fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recebimentos" (
    "id" TEXT NOT NULL,
    "notaFiscalId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "status" "StatusRecebimento" NOT NULL DEFAULT 'PENDENTE',
    "dataRecebimento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recebimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recebimentos_itens" (
    "id" TEXT NOT NULL,
    "recebimentoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "valorUnitario" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recebimentos_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "divergencias" (
    "id" TEXT NOT NULL,
    "notaFiscalId" TEXT NOT NULL,
    "produtoId" TEXT,
    "tipo" "TipoDivergencia" NOT NULL,
    "status" "StatusDivergencia" NOT NULL DEFAULT 'PENDENTE',
    "quantidadePedida" DOUBLE PRECISION,
    "quantidadeNfe" DOUBLE PRECISION,
    "quantidadeAceita" DOUBLE PRECISION,
    "precoPedido" DECIMAL(10,2),
    "precoNfe" DECIMAL(10,2),
    "descricaoItem" TEXT,
    "resolvidoPorId" TEXT,
    "resolvidoEm" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "divergencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PedidoNotasFiscais" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_compra_numero_key" ON "pedidos_compra"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "notas_fiscais_entrada_chaveAcesso_key" ON "notas_fiscais_entrada"("chaveAcesso");

-- CreateIndex
CREATE UNIQUE INDEX "produto_fornecedor_fornecedorId_codigoFornecedor_key" ON "produto_fornecedor"("fornecedorId", "codigoFornecedor");

-- CreateIndex
CREATE UNIQUE INDEX "_PedidoNotasFiscais_AB_unique" ON "_PedidoNotasFiscais"("A", "B");

-- CreateIndex
CREATE INDEX "_PedidoNotasFiscais_B_index" ON "_PedidoNotasFiscais"("B");

-- AddForeignKey
ALTER TABLE "venda_pagamentos" ADD CONSTRAINT "venda_pagamentos_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra_itens" ADD CONSTRAINT "pedidos_compra_itens_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra_itens" ADD CONSTRAINT "pedidos_compra_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_fiscais_entrada" ADD CONSTRAINT "notas_fiscais_entrada_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_fiscais_itens" ADD CONSTRAINT "notas_fiscais_itens_notaFiscalId_fkey" FOREIGN KEY ("notaFiscalId") REFERENCES "notas_fiscais_entrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_fiscais_itens" ADD CONSTRAINT "notas_fiscais_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_fornecedor" ADD CONSTRAINT "produto_fornecedor_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_fornecedor" ADD CONSTRAINT "produto_fornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimentos" ADD CONSTRAINT "recebimentos_notaFiscalId_fkey" FOREIGN KEY ("notaFiscalId") REFERENCES "notas_fiscais_entrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimentos" ADD CONSTRAINT "recebimentos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimentos_itens" ADD CONSTRAINT "recebimentos_itens_recebimentoId_fkey" FOREIGN KEY ("recebimentoId") REFERENCES "recebimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimentos_itens" ADD CONSTRAINT "recebimentos_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "divergencias" ADD CONSTRAINT "divergencias_notaFiscalId_fkey" FOREIGN KEY ("notaFiscalId") REFERENCES "notas_fiscais_entrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "divergencias" ADD CONSTRAINT "divergencias_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "divergencias" ADD CONSTRAINT "divergencias_resolvidoPorId_fkey" FOREIGN KEY ("resolvidoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PedidoNotasFiscais" ADD CONSTRAINT "_PedidoNotasFiscais_A_fkey" FOREIGN KEY ("A") REFERENCES "notas_fiscais_entrada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PedidoNotasFiscais" ADD CONSTRAINT "_PedidoNotasFiscais_B_fkey" FOREIGN KEY ("B") REFERENCES "pedidos_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Garantir permissões do usuário da aplicação no schema public
-- (necessário após resets/restores onde o Prisma recria o schema)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercado') THEN
    GRANT USAGE  ON SCHEMA public TO mercado;
    GRANT CREATE ON SCHEMA public TO mercado;
    GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO mercado;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mercado;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO mercado;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO mercado;
  END IF;
END
$$;
