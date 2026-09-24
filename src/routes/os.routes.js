const express = require('express');
const { readCollection, mutateCollection, genId } = require('../db');
const { requireAuth, requireRole } = require('../auth/middleware');
const router = express.Router();
const team = o => o.tecnicoIds || [o.tecnicoId];
const fail = (status,message) => { const err = new Error(message); err.status=status; throw err; };
const categories = ['ANTES','DURANTE','DEPOIS','EQUIPAMENTOS','EVIDENCIA'];
function imageOK(value) { return typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length <= 7000000; }
function validPhotoDescription(value) { return value===undefined || (typeof value==='string' && value.length<=1000); }
function reportBody(body) {
  if (typeof body.descricao !== 'string' || body.descricao.length > 30000) fail(400,'Descrição inválida (até 30.000 caracteres).');
  if (!body.camposServico || typeof body.camposServico !== 'object' || Array.isArray(body.camposServico) || Object.keys(body.camposServico).length > 30 || Object.values(body.camposServico).some(v=>typeof v !== 'string' || v.length > 4000)) fail(400,'Campos do relatório inválidos.');
  if (body.assinatura != null && body.assinatura !== '' && !imageOK(body.assinatura)) fail(400,'Assinatura inválida.');
}
function assigned(o,req) { if (req.session.perfil==='TECNICO' && !team(o).includes(req.session.tecnicoId)) fail(403,'Esta ordem de serviço não pertence à sua equipe.'); }
function responsible(o,req) { assigned(o,req); if (o.responsavelUsuarioId ? o.responsavelUsuarioId !== req.session.userId : o.tecnicoId !== req.session.tecnicoId) fail(403,'Somente o técnico que fez o check-in pode preencher ou editar o relatório.'); }
function find(items,id) { const o=items.find(o=>o.id===id); if (!o) fail(404,'Ordem de serviço não encontrada.'); return o; }
async function related(o) {
  const tecnicos=await readCollection('tecnicos');
  const cliente=o.clienteSnapshot || (await readCollection('clientes')).find(c=>c.id===o.clienteId) || {nome:'Cliente indisponível',endereco:'',telefone:''};
  const equipe=tecnicos.filter(t=>team(o).includes(t.id));
  return {...o,cliente,tecnicoIds:team(o),equipe,tecnicoNome:equipe.map(t=>t.nome).join(' + ') || '—',responsavelNome:tecnicos.find(t=>t.id===(o.responsavelTecnicoId || o.tecnicoId))?.nome || '—'};
}
const wrap = fn => async(req,res,next)=>{try{await fn(req,res);}catch(err){if(err.status)res.status(err.status).json({erro:err.message});else next(err);}};
router.use(requireAuth,requireRole('ADMIN','TECNICO'));
router.get('/',wrap(async(req,res)=>{let all=await readCollection('ordens_servico');if(req.session.perfil==='TECNICO')all=all.filter(o=>team(o).includes(req.session.tecnicoId));res.json({ordens:await Promise.all(all.map(related))});}));
router.get('/:id',wrap(async(req,res)=>{const o=find(await readCollection('ordens_servico'),req.params.id);assigned(o,req);res.json({os:await related(o)});}));
router.post('/avulso',requireRole('TECNICO'),wrap(async(req,res)=>{
  const b=req.body||{},cliente={};
  const tecnicoIds=b.tecnicoIds ?? [req.session.tecnicoId];
  const tecnicos=await readCollection('tecnicos');
  if(!Array.isArray(tecnicoIds)||!tecnicoIds.length||tecnicoIds.length>20||new Set(tecnicoIds).size!==tecnicoIds.length||tecnicoIds.some(id=>!tecnicos.some(t=>t.id===id))||!tecnicoIds.includes(req.session.tecnicoId))fail(400,'Selecione técnicos válidos, incluindo você, sem repetição.');
  for(const [key,max] of Object.entries({nome:180,endereco:700,telefone:80,tipoSistema:500})){
    const v=b.cliente?.[key]??'';if(typeof v!=='string'||v.length>max)fail(400,'Dados do cliente inválidos.');cliente[key]=v.trim();
  }
  if(!cliente.nome||!cliente.endereco||!cliente.tipoSistema)fail(400,'Informe cliente, endereço e sistema.');
  if(typeof b.servico!=='string'||!b.servico.trim()||b.servico.length>300)fail(400,'Informe o serviço em até 300 caracteres.');
  const dates=[b.chegada,b.saida];
  if(dates.some(v=>typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))))fail(400,'Informe horários válidos.');
  if(Date.parse(b.saida)<Date.parse(b.chegada))fail(400,'A saída não pode ser anterior à chegada.');
  if(typeof b.data!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.data)||typeof b.hora!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.hora))fail(400,'Data ou horário inválido.');
  const os={id:genId('os'),origem:'AVULSO',clienteId:null,clienteSnapshot:cliente,tecnicoId:req.session.tecnicoId,tecnicoIds,responsavelUsuarioId:req.session.userId,responsavelTecnicoId:req.session.tecnicoId,tipoServico:'PERSONALIZADO',tipoServicoPersonalizado:b.servico.trim(),data:b.data,hora:b.hora,status:'EM_ANDAMENTO',descricao:'',camposServico:{sistemaCliente:cliente.tipoSistema},fotos:[],assinatura:null,checkin:{timestamp:b.chegada,manual:true},saidaInformada:b.saida,checkout:null,edicoesRelatorio:0};
  await mutateCollection('ordens_servico',items=>items.push(os));res.status(201).json({os:await related(os)});
}));
router.post('/',requireRole('ADMIN'),wrap(async(req,res)=>{
  const {clienteId,tipoServico,tipoServicoPersonalizado,data,hora}=req.body || {};
  const tecnicoIds=req.body.tecnicoIds || [req.body.tecnicoId];
  const tecnicos=await readCollection('tecnicos');
  if (!Array.isArray(tecnicoIds) || !tecnicoIds.length || tecnicoIds.length>20 || new Set(tecnicoIds).size!==tecnicoIds.length || tecnicoIds.some(id=>!tecnicos.some(t=>t.id===id))) fail(400,'Selecione ao menos um técnico válido, sem repetição.');
  if (typeof data!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(data)) || typeof hora!=='string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) fail(400,'Informe data e horário válidos.');
  const cliente=(await readCollection('clientes')).find(c=>c.id===clienteId);if(!cliente)fail(400,'Selecione um cliente cadastrado.');
  const types=['INSTALACAO_REDE','MANUTENCAO_WIFI','INSTALACAO_CAMERAS','MANUTENCAO_PREVENTIVA','SUPORTE','INSTALACAO_EQUIPAMENTOS','INFRAESTRUTURA','EMERGENCIAL','PERSONALIZADO'];
  if(!types.includes(tipoServico))fail(400,'Tipo de serviço inválido.');
  if(tipoServico==='PERSONALIZADO' && (typeof tipoServicoPersonalizado!=='string' || !tipoServicoPersonalizado.trim() || tipoServicoPersonalizado.length>300))fail(400,'Descreva o tipo de serviço em até 300 caracteres.');
  const os={id:genId('os'),clienteId,clienteSnapshot:{...cliente},tecnicoId:tecnicoIds[0],tecnicoIds,tipoServico,tipoServicoPersonalizado:tipoServico==='PERSONALIZADO'?tipoServicoPersonalizado.trim():'',data,hora,status:'PENDENTE',descricao:'',camposServico:{sistemaCliente:cliente.tipoSistema || ''},fotos:[],assinatura:null,checkin:null,checkout:null,edicoesRelatorio:0};
  await mutateCollection('ordens_servico',items=>items.push(os));
  await mutateCollection('notificacoes',items=>{for(const tecnicoId of tecnicoIds)items.push({id:genId('notif'),tecnicoId,paraAdmin:false,mensagem:`Novo atendimento em equipe: ${data.split('-').reverse().join('/')} às ${hora}`,criadoEm:new Date().toISOString(),lida:false});});
  res.status(201).json({os:await related(os)});
}));
router.delete('/:id',requireRole('ADMIN'),wrap(async(req,res)=>{
  await mutateCollection('ordens_servico',items=>{const o=find(items,req.params.id);items.splice(items.indexOf(o),1);});res.json({ok:true});
}));
router.post('/:id/checkin',requireRole('TECNICO'),wrap(async(req,res)=>{
  let os;await mutateCollection('ordens_servico',items=>{os=find(items,req.params.id);assigned(os,req);if(os.status!=='PENDENTE')fail(409,'O check-in já foi registrado por um integrante da equipe.');os.status='EM_ANDAMENTO';os.responsavelUsuarioId=req.session.userId;os.responsavelTecnicoId=req.session.tecnicoId;os.checkin={timestamp:new Date().toISOString(),tecnicoId:req.session.tecnicoId};});
  res.json({os:await related(os)});
}));
router.post('/:id/checkout',requireRole('TECNICO'),wrap(async(req,res)=>{
  reportBody(req.body || {});let os;
  await mutateCollection('ordens_servico',items=>{os=find(items,req.params.id);responsible(os,req);if(os.status!=='EM_ANDAMENTO')fail(409,'Esta OS precisa estar em andamento para ser concluída.');
    const cats=(os.fotos || []).map(f=>f.categoria);if(!cats.includes('ANTES') || !cats.includes('DEPOIS'))fail(400,'Anexe uma foto antes e uma depois do serviço.');
    os.status='CONCLUIDO';os.descricao=req.body.descricao;os.camposServico=req.body.camposServico;os.assinatura=req.body.assinatura || null;os.checkout={timestamp:os.origem==='AVULSO'?os.saidaInformada:new Date().toISOString(),manual:os.origem==='AVULSO'};os.edicoesRelatorio=0;
  });res.json({os:await related(os)});
}));
router.patch('/:id/report',requireRole('TECNICO'),wrap(async(req,res)=>{
  reportBody(req.body || {});let os;
  if(req.body.fotos!==undefined && (!Array.isArray(req.body.fotos) || req.body.fotos.some(f=>!f || !categories.includes(f.categoria) || !validPhotoDescription(f.descricao) || (f.src!==undefined ? !imageOK(f.src) : typeof f.id!=='string'))))fail(400,'Fotos inválidas.');
  await mutateCollection('ordens_servico',items=>{os=find(items,req.params.id);responsible(os,req);if(os.status!=='CONCLUIDO')fail(409,'Conclua o atendimento antes de editar o relatório.');
    if(req.body.fotos){const cats=req.body.fotos.map(f=>f.categoria);if(!cats.includes('ANTES') || !cats.includes('DEPOIS'))fail(400,'Mantenha ao menos uma foto antes e uma depois.');os.fotos=req.body.fotos.map(f=>{if(f.src===undefined){const saved=(os.fotos||[]).find(photo=>photo.id===f.id);if(!saved)fail(400,'Foto original não encontrada.');return {...saved,categoria:f.categoria,descricao:f.descricao ?? saved.descricao ?? ''};}return {id:genId('foto'),categoria:f.categoria,src:f.src,descricao:f.descricao || '',criadoEm:new Date().toISOString()};});}
    os.descricao=req.body.descricao;os.camposServico=req.body.camposServico;os.assinatura=req.body.assinatura || null;os.edicoesRelatorio=(os.edicoesRelatorio || 0)+1;os.editadoEm=new Date().toISOString();os.editadoPor=req.session.userId;
  });res.json({os:await related(os)});
}));
router.post('/:id/fotos',requireRole('TECNICO'),wrap(async(req,res)=>{
  const {categoria,dataUrl}=req.body || {};if(!categories.includes(categoria) || !imageOK(dataUrl))fail(400,'Envie uma imagem válida de até aproximadamente 5 MB.');let fotos;
  await mutateCollection('ordens_servico',items=>{const os=find(items,req.params.id);responsible(os,req);if(os.status!=='EM_ANDAMENTO')fail(409,'Fotos só podem ser anexadas durante o atendimento; para relatório concluído use a edição do relatório.');os.fotos ||= [];os.fotos.push({id:genId('foto'),categoria,src:dataUrl,descricao:'',criadoEm:new Date().toISOString()});fotos=os.fotos;});res.status(201).json({fotos});
}));
router.delete('/:id/fotos/:fotoId',requireRole('TECNICO'),wrap(async(req,res)=>{
  let fotos;
  await mutateCollection('ordens_servico',items=>{
    const os=find(items,req.params.id);responsible(os,req);
    if(os.status!=='EM_ANDAMENTO')fail(409,'Para remover fotos de um relatório concluído, use a edição do relatório.');
    const index=(os.fotos||[]).findIndex(f=>f.id===req.params.fotoId);
    if(index<0)fail(404,'Foto não encontrada.');
    os.fotos.splice(index,1);fotos=os.fotos;
  });res.json({fotos});
}));
router.patch('/:id/fotos/:fotoId',requireRole('TECNICO'),wrap(async(req,res)=>{
  const descricao=req.body?.descricao;
  if(typeof descricao!=='string' || !validPhotoDescription(descricao))fail(400,'A descrição da foto deve ter no máximo 1000 caracteres.');
  let foto;
  await mutateCollection('ordens_servico',items=>{
    const os=find(items,req.params.id);responsible(os,req);
    if(os.status!=='EM_ANDAMENTO')fail(409,'Para alterar fotos de um relatório concluído, use a edição do relatório do relatório.');
    foto=(os.fotos||[]).find(f=>f.id===req.params.fotoId);if(!foto)fail(404,'Foto não encontrada.');foto.descricao=descricao;
  });res.json({foto});
}));
module.exports = router;
