import { XMLParser } from 'fast-xml-parser';
import { AppError } from '../utils/AppError';

// ── Interfaces públicas ───────────────────────────────────────────────────────

export interface NFeItemParseResult {
  codigoFornecedor: string;
  gtin: string | null;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  desconto: number;
  valorTotal: number;
}

export interface NFeParseResult {
  chaveAcesso: string;
  numero: string;
  serie: string;
  dataEmissao: Date;
  dataEntrada: Date | null;
  emitente: {
    cnpj: string;
    nome: string;
  };
  valorTotal: number;
  itens: NFeItemParseResult[];
}

// ── Parser ────────────────────────────────────────────────────────────────────

const GTIN_VAZIO = new Set(['0', '00000000000000', 'SEM GTIN', 'SEM CODIGO', '']);

function normalizarGtin(raw: any): string | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return GTIN_VAZIO.has(s) ? null : s;
}

function toFloat(v: any): number {
  const n = parseFloat(String(v ?? 0));
  return isNaN(n) ? 0 : n;
}

function parseData(raw: any): Date | null {
  if (!raw) return null;
  try {
    // Suporta "2026-08-08T10:30:00-03:00" e "2026-08-08"
    const d = new Date(String(raw));
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Extrai a chave de acesso (44 dígitos) de várias posições possíveis no XML.
 * 1. protNFe/infProt/chNFe
 * 2. Atributo Id da tag infNFe (remove prefixo "NFe")
 * 3. NFe/infNFe/ide — monta a chave a partir dos campos da NF-e
 */
function extrairChave(nfeNode: any, protNode: any): string {
  // Opção 1: protNFe
  const chProto = protNode?.infProt?.chNFe;
  if (chProto && String(chProto).replace(/\D/g, '').length === 44) {
    return String(chProto).replace(/\D/g, '');
  }

  // Opção 2: atributo Id da infNFe
  const attrId: string = nfeNode?.infNFe?.['@_Id'] ?? '';
  const chId = attrId.replace(/^NFe/, '').replace(/\D/g, '');
  if (chId.length === 44) return chId;

  throw new AppError('Chave de acesso não encontrada no XML da NF-e', 422);
}

export function parseNFeXml(xmlContent: string): NFeParseResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    parseTagValue: true,
    trimValues: true,
    // Forçar arrays nos nós que podem aparecer como objeto único
    isArray: (name) => ['det'].includes(name),
  });

  let parsed: any;
  try {
    parsed = parser.parse(xmlContent);
  } catch (err: any) {
    throw new AppError(`XML inválido: ${err.message}`, 422);
  }

  // Suporta nfeProcNFe (NF-e processada) e NFeProc (variação)
  const root = parsed?.nfeProc ?? parsed?.NFeProc ?? parsed?.nfeProcNFe ?? parsed;

  const nfeNode = root?.NFe ?? root?.nfe;
  if (!nfeNode) throw new AppError('Arquivo não é uma NF-e válida (tag NFe não encontrada)', 422);

  const infNFe = nfeNode?.infNFe;
  if (!infNFe) throw new AppError('Estrutura da NF-e inválida: infNFe ausente', 422);

  const ide    = infNFe?.ide;
  const emit   = infNFe?.emit;
  const total  = infNFe?.total?.ICMSTot;
  const protNode = root?.protNFe ?? root?.retAutorizNFe;

  if (!ide || !emit) throw new AppError('NF-e inválida: ide ou emit ausentes', 422);

  // Chave de acesso
  const chaveAcesso = extrairChave(nfeNode, protNode);

  // Emitente
  const cnpj = String(emit?.CNPJ ?? emit?.CPF ?? '').replace(/\D/g, '');
  const nome  = String(emit?.xNome ?? emit?.xFant ?? '').trim();
  if (!cnpj) throw new AppError('CNPJ do emitente não encontrado no XML', 422);

  // Datas
  const dataEmissao = parseData(ide?.dhEmi ?? ide?.dEmi);
  if (!dataEmissao) throw new AppError('Data de emissão inválida no XML', 422);
  const dataEntrada = parseData(ide?.dhSaiEnt ?? ide?.dSaiEnt ?? null);

  // Valor total
  const valorTotal = toFloat(total?.vNF ?? total?.vProd ?? 0);

  // Itens — det pode ser array ou objeto único (já forçamos array no parser)
  const detList: any[] = Array.isArray(infNFe?.det)
    ? infNFe.det
    : infNFe?.det
    ? [infNFe.det]
    : [];

  if (detList.length === 0) throw new AppError('NF-e sem itens (det vazio)', 422);

  const itens: NFeItemParseResult[] = detList.map((det: any, idx: number) => {
    const prod = det?.prod;
    if (!prod) throw new AppError(`Item ${idx + 1} sem dados de produto (prod)`, 422);

    return {
      codigoFornecedor: String(prod?.cProd ?? '').trim(),
      gtin:             normalizarGtin(prod?.cEAN),
      descricao:        String(prod?.xProd ?? '').trim(),
      ncm:              String(prod?.NCM ?? '').trim(),
      cfop:             String(prod?.CFOP ?? '').trim(),
      unidade:          String(prod?.uCom ?? prod?.uTrib ?? 'UN').trim(),
      quantidade:       toFloat(prod?.qCom ?? prod?.qTrib ?? 0),
      valorUnitario:    toFloat(prod?.vUnCom ?? prod?.vUnTrib ?? 0),
      desconto:         toFloat(prod?.vDesc ?? 0),
      valorTotal:       toFloat(prod?.vProd ?? 0),
    };
  });

  return {
    chaveAcesso,
    numero:      String(ide?.nNF ?? '').trim(),
    serie:       String(ide?.serie ?? '').trim(),
    dataEmissao,
    dataEntrada,
    emitente:    { cnpj, nome },
    valorTotal,
    itens,
  };
}
