const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../auth/middleware');
const rateLimit = require('../auth/rate-limit');
const router = express.Router();
const guide = fs.readFileSync(path.join(__dirname,'../help/guide.md'),'utf8');
router.use(requireAuth);
router.get('/status',(req,res)=>res.json({configurado:Boolean(process.env.OPENAI_API_KEY)}));
router.post('/chat',rateLimit(30,3600000),async(req,res)=>{
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({erro:'O administrador precisa configurar a API de IA do Taagzinho no Render.'});
  const messages=req.body?.messages;
  if (!Array.isArray(messages) || !messages.length || messages.length>20 || messages.some(m=>!m || !['user','assistant'].includes(m.role) || typeof m.content!=='string' || !m.content.trim() || m.content.length>4000) || messages.reduce((n,m)=>n+m.content.length,0)>20000 || messages.at(-1).role!=='user') return res.status(400).json({erro:'Mensagem ou histórico muito longo. Encerre a conversa para começar outra.'});
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),30000);
  res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  try {
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL || 'gpt-4.1-mini',instructions:guide+`\nPerfil autenticado: ${req.session.perfil}. Oriente somente ações permitidas a esse perfil.`,input:messages.map(m=>({role:m.role,content:m.content})),store:false,max_output_tokens:700})});
    if(!response.ok)return res.status(502).json({erro:'A IA está indisponível. Peça ao administrador para verificar a chave, os créditos e o modelo da API.'});
    const data=await response.json();const answer=(data.output || []).filter(item=>item.type==='message').flatMap(item=>item.content || []).filter(item=>item.type==='output_text').map(item=>item.text).join('\n');
    if(!answer)return res.status(502).json({erro:'A IA não retornou uma resposta. Tente novamente.'});
    res.json({resposta:answer});
  }catch{if(!res.destroyed)res.status(504).json({erro:'A resposta demorou mais que o esperado. Tente novamente.'});}finally{clearTimeout(timeout);}
});
module.exports=router;
