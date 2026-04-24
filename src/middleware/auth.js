const jwt = require('jsonwebtoken');

/**
 * Middleware que verifica o token JWT no header Authorization.
 * Adiciona req.user = { id, email, tipo } para as rotas protegidas.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token de autenticação em falta.' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

/**
 * Gera middlewares que verificam o tipo de utilizador no token.
 * Uso: requireTipo('admin'), requireTipo('agente'), requireTipo('utilizador')
 */
function requireTipo(...tipos) {
  return [
    requireAuth,
    (req, res, next) => {
      if (!tipos.includes(req.user.tipo)) {
        return res.status(403).json({ erro: 'Acesso não autorizado.' });
      }
      next();
    },
  ];
}

module.exports = { requireAuth, requireTipo };
