require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { query } = require('./db');

const authRoutes = require('./routes/auth');
const agenteAuthRoutes = require('./routes/agenteAuth');
const adminAuthRoutes = require('./routes/adminAuth');
const documentosRoutes = require('./routes/documentos');
const pagamentosRoutes = require('./routes/pagamentos');
const adminUtilizadoresRoutes = require('./routes/adminUtilizadores');
const adminAgentesRoutes = require('./routes/adminAgentes');
const pontosEntregaRoutes = require('./routes/pontosEntrega');
const recompensasRoutes = require('./routes/recompensas');
const statsRoutes = require('./routes/stats');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1);

function parseCorsOrigins(value) {
  if (!value || value.trim() === '*') return '*';
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

function createCorsOriginChecker(allowedOrigins) {
  if (allowedOrigins === '*') return true;

  return (origin, callback) => {
    // Permite chamadas sem Origin (file://, mobile webview, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origem não permitida por CORS'));
  };
}

async function bootstrapAdminFromEnv() {
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const adminNome = (process.env.ADMIN_NOME || 'Administrador').trim();

  if (!adminEmail || !adminPassword) {
    console.warn('ADMIN_EMAIL/ADMIN_PASSWORD não definidos. Bootstrap de admin ignorado.');
    return;
  }

  const existing = await query('SELECT id FROM admin WHERE email = $1', [adminEmail]);
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  if (existing.rows.length) {
    await query('UPDATE admin SET nome = $1, password_hash = $2 WHERE email = $3', [adminNome, passwordHash, adminEmail]);
    console.log(`Admin actualizado via env: ${adminEmail}`);
    return;
  }

  await query('INSERT INTO admin (nome, email, password_hash) VALUES ($1, $2, $3)', [adminNome, adminEmail, passwordHash]);
  console.log(`Admin criado via env: ${adminEmail}`);
}

app.use(helmet());
const allowedOrigins = parseCorsOrigins(process.env.CORS_ORIGIN);
app.use(cors({
  origin: createCorsOriginChecker(allowedOrigins),
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Demasiados pedidos. Tente novamente mais tarde.' },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { erro: 'Demasiadas tentativas de autenticação. Aguarde 15 minutos.' },
});

app.use(express.json({ limit: '5mb' }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/agente/auth', authLimiter, agenteAuthRoutes);
app.use('/api/admin/auth', authLimiter, adminAuthRoutes);

app.use('/api/documentos', documentosRoutes);
app.use('/api/pagamentos', pagamentosRoutes);
app.use('/api/pontos-entrega', pontosEntregaRoutes);
app.use('/api/recompensas', recompensasRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin/utilizadores', adminUtilizadoresRoutes);
app.use('/api/admin/agentes', adminAgentesRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
async function start() {
  try {
    await bootstrapAdminFromEnv();
    app.listen(PORT, () => {
      console.log(`AcheiDoc API em http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Falha ao iniciar a API:', err.message);
    process.exit(1);
  }
}

start();
