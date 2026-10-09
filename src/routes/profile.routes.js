const express=require('express');
const {readCollection,mutateCollection}=require('../db');
const {requireAuth,requireRole}=require('../auth/middleware');
const router=express.Router();
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){if(e.status)res.status(e.status).json({erro:e.message});else next(e);}};
router.use(requireAuth,requireRole('TECNICO'),(req,res,next)=>{res.set('Cache-Control','no-store');next();});
const collection=req=>'perfil_tecnico_'+req.session.tecnicoId;
function attachment(value,pdf,max){
 if(value===null)return null;
 if(!value||typeof value.nome!=='string'||value.nome.length>180||typeof value.dataUrl!=='string')fail('Arquivo inválido.');
 const m=/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value.dataUrl);
 if(!m||(!pdf&&m[1]==='application/pdf'))fail('Use uma imagem JPG, PNG ou WebP'+(pdf?' ou um PDF.':'.'));
 if(m[2].length>Math.ceil(max/3)*4)fail('Arquivo muito grande.');
 const bytes=Buffer.from(m[2],'base64');
 const valid=m[1]==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':m[1]==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):m[1]==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
 if(!valid||bytes.length>max)fail('Conteúdo do arquivo inválido ou muito grande.');
 return {nome:value.nome.replace(/[<>\x00-\x1f]/g,''),dataUrl:value.dataUrl};
}
router.get('/',wrap(async(req,res)=>{
 const user=(await readCollection('usuarios')).find(u=>u.id===req.session.userId);
 const saved=(await readCollection(collection(req)))[0]||{};
 res.json({perfil:{dataNascimento:'',rg:'',cpf:'',habilitado:false,foto:null,cnh:null,...saved,nome:user.nome}});
}));
router.put('/',wrap(async(req,res)=>{
 const b=req.body||{};
 if(typeof b.nome!=='string'||!b.nome.trim()||b.nome.length>180||/[<>\x00-\x1f]/.test(b.nome))fail('Informe um nome válido de até 180 caracteres.');
 for(const [key,max] of [['dataNascimento',10],['rg',30],['cpf',18]])if(typeof b[key]!=='string'||b[key].length>max)fail('Dados pessoais inválidos.');
 const cpf=b.cpf.replace(/[.\-\s]/g,'');if(cpf&&!/^\d{11}$/.test(cpf))fail('Informe os 11 dígitos do CPF.');
 if(b.dataNascimento){const d=new Date(b.dataNascimento+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(b.dataNascimento)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==b.dataNascimento||b.dataNascimento<'1900-01-01'||b.dataNascimento>new Date().toISOString().slice(0,10))fail('Data de nascimento inválida.');}
 if(typeof b.habilitado!=='boolean')fail('Informe se é habilitado.');
 const foto=b.foto===undefined?undefined:attachment(b.foto,false,1024*1024);
 const cnh=!b.habilitado?null:b.cnh===undefined?undefined:attachment(b.cnh,true,4*1024*1024);
 let perfil;
 await mutateCollection(collection(req),items=>{
  const old=items[0]||{};perfil={nome:b.nome.trim(),dataNascimento:b.dataNascimento,rg:b.rg.trim(),cpf,habilitado:b.habilitado,foto:foto===undefined?old.foto||null:foto,cnh:cnh===undefined?old.cnh||null:cnh};items.splice(0,items.length,perfil);
 });
 await mutateCollection('usuarios',items=>{const u=items.find(u=>u.id===req.session.userId);if(u)u.nome=perfil.nome;});
 await mutateCollection('tecnicos',items=>{const t=items.find(t=>t.id===req.session.tecnicoId);if(t)t.nome=perfil.nome;});
 res.json({perfil});
}));
module.exports=router;
