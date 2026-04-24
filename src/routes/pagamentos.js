const router = require('express').Router();
const { query } = require('../db');
const { requireTipo } = require('../middleware/auth');
const { enviarNotificacaoPagamento } = require('../services/email');

// POST /api/pagamentos — registar pagamento (utilizador autenticado)
router.post('/', ...requireTipo('utilizador'), async (req, res, next) => {
  try {
    const { doc_id, telefone, valor = 500.00 } = req.body;
    if (!doc_id) return res.status(400).json({ erro: 'doc_id é obrigatório.' });

    // Verifica se documento existe e está publicado
    const docResult = await query(
      `SELECT id FROM documentos WHERE id = $1 AND status = 'PUBLICADO'`,
      [doc_id]
    );
    if (docResult.rows.length === 0) {
      return res.status(404).json({ erro: 'Documento não encontrado ou não disponível para pagamento.' });
    }

    // Evita pagamento duplicado para o mesmo documento pelo mesmo utilizador
    const existente = await query(
      `SELECT id FROM pagamentos WHERE doc_id = $1 AND utilizador_id = $2 AND status != 'REJEITADO'`,
      [doc_id, req.user.id]
    );
    if (existente.rows.length > 0) {
      return res.status(409).json({ erro: 'Já existe um pagamento registado para este documento.' });
    }

    const id = 'PAG-' + Date.now();
    const entidade = '00282';
    const referencia = doc_id.replace(/\D/g, '').slice(0, 9).padStart(9, '0');

    const result = await query(
      `INSERT INTO pagamentos (id, doc_id, utilizador_id, valor, entidade, referencia, telefone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, doc_id, req.user.id, valor, entidade, referencia, telefone || null]
    );

    res.status(201).json({ pagamento: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/pagamentos/meus — pagamentos do utilizador autenticado
router.get('/meus', ...requireTipo('utilizador'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT p.*, d.tipo, d.nome_proprietario FROM pagamentos p
       JOIN documentos d ON d.id = p.doc_id
       WHERE p.utilizador_id = $1
       ORDER BY p.criado_em DESC`,
      [req.user.id]
    );
    res.json({ pagamentos: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/pagamentos/admin — todos os pagamentos (admin)
router.get('/admin', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];

    if (status) { params.push(status); conditions.push(`p.status = $${params.length}`); }

    params.push(parseInt(limit), offset);
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await query(
      `SELECT p.*, d.tipo, d.nome_proprietario, u.nome AS utilizador_nome, u.email AS utilizador_email
       FROM pagamentos p
       JOIN documentos d ON d.id = p.doc_id
       LEFT JOIN utilizadores u ON u.id = p.utilizador_id
       ${where}
       ORDER BY p.criado_em DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ pagamentos: result.rows });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/pagamentos/admin/:id/confirmar — confirmar pagamento (admin)
router.patch('/admin/:id/confirmar', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE pagamentos SET status = 'PAGO', confirmado_em = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Pagamento não encontrado.' });

    const pag = result.rows[0];

    // Notifica utilizador por email
    const userResult = await query(
      `SELECT u.email, u.nome, d.tipo FROM utilizadores u
       JOIN pagamentos p ON p.utilizador_id = u.id
       JOIN documentos d ON d.id = p.doc_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (userResult.rows.length > 0) {
      const { email, nome, tipo } = userResult.rows[0];
      enviarNotificacaoPagamento(email, nome, tipo, pag.referencia).catch(() => {});
    }

    res.json({ pagamento: pag });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/pagamentos/admin/:id/rejeitar — rejeitar pagamento (admin)
router.patch('/admin/:id/rejeitar', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE pagamentos SET status = 'REJEITADO' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Pagamento não encontrado.' });
    res.json({ pagamento: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
