const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token de autenticação em falta.' });
  }

  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

function requireTipo(...tipos) {
  return [
    requireAuth,
    (req, res, next) => {
      if (!tipos.includes(req.user.tipo)) {
        return res.status(403).json({ erro: 'Acesso não autorizado.' });
      }
      return next();
    },
  ];
}

module.exports = { requireAuth, requireTipo };
