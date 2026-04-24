const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');
const { enviarOtpRecuperacao } = require('../services/email');

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

// POST /api/agente/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ erro: 'email e password são obrigatórios.' });

    const result = await query(
      `SELECT id, nome, email, password_hash, pontos, status, provincia FROM agentes WHERE email = $1`,
      [email.toLowerCase()]
    );
    if (result.rows.length === 0) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const agente = result.rows[0];
    if (agente.status === 'BLOQUEADO') return res.status(403).json({ erro: 'Conta bloqueada.' });
    if (agente.status === 'INATIVO') return res.status(403).json({ erro: 'Conta inativa.' });

    const ok = await bcrypt.compare(password, agente.password_hash);
    if (!ok) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const token = signToken({ id: agente.id, email: agente.email, tipo: 'agente' });
    const { password_hash, ...agenteSafe } = agente;
    res.json({ token, agente: agenteSafe });
  } catch (err) {
    next(err);
  }
});

// POST /api/agente/auth/recover
router.post('/recover', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ erro: 'email é obrigatório.' });

    const result = await query(`SELECT id, nome FROM agentes WHERE email = $1`, [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.json({ mensagem: 'Se o email estiver registado, receberá um código.' });
    }

    const { nome } = result.rows[0];
    const otp = gerarOtp();

    await query(`DELETE FROM password_reset_tokens WHERE email = $1 AND tipo = 'agente'`, [email.toLowerCase()]);
    await query(
      `INSERT INTO password_reset_tokens (id, email, tipo, token, expires_at) VALUES ($1, $2, 'agente', $3, $4)`,
      [uuidv4(), email.toLowerCase(), otp, otpExpiresAt()]
    );

    await enviarOtpRecuperacao(email, nome, otp);
    res.json({ mensagem: 'Se o email estiver registado, receberá um código.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/agente/auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, otp, novaPassword } = req.body;
    if (!email || !otp || !novaPassword) {
      return res.status(400).json({ erro: 'email, otp e novaPassword são obrigatórios.' });
    }
    if (novaPassword.length < 4) return res.status(400).json({ erro: 'Password muito curta.' });

    const tokenRow = await query(
      `SELECT id FROM password_reset_tokens
       WHERE email = $1 AND tipo = 'agente' AND token = $2 AND usado = FALSE AND expires_at > NOW()`,
      [email.toLowerCase(), otp]
    );
    if (tokenRow.rows.length === 0) return res.status(400).json({ erro: 'Código inválido ou expirado.' });

    const password_hash = await bcrypt.hash(novaPassword, 12);
    await query(`UPDATE agentes SET password_hash = $1 WHERE email = $2`, [password_hash, email.toLowerCase()]);
    await query(`UPDATE password_reset_tokens SET usado = TRUE WHERE id = $1`, [tokenRow.rows[0].id]);

    res.json({ mensagem: 'Password redefinida com sucesso.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
