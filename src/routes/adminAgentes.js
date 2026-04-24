const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { requireTipo } = require('../middleware/auth');

// GET /api/admin/agentes
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
      `SELECT id, nome, email, telefone, pontos, provincia, status, criado_em FROM agentes
       ${where} ORDER BY criado_em DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ agentes: result.rows });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/agentes/:id/status — ativar/desativar/bloquear
router.patch('/:id/status', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['ATIVO', 'INATIVO', 'BLOQUEADO'].includes(status)) {
      return res.status(400).json({ erro: 'Status inválido. Use ATIVO, INATIVO ou BLOQUEADO.' });
    }
    const result = await query(
      `UPDATE agentes SET status = $1 WHERE id = $2 RETURNING id, nome, email, status`,
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Agente não encontrado.' });
    res.json({ agente: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/agentes/:id/pontos — ajustar pontos
router.patch('/:id/pontos', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { delta } = req.body;
    if (typeof delta !== 'number') return res.status(400).json({ erro: 'delta deve ser um número.' });

    const result = await query(
      `UPDATE agentes SET pontos = GREATEST(0, pontos + $1) WHERE id = $2 RETURNING id, nome, pontos`,
      [delta, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Agente não encontrado.' });
    res.json({ agente: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/agentes — criar agente
router.post('/', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { nome, email, telefone, password, provincia } = req.body;
    if (!nome || !email || !password) {
      return res.status(400).json({ erro: 'nome, email e password são obrigatórios.' });
    }
    const password_hash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO agentes (nome, email, telefone, password_hash, provincia)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, nome, email, pontos, status, provincia`,
      [nome, email.toLowerCase(), telefone || null, password_hash, provincia || null]
    );
    res.status(201).json({ agente: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
