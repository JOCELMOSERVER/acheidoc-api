const router = require('express').Router();
const { query } = require('../db');
const { requireAuth, requireTipo } = require('../middleware/auth');
const { enviarNotificacaoDocumento } = require('../services/email');

// GET /api/documentos — lista pública (só PUBLICADO)
router.get('/', async (req, res, next) => {
  try {
    const { tipo, provincia, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [`d.status = 'PUBLICADO'`];

    if (tipo) { params.push(tipo); conditions.push(`d.tipo = $${params.length}`); }
    if (provincia) { params.push(provincia); conditions.push(`d.provincia = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(d.nome_proprietario ILIKE $${params.length} OR d.tipo ILIKE $${params.length})`);
    }

    params.push(parseInt(limit), offset);
    const sql = `
      SELECT d.id, d.tipo, d.nome_proprietario, d.provincia, d.foto_url,
             d.data_publicacao, d.risco
      FROM documentos d
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.data_publicacao DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await query(sql, params);
    res.json({ documentos: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/documentos — publicar (autenticado, utilizador)
router.post('/', ...requireTipo('utilizador'), async (req, res, next) => {
  try {
    const { tipo, nome_proprietario, bi, data_nascimento, morada, provincia, foto_url } = req.body;
    if (!tipo || !nome_proprietario) {
      return res.status(400).json({ erro: 'tipo e nome_proprietario são obrigatórios.' });
    }

    const id = 'DOC-' + Date.now();
    const result = await query(
      `INSERT INTO documentos (id, tipo, nome_proprietario, bi, data_nascimento, morada, provincia, foto_url, publicado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, tipo, nome_proprietario, status, data_publicacao`,
      [id, tipo, nome_proprietario, bi || null, data_nascimento || null, morada || null, provincia || null, foto_url || null, req.user.id]
    );

    res.status(201).json({ documento: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─── ROTAS ADMIN ─────────────────────────────────────────────

// GET /api/documentos/admin/todos — todos os documentos para admin
router.get('/admin/todos', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];

    if (status) { params.push(status); conditions.push(`d.status = $${params.length}`); }

    params.push(parseInt(limit), offset);
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const sql = `
      SELECT d.*, u.nome AS publicado_por_nome, u.email AS publicado_por_email
      FROM documentos d
      LEFT JOIN utilizadores u ON u.id = d.publicado_por
      ${where}
      ORDER BY d.criado_em DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await query(sql, params);
    res.json({ documentos: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/documentos/admin/:id — detalhe para revisão no admin
router.get('/admin/:id', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT d.*, u.nome AS publicado_por_nome, u.email AS publicado_por_email
       FROM documentos d
       LEFT JOIN utilizadores u ON u.id = d.publicado_por
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Documento não encontrado.' });
    res.json({ documento: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/documentos/admin/:id — rever documento (aprovar/rejeitar/correcção)
router.patch('/admin/:id', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { status, observacao_correcao } = req.body;
    const statusValidos = ['PUBLICADO', 'REJEITADO', 'CORRECAO_SOLICITADA'];
    if (!statusValidos.includes(status)) {
      return res.status(400).json({ erro: 'Status inválido.' });
    }

    // Busca o documento e email do autor para notificação
    const docResult = await query(
      `SELECT d.tipo, u.email, u.nome FROM documentos d
       LEFT JOIN utilizadores u ON u.id = d.publicado_por
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (docResult.rows.length === 0) return res.status(404).json({ erro: 'Documento não encontrado.' });

    const result = await query(
      `UPDATE documentos
       SET status = $1, observacao_correcao = $2, revisto_por = $3, data_revisao = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, observacao_correcao || null, req.user.id, req.params.id]
    );

    // Notifica o autor por email (se tiver email)
    const { email, nome, tipo } = docResult.rows[0];
    if (email) {
      enviarNotificacaoDocumento(email, nome, tipo, status).catch(() => {});
    }

    res.json({ documento: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─── ROTAS AGENTE ─────────────────────────────────────────────

// GET /api/documentos/agente/pendentes — docs para receber (PUBLICADO)
router.get('/agente/pendentes', ...requireTipo('agente'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, tipo, nome_proprietario, provincia, status FROM documentos
       WHERE status = 'PUBLICADO' ORDER BY criado_em DESC`
    );
    res.json({ documentos: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/documentos/agente/lista — lista para painel do agente (receber/entregar/histórico)
router.get('/agente/lista', ...requireTipo('agente'), async (req, res, next) => {
  try {
    const { status } = req.query;
    const validStatus = ['PUBLICADO', 'DISPONIVEL_LEVANTAMENTO', 'ENTREGUE', 'CORRECAO_SOLICITADA', 'REJEITADO', 'PENDENTE'];
    const params = [];
    let where = '';

    if (status && validStatus.includes(status)) {
      params.push(status);
      where = 'WHERE d.status = $1';
    }

    const result = await query(
      `SELECT d.id, d.tipo, d.nome_proprietario, d.provincia, d.status, d.risco, d.data_publicacao, d.criado_em
       FROM documentos d
       ${where}
       ORDER BY d.criado_em DESC`,
      params
    );
    res.json({ documentos: result.rows });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/documentos/agente/:id — agente atualiza status (receber/entregar)
router.patch('/agente/:id', ...requireTipo('agente'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const statusValidos = ['DISPONIVEL_LEVANTAMENTO', 'ENTREGUE'];
    if (!statusValidos.includes(status)) {
      return res.status(400).json({ erro: 'Status inválido.' });
    }

    const result = await query(
      `UPDATE documentos SET status = $1 WHERE id = $2 RETURNING id, status`,
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Documento não encontrado.' });
    res.json({ documento: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/documentos/:id — detalhe público (só PUBLICADO)
router.get('/:id(DOC-[A-Za-z0-9-]+)', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT d.id, d.tipo, d.nome_proprietario, d.bi, d.data_nascimento,
              d.morada, d.provincia, d.foto_url, d.status, d.risco, d.data_publicacao
       FROM documentos d
       WHERE d.id = $1 AND d.status = 'PUBLICADO'`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Documento não encontrado.' });
    res.json({ documento: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
