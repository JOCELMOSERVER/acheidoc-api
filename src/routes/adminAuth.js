const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
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
    if (!result.rows.length) return res.status(404).json({ erro: 'Conta não encontrada.' });
    return res.json({ mensagem: 'Conta encontrada. Pode redefinir a password.' });
  } catch (err) {
    return next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, novaPassword } = req.body;
    if (!email || !novaPassword) return res.status(400).json({ erro: 'email e novaPassword são obrigatórios.' });

    const password_hash = await bcrypt.hash(novaPassword, 12);
    const updated = await query('UPDATE admin SET password_hash = $1 WHERE email = $2 RETURNING id', [password_hash, email.toLowerCase()]);
    if (!updated.rows.length) return res.status(404).json({ erro: 'Conta não encontrada.' });

    return res.json({ mensagem: 'Password redefinida com sucesso.' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
