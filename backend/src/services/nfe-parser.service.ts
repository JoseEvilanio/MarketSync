import crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import { AppError } from '../utils/AppError';

// ── Interfaces públicas ───────────────────────────────────────────────────────

export interface NFeItemParseResult {
  codigoFornecedor: string;
  gtin:             string | null;
  descricao:        string;
  ncm:              string;
  cfop:             string;
  unidade:          string;
  quantidade:       number;
  valorUnitario:    number;
  desconto:         number;
  valorTotal:       number;
  // Tributação (nullable — não bloquear importação por ausência)
  cest:        string | null;
  csosn:       string | null;
  cst:         string | null;
  valorIcms:   number;
  valorIpi:    number;
  valorPis:    number;
  valorCofins: number;
}

export type SituacaoFiscalNfe = 'AUTORIZADA' | 'CANCELADA' | 'DENEGADA' | 'DESCONHECIDA';

export interface NFeParseResult {
  chaveAcesso:      string;
  numero:           string;
  serie:            string;
  modelo:           string;
  dataEmissao:      Date;
  dataEntrada:      Date | null;
  protocolo:        string | null;
  dataAutorizacao:  Date | null;
  situacaoFiscal:   SituacaoFiscalNfe;
  emitente: {
    cnpj: string;
    nome: string;
  };
  destinatario: {
    cnpj: string;
    nome: string;
  } | null;
  valorTotal: number;
  xmlHash:    string;
  itens:      NFeItemParseResult[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function toStr(v: any): string | null {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  return String(v).trim();
}

function parseData(raw: any): Date | null {
  if (!raw) return null;
  try {
    const d = new Date(String(raw));
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Mapeia o cStat do protocolo SEFAZ para o enum SituacaoFiscalNfe.
 * Referência: Manual de Orientação do Contribuinte (MOC) — tabela de cStat.
 */
function cStatParaSituacao(cStat: any): SituacaoFiscalNfe {
  const cod = parseInt(String(cStat ?? '0'), 10);
  // 100 = Uso autorizado
  if (cod === 100) return 'AUTORIZADA';
  // 101 = Cancelamento de NF-e homologado / 151 = Cancelamento de NF-e homologado fora do prazo
  if (cod === 101 || cod === 151 || cod === 135 || cod === 155) return 'CANCELADA';
  // 110 = Uso Denegado / 301 = Uso Denegado: irregularidade fiscal / 302 = Uso Denegado: irregularidade fiscal (emitente)
  if (cod === 110 || cod === 301 || cod === 302) return 'DENEGADA';
  return 'DESCONHECIDA';
}

/**
 * Extrai a chave de acesso (44 dígitos) — 5 estratégias em cascata.
 */
function extrairChave(nfeNode: any, protNode: any, infNFe: any, emit: any, ide: any): string {
  // 1. protNFe/infProt/chNFe (NF-e autorizada — mais comum)
  const chProto = protNode?.infProt?.chNFe;
  if (chProto) {
    const ch = String(chProto).replace(/\D/g, '');
    if (ch.length === 44) return ch;
  }

  // 2 e 3. Atributo @Id da tag infNFe
  for (const attrId of [infNFe?.['@_Id'], nfeNode?.infNFe?.['@_Id'], nfeNode?.['@_Id']]) {
    if (!attrId) continue;
    const ch = String(attrId).replace(/^NFe/i, '').replace(/\D/g, '');
    if (ch.length === 44) return ch;
  }

  // 4. chNFe direto em infNFe ou ide
  const chDireto = infNFe?.chNFe ?? ide?.chNFe;
  if (chDireto) {
    const ch = String(chDireto).replace(/\D/g, '');
    if (ch.length === 44) return ch;
  }

  // 5. Construir a partir dos campos do ide
  // cUF(2)+AAMM(4)+CNPJ(14)+mod(2)+serie(3)+nNF(9)+tpEmis(1)+cNF(8)+cDV(1)
  try {
    if (ide && emit) {
      const cUF    = String(ide?.cUF ?? '').padStart(2, '0');
      const dhEmi  = String(ide?.dhEmi ?? ide?.dEmi ?? '');
      const aamm   = dhEmi.replace(/\D/g, '').substring(2, 6);
      const cnpj   = String(emit?.CNPJ ?? '').replace(/\D/g, '').padStart(14, '0');
      const mod    = String(ide?.mod ?? '55').padStart(2, '0');
      const serie  = String(ide?.serie ?? '').padStart(3, '0');
      const nNF    = String(ide?.nNF ?? '').padStart(9, '0');
      const tpEmis = String(ide?.tpEmis ?? '1');
      const cNF    = String(ide?.cNF ?? '').padStart(8, '0');
      const cDV    = String(ide?.cDV ?? '');
      const ch     = `${cUF}${aamm}${cnpj}${mod}${serie}${nNF}${tpEmis}${cNF}${cDV}`.replace(/\D/g, '');
      if (ch.length === 44) return ch;
    }
  } catch { /* ignora */ }

  throw new AppError(
    'Chave de acesso não encontrada no XML da NF-e. ' +
    'Verifique se o arquivo é uma NF-e válida (modelo 55 ou 65).',
    422
  );
}

/**
 * Extrai valores tributários de um item (det.imposto).
 * Suporta os principais regimes: Lucro Real, Lucro Presumido e Simples Nacional.
 */
function extrairImpostos(imposto: any) {
  const icmsGrupo = imposto?.ICMS;
  // ICMS pode estar em vários sub-grupos (ICMS00, ICMS10, ICMS20, ICMSSN102, etc.)
  let valorIcms = 0;
  if (icmsGrupo) {
    for (const sub of Object.values(icmsGrupo)) {
      const v = toFloat((sub as any)?.vICMS ?? (sub as any)?.vICMSSTRet ?? 0);
      if (v > 0) { valorIcms = v; break; }
    }
  }

  const ipiGrupo = imposto?.IPI;
  const valorIpi = toFloat(ipiGrupo?.IPITrib?.vIPI ?? 0);

  const pisGrupo = imposto?.PIS;
  const valorPis = toFloat(
    pisGrupo?.PISAliq?.vPIS ?? pisGrupo?.PISQtde?.vPIS ?? pisGrupo?.PISNT?.vPIS ?? 0
  );

  const cofinsGrupo = imposto?.COFINS;
  const valorCofins = toFloat(
    cofinsGrupo?.COFINSAliq?.vCOFINS ?? cofinsGrupo?.COFINSQtde?.vCOFINS ?? cofinsGrupo?.COFINSNT?.vCOFINS ?? 0
  );

  // CSOSN (Simples Nacional) ou CST (demais regimes)
  let csosn: string | null = null;
  let cst:   string | null = null;
  if (icmsGrupo) {
    for (const sub of Object.values(icmsGrupo)) {
      if ((sub as any)?.CSOSN) { csosn = String((sub as any).CSOSN); break; }
      if ((sub as any)?.CST)   { cst   = String((sub as any).CST);   break; }
    }
  }

  return { valorIcms, valorIpi, valorPis, valorCofins, csosn, cst };
}

// ── Função principal ──────────────────────────────────────────────────────────

export function parseNFeXml(xmlContent: string): NFeParseResult {
  // Hash SHA-256 do XML original
  const xmlHash = crypto.createHash('sha256').update(xmlContent, 'utf8').digest('hex');

  const parser = new XMLParser({
    ignoreAttributes:   false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    parseTagValue:       true,
    trimValues:          true,
    isArray: (name) => ['det'].includes(name),
  });

  let parsed: any;
  try {
    parsed = parser.parse(xmlContent);
  } catch (err: any) {
    throw new AppError(`XML inválido: ${err.message}`, 422);
  }

  const root     = parsed?.nfeProc ?? parsed?.NFeProc ?? parsed?.nfeProcNFe ?? parsed;
  const nfeNode  = root?.NFe ?? root?.nfe ?? (parsed?.NFe ? parsed : null);
  if (!nfeNode) throw new AppError('Arquivo não é uma NF-e válida (tag NFe não encontrada)', 422);

  const infNFe = nfeNode?.infNFe ?? nfeNode?.NFe?.infNFe;
  if (!infNFe) throw new AppError('Estrutura da NF-e inválida: infNFe ausente', 422);

  const ide      = infNFe?.ide;
  const emit     = infNFe?.emit;
  const dest     = infNFe?.dest;
  const total    = infNFe?.total?.ICMSTot;
  const protNode = root?.protNFe ?? root?.retAutorizNFe;

  if (!ide || !emit) throw new AppError('NF-e inválida: ide ou emit ausentes', 422);

  const chaveAcesso = extrairChave(nfeNode, protNode, infNFe, emit, ide);

  // Emitente
  const cnpjEmit = String(emit?.CNPJ ?? emit?.CPF ?? '').replace(/\D/g, '');
  if (!cnpjEmit) throw new AppError('CNPJ do emitente não encontrado no XML', 422);

  // Destinatário
  const cnpjDest = String(dest?.CNPJ ?? dest?.CPF ?? '').replace(/\D/g, '');
  const destinatario = cnpjDest
    ? { cnpj: cnpjDest, nome: String(dest?.xNome ?? '').trim() }
    : null;

  // Datas
  const dataEmissao = parseData(ide?.dhEmi ?? ide?.dEmi);
  if (!dataEmissao) throw new AppError('Data de emissão inválida no XML', 422);
  const dataEntrada = parseData(ide?.dhSaiEnt ?? ide?.dSaiEnt ?? null);

  // Protocolo e situação fiscal
  const protocolo       = toStr(protNode?.infProt?.nProt);
  const dataAutorizacao = parseData(protNode?.infProt?.dhRecbto);
  const situacaoFiscal  = cStatParaSituacao(protNode?.infProt?.cStat);

  const valorTotal = toFloat(total?.vNF ?? total?.vProd ?? 0);
  const modelo     = String(ide?.mod ?? '55');

  // Itens
  const detList: any[] = Array.isArray(infNFe?.det)
    ? infNFe.det
    : infNFe?.det ? [infNFe.det] : [];

  if (detList.length === 0) throw new AppError('NF-e sem itens (det vazio)', 422);

  const itens: NFeItemParseResult[] = detList.map((det: any, idx: number) => {
    const prod = det?.prod;
    if (!prod) throw new AppError(`Item ${idx + 1} sem dados de produto (prod)`, 422);

    const { valorIcms, valorIpi, valorPis, valorCofins, csosn, cst } =
      extrairImpostos(det?.imposto);

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
      cest:             toStr(prod?.CEST),
      csosn,
      cst,
      valorIcms,
      valorIpi,
      valorPis,
      valorCofins,
    };
  });

  return {
    chaveAcesso,
    numero:          String(ide?.nNF ?? '').trim(),
    serie:           String(ide?.serie ?? '').trim(),
    modelo,
    dataEmissao,
    dataEntrada,
    protocolo,
    dataAutorizacao,
    situacaoFiscal,
    emitente:        { cnpj: cnpjEmit, nome: String(emit?.xNome ?? emit?.xFant ?? '').trim() },
    destinatario,
    valorTotal,
    xmlHash,
    itens,
  };
}
