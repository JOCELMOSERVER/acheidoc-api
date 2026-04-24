function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err.message);

  if (err.code === '23505') {
    return res.status(409).json({ erro: 'Registo duplicado.' });
  }

  const status = err.status || 500;
  const message = status === 500 && process.env.NODE_ENV === 'production'
    ? 'Erro interno do servidor.'
    : (err.message || 'Erro interno do servidor.');

  return res.status(status).json({ erro: message });
}

module.exports = errorHandler;
