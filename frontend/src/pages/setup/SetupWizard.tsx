import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { configService, backupService } from '@/services/api';

// ── Schemas ───────────────────────────────────────────────────────────────────

const step1Schema = z.object({
  empresa: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
});

const step2Schema = z.object({
  impressoraCupom: z.string().optional(),
  impressoraEtiquetas: z.string().optional(),
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;

// ── Componente ────────────────────────────────────────────────────────────────

const STEPS = ['Empresa', 'Impressoras', 'Dados Iniciais'];

export default function SetupWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [step1Data, setStep1Data] = useState<Step1Data>({ empresa: '' });
  const [step2Data, setStep2Data] = useState<Step2Data>({});
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) });
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });

  // ── Passo 1 → 2 ────────────────────────────────────────────────────────────
  function handleStep1(data: Step1Data) {
    setStep1Data(data);
    setStep(1);
  }

  // ── Passo 2 → 3 ────────────────────────────────────────────────────────────
  function handleStep2(data: Step2Data) {
    setStep2Data(data);
    setStep(2);
  }

  // ── Finalizar: instalação nova ─────────────────────────────────────────────
  async function handleNovo() {
    setLoading(true);
    try {
      await configService.setupInicial({
        empresa: step1Data.empresa,
        impressora: {
          cupom: step2Data.impressoraCupom ?? '',
          etiquetas: step2Data.impressoraEtiquetas ?? '',
        },
      });
      toast.success('Sistema configurado com sucesso! Login: admin@mercadinho.local / Senha: admin123', {
        duration: 7000,
      });
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { erro?: string } } })?.response?.data?.erro ||
        'Erro ao salvar configurações. Verifique o backend.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Finalizar: restaurar backup ────────────────────────────────────────────
  async function handleRestore() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error('Selecione um arquivo .backup');
      return;
    }
    setLoading(true);
    setUploadProgress(0);
    try {
      await backupService.restaurarSistema(file, (pct) => setUploadProgress(pct));
      toast.success('Sistema restaurado com sucesso!');
      navigate('/login');
    } catch {
      toast.error('Falha na restauração. Verifique o arquivo .backup.');
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  }

  // ── Step indicator ─────────────────────────────────────────────────────────
  function StepIndicator() {
    return (
      <div className="flex items-center justify-center gap-0 mb-8">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                  i < step
                    ? 'bg-green-500 border-green-500 text-white'
                    : i === step
                    ? 'bg-primary border-primary text-white'
                    : 'bg-white border-gray-300 text-gray-400'
                }`}
              >
                {i < step ? (
                  <span className="material-symbols-outlined text-[16px]">check</span>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-xs mt-1 font-medium ${
                  i === step ? 'text-primary' : i < step ? 'text-green-600' : 'text-gray-400'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-16 h-0.5 mb-5 mx-1 transition-all ${
                  i < step ? 'bg-green-500' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <img src="/logo.png" alt="MercadoPro ERP Logo" className="w-12 h-12 rounded-xl object-contain shadow-sm shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-on-surface">MercadoPro ERP</h1>
            <p className="text-sm text-on-surface-variant">Assistente de configuração inicial</p>
          </div>
        </div>

        <StepIndicator />

        {/* ── Passo 0: Empresa ── */}
        {step === 0 && (
          <form onSubmit={form1.handleSubmit(handleStep1)} className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-on-surface mb-1">Nome da sua empresa</h2>
              <p className="text-sm text-on-surface-variant mb-4">
                Este nome aparecerá no cabeçalho dos cupons e no sistema.
              </p>
              <label className="block text-sm font-medium text-on-surface mb-1">
                Nome da empresa <span className="text-red-500">*</span>
              </label>
              <input
                {...form1.register('empresa')}
                placeholder="Ex: Mercadinho São José"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
              {form1.formState.errors.empresa && (
                <p className="text-red-500 text-xs mt-1">
                  {form1.formState.errors.empresa.message}
                </p>
              )}
            </div>
            <button
              type="submit"
              className="w-full bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-primary/90 transition"
            >
              Próximo
            </button>
          </form>
        )}

        {/* ── Passo 1: Impressoras ── */}
        {step === 1 && (
          <form onSubmit={form2.handleSubmit(handleStep2)} className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-on-surface mb-1">Impressoras</h2>
              <p className="text-sm text-on-surface-variant mb-4">
                Configure as impressoras agora ou pule — você poderá ajustar em Configurações.
              </p>
              <label className="block text-sm font-medium text-on-surface mb-1">
                Impressora de cupom
              </label>
              <input
                {...form2.register('impressoraCupom')}
                placeholder="Ex: POS-58 ou deixe em branco"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary mb-4"
              />
              <label className="block text-sm font-medium text-on-surface mb-1">
                Impressora de etiquetas
              </label>
              <input
                {...form2.register('impressoraEtiquetas')}
                placeholder="Ex: Zebra ZD220 ou deixe em branco"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="flex-1 border border-outline text-on-surface py-2.5 rounded-lg font-semibold hover:bg-surface-variant transition"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => { setStep2Data({}); setStep(2); }}
                className="flex-1 border border-outline text-on-surface-variant py-2.5 rounded-lg font-medium hover:bg-surface-variant transition"
              >
                Pular
              </button>
              <button
                type="submit"
                className="flex-1 bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-primary/90 transition"
              >
                Próximo
              </button>
            </div>
          </form>
        )}

        {/* ── Passo 2: Dados Iniciais ── */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-on-surface mb-1">Como deseja começar?</h2>
              <p className="text-sm text-on-surface-variant mb-4">
                Inicie com o sistema vazio ou restaure um backup existente de outro computador.
              </p>
            </div>

            {/* Card: instalação nova */}
            <div className="border border-outline rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-2xl">add_circle</span>
                <div>
                  <p className="font-semibold text-on-surface">Começar do zero</p>
                  <p className="text-xs text-on-surface-variant">Sistema vazio com dados padrão</p>
                </div>
              </div>
              <button
                onClick={handleNovo}
                disabled={loading}
                className="w-full bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-primary/90 transition disabled:opacity-60"
              >
                {loading ? 'Salvando...' : 'Configurar e entrar'}
              </button>
            </div>

            {/* Divisor */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-outline" />
              <span className="text-xs text-on-surface-variant">ou</span>
              <div className="flex-1 border-t border-outline" />
            </div>

            {/* Card: restaurar backup */}
            <div className="border border-outline rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary text-2xl">restore</span>
                <div>
                  <p className="font-semibold text-on-surface">Restaurar backup</p>
                  <p className="text-xs text-on-surface-variant">
                    Importar dados de outro computador via arquivo <code>.backup</code>
                  </p>
                </div>
              </div>
              <label className="block w-full cursor-pointer">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".backup"
                  className="hidden"
                  onChange={() => {}} // controlled via ref
                />
                <div className="border-2 border-dashed border-outline rounded-lg p-4 text-center hover:border-primary transition">
                  <span className="material-symbols-outlined text-2xl text-on-surface-variant">upload_file</span>
                  <p className="text-sm text-on-surface-variant mt-1">
                    Clique para selecionar arquivo <code>.backup</code>
                  </p>
                </div>
              </label>

              {/* Barra de progresso */}
              {uploadProgress > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}

              <button
                onClick={handleRestore}
                disabled={loading}
                className="w-full bg-secondary text-on-secondary py-2.5 rounded-lg font-semibold hover:bg-secondary/90 transition disabled:opacity-60"
              >
                {loading ? `Restaurando... ${uploadProgress > 0 ? uploadProgress + '%' : ''}` : 'Restaurar e entrar'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full border border-outline text-on-surface py-2 rounded-lg font-medium hover:bg-surface-variant transition text-sm"
            >
              Voltar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
