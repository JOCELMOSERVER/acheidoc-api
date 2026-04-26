const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { pool, query } = require('../db');
const { requireTipo } = require('../middleware/auth');

router.get('/', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    let where = '';

    if (status) {
      params.push(status);
      where = `WHERE ag.status = $${params.length}`;
    }

    params.push(parseInt(limit, 10), offset);
    const result = await query(
      `SELECT ag.id, ag.nome, ag.email, ag.telefone, ag.pontos, ag.provincia, ag.status, ag.criado_em,
              p.id AS ponto_id, p.nome AS ponto_nome
       FROM agentes ag
       LEFT JOIN pontos_entrega p ON p.agente_id = ag.id
       ${where}
       ORDER BY ag.criado_em DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ agentes: result.rows });
  } catch (err) {
    return next(err);
  }
});

router.post('/', ...requireTipo('admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      nome,
      email,
      telefone,
      provincia,
      ponto_id,
      password,
    } = req.body || {};

    if (!nome || !email || !telefone) {
      return res.status(400).json({ erro: 'nome, email e telefone são obrigatórios.' });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const nomeNorm = String(nome).trim();
    const telefoneNorm = String(telefone).trim();
    const provinciaNorm = provincia ? String(provincia).trim() : null;
    const senhaInicial = password ? String(password).trim() : '123456';

    if (!senhaInicial || senhaInicial.length < 6) {
      return res.status(400).json({ erro: 'password deve ter pelo menos 6 caracteres.' });
    }

    await client.query('BEGIN');

    if (ponto_id) {
      const ponto = await client.query(
        'SELECT id, nome, agente_id FROM pontos_entrega WHERE id = $1 FOR UPDATE',
        [ponto_id]
      );

      if (!ponto.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ erro: 'Ponto de entrega não encontrado.' });
      }

      if (ponto.rows[0].agente_id) {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro: 'Este ponto de entrega já está atribuído a outro agente.' });
      }
    }

    const passwordHash = await bcrypt.hash(senhaInicial, 12);
    const created = await client.query(
      `INSERT INTO agentes (nome, email, telefone, password_hash, provincia, status)
       VALUES ($1, $2, $3, $4, $5, 'ATIVO')
       RETURNING id`,
      [nomeNorm, emailNorm, telefoneNorm, passwordHash, provinciaNorm]
    );

    const agenteId = created.rows[0].id;

    if (ponto_id) {
      await client.query('UPDATE pontos_entrega SET agente_id = $1 WHERE id = $2', [agenteId, ponto_id]);
    }

    const result = await client.query(
      `SELECT ag.id, ag.nome, ag.email, ag.telefone, ag.pontos, ag.provincia, ag.status, ag.criado_em,
              p.id AS ponto_id, p.nome AS ponto_nome
       FROM agentes ag
       LEFT JOIN pontos_entrega p ON p.agente_id = ag.id
       WHERE ag.id = $1`,
      [agenteId]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      agente: result.rows[0],
      credenciais_iniciais: {
        email: emailNorm,
        password: senhaInicial,
      },
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rollbackErr) {}
    if (err && err.code === '23505') {
      return res.status(409).json({ erro: 'Email já registado para outro agente.' });
    }
    if (err && err.code === '42703') {
      return res.status(500).json({
        erro: 'Schema da base de dados incompatível. Este backend usa pontos_entrega.agente_id (não agentes.ponto_id).',
      });
    }
    return next(err);
  } finally {
    client.release();
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
