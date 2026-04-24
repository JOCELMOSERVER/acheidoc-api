const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { requireTipo } = require('../middleware/auth');

// GET /api/admin/utilizadores
router.get('/', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];

    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    params.push(parseInt(limit), offset);
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await query(
      `SELECT id, nome, email, telefone, pontos, status, criado_em FROM utilizadores
       ${where} ORDER BY criado_em DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ utilizadores: result.rows });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/utilizadores/:id/status — bloquear/desbloquear
router.patch('/:id/status', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['ATIVO', 'BLOQUEADO'].includes(status)) {
      return res.status(400).json({ erro: 'Status inválido. Use ATIVO ou BLOQUEADO.' });
    }
    const result = await query(
      `UPDATE utilizadores SET status = $1 WHERE id = $2 RETURNING id, nome, email, status`,
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Utilizador não encontrado.' });
    res.json({ utilizador: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/utilizadores/:id/pontos — ajustar pontos (+/-)
router.patch('/:id/pontos', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { delta } = req.body;
    if (typeof delta !== 'number') return res.status(400).json({ erro: 'delta deve ser um número.' });

    const result = await query(
      `UPDATE utilizadores SET pontos = GREATEST(0, pontos + $1) WHERE id = $2
       RETURNING id, nome, pontos`,
      [delta, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Utilizador não encontrado.' });
    res.json({ utilizador: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/utilizadores — criar utilizador (pelo admin)
router.post('/', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { nome, email, telefone, password } = req.body;
    if (!nome || !email || !password) {
      return res.status(400).json({ erro: 'nome, email e password são obrigatórios.' });
    }
    const password_hash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO utilizadores (nome, email, telefone, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id, nome, email, pontos, status`,
      [nome, email.toLowerCase(), telefone || null, password_hash]
    );
    res.status(201).json({ utilizador: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
