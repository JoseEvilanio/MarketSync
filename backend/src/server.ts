import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { appConfig } from './config/appConfig';
import routes from './routes';
import { errorHandler } from './middlewares/error.middleware';
import { logEvent } from './utils/logger';
import { agendarBackup } from './utils/backup';

// Garantir que a pasta de logs existe
const logsDir = path.resolve(__dirname, '..', appConfig.sistema.logDir);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const app = express();

// Segurança
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS — em ambiente local libera tudo
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);

// Rate limiting
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { erro: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Uploads de imagens de produtos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Rotas da API
app.use('/api', routes);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    versao: appConfig.sistema.versao,
    banco: 'conectado',
    empresa: appConfig.empresa,
    timestamp: new Date().toISOString(),
  });
});

// ── Produção: servir frontend compilado ───────────────────────────────────────
// Em produção o build do Vite vai para backend/public/ (vite.config.ts → outDir)
if (env.NODE_ENV === 'production') {
  const publicDir = path.resolve(__dirname, '../public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));

    // SPA fallback — qualquer rota não-API devolve o index.html do React
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path === '/health') {
        return next();
      }
      res.sendFile(path.join(publicDir, 'index.html'));
    });

    logEvent({ nivel: 'info', modulo: 'sistema', mensagem: `Frontend servido de: ${publicDir}` });
  } else {
    logEvent({
      nivel: 'warn',
      modulo: 'sistema',
      mensagem: `Pasta public/ não encontrada em ${publicDir}. Execute 'npm run build' no frontend.`,
    });
  }
}

// Handler de erros (deve ser o último middleware)
app.use(errorHandler);

// Iniciar servidor
app.listen(env.PORT, '0.0.0.0', () => {
  logEvent({
    nivel: 'info',
    modulo: 'sistema',
    mensagem: `🚀 Servidor iniciado na porta ${env.PORT} [${env.NODE_ENV}] v${appConfig.sistema.versao}`,
  });

  // Agendar backup automático em produção (e também em dev se configurado)
  agendarBackup();
});

export default app;
