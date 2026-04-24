const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

router.post('/register', async (req, res, next) => {
  try {
    const { nome, email, telefone, password } = req.body;
    if (!nome || !email || !password) return res.status(400).json({ erro: 'nome, email e password são obrigatórios.' });
    if (password.length < 4) return res.status(400).json({ erro: 'A password deve ter pelo menos 4 caracteres.' });

    const exists = await query('SELECT id FROM utilizadores WHERE email = $1', [email.toLowerCase()]);
    if (exists.rows.length) return res.status(409).json({ erro: 'Este email já está registado.' });

    const password_hash = await bcrypt.hash(password, 12);
    const novo = await query(
      'INSERT INTO utilizadores (nome, email, telefone, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, nome, email, pontos, status',
      [nome, email.toLowerCase(), telefone || null, password_hash]
    );

    const user = novo.rows[0];
    const token = signToken({ id: user.id, email: user.email, tipo: 'utilizador' });
    return res.status(201).json({ token, utilizador: user });
  } catch (err) {
    return next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ erro: 'email e password são obrigatórios.' });

    const result = await query('SELECT id, nome, email, password_hash, pontos, status FROM utilizadores WHERE email = $1', [email.toLowerCase()]);
    if (!result.rows.length) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const user = result.rows[0];
    if (user.status === 'BLOQUEADO') return res.status(403).json({ erro: 'Conta bloqueada.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const token = signToken({ id: user.id, email: user.email, tipo: 'utilizador' });
    delete user.password_hash;
    return res.json({ token, utilizador: user });
  } catch (err) {
    return next(err);
  }
});

router.post('/recover', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ erro: 'email é obrigatório.' });

    const result = await query('SELECT nome FROM utilizadores WHERE email = $1', [email.toLowerCase()]);
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
    const updated = await query('UPDATE utilizadores SET password_hash = $1 WHERE email = $2 RETURNING id', [password_hash, email.toLowerCase()]);
    if (!updated.rows.length) return res.status(404).json({ erro: 'Conta não encontrada.' });

    return res.json({ mensagem: 'Password redefinida com sucesso.' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
