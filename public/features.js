/* Fluxos adicionais. Conversas de ajuda vivem somente em memória. */
let reportDraft = null;
let resetRequest = null;
try { resetRequest = JSON.parse(sessionStorage.getItem('taag-reset') || 'null'); } catch {}
let dashboardData = null;
const dashboardFilters = { month: new Date().toLocaleDateString('en-CA').slice(0,7), client:'', tech:'', status:'' };
// Não depende da representação de data oferecida pelo idioma do navegador.
{ const d=new Date();dashboardFilters.month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function ownsReport(o) { return state.role==='TECNICO' && (o.responsavelUsuarioId ? o.responsavelUsuarioId===state.currentUser.id : o.tecnicoId===state.currentUser.tecnicoId); }
function prepareFeatures() {
  VIEWS.password=screenPassword;
  VIEWS.reset_admin=()=>`${topbar('Redefinições de senha')}<div class="screen"><p>Confirme a identidade da pessoa e o protocolo por um contato conhecido antes de aprovar.</p><button class="btn btn-outline" id="loadResets">Atualizar solicitações</button><div id="resetList" aria-live="polite"></div></div>`;
  VIEWS.team_progress=()=>{const o=findOS(state.params.id);return `${topbar('Atendimento da equipe')}<div class="screen"><h2>${escapeHtml(o.cliente.nome)}</h2><p>Equipe: ${escapeHtml(o.tecnicoNome)}</p><p>Responsável: ${escapeHtml(o.responsavelNome)}</p><p>Somente o responsável pelo check-in pode preencher este atendimento.</p><button class="btn btn-primary" id="refreshTeam">Atualizar atendimento</button></div>`;};
  VIEWS.view_dashboard=screenMonthlyDashboard;
  if (reportDraft && !['tech_exec','tech_signature'].includes(state.view)) reportDraft=null;
  if (['tech_exec','tech_signature'].includes(state.view) && !ownsReport(findOS(state.params.id))) state.view='team_progress';
}
function screenPassword() {
 const known=state.params.known;
 return `<div class="screen"><h1>Redefinir senha</h1><button class="btn btn-ghost" data-nav="login">Voltar ao login</button>
 <div class="team-options"><button class="btn btn-outline" id="forgotMode">Esqueci minha senha</button><button class="btn btn-outline" id="knownMode">Sei minha senha atual</button></div>
 ${!known && resetRequest ? `<div class="card"><p>Protocolo <b>${escapeHtml(resetRequest.protocolo)}</b></p><p>Confirme sua identidade e este protocolo com o administrador. Mantenha esta aba aberta. O pedido expira em 24 horas.</p><button class="btn btn-primary" id="checkReset">Consultar aprovação</button><p id="resetStatus" role="status"></p><button class="btn btn-ghost" id="newReset">Nova solicitação</button></div>` : ''}
 <form id="passwordForm"><div class="field" ${!known&&resetRequest?'hidden':''}><label for="resetEmail">E-mail</label><input id="resetEmail" type="email" autocomplete="username" ${known||!resetRequest?'required':''}></div>
 ${known?'<div class="field"><label for="oldPassword">Senha atual</label><input id="oldPassword" type="password" autocomplete="current-password" required></div>':''}
 <div id="newPasswordFields" ${!known?'hidden':''}><div class="field"><label for="newPassword">Nova senha (mínimo 8 caracteres)</label><input id="newPassword" type="password" minlength="8" autocomplete="new-password"></div><div class="field"><label for="confirmPassword">Confirmar nova senha</label><input id="confirmPassword" type="password" minlength="8" autocomplete="new-password"></div></div>
 <p id="passwordError" role="alert"></p><button class="btn btn-primary" id="passwordSubmit" ${!known&&resetRequest?'hidden':''}>${known?'Salvar nova senha':'Solicitar aprovação'}</button></form></div>`;
}
function screenMonthlyDashboard() {
 const rows=filteredDashboard();
 return `${topbar('Dashboard mensal',{showBack:state.role!=='VISUALIZADOR',settings:true})}<div class="screen"><div class="field"><label for="dashMonth">Mês da agenda</label><input id="dashMonth" type="month" value="${escapeHtml(dashboardFilters.month)}"></div><div class="field"><label for="dashClient">Cliente</label><input id="dashClient" value="${escapeHtml(dashboardFilters.client)}" placeholder="Buscar cliente"></div><div class="field"><label for="dashTech">Técnico da equipe</label><select id="dashTech"><option value="">Todos</option>${TECNICOS.map(t=>`<option value="${escapeHtml(t.id)}" ${dashboardFilters.tech===t.id?'selected':''}>${escapeHtml(t.nome)}</option>`).join('')}</select></div><div class="field"><label for="dashStatus">Status</label><select id="dashStatus"><option value="">Todos</option>${['PENDENTE','EM_ANDAMENTO','CONCLUIDO'].map(s=>`<option value="${s}" ${dashboardFilters.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}</select></div>
 <button class="btn btn-outline" id="refreshDashboard">Aplicar filtros / Atualizar</button><p id="dashboardError" role="alert"></p>
 <div class="card"><h2>${rows.length} chamados</h2><p>${rows.filter(o=>o.status==='CONCLUIDO').length} concluídos · ${new Set(rows.map(o=>o.cliente.nome)).size} clientes</p><p>Tempo registrado: ${rows.reduce((n,o)=>n+(o.minutos||0),0)} minutos</p></div><p>Contagem por OS. Equipe indica atribuição; responsável indica quem registrou o atendimento.</p>
 <button class="btn btn-primary" id="monthlyPdf">Baixar PDF mensal</button><button class="btn btn-outline" id="monthlyCsv">Exportar CSV</button>
 ${rows.map(o=>`<div class="card"><h3>${escapeHtml(o.cliente.nome)}</h3><p>${escapeHtml(o.data)} · ${statusLabel(o.status)}</p><p>Equipe: ${escapeHtml(o.tecnicoNome)}</p><p>Responsável: ${escapeHtml(o.responsavelNome)}</p><p>Motivo: ${escapeHtml(o.motivo)}</p><p>Pendências: ${escapeHtml(o.pendencias)}</p></div>`).join('') || '<p>Nenhum chamado neste período.</p>'}</div>`;
}
function filteredDashboard() { return (dashboardData|| (state.role==='VISUALIZADOR'?OS_LIST:[])).filter(o=>o.data?.startsWith(dashboardFilters.month) && o.cliente.nome.toLocaleLowerCase().includes(dashboardFilters.client.toLocaleLowerCase()) && (!dashboardFilters.tech||o.tecnicoIds.includes(dashboardFilters.tech)) && (!dashboardFilters.status||o.status===dashboardFilters.status)); }
function monthlyColumns(o) { return [o.id,o.data,o.cliente.nome,o.tecnicoNome,o.responsavelNome,statusLabel(o.status),o.tipoServico==='PERSONALIZADO'?o.tipoServicoPersonalizado:serviceLabel(o.tipoServico).replace(/^[^\p{L}\p{N}]+/u,''),o.motivo,o.pendencias,o.minutos??'']; }
function monthlyCSV() {
 const table=[['OS','Data','Cliente','Equipe atribuída','Responsável pelo check-in','Status','Serviço','Motivo','Pendências','Duração (minutos)'],...filteredDashboard().map(monthlyColumns)];
 const value=v=>'"'+String(v).replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
 const url=URL.createObjectURL(new Blob(['\uFEFF'+table.map(row=>row.map(value).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`TAAG-${dashboardFilters.month}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function monthlyPDF() {
 const doc=new window.jspdf.jsPDF();let y=20;const rows=filteredDashboard();
 const line=(text,size=10)=>{doc.setFontSize(size);for(const part of doc.splitTextToSize(String(text),178)){if(y>277){doc.addPage();y=20;}doc.text(part,16,y);y+=size*.45+2;}};
 line('TAAG | Relatório mensal',18);line('Mês da agenda: '+dashboardFilters.month);line('Filtros: cliente '+(dashboardFilters.client||'Todos')+' | técnico '+(TECNICOS.find(t=>t.id===dashboardFilters.tech)?.nome||'Todos')+' | status '+(dashboardFilters.status?statusLabel(dashboardFilters.status):'Todos'));
 line(`${rows.length} chamados | ${rows.filter(o=>o.status==='CONCLUIDO').length} concluídos | ${new Set(rows.map(o=>o.cliente.nome)).size} clientes`);line('Equipe = atribuição na OS. Responsável = autor do check-in.');
 const counts=new Map();rows.forEach(o=>counts.set(o.cliente.nome,(counts.get(o.cliente.nome)||0)+1));for(const [client,count] of counts)line(`${client}: ${count} chamado(s)`);
 for(const o of rows){if(y>232){doc.addPage();y=20;}y+=5;line(`${o.data} | ${o.cliente.nome} | OS ${o.id}`,12);line(`Equipe: ${o.tecnicoNome}`);line(`Responsável: ${o.responsavelNome}`);line(`Status: ${statusLabel(o.status)} | Serviço: ${monthlyColumns(o)[6]}`);line(`Motivo: ${o.motivo}`);line(`Pendências: ${o.pendencias} | Duração: ${o.minutos??'Não registrada'} min`);}
 const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFontSize(8);doc.text(`${p}/${pages}`,185,290);}doc.save(`TAAG-${dashboardFilters.month}.pdf`);
}
function bindFeatures() {
 const app=document.getElementById('app');const on=(id,fn)=>{const el=document.getElementById(id);if(el)el.onclick=fn;};
 let help=document.getElementById('sessionHelp');if(!help){help=document.createElement('button');help.id='sessionHelp';help.className='session-logout';help.textContent='Ajuda · Taagzinho';document.getElementById('sessionLogout').before(help);}help.hidden=!state.currentUser;help.onclick=openHelp;
 let fab=document.getElementById('fixedNewOS');if(!fab){fab=document.createElement('button');fab.id='fixedNewOS';fab.className='fab';fab.textContent='+';fab.setAttribute('aria-label','Criar nova OS');document.getElementById('phoneFrame').append(fab);}fab.hidden=state.role!=='ADMIN'||state.view==='admin_new';fab.onclick=()=>nav('admin_new');
 document.getElementById('newOsBtn')?.remove();
 if(state.view==='settings'){
  const screen=app.querySelector('.screen');screen.insertAdjacentHTML('afterbegin',`<button class="btn btn-outline" id="settingsHelp">Ajuda · Taagzinho</button>${state.role==='ADMIN'?'<button class="btn btn-primary" data-nav="admin_new">Criar nova OS</button><button class="btn btn-outline" id="settingsDashboard">Dashboard mensal</button><button class="btn btn-outline" data-nav="reset_admin">Redefinições de senha</button>':''}`);
  on('settingsHelp',openHelp);on('settingsDashboard',openDashboard);
  screen.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>nav(el.dataset.nav));
  if(state.role==='VISUALIZADOR'){app.querySelectorAll('[data-set-aba]').forEach(el=>{if(el.dataset.setAba!=='perfil')el.remove();});}
 }
 if(state.view==='admin_panel'){const btn=document.createElement('button');btn.className='btn btn-outline';btn.textContent='Dashboard mensal';btn.onclick=openDashboard;app.querySelector('.screen').prepend(btn);}
 if(state.view==='tech_report'){
  const o=findOS(state.params.id);const btn=document.createElement('button');btn.className='btn btn-outline';btn.textContent=o.edicoesRelatorio?'Relatório já editado (limite atingido)':'Editar relatório (1 vez)';btn.disabled=!ownsReport(o)||Boolean(o.edicoesRelatorio);if(ownsReport(o))app.querySelector('.screen').append(btn);
  btn.onclick=()=>{reportDraft=structuredClone(o);nav('tech_exec',{id:o.id});};
 }
 if(reportDraft && state.view==='tech_exec'){
  app.querySelector('.screen').insertAdjacentHTML('afterbegin','<p class="card">Você pode salvar uma única edição. Corrija os dados e recolha a assinatura para confirmar.</p><button class="btn btn-ghost" id="cancelEdit">Cancelar edição</button>');
  on('cancelEdit',()=>{const id=reportDraft.id;reportDraft=null;nav('tech_report',{id});});
  (reportDraft.fotos||[]).forEach((f,index)=>{const b=document.createElement('button');b.className='btn btn-ghost';b.textContent=`Remover foto ${index+1} (${f.categoria})`;b.onclick=()=>{reportDraft.fotos.splice(index,1);render();};app.querySelector('.screen').append(b);});
 }
 if(reportDraft&&state.view==='tech_signature')document.getElementById('finishBtn').textContent='Salvar única edição';
 on('refreshAgenda',async()=>{try{OS_LIST=(await apiGetOS()).ordens;render();}catch(e){toast(e.message);}});
 on('refreshTeam',async()=>{try{const {os}=await api('/os/'+encodeURIComponent(state.params.id));updateOsCache(os);nav(os.status==='CONCLUIDO'?'tech_report':'team_progress',{id:os.id});}catch(e){toast(e.message);}});
 on('knownMode',()=>nav('password',{known:true}));on('forgotMode',()=>nav('password'));on('newReset',()=>{resetRequest=null;sessionStorage.removeItem('taag-reset');render();});
 on('checkReset',async()=>{try{const d=await api('/password/status',{method:'POST',body:resetRequest});document.getElementById('resetStatus').textContent={PENDENTE:'Aguardando aprovação.',APROVADO:'Aprovado. Defina sua nova senha.',RECUSADO:'Solicitação recusada.',INDISPONIVEL:'Solicitação expirada ou indisponível.'}[d.status]||d.status;if(d.status==='APROVADO'){document.getElementById('newPasswordFields').hidden=false;document.getElementById('passwordSubmit').hidden=false;document.getElementById('passwordSubmit').textContent='Salvar nova senha';}}catch(e){toast(e.message);}});
 const form=document.getElementById('passwordForm');if(form)form.onsubmit=async e=>{
  e.preventDefault();const button=document.getElementById('passwordSubmit');button.disabled=true;const known=state.params.known;
  try{
   if(known||resetRequest){const novaSenha=document.getElementById('newPassword').value;if(novaSenha!==document.getElementById('confirmPassword').value)throw Error('As senhas não coincidem.');await api(known?'/password/change':'/password/complete',{method:'POST',body:known?{email:document.getElementById('resetEmail').value,senhaAtual:document.getElementById('oldPassword').value,novaSenha}:{...resetRequest,novaSenha}});resetRequest=null;sessionStorage.removeItem('taag-reset');toast('Senha redefinida. Entre com a nova senha.');state.currentUser=null;state.role=null;nav('login');}
   else {resetRequest=await api('/password/request',{method:'POST',body:{email:document.getElementById('resetEmail').value}});sessionStorage.setItem('taag-reset',JSON.stringify(resetRequest));render();}
  }catch(err){document.getElementById('passwordError').textContent=err.message;}finally{button.disabled=false;}
 };
 on('loadResets',loadResets);if(state.view==='reset_admin')loadResets();
 on('refreshDashboard',async()=>{if(!document.getElementById('dashMonth').value){toast('Escolha um mês.');return;}Object.assign(dashboardFilters,{month:document.getElementById('dashMonth').value,client:document.getElementById('dashClient').value.trim(),tech:document.getElementById('dashTech').value,status:document.getElementById('dashStatus').value});if(!dashboardFilters.month){toast('Escolha um mês.');return;}await openDashboard(false);});
 on('monthlyCsv',monthlyCSV);on('monthlyPdf',monthlyPDF);
}
async function openDashboard(push=true){try{const d=await api('/dashboard');dashboardData=d.ordens;TECNICOS=d.tecnicos;if(push)nav('view_dashboard');else render();}catch(e){toast(e.message);}}
async function loadResets(){const list=document.getElementById('resetList');if(!list)return;list.textContent='Carregando…';try{const d=await api('/password/pending');list.innerHTML=d.solicitacoes.map(r=>`<div class="card"><b>${escapeHtml(r.nome)}</b><p>${escapeHtml(r.email)}</p><p>Protocolo: <strong>${escapeHtml(r.protocolo)}</strong></p><button class="btn btn-primary" data-reset="${r.id}" data-decision="APROVADO">Identidade e protocolo conferidos: aprovar</button><button class="btn btn-outline" data-reset="${r.id}" data-decision="RECUSADO">Recusar</button></div>`).join('')||'<p>Nenhuma solicitação pendente.</p>';list.querySelectorAll('[data-reset]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('/password/'+b.dataset.reset+'/decision',{method:'POST',body:{status:b.dataset.decision}});loadResets();}catch(e){toast(e.message);b.disabled=false;}});}catch(e){list.textContent=e.message;}}
let helpMessages=[],helpController=null,helpPreviousFocus=null;
function closeHelp(){helpController?.abort();helpController=null;helpMessages=[];document.getElementById('helpDialog')?.remove();helpPreviousFocus?.focus();helpPreviousFocus=null;}
function openHelp(){
 if(!state.currentUser)return;if(document.getElementById('helpDialog'))return;
 helpPreviousFocus=document.activeElement;helpMessages=[];
 const dialog=document.createElement('dialog');dialog.id='helpDialog';dialog.setAttribute('aria-labelledby','helpTitle');dialog.innerHTML='<header><img src="taagzinho.png" alt="Robô Taagzinho"><div><h2 id="helpTitle">Taagzinho</h2><p>Ajuda com o FieldService</p></div></header><p class="help-notice">Conversa temporária, enviada à API OpenAI. Não envie senhas nem dados de clientes. Ao encerrar, o histórico é apagado do app.</p><div id="helpMessages" role="log" aria-live="polite"><p>Olá! Em qual função do aplicativo você precisa de ajuda?</p></div><form id="helpForm"><label for="helpInput">Sua dúvida</label><textarea id="helpInput" maxlength="4000" required></textarea><button class="btn btn-primary" id="helpSend">Enviar</button></form><button class="btn btn-outline" id="helpClose">Encerrar conversa</button>';
 document.body.append(dialog);dialog.showModal();document.getElementById('helpInput').focus();dialog.addEventListener('cancel',e=>{e.preventDefault();closeHelp();});document.getElementById('helpClose').onclick=closeHelp;
 const log=document.getElementById('helpMessages');const say=(who,text)=>{const p=document.createElement('p');const label=document.createElement('strong');label.textContent=who+': ';p.append(label,document.createTextNode(text));log.append(p);log.scrollTop=log.scrollHeight;};
 document.getElementById('helpForm').onsubmit=async e=>{
  e.preventDefault();if(helpController)return;const input=document.getElementById('helpInput');const question=input.value.trim();if(!question)return;const button=document.getElementById('helpSend');button.disabled=true;input.value='';say('Você',question);
  const candidate=[...helpMessages,{role:'user',content:question}].slice(-19);while(candidate.reduce((n,m)=>n+m.content.length,0)>19000&&candidate.length>1)candidate.shift();while(candidate[0]?.role==='assistant')candidate.shift();
  const controller=new AbortController();helpController=controller;const timeout=setTimeout(()=>controller.abort(),35000);
  try{const response=await fetch('/api/help/chat',{method:'POST',credentials:'include',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:candidate})});const data=await response.json();if(!response.ok)throw Error(data.erro||'Não foi possível responder.');if(!dialog.isConnected)return;helpMessages=[...candidate,{role:'assistant',content:data.resposta}];say('Taagzinho',data.resposta);}catch(err){if(dialog.isConnected)say('Aviso',err.name==='AbortError'?'O tempo de resposta terminou. Tente novamente.':err.message);}finally{clearTimeout(timeout);if(helpController===controller)helpController=null;if(dialog.isConnected){button.disabled=false;input.focus();}}
 };
}
window.addEventListener('pagehide',closeHelp);
