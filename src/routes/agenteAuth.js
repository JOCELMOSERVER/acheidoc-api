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

    const result = await query(
      `SELECT ag.id, ag.nome, ag.email, ag.password_hash, ag.pontos, ag.status, ag.provincia,
              p.id AS ponto_id, p.nome AS ponto_nome
       FROM agentes ag
       LEFT JOIN pontos_entrega p ON p.agente_id = ag.id
       WHERE ag.email = $1`,
      [email.toLowerCase()]
    );
    if (!result.rows.length) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const agente = result.rows[0];
    if (agente.status === 'BLOQUEADO') return res.status(403).json({ erro: 'Conta bloqueada.' });
    if (agente.status === 'INATIVO') return res.status(403).json({ erro: 'Conta inativa.' });

    const ok = await bcrypt.compare(password, agente.password_hash);
    if (!ok) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const token = signToken({ id: agente.id, email: agente.email, tipo: 'agente' });
    agente.pontoId = agente.ponto_id || null;
    agente.pontoNome = agente.ponto_nome || null;
    delete agente.ponto_id;
    delete agente.ponto_nome;
    delete agente.password_hash;
    return res.json({ token, agente });
  } catch (err) {
    return next(err);
  }
});

router.post('/recover', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ erro: 'email é obrigatório.' });

    const result = await query('SELECT nome FROM agentes WHERE email = $1', [email.toLowerCase()]);
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
    const updated = await query('UPDATE agentes SET password_hash = $1 WHERE email = $2 RETURNING id', [password_hash, email.toLowerCase()]);
    if (!updated.rows.length) return res.status(404).json({ erro: 'Conta não encontrada.' });

    return res.json({ mensagem: 'Password redefinida com sucesso.' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
