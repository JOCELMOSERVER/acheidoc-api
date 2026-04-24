const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');
const { enviarOtpVerificacao, enviarOtpRecuperacao } = require('../services/email');

// ─── Helpers ────────────────────────────────────────────────

function gerarOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function otpExpiresAt() {
  const mins = parseInt(process.env.OTP_EXPIRES_MIN || '15', 10);
  return new Date(Date.now() + mins * 60 * 1000);
}

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

// ─── UTILIZADORES ────────────────────────────────────────────

// POST /api/auth/register — passo 1: envia OTP de verificação
router.post('/register', async (req, res, next) => {
  try {
    const { nome, email, telefone, password } = req.body;
    if (!nome || !email || !password) {
      return res.status(400).json({ erro: 'nome, email e password são obrigatórios.' });
    }
    if (password.length < 4) {
      return res.status(400).json({ erro: 'A password deve ter pelo menos 4 caracteres.' });
    }

    // Verifica se email já existe
    const existe = await query('SELECT id FROM utilizadores WHERE email = $1', [email.toLowerCase()]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ erro: 'Este email já está registado.' });
    }

    // Hash da password
    const password_hash = await bcrypt.hash(password, 12);
    const otp = gerarOtp();

    // Guarda dados temporários num token pendente (reutilizamos a tabela de verificação)
    await query(
      `DELETE FROM email_verification_tokens WHERE email = $1`,
      [email.toLowerCase()]
    );
    await query(
      `INSERT INTO email_verification_tokens (id, email, token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [uuidv4(), email.toLowerCase(), otp, otpExpiresAt()]
    );

    // Guarda dados pendentes do cadastro para concluir no verify-email.
    await query(`DELETE FROM pending_user_registrations WHERE email = $1`, [email.toLowerCase()]);
    await query(
      `INSERT INTO pending_user_registrations (id, email, nome, telefone, password_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), email.toLowerCase(), nome, telefone || null, password_hash, otpExpiresAt()]
    );

    await enviarOtpVerificacao(email, nome, otp);
    res.json({ mensagem: 'Código de verificação enviado para o email.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/verify-email — passo 2: confirma OTP e cria conta
router.post('/verify-email', async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ erro: 'email e otp são obrigatórios.' });

    const tokenRow = await query(
      `SELECT * FROM email_verification_tokens
       WHERE email = $1 AND token = $2 AND usado = FALSE AND expires_at > NOW()`,
      [email.toLowerCase(), otp]
    );
    if (tokenRow.rows.length === 0) {
      return res.status(400).json({ erro: 'Código inválido ou expirado.' });
    }

    // Busca dados pendentes do registo
    const pendingRow = await query(
      `SELECT nome, telefone, password_hash
       FROM pending_user_registrations
       WHERE email = $1 AND expires_at > NOW()`,
      [email.toLowerCase()]
    );
    if (pendingRow.rows.length === 0) {
      return res.status(400).json({ erro: 'Sessão de registo expirada. Tente novamente.' });
    }

    const { nome, telefone, password_hash } = pendingRow.rows[0];

    // Cria o utilizador
    const novo = await query(
      `INSERT INTO utilizadores (nome, email, telefone, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id, nome, email, pontos, status`,
      [nome, email.toLowerCase(), telefone || null, password_hash]
    );

    // Marca tokens como usados
    await query(`UPDATE email_verification_tokens SET usado = TRUE WHERE email = $1`, [email.toLowerCase()]);
    await query(`DELETE FROM pending_user_registrations WHERE email = $1`, [email.toLowerCase()]);

    const user = novo.rows[0];
    const token = signToken({ id: user.id, email: user.email, tipo: 'utilizador' });
    res.status(201).json({ token, utilizador: user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ erro: 'email e password são obrigatórios.' });

    const result = await query(
      `SELECT id, nome, email, password_hash, pontos, status FROM utilizadores WHERE email = $1`,
      [email.toLowerCase()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }

    const user = result.rows[0];
    if (user.status === 'BLOQUEADO') {
      return res.status(403).json({ erro: 'Conta bloqueada. Contacte o suporte.' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const token = signToken({ id: user.id, email: user.email, tipo: 'utilizador' });
    const { password_hash, ...userSafe } = user;
    res.json({ token, utilizador: userSafe });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/recover — envia OTP de recuperação
router.post('/recover', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ erro: 'email é obrigatório.' });

    const result = await query(
      `SELECT id, nome FROM utilizadores WHERE email = $1`,
      [email.toLowerCase()]
    );
    // Responde sempre OK para não revelar se o email existe
    if (result.rows.length === 0) {
      return res.json({ mensagem: 'Se o email estiver registado, receberá um código.' });
    }

    const { nome } = result.rows[0];
    const otp = gerarOtp();

    await query(`DELETE FROM password_reset_tokens WHERE email = $1 AND tipo = 'utilizador'`, [email.toLowerCase()]);
    await query(
      `INSERT INTO password_reset_tokens (id, email, tipo, token, expires_at)
       VALUES ($1, $2, 'utilizador', $3, $4)`,
      [uuidv4(), email.toLowerCase(), otp, otpExpiresAt()]
    );

    await enviarOtpRecuperacao(email, nome, otp);
    res.json({ mensagem: 'Se o email estiver registado, receberá um código.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password — valida OTP e redefine password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, otp, novaPassword } = req.body;
    if (!email || !otp || !novaPassword) {
      return res.status(400).json({ erro: 'email, otp e novaPassword são obrigatórios.' });
    }
    if (novaPassword.length < 4) {
      return res.status(400).json({ erro: 'A password deve ter pelo menos 4 caracteres.' });
    }

    const tokenRow = await query(
      `SELECT id FROM password_reset_tokens
       WHERE email = $1 AND tipo = 'utilizador' AND token = $2 AND usado = FALSE AND expires_at > NOW()`,
      [email.toLowerCase(), otp]
    );
    if (tokenRow.rows.length === 0) {
      return res.status(400).json({ erro: 'Código inválido ou expirado.' });
    }

    const password_hash = await bcrypt.hash(novaPassword, 12);
    await query(`UPDATE utilizadores SET password_hash = $1 WHERE email = $2`, [password_hash, email.toLowerCase()]);
    await query(`UPDATE password_reset_tokens SET usado = TRUE WHERE id = $1`, [tokenRow.rows[0].id]);

    res.json({ mensagem: 'Password redefinida com sucesso.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
