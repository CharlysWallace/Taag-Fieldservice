const express = require('express');
const crypto = require('crypto');
const { readCollection, mutateCollection } = require('../db');
const { comparePassword, hashPassword } = require('../auth/hash');
const { requireAuth, requireRole } = require('../auth/middleware');
const rateLimit = require('../auth/rate-limit');
const router = express.Router();
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const validPassword = value => typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
const safeToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const emailOf = req => typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0,200) : '';
const active = r => r && Date.parse(r.expiraEm) > Date.now();
router.post('/request', rateLimit(5), async (req, res, next) => {
  try {
    const id = crypto.randomBytes(12).toString('hex'), token = crypto.randomBytes(32).toString('hex');
    const protocolo = id.slice(-8).toUpperCase();
    await mutateCollection('usuarios', users => {
      const user = users.find(u => u.email.toLowerCase() === emailOf(req));
      if (!user) return;
      user.passwordResets = (user.passwordResets || []).filter(active);
      if (user.passwordResets.length >= 3) return;
      user.passwordResets.push({ id, protocolo, tokenHash: digest(token), status: 'PENDENTE', criadoEm: new Date().toISOString(), expiraEm: new Date(Date.now()+86400000).toISOString() });
    });
    // A mesma resposta para e-mails existentes e inexistentes evita enumeração.
    res.json({ id, token, protocolo, mensagem: 'Se a conta existir, a solicitação estará disponível para o administrador. Informe seu protocolo e confirme sua identidade com ele.' });
  } catch (err) { next(err); }
});
router.post('/status', rateLimit(120), async (req, res, next) => {
  try {
    if (!safeToken(req.body?.token)) return res.status(400).json({ erro: 'Solicitação inválida.' });
    const users = await readCollection('usuarios');
    const reset = users.flatMap(u=>u.passwordResets || []).find(r => r.id === req.body.id && r.tokenHash === digest(req.body.token));
    res.json({ status: active(reset) ? reset.status : 'INDISPONIVEL' });
  } catch (err) { next(err); }
});
router.get('/pending', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const users = await readCollection('usuarios');
    res.json({ solicitacoes: users.flatMap(u => (u.passwordResets || []).filter(r => active(r) && r.status === 'PENDENTE').map(r => ({ id:r.id, protocolo:r.protocolo, nome:u.nome, email:u.email, criadoEm:r.criadoEm }))) });
  } catch (err) { next(err); }
});
router.post('/:id/decision', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  if (!['APROVADO','RECUSADO'].includes(req.body?.status)) return res.status(400).json({ erro: 'Decisão inválida.' });
  try {
    let changed = false;
    await mutateCollection('usuarios', users => {
      const reset = users.flatMap(u=>u.passwordResets || []).find(r=>r.id===req.params.id);
      if (!active(reset) || reset.status !== 'PENDENTE') return;
      reset.status = req.body.status; reset.aprovadorId = req.session.userId; changed = true;
    });
    if (!changed) return res.status(409).json({ erro: 'Solicitação expirada ou já respondida.' });
    res.json({ ok:true });
  } catch (err) { next(err); }
});
router.post('/complete', rateLimit(10), async (req, res, next) => {
  if (!safeToken(req.body?.token) || !validPassword(req.body?.novaSenha)) return res.status(400).json({ erro: 'Use uma senha de pelo menos 8 caracteres e até 72 bytes.' });
  try {
    let changed = false;
    await mutateCollection('usuarios', users => {
      const user = users.find(u => (u.passwordResets || []).some(r => r.id === req.body.id && r.tokenHash === digest(req.body.token) && r.status === 'APROVADO' && active(r)));
      if (!user) return;
      user.senhaHash = hashPassword(req.body.novaSenha); user.sessionVersion = (user.sessionVersion || 0)+1;
      user.passwordResets = []; changed = true;
    });
    if (!changed) return res.status(403).json({ erro: 'A redefinição precisa de aprovação válida do administrador.' });
    req.session = null; res.json({ ok:true });
  } catch (err) { next(err); }
});
router.post('/change', rateLimit(10), async (req, res, next) => {
  if (!validPassword(req.body?.novaSenha) || typeof req.body?.senhaAtual !== 'string' || req.body.senhaAtual.length > 200) return res.status(400).json({ erro: 'Informe a senha atual e uma nova senha de pelo menos 8 caracteres e até 72 bytes.' });
  try {
    let changed = false;
    await mutateCollection('usuarios', users => {
      const user = users.find(u=>u.email.toLowerCase()===emailOf(req));
      if (!user || !comparePassword(req.body.senhaAtual,user.senhaHash)) return;
      user.senhaHash = hashPassword(req.body.novaSenha); user.sessionVersion = (user.sessionVersion || 0)+1; user.passwordResets = []; changed = true;
    });
    if (!changed) return res.status(401).json({ erro:'E-mail ou senha atual inválidos.' });
    req.session = null; res.json({ok:true});
  } catch (err) { next(err); }
});
module.exports = router;
