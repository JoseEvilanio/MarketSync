import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middlewares/auth.middleware';

export async function dashboard(_req: AuthRequest, res: Response): Promise<void> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - hoje.getDay());

  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const [
    vendasHoje,
    vendasSemana,
    vendasMes,
    caixaAberto,
    produtosEstoqueBaixo,
    maiVendidos,
    semVenda,
    totalProdutos,
  ] = await Promise.all([
    // Vendas hoje
    prisma.venda.aggregate({
      where: { status: 'CONCLUIDA', createdAt: { gte: hoje, lt: amanha } },
      _sum: { total: true },
      _count: { id: true },
    }),
    // Vendas semana
    prisma.venda.aggregate({
      where: { status: 'CONCLUIDA', createdAt: { gte: inicioSemana } },
      _sum: { total: true },
    }),
    // Vendas mês
    prisma.venda.aggregate({
      where: { status: 'CONCLUIDA', createdAt: { gte: inicioMes } },
      _sum: { total: true },
    }),
    // Caixa aberto
    prisma.caixa.findFirst({
      where: { status: 'ABERTO' },
      include: { usuario: { select: { nome: true } } },
    }),
    // Produtos com estoque baixo
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM produtos
      WHERE "deletedAt" IS NULL AND ativo = true
        AND "estoqueAtual" <= "estoqueMinimo"
    `,
    // Mais vendidos (últimos 30 dias)
    prisma.$queryRaw<any[]>`
      SELECT p.id, p.nome, SUM(iv.quantidade) as total_qty, SUM(iv.subtotal) as total_valor
      FROM itens_venda iv
      JOIN produtos p ON p.id = iv."produtoId"
      JOIN vendas v ON v.id = iv."vendaId"
      WHERE v.status = 'CONCLUIDA'
        AND v."createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY p.id, p.nome
      ORDER BY total_qty DESC
      LIMIT 10
    `,
    // Sem venda (últimos 30 dias)
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM produtos p
      WHERE p."deletedAt" IS NULL AND p.ativo = true
        AND p.id NOT IN (
          SELECT DISTINCT iv."produtoId"
          FROM itens_venda iv
          JOIN vendas v ON v.id = iv."vendaId"
          WHERE v.status = 'CONCLUIDA'
            AND v."createdAt" >= NOW() - INTERVAL '30 days'
        )
    `,
    prisma.produto.count({ where: { deletedAt: null, ativo: true } }),
  ]);

  // Calcular lucro estimado do dia
  const itensHoje = await prisma.itemVenda.findMany({
    where: {
      venda: { status: 'CONCLUIDA', createdAt: { gte: hoje, lt: amanha } },
    },
    include: { produto: { select: { precoCompra: true } } },
  });

  const lucroHoje = itensHoje.reduce((acc, item) => {
    const custo = Number(item.produto.precoCompra) * item.quantidade;
    return acc + Number(item.subtotal) - custo;
  }, 0);

  const totalVendasHoje = Number(vendasHoje._sum.total) || 0;
  const ticketMedio =
    vendasHoje._count.id > 0 ? totalVendasHoje / vendasHoje._count.id : 0;

  // Calcular valor em caixa
  let valorEmCaixa = 0;
  if (caixaAberto) {
    const movs = await prisma.movimentoCaixa.findMany({
      where: { caixaId: caixaAberto.id },
    });
    valorEmCaixa = movs.reduce((acc, m) => {
      if (['ABERTURA', 'SUPRIMENTO', 'VENDA'].includes(m.tipo)) return acc + Number(m.valor);
      if (['SANGRIA', 'DEVOLUCAO'].includes(m.tipo)) return acc - Number(m.valor);
      return acc;
    }, 0);
  }

  res.json({
    vendasHoje: totalVendasHoje,
    vendasSemana: Number(vendasSemana._sum.total) || 0,
    vendasMes: Number(vendasMes._sum.total) || 0,
    ticketMedio,
    lucroHoje,
    caixaAberto: caixaAberto
      ? { ...caixaAberto, valorEmCaixa }
      : null,
    produtosEstoqueBaixo: Number((produtosEstoqueBaixo[0] as any)?.count) || 0,
    maiVendidos,
    semVenda: Number((semVenda[0] as any)?.count) || 0,
    totalProdutos,
    quantidadeVendasHoje: vendasHoje._count.id,
  });
}

export async function vendasPorPeriodo(req: AuthRequest, res: Response): Promise<void> {
  const { dataInicio, dataFim, agrupamento = 'DIA' } = req.query as any;

  const inicio = dataInicio ? new Date(dataInicio) : new Date(new Date().setDate(1));
  const fim = dataFim ? new Date(dataFim) : new Date();
  fim.setHours(23, 59, 59, 999);

  const format =
    agrupamento === 'MES'
      ? 'YYYY-MM'
      : agrupamento === 'SEMANA'
      ? 'IYYY-IW'
      : 'YYYY-MM-DD';

  const resultado = await prisma.$queryRaw<any[]>`
    SELECT
      TO_CHAR(v."createdAt", ${format}) as periodo,
      COUNT(v.id) as quantidade,
      SUM(v.total) as total,
      AVG(v.total) as ticket_medio
    FROM vendas v
    WHERE v.status = 'CONCLUIDA'
      AND v."createdAt" BETWEEN ${inicio} AND ${fim}
    GROUP BY periodo
    ORDER BY periodo ASC
  `;

  res.json(resultado);
}

export async function vendasPorProduto(req: AuthRequest, res: Response): Promise<void> {
  const { dataInicio, dataFim, limit = '20' } = req.query as any;

  const inicio = dataInicio ? new Date(dataInicio) : new Date(new Date().setDate(1));
  const fim = dataFim ? new Date(dataFim) : new Date();
  fim.setHours(23, 59, 59, 999);

  const resultado = await prisma.$queryRaw<any[]>`
    SELECT
      p.id, p.nome, p."codigoBarras",
      c.nome as categoria,
      SUM(iv.quantidade) as quantidade,
      SUM(iv.subtotal) as total,
      COUNT(DISTINCT v.id) as num_vendas
    FROM itens_venda iv
    JOIN produtos p ON p.id = iv."produtoId"
    JOIN vendas v ON v.id = iv."vendaId"
    LEFT JOIN categorias c ON c.id = p."categoriaId"
    WHERE v.status = 'CONCLUIDA'
      AND v."createdAt" BETWEEN ${inicio} AND ${fim}
    GROUP BY p.id, p.nome, p."codigoBarras", c.nome
    ORDER BY total DESC
    LIMIT ${parseInt(limit)}
  `;

  res.json(resultado);
}

export async function vendasPorOperador(req: AuthRequest, res: Response): Promise<void> {
  const { dataInicio, dataFim } = req.query as any;

  const inicio = dataInicio ? new Date(dataInicio) : new Date(new Date().setDate(1));
  const fim = dataFim ? new Date(dataFim) : new Date();
  fim.setHours(23, 59, 59, 999);

  const resultado = await prisma.$queryRaw<any[]>`
    SELECT
      u.id, u.nome,
      COUNT(v.id) as num_vendas,
      SUM(v.total) as total
    FROM vendas v
    JOIN usuarios u ON u.id = v."usuarioId"
    WHERE v.status = 'CONCLUIDA'
      AND v."createdAt" BETWEEN ${inicio} AND ${fim}
    GROUP BY u.id, u.nome
    ORDER BY total DESC
  `;

  res.json(resultado);
}

export async function estoqueCritico(_req: AuthRequest, res: Response): Promise<void> {
  const resultado = await prisma.$queryRaw<any[]>`
    SELECT
      p.id, p.nome, p."codigoBarras",
      p."estoqueAtual", p."estoqueMinimo",
      c.nome as categoria,
      f.nome as fornecedor
    FROM produtos p
    LEFT JOIN categorias c ON c.id = p."categoriaId"
    LEFT JOIN fornecedores f ON f.id = p."fornecedorId"
    WHERE p."deletedAt" IS NULL AND p.ativo = true
      AND p."estoqueAtual" <= p."estoqueMinimo"
    ORDER BY (p."estoqueAtual" - p."estoqueMinimo") ASC
  `;

  res.json(resultado);
}

export async function caixaRelatorio(req: AuthRequest, res: Response): Promise<void> {
  const { dataInicio, dataFim } = req.query as any;

  const inicio = dataInicio ? new Date(dataInicio) : new Date(new Date().setDate(1));
  const fim = dataFim ? new Date(dataFim) : new Date();
  fim.setHours(23, 59, 59, 999);

  const caixas = await prisma.caixa.findMany({
    where: { aberturaEm: { gte: inicio, lte: fim } },
    include: {
      usuario: { select: { nome: true } },
      movimentos: true,
    },
    orderBy: { aberturaEm: 'desc' },
  });

  res.json(caixas);
}
