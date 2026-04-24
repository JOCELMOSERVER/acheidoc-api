const router = require('express').Router();
const { query } = require('../db');
const { requireTipo } = require('../middleware/auth');

router.get('/', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    let where = '';

    if (status) {
      params.push(status);
      where = `WHERE status = $${params.length}`;
    }

    params.push(parseInt(limit, 10), offset);
    const result = await query(
      `SELECT id, nome, email, telefone, pontos, provincia, status, criado_em
       FROM agentes
       ${where}
       ORDER BY criado_em DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ agentes: result.rows });
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id/status', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['ATIVO', 'INATIVO', 'BLOQUEADO'].includes(status)) return res.status(400).json({ erro: 'Status inválido.' });

    const result = await query('UPDATE agentes SET status = $1 WHERE id = $2 RETURNING id, nome, email, status', [status, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ erro: 'Agente não encontrado.' });

    return res.json({ agente: result.rows[0] });
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id/pontos', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { delta } = req.body;
    if (typeof delta !== 'number') return res.status(400).json({ erro: 'delta deve ser número.' });

    const result = await query(
      'UPDATE agentes SET pontos = GREATEST(0, pontos + $1) WHERE id = $2 RETURNING id, nome, pontos',
      [delta, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ erro: 'Agente não encontrado.' });

    return res.json({ agente: result.rows[0] });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
