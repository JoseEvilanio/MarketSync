import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { authService } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(1, 'Informe a senha'),
});
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: Form) {
    setLoading(true);
    try {
      const res = await authService.login(data.email, data.senha);
      login(res.token, res.usuario);
      toast.success(`Bem-vindo, ${res.usuario.nome}!`);
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.erro || 'Credenciais inválidas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4">
      {/* Background decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-secondary/10 rounded-full" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-secondary/10 rounded-full" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 rounded-2xl mb-4 shadow-modal p-2 border border-white/20">
            <img src="/logo.png" alt="MercadoPro ERP Logo" className="w-full h-full object-contain rounded-xl" />
          </div>
          <h1 className="text-[32px] font-black text-on-primary">MercadoPro ERP</h1>
          <p className="text-primary-fixed-dim text-body-md mt-1">Sistema ERP Local para Mercadinhos</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-modal p-8">
          <h2 className="text-headline-md font-semibold text-on-surface mb-6">Entrar no sistema</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">E-mail</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                  email
                </span>
                <input
                  {...register('email')}
                  type="email"
                  placeholder="seu@email.com"
                  className="input pl-10"
                  autoFocus
                />
              </div>
              {errors.email && <p className="text-error text-body-sm mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                  lock
                </span>
                <input
                  {...register('senha')}
                  type="password"
                  placeholder="••••••"
                  className="input pl-10"
                />
              </div>
              {errors.senha && <p className="text-error text-body-sm mt-1">{errors.senha.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full h-11 mt-2 text-body-md"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Entrando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">login</span>
                  Entrar
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-primary-fixed-dim text-body-sm mt-6">
          v1.0.0 · 100% Local · Sem internet necessária
        </p>
      </div>
    </div>
  );
}
