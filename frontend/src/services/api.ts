import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Injetar token automaticamente
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('auth-storage');
  if (stored) {
    try {
      const { state } = JSON.parse(stored);
      if (state?.token) config.headers.Authorization = `Bearer ${state.token}`;
    } catch { /* ignore */ }
  }
  return config;
});

// Tratar erros globalmente
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const msg = err.response?.data?.erro || 'Erro de comunicação com o servidor';

    if (status === 401) {
      localStorage.removeItem('auth-storage');
      window.location.href = '/login';
      return Promise.reject(err);
    }

    if (status !== 404) toast.error(msg);
    return Promise.reject(err);
  }
);

export default api;

// ── Helpers de serviço ────────────────────────────────────────────────────────

export const authService = {
  login: (email: string, senha: string) =>
    api.post('/auth/login', { email, senha }).then((r) => r.data),
  perfil: () => api.get('/auth/perfil').then((r) => r.data),
};

export const produtosService = {
  listar: (params?: object) => api.get('/produtos', { params }).then((r) => r.data),
  buscarBarras: (codigo: string) => api.get(`/produtos/barras/${codigo}`).then((r) => r.data),
  buscarId: (id: string) => api.get(`/produtos/${id}`).then((r) => r.data),
  criar: (data: object) => api.post('/produtos', data).then((r) => r.data),
  atualizar: (id: string, data: object) => api.put(`/produtos/${id}`, data).then((r) => r.data),
  remover: (id: string) => api.delete(`/produtos/${id}`),
  alteracaoEmMassa: (data: object) => api.put('/produtos/massa', data).then((r) => r.data),
};

export const categoriasService = {
  listar: (params?: object) => api.get('/categorias', { params }).then((r) => r.data),
  criar: (data: object) => api.post('/categorias', data).then((r) => r.data),
  atualizar: (id: string, data: object) => api.put(`/categorias/${id}`, data).then((r) => r.data),
  remover: (id: string) => api.delete(`/categorias/${id}`),
};

export const clientesService = {
  listar: (params?: object) => api.get('/clientes', { params }).then((r) => r.data),
  buscarId: (id: string) => api.get(`/clientes/${id}`).then((r) => r.data),
  criar: (data: object) => api.post('/clientes', data).then((r) => r.data),
  atualizar: (id: string, data: object) => api.put(`/clientes/${id}`, data).then((r) => r.data),
  remover: (id: string) => api.delete(`/clientes/${id}`),
};

export const fornecedoresService = {
  listar: (params?: object) => api.get('/fornecedores', { params }).then((r) => r.data),
  buscarId: (id: string) => api.get(`/fornecedores/${id}`).then((r) => r.data),
  criar: (data: object) => api.post('/fornecedores', data).then((r) => r.data),
  atualizar: (id: string, data: object) => api.put(`/fornecedores/${id}`, data).then((r) => r.data),
  remover: (id: string) => api.delete(`/fornecedores/${id}`),
};

export const caixaService = {
  atual: () => api.get('/caixa/atual').then((r) => r.data),
  historico: (params?: object) => api.get('/caixa/historico', { params }).then((r) => r.data),
  abrir: (valorAbertura: number) => api.post('/caixa/abrir', { valorAbertura }).then((r) => r.data),
  fechar: (data: object) => api.post('/caixa/fechar', data).then((r) => r.data),
  sangria: (data: object) => api.post('/caixa/sangria', data).then((r) => r.data),
  suprimento: (data: object) => api.post('/caixa/suprimento', data).then((r) => r.data),
};

export const vendasService = {
  listar: (params?: object) => api.get('/vendas', { params }).then((r) => r.data),
  buscarId: (id: string) => api.get(`/vendas/${id}`).then((r) => r.data),
  registrar: (data: object) => api.post('/vendas', data).then((r) => r.data),
  cancelar: (id: string, motivo: string) =>
    api.post(`/vendas/${id}/cancelar`, { motivo }).then((r) => r.data),
  auditoriaEvento: (acao: string, detalhes?: object) =>
    api.post('/vendas/auditoria-evento', { acao, detalhes }).then((r) => r.data),
};

export const estoqueService = {
  historico: (params?: object) => api.get('/estoque/historico', { params }).then((r) => r.data),
  critico: () => api.get('/estoque/critico').then((r) => r.data),
  inventario: (params?: object) => api.get('/estoque/inventario', { params }).then((r) => r.data),
  ajustar: (data: object) => api.post('/estoque/ajuste', data).then((r) => r.data),
};

export const comprasService = {
  listar: (params?: object) => api.get('/compras', { params }).then((r) => r.data),
  buscarId: (id: string) => api.get(`/compras/${id}`).then((r) => r.data),
  criar: (data: object) => api.post('/compras', data).then((r) => r.data),
  concluir: (id: string) => api.post(`/compras/${id}/concluir`).then((r) => r.data),
  cancelar: (id: string) => api.post(`/compras/${id}/cancelar`).then((r) => r.data),
};

export const relatoriosService = {
  dashboard: () => api.get('/relatorios/dashboard').then((r) => r.data),
  vendasPeriodo: (params?: object) =>
    api.get('/relatorios/vendas/periodo', { params }).then((r) => r.data),
  vendasProduto: (params?: object) =>
    api.get('/relatorios/vendas/produtos', { params }).then((r) => r.data),
  vendasOperador: (params?: object) =>
    api.get('/relatorios/vendas/operadores', { params }).then((r) => r.data),
  estoqueCritico: () => api.get('/relatorios/estoque/critico').then((r) => r.data),
  caixa: (params?: object) => api.get('/relatorios/caixa', { params }).then((r) => r.data),
};

export const backupService = {
  listar: () => api.get('/backup').then((r) => r.data),
  executar: () => api.post('/backup/executar').then((r) => r.data),
  download: (nome: string): Promise<Blob> =>
    api
      .get(`/backup/download/${encodeURIComponent(nome)}`, { responseType: 'blob', timeout: 120_000 })
      .then((r) => r.data as Blob),
  exportarSistema: (): Promise<Blob> =>
    api
      .post('/backup/exportar-sistema', null, { responseType: 'blob', timeout: 120_000 })
      .then((r) => r.data as Blob),
  restaurarSistema: (file: File, onProgress?: (pct: number) => void): Promise<void> => {
    const form = new FormData();
    form.append('arquivo', file);
    return api
      .post('/backup/restaurar-sistema', form, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-Confirm': 'true',
        },
        timeout: 300_000,
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
        },
      })
      .then(() => undefined);
  },
};

export const configService = {
  getEmpresa: (): Promise<{ empresa: string; primeiroAcesso: boolean; versao: string }> =>
    api.get('/config/empresa').then((r) => r.data),
  getConfig: () => api.get('/config').then((r) => r.data),
  updateConfig: (data: Record<string, unknown>) =>
    api.put('/config', data).then((r) => r.data),
  setupInicial: (data: { empresa: string; impressora?: { cupom?: string; etiquetas?: string } }) =>
    api.post('/config/setup', data).then((r) => r.data),
};

export const usuariosService = {
  listar: () => api.get('/usuarios').then((r) => r.data),
  buscarId: (id: string) => api.get(`/usuarios/${id}`).then((r) => r.data),
  criar: (data: object) => api.post('/usuarios', data).then((r) => r.data),
  atualizar: (id: string, data: object) => api.put(`/usuarios/${id}`, data).then((r) => r.data),
  remover: (id: string) => api.delete(`/usuarios/${id}`),
};

export const configuracoesService = {
  listar: () => api.get('/configuracoes').then((r) => r.data),
  atualizar: (data: object) => api.put('/configuracoes', data).then((r) => r.data),
};

export const authSenhaService = {
  alterar: (data: { senhaAtual: string; novaSenha: string }) =>
    api.put('/auth/senha', data).then((r) => r.data),
};

// ── NF-e e Recebimento v2.0 ───────────────────────────────────────────────────

export const pedidosService = {
  dashboard: () =>
    api.get('/compras/pedidos/dashboard').then((r) => r.data),
  listar: (params?: object) =>
    api.get('/compras/pedidos', { params }).then((r) => r.data),
  buscarId: (id: string) =>
    api.get(`/compras/pedidos/${id}`).then((r) => r.data),
  criar: (data: object) =>
    api.post('/compras/pedidos', data).then((r) => r.data),
  atualizar: (id: string, data: object) =>
    api.put(`/compras/pedidos/${id}`, data).then((r) => r.data),
  abrir: (id: string) =>
    api.post(`/compras/pedidos/${id}/abrir`).then((r) => r.data),
  enviar: (id: string) =>
    api.post(`/compras/pedidos/${id}/enviar`).then((r) => r.data),
  cancelar: (id: string) =>
    api.post(`/compras/pedidos/${id}/cancelar`).then((r) => r.data),
};

export const notasFiscaisService = {
  listar: (params?: object) =>
    api.get('/compras/notas-fiscais', { params }).then((r) => r.data),
  buscarId: (id: string) =>
    api.get(`/compras/notas-fiscais/${id}`).then((r) => r.data),
  importar: (arquivo: File, onProgress?: (pct: number) => void) => {
    const form = new FormData();
    form.append('arquivo', arquivo);
    return api.post('/compras/notas-fiscais/importar', form, {
      headers:  { 'Content-Type': 'multipart/form-data' },
      timeout:  60_000,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
      },
    }).then((r) => r.data);
  },
  vincularPedido: (id: string, pedidoIds: string[]) =>
    api.post(`/compras/notas-fiscais/${id}/vincular-pedido`, { pedidoIds }).then((r) => r.data),
  identificarProduto: (id: string, data: { notaFiscalItemId: string; produtoId: string; salvarRelacionamento?: boolean }) =>
    api.post(`/compras/notas-fiscais/${id}/identificar-produto`, data).then((r) => r.data),
  getConferencia: (id: string) =>
    api.get(`/compras/notas-fiscais/${id}/conferencia`).then((r) => r.data),
  receber: (id: string, data: { itens: object[]; observacao?: string }) =>
    api.post(`/compras/notas-fiscais/${id}/receber`, data).then((r) => r.data),
  cancelar: (id: string) =>
    api.post(`/compras/notas-fiscais/${id}/cancelar`).then((r) => r.data),
  estornar: (id: string) =>
    api.post(`/compras/notas-fiscais/${id}/estornar`).then((r) => r.data),
};

export const recebimentosService = {
  listar: (params?: object) =>
    api.get('/compras/recebimentos', { params }).then((r) => r.data),
  buscarId: (id: string) =>
    api.get(`/compras/recebimentos/${id}`).then((r) => r.data),
  listarDivergencias: (params?: object) =>
    api.get('/compras/recebimentos/divergencias', { params }).then((r) => r.data),
  resolverDivergencia: (id: string, data: { quantidadeAceita?: number; observacao: string; ignorar?: boolean }) =>
    api.post(`/compras/recebimentos/divergencias/${id}/resolver`, data).then((r) => r.data),
};
