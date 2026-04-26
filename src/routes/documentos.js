const router = require('express').Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const crypto = require('crypto');
const { pool, query } = require('../db');
const { requireTipo } = require('../middleware/auth');
const { enviarNotificacaoDocumento } = require('../services/email');
const { findNearestPoint } = require('../services/pontosEntrega');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function getOptionalUser(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  try {
    return jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function gerarCodigo(prefixo) {
  return `${prefixo}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

router.get('/', async (req, res, next) => {
  try {
    const { tipo, provincia, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    const conditions = [
      "(d.status = 'PUBLICADO' OR (d.status = 'DISPONIVEL_LEVANTAMENTO' AND (d.codigo_resgate IS NULL OR d.codigo_resgate = '')))"
    ];

    if (tipo) { params.push(tipo); conditions.push(`d.tipo = $${params.length}`); }
    if (provincia) { params.push(provincia); conditions.push(`d.provincia = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(d.nome_proprietario ILIKE $${params.length} OR d.tipo ILIKE $${params.length})`);
    }

    params.push(parseInt(limit, 10), offset);
    const result = await query(
      `SELECT d.id, d.tipo, d.nome_proprietario, d.provincia, d.foto_url, d.status, d.risco,
              d.criado_em AS data_publicacao
       FROM documentos d
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.criado_em DESC
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
    const chaveEntrega = gerarCodigo('ENT');
    const created = await query(
      `INSERT INTO documentos (id, tipo, nome_proprietario, bi, data_nascimento, morada, provincia, foto_url, publicado_por, ponto_entrega_id, chave_entrega)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, tipo, nome_proprietario, status, criado_em AS data_publicacao, chave_entrega`,
      [id, tipo, nome_proprietario, bi || null, data_nascimento || null, morada || null, provincia || null, fotoFinal, req.user.id, pontoEntrega.id, chaveEntrega]
    );

    return res.status(201).json({
      documento: created.rows[0],
      chave_entrega: chaveEntrega,
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
      `SELECT d.id, d.tipo, d.nome_proprietario, d.provincia, d.foto_url, d.status, d.risco,
              d.criado_em AS data_publicacao, d.criado_em,
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
      `SELECT d.id, d.tipo, d.nome_proprietario, d.provincia, d.status, d.risco,
              d.criado_em AS data_publicacao, d.criado_em,
              d.ponto_entrega_id, d.codigo_resgate, d.chave_entrega,
              u.nome AS publicado_por_nome
       FROM documentos d
       LEFT JOIN utilizadores u ON u.id = d.publicado_por
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.criado_em DESC`,
      params
    );
    return res.json({ documentos: result.rows });
  } catch (err) {
    return next(err);
  }
});

router.get('/agente/codigo/:codigo', ...requireTipo('agente'), async (req, res, next) => {
  try {
    const codigo = normalizeCode(req.params.codigo);
    if (!codigo) return res.status(400).json({ erro: 'Código inválido.' });

    const result = await query(
      `SELECT d.id, d.tipo, d.nome_proprietario, d.provincia, d.status, d.risco,
              d.criado_em AS data_publicacao, d.criado_em,
              d.ponto_entrega_id, d.codigo_resgate, d.chave_entrega,
              u.nome AS publicado_por_nome
       FROM documentos d
       LEFT JOIN utilizadores u ON u.id = d.publicado_por
       WHERE d.ponto_entrega_id IN (SELECT id FROM pontos_entrega WHERE agente_id = $1)
         AND (
           regexp_replace(upper(coalesce(d.codigo_resgate, '')), '[^A-Z0-9]', '', 'g') = $2
           OR regexp_replace(upper(coalesce(d.chave_entrega, '')), '[^A-Z0-9]', '', 'g') = $2
           OR regexp_replace(upper(coalesce(d.id, '')), '[^A-Z0-9]', '', 'g') = $2
         )
       ORDER BY d.criado_em DESC
       LIMIT 1`,
      [req.user.id, codigo]
    );

    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Documento não encontrado para este código.' });
    }

    return res.json({ documento: result.rows[0] });
  } catch (err) {
    return next(err);
  }
});

router.patch('/agente/:id', ...requireTipo('agente'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { status } = req.body;
    const valid = ['DISPONIVEL_LEVANTAMENTO', 'ENTREGUE'];
    if (!valid.includes(status)) return res.status(400).json({ erro: 'Status inválido.' });

    await client.query('BEGIN');

    const docResult = await client.query(
      `SELECT d.id, d.status, d.publicado_por
       FROM documentos d
       WHERE d.id = $1
         AND d.ponto_entrega_id IN (SELECT id FROM pontos_entrega WHERE agente_id = $2)
       FOR UPDATE`,
      [req.params.id, req.user.id]
    );

    if (!docResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Documento não encontrado ou não pertence ao seu ponto.' });
    }

    const doc = docResult.rows[0];
    const statusAtual = doc.status;

    if (statusAtual !== status) {
      await client.query(
        `UPDATE documentos
         SET status = $1
         WHERE id = $2`,
        [status, req.params.id]
      );

      var pontosDelta = 0;
      if (status === 'DISPONIVEL_LEVANTAMENTO' && ['PUBLICADO', 'PENDENTE', 'CORRECAO_SOLICITADA', 'AGUARDANDO_ENTREGA'].includes(statusAtual)) {
        pontosDelta = 10;
      } else if (status === 'ENTREGUE' && statusAtual === 'DISPONIVEL_LEVANTAMENTO') {
        pontosDelta = 60;
      }

      if (pontosDelta > 0 && doc.publicado_por) {
        await client.query(
          `UPDATE utilizadores
           SET pontos = pontos + $1
           WHERE id = $2`,
          [pontosDelta, doc.publicado_por]
        );
      }
    }

    await client.query('COMMIT');

    return res.json({ documento: { id: req.params.id, status } });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rollbackErr) {}
    return next(err);
  } finally {
    client.release();
  }
});

router.get('/:id(DOC-[A-Za-z0-9-]+)', async (req, res, next) => {
  try {
    const user = getOptionalUser(req);
    const result = await query(
      `SELECT d.id, d.tipo, d.nome_proprietario, d.bi, d.data_nascimento, d.morada, d.provincia,
              d.foto_url, d.status, d.risco, d.criado_em AS data_publicacao, d.publicado_por
       FROM documentos d
       WHERE d.id = $1
         AND (
           d.status = 'PUBLICADO'
           OR (d.status = 'DISPONIVEL_LEVANTAMENTO' AND (d.codigo_resgate IS NULL OR d.codigo_resgate = ''))
           OR ($2::uuid IS NOT NULL AND d.publicado_por = $2::uuid)
         )`,
      [req.params.id, user && user.tipo === 'utilizador' ? user.id : null]
    );
    if (!result.rows.length) return res.status(404).json({ erro: 'Documento não encontrado.' });

    const documento = result.rows[0];
    delete documento.publicado_por;

    return res.json({ documento });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
