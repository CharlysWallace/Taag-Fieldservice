const express = require('express');
const { readCollection, mutateCollection, genId } = require('../db');
const { requireAuth, requireRole } = require('../auth/middleware');
const router = express.Router();
router.use(requireAuth, requireRole('ADMIN'));
function validate(body) {
  const values = {};
  for (const [key, max] of Object.entries({ nome: 180, endereco: 700, telefone: 80, tipoSistema: 500, email: 200 })) {
    const value = body?.[key] ?? '';
    if (typeof value !== 'string' || value.length > max) throw new Error(`Campo ${key} inválido.`);
    values[key] = value.trim();
  }
  if (!values.nome || !values.endereco || !values.telefone || !values.tipoSistema) throw new Error('Preencha nome, endereço, telefone e tipo do sistema.');
  return values;
}
router.get('/', async (req, res, next) => {
  try { res.json({ clientes: await readCollection('clientes') }); } catch (err) { next(err); }
});
router.post('/', async (req, res, next) => {
  let values; try { values = validate(req.body); } catch (err) { return res.status(400).json({ erro: err.message }); }
  try {
    const cliente = { id: genId('c'), ...values };
    await mutateCollection('clientes', items => { items.push(cliente); });
    res.status(201).json({ cliente });
  } catch (err) { next(err); }
});
router.put('/:id', async (req, res, next) => {
  let values; try { values = validate(req.body); } catch (err) { return res.status(400).json({ erro: err.message }); }
  try {
    let cliente;
    await mutateCollection('clientes', items => {
      const item = items.find(c => c.id === req.params.id);
      if (item) { Object.assign(item, values); cliente = item; }
    });
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' });
    res.json({ cliente });
  } catch (err) { next(err); }
});
router.delete('/:id', async (req,res,next)=>{
  try {
    const cliente=(await readCollection('clientes')).find(c=>c.id===req.params.id);
    if(!cliente)return res.status(404).json({erro:'Cliente não encontrado.'});
    // Preserve historical orders created before client snapshots were introduced.
    await mutateCollection('ordens_servico',items=>{for(const o of items)if(o.clienteId===cliente.id&&!o.clienteSnapshot)o.clienteSnapshot={...cliente};});
    await mutateCollection('clientes',items=>{const index=items.findIndex(c=>c.id===cliente.id);if(index>=0)items.splice(index,1);});
    res.json({ok:true});
  }catch(err){next(err);}
});
module.exports = router;
