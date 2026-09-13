/**
 * ============================================================
 *  MIDDLEWARES DE AUTENTICAÇÃO E AUTORIZAÇÃO (src/auth/middleware.js)
 * ------------------------------------------------------------
 *  O QUE ISSO FAZ:
 *  Intercepta toda requisição ANTES dela chegar na rota, e decide:
 *    1) "Essa pessoa está logada?"                 -> requireAuth
 *    2) "Essa pessoa tem o perfil certo pra isso?"  -> requireRole(...)
 *
 *  POR QUE ISSO É O CORAÇÃO DA SEGURANÇA DO APP:
 *  No protótipo 100% frontend, um técnico mal-intencionado podia
 *  abrir o DevTools, mudar `state.role = 'ADMIN'` na memória do
 *  navegador, e o app "acreditava" nele — nada no servidor
 *  conferia de verdade quem podia fazer o quê.
 *
 *  Aqui é diferente: a sessão vive num cookie ASSINADO
 *  (cookie-session, configurado em server.js) que o navegador não
 *  consegue forjar sem conhecer o COOKIE_SECRET do servidor. Toda
 *  vez que uma rota exige `requireRole('ADMIN')`, é o SERVIDOR que
 *  decide, olhando a sessão real, não o que o frontend alega ser.
 *
 *  Isso é exatamente o "Importante" apontado no SECURITY_AUDIT.md
 *  do próprio projeto: "autorização real precisa ser aplicada no
 *  backend em cada endpoint" — é isso que este arquivo entrega.
 * ============================================================
 */

/** Bloqueia a rota se não houver ninguém logado nesta sessão. */
async function requireAuth(req, res, next) {
  try {
    const { readCollection } = require('../db');
    const user = req.session?.userId && (await readCollection('usuarios')).find(u => u.id === req.session.userId);
    if (!user || (req.session.sessionVersion || 0) !== (user.sessionVersion || 0)) {
      req.session = null; return res.status(401).json({ erro: 'Não autenticado. Faça login novamente.' });
    }
    req.session.perfil = user.perfil; req.session.tecnicoId = user.tecnicoId || null;
    next();
  } catch (err) { next(err); }
}

/**
 * Bloqueia a rota se o perfil da sessão não estiver na lista permitida.
 * Uso: app.get('/rota', requireAuth, requireRole('ADMIN'), handler)
 */
function requireRole(...perfisPermitidos) {
  return (req, res, next) => {
    if (!req.session || !perfisPermitidos.includes(req.session.perfil)) {
      return res.status(403).json({ erro: 'Você não tem permissão para acessar este recurso.' });
    }
    next();
  };
}

/**
 * Bloqueia a rota se a OS do parâmetro :id não pertencer ao técnico logado
 * — a peça que garante, no servidor, que "técnico só vê a própria agenda"
 * (antes isso era só um filtro visual no frontend, driblável pelo DevTools).
 * Administradores e visualizadores passam direto (eles têm acesso amplo,
 * controlado por requireRole nas próprias rotas).
 */
function requireOwnOsOrElevated(getOsById) {
  return async (req, res, next) => {
    if (req.session.perfil !== 'TECNICO') return next();
    const os = await getOsById(req.params.id);
    if (!os) return res.status(404).json({ erro: 'Ordem de serviço não encontrada.' });
    if (!(os.tecnicoIds || [os.tecnicoId]).includes(req.session.tecnicoId)) {
      return res.status(403).json({ erro: 'Esta ordem de serviço não pertence a você.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, requireOwnOsOrElevated };
