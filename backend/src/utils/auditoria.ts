import prisma from '../config/prisma';

interface AuditoriaParams {
  usuarioId?: string;
  acao: string;
  tabela?: string;
  registroId?: string;
  dadosAntes?: object;
  dadosDepois?: object;
  ip?: string;
}

export async function registrarAuditoria(params: AuditoriaParams): Promise<void> {
  try {
    await prisma.auditoria.create({
      data: {
        usuarioId: params.usuarioId,
        acao: params.acao,
        tabela: params.tabela,
        registroId: params.registroId,
        dadosAntes: params.dadosAntes as any,
        dadosDepois: params.dadosDepois as any,
        ip: params.ip,
      },
    });
  } catch {
    // Falha silenciosa na auditoria não deve interromper a operação principal
  }
}
