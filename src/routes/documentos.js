const router = require('express').Router();
const multer = require('multer');
const { query } = require('../db');
const { requireTipo } = require('../middleware/auth');
const { enviarNotificacaoDocumento } = require('../services/email');
const { findNearestPoint } = require('../services/pontosEntrega');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get('/', async (req, res, next) => {
  try {
    const { tipo, provincia, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    const conditions = ["d.status = 'PUBLICADO'"];

    if (tipo) { params.push(tipo); conditions.push(`d.tipo = $${params.length}`); }
    if (provincia) { params.push(provincia); conditions.push(`d.provincia = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(d.nome_proprietario ILIKE $${params.length} OR d.tipo ILIKE $${params.length})`);
    }

    params.push(parseInt(limit, 10), offset);
    const result = await query(
      `SELECT d.id, d.tipo, d.nome_proprietario, d.provincia, d.foto_url, d.status, d.risco, d.data_publicacao
       FROM documentos d
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.data_publicacao DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ documentos: result.rows });
  } catch (err) {
    return next(err);
  }
});

router.post('/', ...requireTipo('utilizador'), upload.single('foto'), async (req, res, next) => {
  try {
    const { tipo, nome_proprietario, bi, data_nascimento, morada, provincia, foto_url } = req.body;
    if (!tipo || !nome_proprietario) return res.status(400).json({ erro: 'tipo e nome_proprietario são obrigatórios.' });

    let fotoFinal = foto_url || null;
    if (req.file && req.file.buffer) {
      const mime = req.file.mimetype || 'application/octet-stream';
      fotoFinal = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
    }

    const pontoEntrega = await findNearestPoint({ provincia, municipio: provincia });
    if (!pontoEntrega) {
      return res.status(503).json({ erro: 'Nenhum ponto de entrega activo está configurado.' });
    }

    const id = `DOC-${Date.now()}`;
    const created = await query(
      `INSERT INTO documentos (id, tipo, nome_proprietario, bi, data_nascimento, morada, provincia, foto_url, publicado_por, ponto_entrega_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, tipo, nome_proprietario, status, data_publicacao`,
      [id, tipo, nome_proprietario, bi || null, data_nascimento || null, morada || null, provincia || null, fotoFinal, req.user.id, pontoEntrega.id]
    );

    return res.status(201).json({
      documento: created.rows[0],
      ponto_entrega: pontoEntrega,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/meus', ...requireTipo('utilizador'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [req.user.id];
    const where = ['d.publicado_por = $1'];

    if (status) {
      params.push(status);
      where.push(`d.status = $${params.length}`);
    }

    params.push(parseInt(limit, 10), offset);
    const result = await query(
      `SELECT d.id, d.tipo, d.nome_proprietario, d.provincia, d.foto_url, d.status, d.risco, d.data_publicacao, d.criado_em,
              d.ponto_entrega_id, d.codigo_resgate, d.chave_entrega
       FROM documentos d
       WHERE ${where.join(' AND ')}
       ORDER BY d.criado_em DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ documentos: result.rows });
  } catch (err) {
    return next(err);
  }
});

router.get('/admin/todos', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    let where = '';

    if (status) {
      params.push(status);
      where = `WHERE d.status = $${params.length}`;
    }

    params.push(parseInt(limit, 10), offset);
    const result = await query(
      `SELECT d.*, u.nome AS publicado_por_nome, u.email AS publicado_por_email
       FROM documentos d
       LEFT JOIN utilizadores u ON u.id = d.publicado_por
       ${where}
       ORDER BY d.criado_em DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ documentos: result.rows });
  } catch (err) {
    return next(err);
  }
});

router.get('/admin/:id', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT d.*, u.nome AS publicado_por_nome, u.email AS publicado_por_email
       FROM documentos d
       LEFT JOIN utilizadores u ON u.id = d.publicado_por
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ erro: 'Documento não encontrado.' });
    return res.json({ documento: result.rows[0] });
  } catch (err) {
    return next(err);
  }
});

router.patch('/admin/:id', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { status, observacao_correcao } = req.body;
    const valid = ['PUBLICADO', 'REJEITADO', 'CORRECAO_SOLICITADA'];
    if (!valid.includes(status)) return res.status(400).json({ erro: 'Status inválido.' });

    const docInfo = await query(
      `SELECT d.tipo, u.email, u.nome
       FROM documentos d
       LEFT JOIN utilizadores u ON u.id = d.publicado_por
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (!docInfo.rows.length) return res.status(404).json({ erro: 'Documento não encontrado.' });

    const result = await query(
      `UPDATE documentos
       SET status = $1, observacao_correcao = $2, revisto_por = $3, data_revisao = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, observacao_correcao || null, req.user.id, req.params.id]
    );

    const { email, nome, tipo } = docInfo.rows[0];
    if (email) enviarNotificacaoDocumento(email, nome, tipo, status).catch(() => {});

    return res.json({ documento: result.rows[0] });
  } catch (err) {
    return next(err);
  }
});

router.get('/agente/lista', ...requireTipo('agente'), async (req, res, next) => {
  try {
    const { status } = req.query;
    const params = [req.user.id];
    const conditions = ['d.ponto_entrega_id IN (SELECT id FROM pontos_entrega WHERE agente_id = $1)'];

    if (status) {
      params.push(status);
      conditions.push(`d.status = $${params.length}`);
    }

    const result = await query(
      `SELECT d.id, d.tipo, d.nome_proprietario, d.provincia, d.status, d.risco, d.data_publicacao, d.criado_em,
              d.ponto_entrega_id, d.codigo_resgate, d.chave_entrega
       FROM documentos d
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.criado_em DESC`,
      params
    );
    return res.json({ documentos: result.rows });
  } catch (err) {
    return next(err);
  }
});

router.patch('/agente/:id', ...requireTipo('agente'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const valid = ['DISPONIVEL_LEVANTAMENTO', 'ENTREGUE'];
    if (!valid.includes(status)) return res.status(400).json({ erro: 'Status inválido.' });

    const result = await query(
      `UPDATE documentos
       SET status = $1
       WHERE id = $2
         AND ponto_entrega_id IN (SELECT id FROM pontos_entrega WHERE agente_id = $3)
       RETURNING id, status`,
      [status, req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ erro: 'Documento não encontrado.' });

    return res.json({ documento: result.rows[0] });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id(DOC-[A-Za-z0-9-]+)', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT d.id, d.tipo, d.nome_proprietario, d.bi, d.data_nascimento, d.morada, d.provincia,
              d.foto_url, d.status, d.risco, d.data_publicacao
       FROM documentos d
       WHERE d.id = $1 AND d.status = 'PUBLICADO'`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ erro: 'Documento não encontrado.' });
    return res.json({ documento: result.rows[0] });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
