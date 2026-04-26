const router = require('express').Router();
const crypto = require('crypto');
const { query } = require('../db');
const { requireTipo } = require('../middleware/auth');
const { enviarNotificacaoPagamento } = require('../services/email');

function gerarCodigo(prefixo) {
  return `${prefixo}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

router.post('/', ...requireTipo('utilizador'), async (req, res, next) => {
  try {
    const { doc_id, telefone, valor = 500.0 } = req.body;
    if (!doc_id) return res.status(400).json({ erro: 'doc_id é obrigatório.' });

    const doc = await query(
      `SELECT d.id, d.ponto_entrega_id, d.codigo_resgate, d.chave_entrega,
              p.id AS ponto_id, p.nome AS ponto_nome, p.endereco, p.horario, p.telefone,
              a.nome AS agente_nome
       FROM documentos d
       LEFT JOIN pontos_entrega p ON p.id = d.ponto_entrega_id
       LEFT JOIN agentes a ON a.id = p.agente_id
       WHERE d.id = $1 AND d.status = $2`,
      [doc_id, 'PUBLICADO']
    );
    if (!doc.rows.length) return res.status(404).json({ erro: 'Documento não encontrado ou indisponível para pagamento.' });

    const exists = await query(
      `SELECT id FROM pagamentos WHERE doc_id = $1 AND utilizador_id = $2 AND status != 'REJEITADO'`,
      [doc_id, req.user.id]
    );
    if (exists.rows.length) return res.status(409).json({ erro: 'Já existe pagamento registado para este documento.' });

    const id = `PAG-${Date.now()}`;
    const entidade = '00282';
    const referencia = doc_id.replace(/\D/g, '').slice(0, 9).padStart(9, '0');

    const documento = doc.rows[0];
    if (!documento.ponto_id) {
      return res.status(409).json({ erro: 'Documento sem ponto de entrega configurado.' });
    }
    const codigoResgate = documento.codigo_resgate || gerarCodigo('RES');
    const chaveEntrega = documento.chave_entrega || gerarCodigo('ENT');
    await query(
      'UPDATE documentos SET codigo_resgate = $1, chave_entrega = $2 WHERE id = $3',
      [codigoResgate, chaveEntrega, doc_id]
    );

    const created = await query(
      `INSERT INTO pagamentos (id, doc_id, utilizador_id, valor, entidade, referencia, telefone)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [id, doc_id, req.user.id, valor, entidade, referencia, telefone || null]
    );

    return res.status(201).json({
      pagamento: created.rows[0],
      codigo_resgate: codigoResgate,
      chave_entrega: chaveEntrega,
      ponto_entrega: documento.ponto_id ? {
        id: documento.ponto_id,
        nome: documento.ponto_nome,
        endereco: documento.endereco,
        horario: documento.horario,
        telefone: documento.telefone,
        agente_nome: documento.agente_nome,
      } : null,
    });
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
    await query(
      `UPDATE documentos
       SET status = CASE
         WHEN status IN ('PUBLICADO', 'PENDENTE') THEN 'AGUARDANDO_ENTREGA'
         ELSE status
       END
       WHERE id = $1`,
      [p.doc_id]
    );

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
