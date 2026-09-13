const express = require('express');
const { readCollection, writeCollection, genId } = require('../db');
const { requireAuth, requireRole } = require('../auth/middleware');
const router = express.Router();
router.use(requireAuth, requireRole('ADMIN','TECNICO'));
const collection = req => `acessos_${req.session.userId}`;
router.get('/', async (req, res, next) => {
  try { res.json({ acessos: await readCollection(collection(req)) }); } catch (err) { next(err); }
});
router.post('/', async (req, res, next) => {
  try {
    const fields = { sistema: 120, endereco: 1000, usuario: 200, observacoes: 2000 };
    const entry = {};
    for (const [key, limit] of Object.entries(fields)) {
      const value = req.body?.[key] ?? '';
      if (typeof value !== 'string' || value.length > limit) return res.status(400).json({ erro: `Campo ${key} inválido.` });
      entry[key] = value.trim();
    }
    if (!entry.sistema || !entry.usuario) return res.status(400).json({ erro: 'Informe o sistema e o usuário de acesso.' });
    if (entry.endereco) {
      try { if (!['http:', 'https:'].includes(new URL(entry.endereco).protocol)) throw new Error(); }
      catch { return res.status(400).json({ erro: 'Use um endereço completo começando com https:// ou http://.' }); }
    }
    const acessos = await readCollection(collection(req));
    const acesso = { id: genId('acesso'), ...entry, criadoEm: new Date().toISOString() };
    acessos.push(acesso);
    await writeCollection(collection(req), acessos);
    res.status(201).json({ acesso });
  } catch (err) { next(err); }
});
module.exports = router;
