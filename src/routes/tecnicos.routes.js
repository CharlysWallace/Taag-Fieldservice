/**
 * ============================================================
 *  ROTA DE TÉCNICOS (src/routes/tecnicos.routes.js)
 * ------------------------------------------------------------
 *  O QUE VIVE AQUI:
 *   GET /api/tecnicos - lista todos os técnicos cadastrados
 *
 *  UTILIDADE NO APP COMO UM TODO:
 *  O frontend precisa dessa lista em três lugares: o formulário
 *  "Nova ordem de serviço" do admin (escolher o técnico
 *  responsável), os filtros do painel administrativo/dashboard
 *  (filtrar por técnico), e a tela de login/perfil (mostrar o
 *  nome do técnico vinculado à conta logada).
 *
 *  Antes, essa lista vivia hardcoded dentro do app.js do
 *  navegador — se alguém aprovasse um novo técnico (ver
 *  auth.routes.js), o frontend só saberia depois de recarregar
 *  o código-fonte inteiro. Agora ela vem do backend a cada login,
 *  então um técnico aprovado agora mesmo já aparece no dropdown
 *  do admin sem precisar de deploy nenhum.
 * ============================================================
 */

const express = require('express');
const { readCollection } = require('../db');
const { requireAuth } = require('../auth/middleware');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  res.json({ tecnicos: await readCollection('tecnicos') });
});

module.exports = router;
