const router = require('express').Router();
const { query } = require('../db');
const { requireTipo } = require('../middleware/auth');
const { enviarNotificacaoPagamento } = require('../services/email');

router.post('/', ...requireTipo('utilizador'), async (req, res, next) => {
  try {
    const { doc_id, telefone, valor = 500.0 } = req.body;
    if (!doc_id) return res.status(400).json({ erro: 'doc_id é obrigatório.' });

    const doc = await query('SELECT id FROM documentos WHERE id = $1 AND status = $2', [doc_id, 'PUBLICADO']);
    if (!doc.rows.length) return res.status(404).json({ erro: 'Documento não encontrado ou indisponível para pagamento.' });

    const exists = await query(
      `SELECT id FROM pagamentos WHERE doc_id = $1 AND utilizador_id = $2 AND status != 'REJEITADO'`,
      [doc_id, req.user.id]
    );
    if (exists.rows.length) return res.status(409).json({ erro: 'Já existe pagamento registado para este documento.' });

    const id = `PAG-${Date.now()}`;
    const entidade = '00282';
    const referencia = doc_id.replace(/\D/g, '').slice(0, 9).padStart(9, '0');

    const created = await query(
      `INSERT INTO pagamentos (id, doc_id, utilizador_id, valor, entidade, referencia, telefone)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [id, doc_id, req.user.id, valor, entidade, referencia, telefone || null]
    );

    return res.status(201).json({ pagamento: created.rows[0] });
  } catch (err) {
    return next(err);
  }
});

router.get('/admin', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    let where = '';

    if (status) {
      params.push(status);
      where = `WHERE p.status = $${params.length}`;
    }

    params.push(parseInt(limit, 10), offset);
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

    return res.json({ pagamentos: result.rows });
  } catch (err) {
    return next(err);
  }
});

router.patch('/admin/:id/confirmar', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const updated = await query(
      `UPDATE pagamentos SET status = 'PAGO', confirmado_em = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!updated.rows.length) return res.status(404).json({ erro: 'Pagamento não encontrado.' });

    const p = updated.rows[0];
    const userInfo = await query(
      `SELECT u.email, u.nome, d.tipo
       FROM pagamentos p
       JOIN utilizadores u ON u.id = p.utilizador_id
       JOIN documentos d ON d.id = p.doc_id
       WHERE p.id = $1`,
      [req.params.id]
    );

    if (userInfo.rows.length) {
      const u = userInfo.rows[0];
      enviarNotificacaoPagamento(u.email, u.nome, u.tipo, p.referencia).catch(() => {});
    }

    return res.json({ pagamento: p });
  } catch (err) {
    return next(err);
  }
});

router.patch('/admin/:id/rejeitar', ...requireTipo('admin'), async (req, res, next) => {
  try {
    const updated = await query(
      `UPDATE pagamentos SET status = 'REJEITADO' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!updated.rows.length) return res.status(404).json({ erro: 'Pagamento não encontrado.' });
    return res.json({ pagamento: updated.rows[0] });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
