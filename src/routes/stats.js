const router = require('express').Router();
const { query } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const [docsTotalRes, docsEntreguesRes, usersTotalRes, pontosTotalRes] = await Promise.all([
      query('SELECT COUNT(*)::int AS total FROM documentos'),
      query("SELECT COUNT(*)::int AS total FROM documentos WHERE status = 'ENTREGUE'"),
      query('SELECT COUNT(*)::int AS total FROM utilizadores'),
      query('SELECT COUNT(*)::int AS total FROM pontos_entrega WHERE ativo = TRUE'),
    ]);

    return res.json({
      documentos_total: docsTotalRes.rows[0] ? docsTotalRes.rows[0].total : 0,
      documentos_entregues: docsEntreguesRes.rows[0] ? docsEntreguesRes.rows[0].total : 0,
      utilizadores_total: usersTotalRes.rows[0] ? usersTotalRes.rows[0].total : 0,
      pontos_entrega_total: pontosTotalRes.rows[0] ? pontosTotalRes.rows[0].total : 0,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
