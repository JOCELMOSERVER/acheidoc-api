const router = require('express').Router();
const { query } = require('../db');
const { listActivePoints, findNearestPoint } = require('../services/pontosEntrega');

router.get('/', async (req, res, next) => {
  try {
    const pontos = await listActivePoints();
    return res.json({ pontos });
  } catch (err) {
    return next(err);
  }
});

router.get('/nearest', async (req, res, next) => {
  try {
    const ponto = await findNearestPoint({ provincia: req.query.provincia, municipio: req.query.municipio });
    return res.json({ ponto_entrega: ponto });
  } catch (err) {
    return next(err);
  }
});

router.get('/documento/:id', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT d.id AS doc_id, d.codigo_resgate, d.chave_entrega,
              p.id, p.nome, p.endereco, p.horario, p.telefone, p.provincia, p.municipio,
              p.agente_id, a.nome AS agente_nome
       FROM documentos d
       LEFT JOIN pontos_entrega p ON p.id = d.ponto_entrega_id
       LEFT JOIN agentes a ON a.id = p.agente_id
       WHERE d.id = $1`,
      [req.params.id]
    );

    if (!result.rows.length) return res.status(404).json({ erro: 'Documento não encontrado.' });
    const row = result.rows[0];
    return res.json({
      documento: {
        id: row.doc_id,
        codigo_resgate: row.codigo_resgate,
        chave_entrega: row.chave_entrega,
      },
      ponto_entrega: row.id ? {
        id: row.id,
        nome: row.nome,
        endereco: row.endereco,
        horario: row.horario,
        telefone: row.telefone,
        provincia: row.provincia,
        municipio: row.municipio,
        agente_id: row.agente_id,
        agente_nome: row.agente_nome,
      } : null,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;