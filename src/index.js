require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const agenteAuthRoutes = require('./routes/agenteAuth');
const adminAuthRoutes = require('./routes/adminAuth');
const documentosRoutes = require('./routes/documentos');
const pagamentosRoutes = require('./routes/pagamentos');
const adminUtilizadoresRoutes = require('./routes/adminUtilizadores');
const adminAgentesRoutes = require('./routes/adminAgentes');

const app = express();

// Necessario em plataformas com proxy reverso (Render, Fly, Heroku)
app.set('trust proxy', 1);

function parseCorsOrigins(value) {
  if (!value || value.trim() === '*') {
    return '*';
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// ─── Segurança ───────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: parseCorsOrigins(process.env.CORS_ORIGIN),
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting — 100 pedidos por 15 minutos por IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Demasiados pedidos. Tente novamente mais tarde.' },
});
app.use(limiter);

// Rate limiting mais restritivo para rotas de autenticação
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { erro: 'Demasiadas tentativas de autenticação. Aguarde 15 minutos.' },
});

app.use(express.json({ limit: '5mb' }));

// ─── Rotas ───────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/agente/auth', authLimiter, agenteAuthRoutes);
app.use('/api/admin/auth', authLimiter, adminAuthRoutes);

app.use('/api/documentos', documentosRoutes);
app.use('/api/pagamentos', pagamentosRoutes);
app.use('/api/admin/utilizadores', adminUtilizadoresRoutes);
app.use('/api/admin/agentes', adminAgentesRoutes);

// ─── Health check ────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 404 ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

// ─── Error Handler ───────────────────────────────────────────
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AcheiDoc API a correr em http://localhost:${PORT}`);
});
