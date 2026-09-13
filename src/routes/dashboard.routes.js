const express=require('express');
const {readCollection}=require('../db');
const {requireAuth,requireRole}=require('../auth/middleware');
const router=express.Router();
router.get('/',requireAuth,requireRole('ADMIN','VISUALIZADOR'),async(req,res,next)=>{
 try {
  const [ordens,clientes,tecnicos]=await Promise.all(['ordens_servico','clientes','tecnicos'].map(readCollection));
  const rows=ordens.map(o=>{
   const ids=o.tecnicoIds || [o.tecnicoId];const cliente=o.clienteSnapshot || clientes.find(c=>c.id===o.clienteId);
   const inicio=Date.parse(o.checkin?.timestamp),fim=Date.parse(o.checkout?.timestamp);
   return {id:o.id,data:o.data,hora:o.hora,cliente:{nome:cliente?.nome || 'Cliente indisponível'},tecnicoIds:ids,tecnicoNome:tecnicos.filter(t=>ids.includes(t.id)).map(t=>t.nome).join(' + '),responsavelNome:!o.checkin ? 'Ainda não iniciado' : tecnicos.find(t=>t.id===(o.responsavelTecnicoId || o.tecnicoId))?.nome || '—',status:o.status,tipoServico:o.tipoServico,tipoServicoPersonalizado:o.tipoServicoPersonalizado || '',motivo:o.camposServico?.motivo || 'Não informado',pendencias:o.camposServico?.pendencias || 'Não informado',minutos:Number.isFinite(inicio)&&Number.isFinite(fim)?Math.max(0,Math.round((fim-inicio)/60000)):null};
  });
  res.json({ordens:rows,tecnicos});
 }catch(err){next(err);}
});
module.exports=router;
