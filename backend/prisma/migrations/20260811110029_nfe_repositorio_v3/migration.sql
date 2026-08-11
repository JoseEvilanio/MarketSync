-- CreateEnum
CREATE TYPE "SituacaoFiscalNfe" AS ENUM ('AUTORIZADA', 'CANCELADA', 'DENEGADA', 'DESCONHECIDA');

-- CreateEnum
CREATE TYPE "StatusIdentificacaoItem" AS ENUM ('IDENTIFICADO_EAN', 'IDENTIFICADO_CODIGO_FORNECEDOR', 'IDENTIFICADO_MANUAL', 'NAO_IDENTIFICADO');

-- CreateEnum
CREATE TYPE "TipoEventoNfe" AS ENUM ('NFE_IMPORTADA', 'FORNECEDOR_IDENTIFICADO', 'FORNECEDOR_NAO_ENCONTRADO', 'PRODUTO_IDENTIFICADO', 'PEDIDO_VINCULADO', 'CONFERENCIA_INICIADA', 'DIVERGENCIA_DETECTADA', 'DIVERGENCIA_AUTORIZADA', 'RECEBIMENTO_CONFIRMADO', 'RECEBIMENTO_ESTORNADO', 'NFE_CANCELADA', 'CIENCIA_OPERACAO', 'CONFIRMACAO_OPERACAO', 'DESCONHECIMENTO_OPERACAO', 'OPERACAO_NAO_REALIZADA', 'CANCELAMENTO_SEFAZ', 'CARTA_CORRECAO');

-- AlterEnum
ALTER TYPE "TipoDivergencia" ADD VALUE 'PRODUTO_FALTANTE';

-- AlterTable
ALTER TABLE "notas_fiscais_entrada" ADD COLUMN     "dataAutorizacao" TIMESTAMP(3),
ADD COLUMN     "destinatarioCnpj" TEXT,
ADD COLUMN     "destinatarioNome" TEXT,
ADD COLUMN     "modelo" TEXT,
ADD COLUMN     "protocolo" TEXT,
ADD COLUMN     "situacaoFiscal" "SituacaoFiscalNfe" NOT NULL DEFAULT 'DESCONHECIDA',
ADD COLUMN     "xmlHash" TEXT;

-- AlterTable
ALTER TABLE "notas_fiscais_itens" ADD COLUMN     "cest" TEXT,
ADD COLUMN     "csosn" TEXT,
ADD COLUMN     "cst" TEXT,
ADD COLUMN     "statusIdentificacao" "StatusIdentificacaoItem" NOT NULL DEFAULT 'NAO_IDENTIFICADO',
ADD COLUMN     "valorCofins" DECIMAL(10,2),
ADD COLUMN     "valorIcms" DECIMAL(10,2),
ADD COLUMN     "valorIpi" DECIMAL(10,2),
ADD COLUMN     "valorPis" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "custoMedio" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "nfe_pedidos" (
    "id" TEXT NOT NULL,
    "nfeId" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "vinculadoPorId" TEXT,
    "dataVinculacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,

    CONSTRAINT "nfe_pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_nfe" (
    "id" TEXT NOT NULL,
    "nfeId" TEXT NOT NULL,
    "tipo" "TipoEventoNfe" NOT NULL,
    "descricao" TEXT NOT NULL,
    "usuarioId" TEXT,
    "dados" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_nfe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nfe_pedidos_nfeId_pedidoId_key" ON "nfe_pedidos"("nfeId", "pedidoId");

-- AddForeignKey
ALTER TABLE "nfe_pedidos" ADD CONSTRAINT "nfe_pedidos_nfeId_fkey" FOREIGN KEY ("nfeId") REFERENCES "notas_fiscais_entrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_pedidos" ADD CONSTRAINT "nfe_pedidos_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_pedidos" ADD CONSTRAINT "nfe_pedidos_vinculadoPorId_fkey" FOREIGN KEY ("vinculadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_nfe" ADD CONSTRAINT "eventos_nfe_nfeId_fkey" FOREIGN KEY ("nfeId") REFERENCES "notas_fiscais_entrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_nfe" ADD CONSTRAINT "eventos_nfe_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
