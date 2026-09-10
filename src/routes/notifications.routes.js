/**
 * ============================================================
 *  ROTAS DE NOTIFICAÇÕES (src/routes/notifications.routes.js)
 * ------------------------------------------------------------
 *  O QUE VIVE AQUI:
 *   GET  /api/notificacoes         - lista as notificações da sessão atual
 *   POST /api/notificacoes/marcar-lidas - marca todas como lidas
 *
 *  UTILIDADE NO APP COMO UM TODO:
 *  As notificações já eram criadas nas rotas de negócio (uma nova
 *  OS gera notificação pro técnico em os.routes.js; um novo
 *  cadastro gera notificação pro admin em auth.routes.js) — este
 *  arquivo só cuida de LER e MARCAR COMO LIDA, sempre filtrando
 *  pela sessão de quem está pedindo (um técnico nunca recebe as
 *  notificações de outro técnico, nem as do admin).
 *
 *  Isso é hoje um "polling" (o frontend chamaria essa rota de
 *  tempos em tempos). O próximo passo natural — se quiser
 *  notificação em tempo real mesmo com o app fechado — é trocar
 *  isso por Web Push (Service Worker + Push API) ou WebSocket,
 *  mantendo esta mesma tabela como fonte da verdade.
 * ============================================================
 */

const express = require('express');
const { readCollection, writeCollection } = require('../db');
const { requireAuth } = require('../auth/middleware');

const router = express.Router();

/** Filtra as notificações que pertencem à sessão atual (técnico vê as suas; admin vê as dele). */
async function minhasNotificacoes(req) {
  const todas = await readCollection('notificacoes');
  if (req.session.perfil === 'ADMIN') return todas.filter((n) => n.paraAdmin);
  if (req.session.perfil === 'TECNICO') return todas.filter((n) => n.tecnicoId === req.session.tecnicoId);
  return []; // visualizador não tem notificações neste modelo, por ora
}

// ---------- GET /api/notificacoes ----------
router.get('/', requireAuth, async (req, res) => {
  const minhas = (await minhasNotificacoes(req)).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const naoLidas = minhas.filter((n) => !n.lida).length;
  res.json({ notificacoes: minhas, naoLidas });
});

// ---------- POST /api/notificacoes/marcar-lidas ----------
router.post('/marcar-lidas', requireAuth, async (req, res) => {
  const todas = await readCollection('notificacoes');
  const idsQueSaoMinhas = new Set((await minhasNotificacoes(req)).map((n) => n.id));
  todas.forEach((n) => {
    if (idsQueSaoMinhas.has(n.id)) n.lida = true;
  });
  await writeCollection('notificacoes', todas);
  res.json({ ok: true });
});

module.exports = router;
