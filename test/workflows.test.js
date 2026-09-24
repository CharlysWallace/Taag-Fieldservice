const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawn}=require('node:child_process');const net=require('node:net');
const {hashPassword}=require('../src/auth/hash');
test('equipes, edições ilimitadas, acesso gerencial, recuperação e exclusões autorizadas',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'taag-workflows-'));
 const save=(name,data)=>fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(data));
 const password='Only-test-4381';
 save('usuarios',[['admin','ADMIN',null],['first','TECNICO','t1'],['second','TECNICO','t2'],['outside','TECNICO','t3'],['viewer','VISUALIZADOR',null]].map(([id,perfil,tecnicoId])=>({id,nome:id,email:id+'@example.test',perfil,tecnicoId,senhaHash:hashPassword(password)})));
 save('tecnicos',[{id:'t1',nome:'Primeiro'},{id:'t2',nome:'Segundo'},{id:'t3',nome:'Externo'}]);save('clientes',[{id:'c1',nome:'Cliente de teste',endereco:'Rua de teste',telefone:'11999990000',tipoSistema:'Automação'}]);for(const name of ['ordens_servico','notificacoes','solicitacoes_cadastro','acessos'])save(name,[]);
 const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const server=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),DATA_DIR:dir,DATABASE_URL:'',NODE_ENV:'test',COOKIE_SECRET:'temporary-test-secret'},stdio:['ignore','pipe','pipe']});
 t.after(()=>{server.kill();fs.rmSync(dir,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Server startup timed out')),10000);server.stdout.on('data',d=>{if(d.toString().includes('rodando')){clearTimeout(timeout);resolve();}});server.on('exit',code=>reject(Error('Server exit '+code)));});
 async function request(route,method='GET',body,cookie){const res=await fetch(`http://127.0.0.1:${port}/api${route}`,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:res.status,data:await res.json(),cookie:res.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};}
 const sessions={};for(const name of ['admin','first','second','outside','viewer']){const r=await request('/auth/login','POST',{email:name+'@example.test',senha:password});assert.equal(r.status,200);sessions[name]=r.cookie;assert.equal(r.data.usuario.senhaHash,undefined);assert.equal(r.data.usuario.passwordResets,undefined);}
 const req=(role,url,method,body)=>request(url,method,body,sessions[role]);
 await t.test('cliente permite omitir e limpar telefone, mantendo campos obrigatórios',async()=>{
  const body={nome:'Sem telefone',endereco:'Rua teste',tipoSistema:'Rede'};
  const created=await req('admin','/clientes','POST',body);assert.equal(created.status,201);assert.equal(created.data.cliente.telefone,'');
  const url='/clientes/'+created.data.cliente.id;
  assert.equal((await req('admin',url,'PUT',{...body,telefone:'11999990000'})).status,200);
  const cleared=await req('admin',url,'PUT',{...body,telefone:''});assert.equal(cleared.status,200);assert.equal(cleared.data.cliente.telefone,'');
  assert.equal((await req('admin','/clientes','POST',{...body,nome:''})).status,400);
  assert.equal((await req('admin',url,'DELETE')).status,200);
 });
 await t.test('uma OS para equipe, primeiro check-in vence atomicamente',async()=>{
  const create=await req('admin','/os','POST',{clienteId:'c1',tecnicoIds:['t1','t2'],tipoServico:'SUPORTE',data:'2026-09-13',hora:'10:00'});assert.equal(create.status,201);const id=create.data.os.id;t.osId=id;
  for(const role of ['first','second'])assert.equal((await req(role,'/os')).data.ordens[0].id,id);
  assert.equal((await req('outside','/os/'+id)).status,403);
  const attempts=await Promise.all(['first','second'].map(role=>req(role,`/os/${id}/checkin`,'POST')));assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);t.owner=attempts[0].status===200?'first':'second';t.other=t.owner==='first'?'second':'first';
  assert.equal((await req('admin',`/os/${id}/checkin`,'POST')).status,403);
 });
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 const report={descricao:'Serviço realizado',camposServico:{motivo:'Ajuste da rede',pendencias:'Não'},assinatura:image};
 await t.test('somente autor conclui e salva várias revisões',async()=>{
  const base='/os/'+t.osId;
  assert.equal((await req(t.other,base+'/fotos','POST',{categoria:'ANTES',dataUrl:image})).status,403);
  assert.equal((await req(t.owner,base+'/checkout','POST',report)).status,400);
  for(const categoria of ['ANTES','DEPOIS'])assert.equal((await req(t.owner,base+'/fotos','POST',{categoria,dataUrl:image})).status,201);
  const extra=await req(t.owner,base+'/fotos','POST',{categoria:'DURANTE',dataUrl:image});
  const removeRoute=base+'/fotos/'+extra.data.fotos.at(-1).id;
  for(const role of [t.other,'admin','outside','viewer'])assert.equal((await req(role,removeRoute,'DELETE')).status,403);
  assert.equal((await req(t.owner,removeRoute,'DELETE')).status,200);
  assert.equal((await req(t.owner,removeRoute,'DELETE')).status,404);
  assert.equal((await req(t.owner,base)).data.os.fotos.length,2);
  const photoId=(await req(t.owner,base)).data.os.fotos[0].id;
  const captionRoute=base+'/fotos/'+photoId;
  assert.equal((await req(t.other,captionRoute,'PATCH',{descricao:'Sem permissão'})).status,403);
  assert.equal((await req('admin',captionRoute,'PATCH',{descricao:'Sem permissão'})).status,403);
  assert.equal((await req(t.owner,captionRoute,'PATCH',{descricao:'a'.repeat(1001)})).status,400);
  assert.equal((await req(t.owner,captionRoute,'PATCH',{descricao:'a'.repeat(1000)})).status,200);
  assert.equal((await req(t.owner,base)).data.os.fotos[0].descricao.length,1000);
  assert.equal((await req(t.other,base+'/checkout','POST',report)).status,403);
  assert.equal((await req(t.owner,base+'/checkout','POST',report)).status,200);
  assert.equal((await req(t.owner,captionRoute,'PATCH',{descricao:'Não pode após conclusão'})).status,409);
  assert.equal((await req('admin',base+'/report','PATCH',report)).status,403);
  assert.equal((await req(t.other,base+'/report','PATCH',report)).status,403);
  const photos=(await req(t.owner,base)).data.os.fotos.map(f=>({id:f.id,categoria:f.categoria}));
  assert.equal((await req(t.owner,base+'/report','PATCH',{...report,fotos:[{id:'invalid',categoria:'ANTES'},{id:'invalid',categoria:'DEPOIS'}]})).status,400);
  assert.equal((await req(t.owner,base+'/report','PATCH',{...report,fotos:photos.map(f=>({...f,descricao:'a'.repeat(1001)}))})).status,400);
  report.fotos=photos.map(f=>({...f,descricao:'Descrição revisada'}));
  const edits=await Promise.all([req(t.owner,base+'/report','PATCH',{...report,descricao:'Revisão A'}),req(t.owner,base+'/report','PATCH',{...report,descricao:'Revisão B'})]);assert.deepEqual(edits.map(r=>r.status).sort(),[200,200]);
  assert.equal((await req(t.owner,base+'/report','PATCH',report)).status,200);
  assert.equal((await req(t.owner,base+'/fotos','POST',{categoria:'ANTES',dataUrl:image})).status,409);
  assert.equal((await req(t.owner,base,'DELETE')).status,403);
  assert.equal((await req(t.owner,captionRoute,'DELETE')).status,409);
  assert.equal((await req(t.owner,base)).data.os.edicoesRelatorio,3);
  assert.equal((await req(t.owner,base)).data.os.fotos[0].descricao,'Descrição revisada');
 });
 await t.test('perfil gerencial recebe só dados do dashboard',async()=>{
  for(const route of ['/os','/os/'+t.osId,'/acessos','/clientes'])assert.equal((await req('viewer',route)).status,403);
  assert.equal((await req('first','/dashboard')).status,403);
  const dashboard=await req('viewer','/dashboard');assert.equal(dashboard.status,200);assert.equal(dashboard.data.ordens.length,1);assert.equal(dashboard.data.ordens[0].fotos,undefined);assert.equal(dashboard.data.ordens[0].assinatura,undefined);assert.equal(dashboard.data.ordens[0].tecnicoIds.length,2);
 });
 await t.test('cadastro pendente não ganha sessão nem acesso até aprovação',async()=>{
  const registration=await request('/auth/register','POST',{nome:'Novo técnico',email:'novo@example.test',senha:password});assert.equal(registration.status,201);
  assert.equal((await request('/auth/me','GET',undefined,registration.cookie)).status,401);
  assert.equal((await request('/os','GET',undefined,registration.cookie)).status,401);
  assert.equal((await request('/auth/login','POST',{email:'novo@example.test',senha:password})).status,401);
  const pending=(await req('admin','/auth/pending')).data.solicitacoes.find(x=>x.email==='novo@example.test');
  assert.equal((await req('admin','/auth/pending/'+pending.id+'/approve','POST',{perfil:'TECNICO'})).status,200);
  assert.equal((await request('/auth/login','POST',{email:'novo@example.test',senha:password})).status,200);
 });
 await t.test('relatório avulso usa horários informados e mesmas regras de conclusão',async()=>{
  const body={tecnicoIds:['t3','t2'],cliente:{nome:'Cliente avulso',endereco:'Rua Exemplo',tipoSistema:'Rede'},servico:'Revisão sem agenda',chegada:'2026-09-16T12:00:00.000Z',saida:'2026-09-16T14:30:00.000Z',data:'2026-09-16',hora:'09:00'};
  for(const role of ['admin','viewer'])assert.equal((await req(role,'/os/avulso','POST',body)).status,403);
  assert.equal((await request('/os/avulso','POST',body)).status,401);
  assert.equal((await req('outside','/os/avulso','POST',{...body,saida:'2026-09-15T12:00:00.000Z'})).status,400);
  for(const tecnicoIds of [[],['t2'],['t3','t3'],['t3','missing']])assert.equal((await req('outside','/os/avulso','POST',{...body,tecnicoIds})).status,400);
  const created=await req('outside','/os/avulso','POST',body);assert.equal(created.status,201);
  const base='/os/'+created.data.os.id;assert.equal(created.data.os.cliente.nome,body.cliente.nome);assert.equal(created.data.os.tipoServicoPersonalizado,body.servico);
  assert.equal((await req('first',base)).status,403);
  assert.equal((await req('second',base)).status,200);
  assert.equal((await req('second','/os')).data.ordens.some(o=>o.id===created.data.os.id),true);
  assert.equal((await req('second',base+'/checkout','POST',report)).status,403);
  assert.equal((await req('outside',base+'/checkout','POST',report)).status,400);
  for(const categoria of ['ANTES','DEPOIS'])assert.equal((await req('outside',base+'/fotos','POST',{categoria,dataUrl:image})).status,201);
  const done=await req('outside',base+'/checkout','POST',{...report,assinatura:null});assert.equal(done.data.os.assinatura,null);assert.equal(done.status,200);assert.equal(done.data.os.checkin.timestamp,body.chegada);assert.equal(done.data.os.checkout.timestamp,body.saida);
  assert.equal((await req('second',base+'/report','PATCH',report)).status,403);
  for(let i=0;i<3;i++)assert.equal((await req('outside',base+'/report','PATCH',{descricao:'Revisão '+i,camposServico:{},assinatura:null})).status,200);
  assert.equal((await req('admin','/clientes')).data.clientes.some(c=>c.nome===body.cliente.nome),false);
  assert.equal((await req('admin',base,'DELETE')).status,200);
 });
 await t.test('OS agendada conclui sem assinatura e aceita assinatura apenas válida',async()=>{
  const created=await req('admin','/os','POST',{clienteId:'c1',tecnicoIds:['t3'],tipoServico:'SUPORTE',data:'2026-09-18',hora:'10:00'});
  const base='/os/'+created.data.os.id;await req('outside',base+'/checkin','POST');
  for(const categoria of ['ANTES','DEPOIS'])await req('outside',base+'/fotos','POST',{categoria,dataUrl:image});
  assert.equal((await req('outside',base+'/checkout','POST',{...report,assinatura:'inválida'})).status,400);
  const completed=await req('outside',base+'/checkout','POST',{descricao:'Feito',camposServico:{}});assert.equal(completed.status,200);assert.equal(completed.data.os.assinatura,null);
  const revised=await req('outside',base+'/report','PATCH',{descricao:'Corrigido',camposServico:{},assinatura:null});assert.equal(revised.status,200);assert.equal(revised.data.os.assinatura,null);
  await req('admin',base,'DELETE');
 });
 await t.test('pedido exige aprovação + token, uso único invalida sessões antigas',async()=>{
  const reset=(await request('/password/request','POST',{email:'first@example.test'})).data;
  assert.equal((await request('/password/complete','POST',{...reset,novaSenha:'Replacement-567'})).status,403);
  const pending=await req('admin','/password/pending');assert.equal(pending.data.solicitacoes[0].protocolo,reset.protocolo);assert.equal(pending.data.solicitacoes[0].tokenHash,undefined);
  assert.equal((await req('second',`/password/${reset.id}/decision`,'POST',{status:'APROVADO'})).status,403);
  assert.equal((await req('admin',`/password/${reset.id}/decision`,'POST',{status:'APROVADO'})).status,200);
  assert.equal((await request('/password/status','POST',reset)).data.status,'APROVADO');
  const completions=await Promise.all([request('/password/complete','POST',{...reset,novaSenha:'Replacement-567'}),request('/password/complete','POST',{...reset,novaSenha:'Replacement-567'})]);assert.deepEqual(completions.map(r=>r.status).sort(),[200,403]);
  assert.equal((await req('first','/auth/me')).status,401);
  assert.equal((await request('/auth/login','POST',{email:'first@example.test',senha:password})).status,401);
  assert.equal((await request('/auth/login','POST',{email:'first@example.test',senha:'Replacement-567'})).status,200);
  assert.equal((await request('/password/change','POST',{email:'second@example.test',senhaAtual:password,novaSenha:'Replacement-568'})).status,200);assert.equal((await req('second','/auth/me')).status,401);
 });
 await t.test('IA removida e exclusões restritas ao administrador',async()=>{
  assert.equal((await request('/help/chat','POST',{messages:[]})).status,404);
  for(const role of ['outside','viewer']){
   assert.equal((await req(role,'/clientes/c1','DELETE')).status,403);
   assert.equal((await req(role,'/os/'+t.osId,'DELETE')).status,403);
  }
  assert.equal((await request('/clientes/c1','DELETE')).status,401);
  const legacy=JSON.parse(fs.readFileSync(path.join(dir,'ordens_servico.json'),'utf8'));delete legacy[0].clienteSnapshot;save('ordens_servico',legacy);
  assert.equal((await req('admin','/clientes/c1','DELETE')).status,200);
  assert.equal((await req('admin','/clientes')).data.clientes.length,0);
  assert.equal((await req('admin','/os/'+t.osId)).data.os.cliente.nome,'Cliente de teste');
  assert.equal((await req('admin','/clientes/c1','DELETE')).status,404);
  assert.equal((await req('admin','/os/'+t.osId,'DELETE')).status,200);
  assert.equal((await req('admin','/os/'+t.osId)).status,404);
 });
});
