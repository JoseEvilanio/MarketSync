export type FormaPag =
  | 'DINHEIRO'
  | 'PIX'
  | 'POS_DEBITO'
  | 'POS_CREDITO'
  | 'VALE_ALIMENTACAO'
  | 'VALE_REFEICAO';

export interface PagamentoItem {
  formaPagamento: FormaPag;
  valor: number;
  ordem?: number;
}

export interface FORMA_OPTION {
  key: FormaPag;
  tecla: string;
  label: string;
  shortLabel: string;
  icon: string;
  autoFill: boolean;
}

export const FORMAS_PAGAMENTO: FORMA_OPTION[] = [
  { key: 'DINHEIRO',         tecla: '2', label: '2 Dinheiro',         shortLabel: 'Dinheiro',        icon: 'payments',       autoFill: false },
  { key: 'PIX',              tecla: '3', label: '3 PIX',              shortLabel: 'PIX',             icon: 'pix',            autoFill: false },
  { key: 'POS_DEBITO',       tecla: '4', label: '4 Débito',           shortLabel: 'Débito',          icon: 'credit_card',    autoFill: true },
  { key: 'POS_CREDITO',      tecla: '5', label: '5 Crédito',          shortLabel: 'Crédito',         icon: 'credit_score',   autoFill: true },
  { key: 'VALE_ALIMENTACAO', tecla: '6', label: '6 Vale Alimentação', shortLabel: 'Vale Alimentação',icon: 'local_dining',   autoFill: true },
  { key: 'VALE_REFEICAO',    tecla: '7', label: '7 Vale Refeição',    shortLabel: 'Vale Refeição',   icon: 'restaurant',     autoFill: true },
];

export function calcularResumoPagamentos(totalVenda: number, pagamentos: PagamentoItem[]) {
  const total = Number(totalVenda.toFixed(2));
  const totalPago = Number(
    pagamentos.reduce((acc, p) => acc + Number(p.valor || 0), 0).toFixed(2)
  );

  const falta = Number(Math.max(0, total - totalPago).toFixed(2));

  // Troco exclusivamente para pagamentos em DINHEIRO (PRD v2.0 - Seção 16)
  const totalDinheiro = pagamentos
    .filter((p) => p.formaPagamento === 'DINHEIRO')
    .reduce((acc, p) => acc + Number(p.valor || 0), 0);

  const totalOutros = pagamentos
    .filter((p) => p.formaPagamento !== 'DINHEIRO')
    .reduce((acc, p) => acc + Number(p.valor || 0), 0);

  const saldoPosOutros = Math.max(0, total - totalOutros);
  const troco = totalDinheiro > saldoPosOutros ? Number((totalDinheiro - saldoPosOutros).toFixed(2)) : 0;

  const quitado = falta <= 0;

  return {
    total,
    totalPago,
    falta,
    troco,
    quitado,
  };
}

export function obterValorInicialForma(forma: FormaPag, falta: number): string {
  const option = FORMAS_PAGAMENTO.find((f) => f.key === forma);
  if (!option || !option.autoFill || falta <= 0) {
    return '';
  }
  return falta.toFixed(2).replace('.', ',');
}
