const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');
const { enviarOtpRecuperacao } = require('../services/email');

function gerarOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }
function otpExpiresAt() {
  const mins = parseInt(process.env.OTP_EXPIRES_MIN || '15', 10);
  return new Date(Date.now() + mins * 60 * 1000);
}
function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ erro: 'email e password são obrigatórios.' });

    const result = await query('SELECT id, nome, email, password_hash FROM admin WHERE email = $1', [email.toLowerCase()]);
    if (!result.rows.length) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const admin = result.rows[0];
    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const token = signToken({ id: admin.id, email: admin.email, tipo: 'admin' });
    delete admin.password_hash;
    return res.json({ token, admin });
  } catch (err) {
    return next(err);
  }
});

router.post('/recover', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ erro: 'email é obrigatório.' });

    const result = await query('SELECT nome FROM admin WHERE email = $1', [email.toLowerCase()]);
    if (!result.rows.length) return res.json({ mensagem: 'Se o email estiver registado, receberá um código.' });

    const otp = gerarOtp();
    await query('DELETE FROM password_reset_tokens WHERE email = $1 AND tipo = $2', [email.toLowerCase(), 'admin']);
    await query(
      'INSERT INTO password_reset_tokens (id, email, tipo, token, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [uuidv4(), email.toLowerCase(), 'admin', otp, otpExpiresAt()]
    );

    await enviarOtpRecuperacao(email, result.rows[0].nome, otp);
    return res.json({ mensagem: 'Se o email estiver registado, receberá um código.' });
  } catch (err) {
    return next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, otp, novaPassword } = req.body;
    if (!email || !otp || !novaPassword) return res.status(400).json({ erro: 'email, otp e novaPassword são obrigatórios.' });

    const tokenRow = await query(
      'SELECT id FROM password_reset_tokens WHERE email = $1 AND tipo = $2 AND token = $3 AND usado = FALSE AND expires_at > NOW()',
      [email.toLowerCase(), 'admin', otp]
    );
    if (!tokenRow.rows.length) return res.status(400).json({ erro: 'Código inválido ou expirado.' });

    const password_hash = await bcrypt.hash(novaPassword, 12);
    await query('UPDATE admin SET password_hash = $1 WHERE email = $2', [password_hash, email.toLowerCase()]);
    await query('UPDATE password_reset_tokens SET usado = TRUE WHERE id = $1', [tokenRow.rows[0].id]);

    return res.json({ mensagem: 'Password redefinida com sucesso.' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
