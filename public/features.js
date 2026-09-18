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
  VIEWS.tech_avulso=screenAvulso;
  VIEWS.pending_registration=()=>`<div class="screen"><h1>Cadastro aguardando aprovação</h1><p>Sua solicitação foi enviada. O acesso ao sistema só será liberado após a validação do administrador.</p><button class="btn btn-primary" data-nav="login">Voltar ao login</button></div>`;
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
 <p class="table-hint">Deslize a tabela para os lados para ver todas as colunas.</p>
 <div class="dashboard-table-wrap" role="region" aria-label="Tabela de atendimentos mensais" tabindex="0"><table class="dashboard-table"><caption>Atendimentos de ${escapeHtml(dashboardFilters.month)}</caption><thead><tr>${MONTHLY_HEADERS.map(label=>`<th scope="col">${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${rows.map(o=>`<tr>${monthlyColumns(o).map(value=>`<td>${escapeHtml(value === '' ? '—' : value)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="10">Nenhum chamado neste período.</td></tr>`}</tbody></table></div></div>`;
}
function filteredDashboard() { return (dashboardData|| (state.role==='VISUALIZADOR'?OS_LIST:[])).filter(o=>o.data?.startsWith(dashboardFilters.month) && o.cliente.nome.toLocaleLowerCase().includes(dashboardFilters.client.toLocaleLowerCase()) && (!dashboardFilters.tech||o.tecnicoIds.includes(dashboardFilters.tech)) && (!dashboardFilters.status||o.status===dashboardFilters.status)); }
const MONTHLY_HEADERS=['OS','Data','Cliente','Equipe atribuída','Responsável pelo check-in','Status','Serviço','Motivo','Pendências','Duração (min)'];
function monthlyColumns(o) { return [o.id,o.data,o.cliente.nome,o.tecnicoNome,o.responsavelNome,statusLabel(o.status),o.tipoServico==='PERSONALIZADO'?o.tipoServicoPersonalizado:serviceLabel(o.tipoServico).replace(/^[^\p{L}\p{N}]+/u,''),o.motivo,o.pendencias,o.minutos??'']; }
function monthlyCSV() {
 const table=[['OS','Data','Cliente','Equipe atribuída','Responsável pelo check-in','Status','Serviço','Motivo','Pendências','Duração (minutos)'],...filteredDashboard().map(monthlyColumns)];
 const value=v=>'"'+String(v).replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
 const url=URL.createObjectURL(new Blob(['\uFEFF'+table.map(row=>row.map(value).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`TAAG-${dashboardFilters.month}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function monthlyPDF() {
 const doc=new window.jspdf.jsPDF({orientation:'landscape'});
 const rows=filteredDashboard(), widths=[24,19,31,28,28,22,29,43,27,16];
 const left=15, bottom=194, leading=4, padding=2; let y=17;
 const textLine=(text,size=10)=>{doc.setFontSize(size);for(const part of doc.splitTextToSize(String(text),267)){if(y>bottom-12){doc.addPage();y=17;}doc.text(part,left,y);y+=5;}};
 textLine('TAAG | Relatório mensal',17);
 textLine('Mês da agenda: '+dashboardFilters.month);
 textLine('Filtros: cliente '+(dashboardFilters.client||'Todos')+' | técnico '+(TECNICOS.find(t=>t.id===dashboardFilters.tech)?.nome||'Todos')+' | status '+(dashboardFilters.status?statusLabel(dashboardFilters.status):'Todos'));
 textLine(`${rows.length} chamados | ${rows.filter(o=>o.status==='CONCLUIDO').length} concluídos | ${new Set(rows.map(o=>o.cliente.nome)).size} clientes`);
 textLine('Equipe = atribuição na OS. Responsável = autor do check-in.');y+=3;
 const cells=values=>{doc.setFontSize(8);return values.map((value,i)=>doc.splitTextToSize(String(value===''?'—':value),widths[i]-padding*2));};
 const draw=(lines,count,header=false,stripe=false)=>{
  const height=count*leading+padding*2;let x=left;
  doc.setFont('helvetica',header?'bold':'normal');doc.setFontSize(8);
  lines.forEach((parts,i)=>{
   doc.setFillColor(...(header?[232,180,83]:stripe?[246,246,246]:[255,255,255]));doc.setDrawColor(190,190,190);doc.setLineWidth(.15);doc.rect(x,y,widths[i],height,'FD');doc.setTextColor(25,25,25);
   parts.forEach((part,n)=>doc.text(part,x+padding,y+padding+3+n*leading));x+=widths[i];
  });y+=height;
 };
 const header=()=>{doc.setFont('helvetica','bold');const lines=cells(MONTHLY_HEADERS);draw(lines,Math.max(...lines.map(c=>c.length)),true);doc.setFont('helvetica','normal');};
 const nextPage=()=>{doc.addPage();y=15;header();};
 if(y>bottom-30){doc.addPage();y=15;}header();
 rows.forEach((o,index)=>{
  const lines=cells(monthlyColumns(o));let remaining=Math.max(...lines.map(c=>c.length));
  if(remaining*leading+padding*2<=150 && y+remaining*leading+padding*2>bottom)nextPage();
  // Linhas excepcionalmente longas continuam na próxima página, sem cortar texto.
  while(remaining>0){let capacity=Math.floor((bottom-y-padding*2)/leading);if(capacity<1){nextPage();capacity=Math.floor((bottom-y-padding*2)/leading);}const count=Math.min(capacity,remaining);draw(lines.map(c=>c.splice(0,count)),count,false,index%2===1);remaining-=count;if(remaining>0)nextPage();}
 });
 if(!rows.length){y+=8;textLine('Nenhum chamado neste período.');}
 const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFontSize(8);doc.text(`${p}/${pages}`,274,204);}doc.save(`TAAG-${dashboardFilters.month}.pdf`);
}

function bindFeatures() {
 const avulso=document.getElementById('avulsoForm');if(avulso)avulso.onsubmit=async e=>{
  e.preventDefault();const button=avulso.querySelector('[type="submit"]');button.disabled=true;
  try{const v=id=>document.getElementById(id).value.trim(),chegada=v('avChegada'),saida=v('avSaida');
   const {os}=await api('/os/avulso',{method:'POST',body:{cliente:{nome:v('avNome'),endereco:v('avEndereco'),telefone:v('avTelefone'),tipoSistema:v('avSistema')},servico:v('avServico'),chegada:new Date(chegada).toISOString(),saida:new Date(saida).toISOString(),data:chegada.slice(0,10),hora:chegada.slice(11,16)}});
   updateOsCache(os);nav('tech_exec',{id:os.id});
  }catch(err){document.getElementById('avError').textContent=err.message;button.disabled=false;}
 };
 if(state.role==='TECNICO'&&['tech_agenda','settings'].includes(state.view)){
  const button=document.createElement('button');button.className='btn btn-primary avulso-entry';button.textContent='Relatório sem agendamento';button.onclick=()=>nav('tech_avulso');document.querySelector('#app .screen').prepend(button);
 }

 bindPhotoDescriptions();
 document.getElementById('sessionActions').hidden=!state.currentUser;
 const app=document.getElementById('app');const on=(id,fn)=>{const el=document.getElementById(id);if(el)el.onclick=fn;};
 let fab=document.getElementById('fixedNewOS');if(!fab){fab=document.createElement('button');fab.id='fixedNewOS';fab.className='fab';fab.innerHTML='<span aria-hidden="true">+</span> Nova agenda / OS';fab.setAttribute('aria-label','Criar nova OS');document.getElementById('sessionActions').prepend(fab);}fab.hidden=state.role!=='ADMIN'||state.view==='admin_new';fab.onclick=()=>nav('admin_new');
 document.getElementById('newOsBtn')?.remove();
 if(state.view==='settings'){
  const screen=app.querySelector('.screen');screen.insertAdjacentHTML('afterbegin',`<div class="settings-actions">${state.role==='ADMIN'?'<button class="btn btn-primary" data-nav="admin_new">Criar nova OS</button><button class="btn btn-outline" id="settingsDashboard">Dashboard mensal</button><button class="btn btn-outline" data-nav="reset_admin">Redefinições de senha</button>':''}</div>`);
  on('settingsDashboard',openDashboard);
  screen.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>nav(el.dataset.nav));
  if(state.role==='VISUALIZADOR'){app.querySelectorAll('[data-set-aba]').forEach(el=>{if(el.dataset.setAba!=='perfil')el.remove();});}
 }
 if(state.view==='admin_panel'){const btn=document.createElement('button');btn.className='btn btn-outline dashboard-entry';btn.textContent='Dashboard mensal';btn.onclick=openDashboard;app.querySelector('.screen').prepend(btn);}
 if(state.view==='tech_report'){
  const o=findOS(state.params.id);const btn=document.createElement('button');btn.className='btn btn-outline';btn.textContent=o.edicoesRelatorio?'Relatório já editado (limite atingido)':'Editar relatório (1 vez)';btn.disabled=!ownsReport(o)||Boolean(o.edicoesRelatorio);if(ownsReport(o))app.querySelector('.screen').append(btn);
  btn.onclick=()=>{reportDraft=structuredClone(o);nav('tech_exec',{id:o.id});};
 }
 if(reportDraft && state.view==='tech_exec'){
  app.querySelector('.screen').insertAdjacentHTML('afterbegin','<p class="card">Você pode salvar uma única edição. Corrija os dados e, se desejar, inclua a assinatura do cliente.</p><button class="btn btn-ghost" id="cancelEdit">Cancelar edição</button>');
  on('cancelEdit',()=>{const id=reportDraft.id;reportDraft=null;nav('tech_report',{id});});
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
// Rascunhos preservados ao anexar outra foto; salvos antes de coletar a assinatura.
const photoDescriptionDrafts=new Map();
function photoDescriptionKey(osId,photoId){return osId+':'+photoId;}
function photoGallery(o,editable=false){
 if(!(o.fotos||[]).length)return '';
 return `<div class="section-label">Fotos do atendimento</div><div class="photo-evidence-list">${o.fotos.map((f,i)=>{
  const description=editable&&!reportDraft?(photoDescriptionDrafts.get(photoDescriptionKey(o.id,f.id))??f.descricao??''):(f.descricao||'');
  return `<article class="photo-evidence"><img src="${escapeHtml(f.src)}" alt="Foto ${i+1} do atendimento"><p class="photo-category-label">Foto ${i+1} · ${escapeHtml(f.categoria)}</p>${editable?`<div class="photo-description-box"><label for="photo-description-${i}">Descrição da foto (opcional)</label><textarea id="photo-description-${i}" data-photo-description="${escapeHtml(f.id)}" maxlength="1000" placeholder="Descreva o que aparece nesta foto…">${escapeHtml(description)}</textarea><small data-photo-count="${escapeHtml(f.id)}">${description.length}/1000 caracteres</small>${reportDraft?'<small>A descrição será salva junto com a edição do relatório.</small>':`<button type="button" class="btn btn-outline" data-save-photo-description="${escapeHtml(f.id)}">Salvar descrição</button>`}</div><button type="button" class="btn btn-danger remove-photo" data-remove-photo="${escapeHtml(f.id)}">Remover foto ${i+1}</button>`:description?`<div class="photo-description-box"><b>Descrição da foto</b><p>${escapeHtml(description)}</p></div>`:''}</article>`;
 }).join('')}</div>`;
}
async function savePhotoDescription(o,id){
 const key=photoDescriptionKey(o.id,id);if(!photoDescriptionDrafts.has(key))return;
 const descricao=photoDescriptionDrafts.get(key);
 const data=await api('/os/'+encodeURIComponent(o.id)+'/fotos/'+encodeURIComponent(id),{method:'PATCH',body:{descricao}});
 const photo=o.fotos.find(f=>f.id===id);if(photo)photo.descricao=data.foto.descricao;
 if(photoDescriptionDrafts.get(key)===descricao)photoDescriptionDrafts.delete(key);
}
async function saveAllPhotoDescriptions(o){if(reportDraft)return;for(const f of o.fotos||[])await savePhotoDescription(o,f.id);}
function bindPhotoDescriptions(){
 document.querySelectorAll('[data-remove-photo]').forEach(button=>button.onclick=async()=>{
  if(!confirm('Remover esta foto do relatório?'))return;
  const o=findOS(state.params.id),id=button.dataset.removePhoto;button.disabled=true;
  try{
   // Preserve text and technical fields before rendering the updated gallery.
   const description=document.getElementById('descField');if(description)o.descricao=description.value;
   if(reportDraft){reportDraft.fotos=reportDraft.fotos.filter(f=>f.id!==id);}
   else{const data=await api('/os/'+encodeURIComponent(o.id)+'/fotos/'+encodeURIComponent(id),{method:'DELETE'});o.fotos=data.fotos;}
   photoDescriptionDrafts.delete(photoDescriptionKey(o.id,id));render();
  }catch(e){toast(e.message);button.disabled=false;}
 });
 document.querySelectorAll('[data-photo-description]').forEach(input=>{
  input.oninput=()=>{const o=findOS(state.params.id),id=input.dataset.photoDescription;
   if(reportDraft)o.fotos.find(f=>f.id===id).descricao=input.value;
   else photoDescriptionDrafts.set(photoDescriptionKey(o.id,id),input.value);
   const count=[...document.querySelectorAll('[data-photo-count]')].find(el=>el.dataset.photoCount===id);if(count)count.textContent=input.value.length+'/1000 caracteres';
  };
 });
 document.querySelectorAll('[data-save-photo-description]').forEach(button=>button.onclick=async()=>{
  button.disabled=true;try{await savePhotoDescription(findOS(state.params.id),button.dataset.savePhotoDescription);toast('Descrição da foto salva.');}catch(e){toast(e.message);}finally{button.disabled=false;}
 });
}

function screenAvulso(){
 if(state.role!=='TECNICO')return '<div class="screen">Acesso restrito ao técnico.</div>';
 const fields=[['avNome','Cliente','text',180],['avEndereco','Endereço','text',700],['avTelefone','Telefone (opcional)','tel',80],['avSistema','Tipo do sistema','text',500],['avServico','Serviço prestado','text',300],['avChegada','Data e horário de chegada','datetime-local',40],['avSaida','Data e horário de saída','datetime-local',40]];
 return `${topbar('Relatório sem agendamento')}<div class="screen"><p>Informe o atendimento realizado. Depois, preencha o relatório, anexe as fotos e finalize; a assinatura é opcional. Os dados do cliente serão registrados somente neste atendimento.</p><form id="avulsoForm" class="card client-form">${fields.map(([id,label,type,max])=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" maxlength="${max}" ${id==='avTelefone'?'':'required'}></div>`).join('')}<p id="avError" role="alert"></p><button class="btn btn-primary" type="submit">Continuar para o relatório</button></form></div>`;
}
