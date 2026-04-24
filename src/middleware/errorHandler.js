/**
 * Handler global de erros. Deve ser registado como último middleware no Express.
 */
function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} →`, err.message);

  // Erros de validação do pg (ex: violação de unique)
  if (err.code === '23505') {
    return res.status(409).json({ erro: 'Registo já existe (duplicado).' });
  }

  const status = err.status || 500;
  const mensagem =
    process.env.NODE_ENV === 'production' && status === 500
      ? 'Erro interno do servidor.'
      : err.message || 'Erro interno do servidor.';

  res.status(status).json({ erro: mensagem });
}

module.exports = errorHandler;
