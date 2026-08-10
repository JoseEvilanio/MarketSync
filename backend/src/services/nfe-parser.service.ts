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
 * Extrai a chave de acesso (44 dígitos) de todas as posições possíveis no XML.
 *
 * Casos reais encontrados em NF-e brasileiras:
 * 1. nfeProc/protNFe/infProt/chNFe          — NF-e autorizada (mais comum)
 * 2. NFe/infNFe @Id="NFe{44 dígitos}"       — atributo Id da tag infNFe
 * 3. nfeProc/NFe/infNFe @Id="NFe{44 dígitos}"
 * 4. Construída a partir dos campos ide      — cUF+AAMM+CNPJ+mod+serie+nNF+tpEmis+cNF+cDV
 */
function extrairChave(nfeNode: any, protNode: any, infNFe: any, emit: any, ide: any): string {
  // ── Opção 1: protNFe/infProt/chNFe (NF-e autorizada) ────────────────────
  const chProto = protNode?.infProt?.chNFe;
  if (chProto) {
    const ch = String(chProto).replace(/\D/g, '');
    if (ch.length === 44) return ch;
  }

  // ── Opção 2 e 3: atributo @Id da tag infNFe ──────────────────────────────
  // O atributo pode estar em infNFe diretamente ou em nfeNode.infNFe
  const candidatosId = [
    infNFe?.['@_Id'],
    nfeNode?.infNFe?.['@_Id'],
    nfeNode?.['@_Id'],
  ];
  for (const attrId of candidatosId) {
    if (!attrId) continue;
    const ch = String(attrId).replace(/^NFe/i, '').replace(/\D/g, '');
    if (ch.length === 44) return ch;
  }

  // ── Opção 4: cChave ou chNFe direto em infNFe ou ide ────────────────────
  const chDireto = infNFe?.chNFe ?? ide?.chNFe;
  if (chDireto) {
    const ch = String(chDireto).replace(/\D/g, '');
    if (ch.length === 44) return ch;
  }

  // ── Opção 5: construir a partir dos campos de ide ────────────────────────
  // cUF(2) + AAMM(4) + CNPJ(14) + mod(2) + serie(3) + nNF(9) + tpEmis(1) + cNF(8) + cDV(1)
  try {
    if (ide && emit) {
      const cUF   = String(ide?.cUF   ?? '').padStart(2, '0');
      const dhEmi = String(ide?.dhEmi ?? ide?.dEmi ?? '');
      const aamm  = dhEmi.replace(/\D/g, '').substring(2, 6); // AAMM
      const cnpj  = String(emit?.CNPJ ?? '').replace(/\D/g, '').padStart(14, '0');
      const mod   = String(ide?.mod   ?? '55').padStart(2, '0');
      const serie = String(ide?.serie ?? '').padStart(3, '0');
      const nNF   = String(ide?.nNF   ?? '').padStart(9, '0');
      const tpEmis = String(ide?.tpEmis ?? '1');
      const cNF   = String(ide?.cNF   ?? '').padStart(8, '0');
      const cDV   = String(ide?.cDV   ?? '');
      const ch    = `${cUF}${aamm}${cnpj}${mod}${serie}${nNF}${tpEmis}${cNF}${cDV}`.replace(/\D/g, '');
      if (ch.length === 44) return ch;
    }
  } catch { /* ignora */ }

  throw new AppError(
    'Chave de acesso não encontrada no XML da NF-e. ' +
    'Verifique se o arquivo é uma NF-e válida (modelo 55 ou 65) e tente novamente.',
    422
  );
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

  // Suporta todas as variações de envelope NF-e encontradas na prática:
  // - nfeProc (NF-e processada/autorizada — mais comum)
  // - NFeProc (variação de capitalização)
  // - NFe diretamente na raiz (sem envelope de protocolo)
  // - nfeProcNFe (variação rara)
  const root = parsed?.nfeProc ?? parsed?.NFeProc ?? parsed?.nfeProcNFe ?? parsed;

  // A tag NFe pode estar dentro do envelope ou na raiz
  const nfeNode = root?.NFe ?? root?.nfe ?? (parsed?.NFe ? parsed : null);
  if (!nfeNode) throw new AppError('Arquivo não é uma NF-e válida (tag NFe não encontrada)', 422);

  const infNFe = nfeNode?.infNFe ?? nfeNode?.NFe?.infNFe;
  if (!infNFe) throw new AppError('Estrutura da NF-e inválida: infNFe ausente', 422);

  const ide    = infNFe?.ide;
  const emit   = infNFe?.emit;
  const total  = infNFe?.total?.ICMSTot;
  const protNode = root?.protNFe ?? root?.retAutorizNFe;

  if (!ide || !emit) throw new AppError('NF-e inválida: ide ou emit ausentes', 422);

  // Chave de acesso
  const chaveAcesso = extrairChave(nfeNode, protNode, infNFe, emit, ide);

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
