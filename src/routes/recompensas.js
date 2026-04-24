const router = require('express').Router();
const { pool, query } = require('../db');
const { requireTipo } = require('../middleware/auth');

const BENEFICIOS = [
  { codigo: 'saldo-500', nome: '500 Kz saldo Unitel', pontos: 100 },
  { codigo: 'dados-1gb', nome: '1 GB dados Unitel', pontos: 150 },
  { codigo: 'dinheiro-1000', nome: '1.000 Kz em dinheiro', pontos: 200 },
  { codigo: 'voucher-parceiro', nome: 'Voucher parceiro AcheiDoc', pontos: 300 },
];

router.get('/', ...requireTipo('utilizador'), async (req, res, next) => {
  try {
    const userResult = await query('SELECT id, nome, email, pontos FROM utilizadores WHERE id = $1', [req.user.id]);
    if (!userResult.rows.length) return res.status(404).json({ erro: 'Utilizador não encontrado.' });

    const historicoResult = await query(
      `SELECT criado_em AS data, 'Documento entregue' AS acao, id AS doc_id, 60 AS pontos
       FROM documentos
       WHERE publicado_por = $1 AND status = 'ENTREGUE'
       UNION ALL
       SELECT criado_em AS data, 'Documento recebido no ponto' AS acao, id AS doc_id, 10 AS pontos
       FROM documentos
       WHERE publicado_por = $1 AND status IN ('DISPONIVEL_LEVANTAMENTO', 'AGUARDANDO_ENTREGA')
       UNION ALL
       SELECT criado_em AS data, 'Resgate solicitado' AS acao, NULL AS doc_id, (pontos_usados * -1) AS pontos
       FROM resgates_pontos
       WHERE utilizador_id = $1
       ORDER BY data DESC
       LIMIT 50`,
      [req.user.id]
    );

    return res.json({
      utilizador: userResult.rows[0],
      beneficios: BENEFICIOS,
      historico: historicoResult.rows,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/resgatar', ...requireTipo('utilizador'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { beneficio_codigo } = req.body;
    const beneficio = BENEFICIOS.find((item) => item.codigo === beneficio_codigo);
    if (!beneficio) return res.status(400).json({ erro: 'Benefício inválido.' });

    await client.query('BEGIN');
    const userResult = await client.query('SELECT id, pontos FROM utilizadores WHERE id = $1 FOR UPDATE', [req.user.id]);
    if (!userResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Utilizador não encontrado.' });
    }

    const pontosAtuais = Number(userResult.rows[0].pontos || 0);
    if (pontosAtuais < beneficio.pontos) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Pontos insuficientes para este benefício.' });
    }

    const resgateResult = await client.query(
      `INSERT INTO resgates_pontos (utilizador_id, beneficio_codigo, beneficio_nome, pontos_usados)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, beneficio.codigo, beneficio.nome, beneficio.pontos]
    );

    const updatedUser = await client.query(
      'UPDATE utilizadores SET pontos = pontos - $1 WHERE id = $2 RETURNING id, nome, email, pontos',
      [beneficio.pontos, req.user.id]
    );

    await client.query('COMMIT');
    return res.status(201).json({
      resgate: resgateResult.rows[0],
      utilizador: updatedUser.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return next(err);
  } finally {
    client.release();
  }
});

module.exports = router;