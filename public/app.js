/* Caminho do logo: mesma pasta do index.html (servida pelo backend em /public) */
const LOGO_SRC = 'Taag30.png';

/* ============================================================
   FIELDSERVICE APP — LÓGICA DA APLICAÇÃO
   ------------------------------------------------------------
   Esta é a versão INTEGRADA ao backend: nada mais é lido/gravado
   em window.storage. Todo dado (usuários, OS, cadastros
   pendentes, notificações) vive no servidor (pasta /data do
   backend) e chega aqui via fetch(), sempre com a sessão do
   navegador (cookie httpOnly) — é o servidor, não o navegador,
   quem decide o que cada perfil pode ver ou fazer.
   ============================================================ */

/* ---------- 0. CLIENTE DE API ---------- */
const API_BASE = '/api';

/**
 * Wrapper único para toda chamada à API: sempre manda o cookie de sessão
 * (credentials:'include'), sempre trata a resposta como JSON, e sempre
 * transforma um erro HTTP (400/401/403/404/409...) em uma exceção com a
 * mensagem que o backend mandou — assim cada tela só precisa de um
 * try/catch pra mostrar o erro certo pro usuário, sem repetir lógica.
 */
async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // fetch só lança exceção quando a rede falhou de verdade (servidor fora do
    // ar, sem internet etc.) — nunca por causa de um 4xx/5xx, que tratamos abaixo
    throw new Error('Não foi possível conectar ao servidor. Verifique se o backend está rodando.');
  }

  let data = null;
  try { data = await res.json(); } catch (e) { /* resposta sem corpo (204 etc.) — ok */ }

  if (!res.ok) {
    const erro = new Error((data && data.erro) || `Erro inesperado (status ${res.status}).`);
    erro.status = res.status;
    throw erro;
  }
  return data || {};
}

// ---------- funções de API por área (nomes explícitos, um por endpoint) ----------
const apiMe = () => api('/auth/me');
const apiLogin = (email, senha) => api('/auth/login', { method: 'POST', body: { email, senha } });
const apiLogout = () => api('/auth/logout', { method: 'POST' });
const apiRegister = (nome, email, senha) => api('/auth/register', { method: 'POST', body: { nome, email, senha } });
const apiGetPending = () => api('/auth/pending');
const apiApprove = (id, perfil) => api(`/auth/pending/${id}/approve`, { method: 'POST', body: { perfil } });
const apiReject = (id) => api(`/auth/pending/${id}/reject`, { method: 'POST' });

const apiGetTecnicos = () => api('/tecnicos');

const apiGetOS = () => api('/os');
const apiCreateOS = (payload) => api('/os', { method: 'POST', body: payload });
const apiDeleteOS = (id) => api(`/os/${id}`, { method: 'DELETE' });
const apiCheckin = (id) => api(`/os/${id}/checkin`, { method: 'POST' });
const apiCheckout = (id, payload) => api(`/os/${id}/checkout`, { method: 'POST', body: payload });
const apiUploadFoto = (id, categoria, dataUrl) => api(`/os/${id}/fotos`, { method: 'POST', body: { categoria, dataUrl } });


/* ---------- 1. CACHES LOCAIS ----------
   Guardam, na memória do navegador, a última resposta do backend — pra
   telas renderizarem na hora (sem esperar fetch a cada troca de tela).
   Toda mutação (check-in, criar OS, aprovar cadastro…) atualiza o cache
   correspondente a partir da resposta do servidor, nunca "adivinhando"
   localmente o que deveria ter acontecido. */
let CLIENTES = [];
let ACCESS_CACHE = [];
let TECNICOS = [];
let OS_LIST = [];
let PENDING_CACHE = [];
let NOTIF_CACHE = { naoLidas: 0, notificacoes: [] };

function findOS(id) { return reportDraft?.id === id ? reportDraft : OS_LIST.find(o => o.id === id); }
function updateOsCache(os) {
  const idx = OS_LIST.findIndex(o => o.id === os.id);
  if (idx >= 0) OS_LIST[idx] = os; else OS_LIST.push(os);
}

/** Busca de uma vez tudo que as telas pós-login precisam — chamada após login e após restaurar sessão. */
async function loadCoreData() {
  if (state.currentUser.perfil === 'VISUALIZADOR') { const d = await api('/dashboard'); TECNICOS=d.tecnicos; OS_LIST=d.ordens; ACCESS_CACHE=[]; PENDING_CACHE=[]; NOTIF_CACHE={naoLidas:0,notificacoes:[]}; return; }
  const [tecRes, osRes, notifRes, accessRes] = await Promise.all([apiGetTecnicos(), apiGetOS(), Promise.resolve({naoLidas:0,notificacoes:[]}), api('/acessos')]);
  ACCESS_CACHE = accessRes.acessos;
  TECNICOS = tecRes.tecnicos;
  OS_LIST = osRes.ordens;
  NOTIF_CACHE = notifRes;
  if (state.currentUser.perfil === 'ADMIN') {
    PENDING_CACHE = (await apiGetPending()).solicitacoes;
    CLIENTES = (await api('/clientes')).clientes;
  } else {
    PENDING_CACHE = [];
  }
}

/* ---------- 2. ESTADO DE NAVEGAÇÃO ---------- */
const agendaFilters = { cliente: '', inicio: '', fim: '', status: '' };
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
const state = { role: null, currentUser: null, currentTech: null, view: 'login', params: {}, history: [] };

function nav(view, params = {}) {
  state.history.push({ view: state.view, params: state.params });
  state.view = view; state.params = params;
  render();
}
function back() {
  const prev = state.history.pop();
  if (prev && prev.view !== 'login') { state.view = prev.view; state.params = prev.params; }
  else { state.view = rootScreenFor(state.role); state.params = {}; }
  render();
}
async function logout() {
  try { await apiLogout(); } catch (e) { toast('Não foi possível sair. Verifique a conexão e tente novamente.'); return; }
  dashboardData = null; reportDraft = null; photoDescriptionDrafts.clear();
  state.role = null; state.currentUser = null; state.currentTech = null; state.history = [];
  CLIENTES = []; ACCESS_CACHE = []; OS_LIST = []; TECNICOS = []; PENDING_CACHE = []; NOTIF_CACHE = { naoLidas: 0, notificacoes: [] };
  Object.assign(agendaFilters, { cliente: '', inicio: '', fim: '', status: '' });
  state.view = 'login'; state.params = {};
  render();
}
function roleLabel(p) { return { TECNICO: 'Técnico de Campo', ADMIN: 'Administrador', VISUALIZADOR: 'Visualizador (Gerente)' }[p] || p; }

/* depois de login OU de restaurar sessão via /auth/me — busca os dados e decide a primeira tela */
async function afterLogin(usuario) {
  state.currentUser = usuario;
  state.role = usuario.perfil;
  await loadCoreData();
  state.currentTech = usuario.perfil === 'TECNICO' ? TECNICOS.find(t => t.id === usuario.tecnicoId) : null;
}
function rootScreenFor(perfil) {
  return perfil === 'TECNICO' ? 'tech_agenda' : perfil === 'ADMIN' ? 'admin_panel' : 'view_dashboard';
}

/* ---------- 3. HELPERS DE UI ---------- */
function statusLabel(s){ return {PENDENTE:'Pendente', EM_ANDAMENTO:'Em andamento', CONCLUIDO:'Concluído'}[s]; }
function osServiceLabel(o) { return o.tipoServico === 'PERSONALIZADO' ? escapeHtml(o.tipoServicoPersonalizado || 'Serviço personalizado') : serviceLabel(o.tipoServico); }
function serviceLabel(v){ return ({INSTALACAO_REDE:'🌐 Instalação de rede',MANUTENCAO_WIFI:'📡 Manutenção de Wi‑Fi',INSTALACAO_CAMERAS:'📷 Instalação de câmeras',MANUTENCAO_PREVENTIVA:'🔧 Manutenção preventiva',SUPORTE:'💻 Suporte técnico',INSTALACAO_EQUIPAMENTOS:'🖥️ Instalação de equipamentos',INFRAESTRUTURA:'🔌 Infraestrutura',EMERGENCIAL:'⚠️ Atendimento emergencial'})[v]||'Serviço'; }
function fmtTime(iso){ return iso ? new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—'; }
function fmtDur(a,b){
  if(!a||!b) return '—';
  const min = Math.round((new Date(b)-new Date(a))/60000);
  return Math.floor(min/60) + 'h ' + String(min%60).padStart(2,'0') + 'min';
}
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(()=>t.classList.remove('show'), 2600);
}
function openRoute(endereco){ window.open('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(endereco), '_blank', 'noopener,noreferrer'); }
function openUber(endereco){ window.open('https://m.uber.com/ul/?action=setPickup&dropoff[formatted_address]=' + encodeURIComponent(endereco), '_blank', 'noopener,noreferrer'); }

function iconPin(){ return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 22s7-7.58 7-13A7 7 0 0 0 5 9c0 5.42 7 13 7 13Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="9" r="2.3" stroke="currentColor" stroke-width="1.8"/></svg>'; }
function iconBack(){ return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
function iconReturn(){ return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M9 14 4 9l5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h10a6 6 0 0 1 0 12h-1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
function iconSettings(){ return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 12.9a7.4 7.4 0 0 0 0-1.8l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.6-.9L15 3.4h-4l-.5 2.4a7.6 7.6 0 0 0-1.6.9l-2.3-.9-2 3.4 2 1.5a7.4 7.4 0 0 0 0 1.8l-2 1.5 2 3.4 2.3-.9c.5.4 1 .7 1.6.9l.5 2.4h4l.5-2.4c.6-.2 1.1-.5 1.6-.9l2.3.9 2-3.4-2-1.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'; }
function iconMail(){ return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
function iconLock(){ return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="4.5" y="10.5" width="15" height="10" rx="2.2" stroke="currentColor" stroke-width="1.8"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'; }
function iconUser(){ return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/></svg>';}
function iconEye(off){ return off
  ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M10.6 10.7a2.4 2.4 0 0 0 3.3 3.3M6.6 6.9C4.4 8.3 2.9 10.3 2 12c1.6 3.3 5.2 7 10 7 1.7 0 3.2-.4 4.6-1.1M9.9 4.3A10.4 10.4 0 0 1 12 4c4.8 0 8.4 3.7 10 7-.5 1-1.1 2-2 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M2 12c1.6-3.3 5.2-7 10-7s8.4 3.7 10 7c-1.6 3.3-5.2 7-10 7s-8.4-3.7-10-7Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.7"/></svg>';
}

/* ---------- 4. TOPBAR REUTILIZÁVEL ---------- */
function topbar(title, {showBack=true, rolePill=true, settings=false, settingsBadge=0} = {}){
  const leftSlot = showBack
    ? `<button class="icon-btn back-btn" data-nav="back" aria-label="Voltar para a tela anterior">${iconBack()}<span>Voltar</span></button>`
    : (settings
        ? `<button class="icon-btn" data-nav="settings" title="Configurações" style="position:relative;">${iconSettings()}</button>`
        : `<div style="width:36px"></div>`);
  return `
  <div class="topbar">
    ${leftSlot}
    <h1>${title}</h1>

  </div>`;
}

/* ============================================================
   5. TELAS
   ============================================================ */

function screenLogin(){
  return `
  <div class="screen" style="padding-top:32px;">
    <div style="text-align:center; margin-bottom:26px;">
      <div class="login-logo"><img src="${LOGO_SRC}" alt="TAAG"></div>
      <div style="color:var(--text-muted); font-size:13px; margin-top:10px;">The Automation Association Group</div>
    </div>

    <form id="loginForm" autocomplete="off">
      <div class="field">
        <label>E-mail</label>
        <div class="input-group">
          <span class="input-ico">${iconMail()}</span>
          <input type="email" id="loginEmail" placeholder="seu.nome@taag.com" autocomplete="username" required>
        </div>
      </div>
      <div class="field">
        <label>Senha</label>
        <div class="input-group">
          <span class="input-ico">${iconLock()}</span>
          <input type="password" id="loginSenha" placeholder="••••••••" autocomplete="current-password" required>
          <button type="button" class="input-toggle" id="togglePass">${iconEye(false)}</button>
        </div>
      </div>

      <div class="login-error" id="loginError" style="display:none;"></div>

      <button class="btn btn-primary" id="loginBtn" type="submit" style="margin-top:6px;">
        <span id="loginBtnLabel">Entrar</span>
      </button>
    </form>

    <button type="button" class="btn btn-ghost" data-nav="password">Esqueci minha senha / Redefinir senha</button>
    <div class="auth-switch" id="goToRegister">Ainda não tem conta? <b>Cadastre-se</b></div>

    <form id="registerForm" autocomplete="off" style="display:none;">
      <div class="field">
        <label>Nome completo</label>
        <div class="input-group">
          <span class="input-ico">${iconUser()}</span>
          <input type="text" id="regNome" placeholder="Ex: João da Silva" required>
        </div>
      </div>
      <div class="field">
        <label>E-mail</label>
        <div class="input-group">
          <span class="input-ico">${iconMail()}</span>
          <input type="email" id="regEmail" placeholder="seu.nome@taag.com" required>
        </div>
      </div>
      <div class="field">
        <label>Senha</label>
        <div class="input-group">
          <span class="input-ico">${iconLock()}</span>
          <input type="password" id="regSenha" placeholder="Mínimo 6 caracteres" required>
        </div>
      </div>
      <div class="field">
        <label>Confirmar senha</label>
        <div class="input-group">
          <span class="input-ico">${iconLock()}</span>
          <input type="password" id="regSenha2" placeholder="Repita a senha" required>
        </div>
      </div>

      <div class="register-note">${iconLock()} O perfil de acesso (Técnico ou Administrador) é definido pelo administrador principal após a aprovação do cadastro.</div>
      <div class="login-error" id="registerError" style="display:none;"></div>

      <button class="btn btn-primary" id="registerBtn" type="submit" style="margin-top:6px;">Solicitar cadastro</button>
    </form>

    <div class="auth-switch" id="goToLogin" style="display:none;">Já tem uma conta? <b>Entrar</b></div>

  </div>`;
}

// ---- 5a. TÉCNICO: agenda do dia ----
// (a filtragem "só as OS deste técnico" já vem pronta do backend — GET /api/os
// escopa por sessão; o frontend só exibe o que o servidor mandou)
function screenTechAgenda(){
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const minhas = OS_LIST.filter(o => normalize(o.cliente.nome).includes(normalize(agendaFilters.cliente.trim())) && (!agendaFilters.inicio || o.data >= agendaFilters.inicio) && (!agendaFilters.fim || o.data <= agendaFilters.fim) && (!agendaFilters.status || o.status === agendaFilters.status)).sort((a,b)=> (a.data+a.hora).localeCompare(b.data+b.hora));
  const hojeStr = localDate();
  const hoje = minhas.filter(o=>o.data===hojeStr);
  const outras = minhas.filter(o=>o.data!==hojeStr);

  const card = o => `
    <div class="os-card st-${o.status}" data-open-os="${o.id}">
      <div class="time">${o.hora}<small>${escapeHtml(o.data.split('-').reverse().join('/'))}</small></div>
      <div class="info" style="flex:1">
        <b>${escapeHtml(o.cliente.nome)}</b><div class="service-preview">${osServiceLabel(o)}</div>
        <div class="addr">${iconPin()} ${escapeHtml(o.cliente.endereco)}</div><div class="addr">Equipe: ${escapeHtml(o.tecnicoNome)}</div>
        <div class="meta"><span class="chip ${o.status==='PENDENTE'?'pendente':o.status==='EM_ANDAMENTO'?'andamento':'concluido'}">${statusLabel(o.status)}</span></div>
      </div>
    </div>`;

  return `
  ${topbar('Olá, ' + state.currentTech.nome.split(' ')[0], {showBack:false, settings:true, settingsBadge:NOTIF_CACHE.naoLidas})}
  <div class="screen">
    <div class="scope-note">${iconLock()} Você vê apenas os atendimentos atribuídos a você</div>
    <form id="agendaFilterForm" class="card agenda-filters">
      <div class="field"><label for="agendaCliente">Buscar cliente</label><input id="agendaCliente" type="text" value="${escapeHtml(agendaFilters.cliente)}" placeholder="Nome do cliente"></div>
      <div class="agenda-dates">
        <div class="field"><label for="agendaInicio">Data inicial</label><input id="agendaInicio" type="date" value="${agendaFilters.inicio}"></div>
        <div class="field"><label for="agendaFim">Data final</label><input id="agendaFim" type="date" value="${agendaFilters.fim}"></div>
      </div>
      <div class="field"><label for="agendaStatus">Status</label><select id="agendaStatus">${[['','Todos'],['PENDENTE','Pendente'],['EM_ANDAMENTO','Em andamento'],['CONCLUIDO','Concluído']].map(([value,label])=>`<option value="${value}" ${agendaFilters.status===value?'selected':''}>${label}</option>`).join('')}</select></div>
      <div class="agenda-dates"><button class="btn btn-primary" type="submit">Filtrar agenda</button><button class="btn btn-outline" type="button" id="clearAgendaFilters">Limpar filtros</button></div>
    </form>
    <button class="btn btn-outline" id="refreshAgenda">Atualizar agenda</button><p role="status">${minhas.length} atendimento(s) encontrado(s)</p>
    <div class="section-label">Hoje</div>
    ${hoje.length ? hoje.map(card).join('') : `<div class="empty">Nenhum atendimento agendado para hoje.</div>`}
    ${outras.length ? `<div class="section-label">Outros dias</div>${outras.map(card).join('')}` : ''}
  </div>`;
}

// ---- 5b. TÉCNICO: detalhe da OS + check-in simples ----
function screenTechDetail(){
  const o = findOS(state.params.id);
  const already = o.status !== 'PENDENTE';
  return `
  ${topbar('Ordem de Serviço')}
  <div class="screen">
    <div class="card" style="margin-bottom:16px;">
      <b style="font-size:17px;">${escapeHtml(o.cliente.nome)}</b>
      <div style="color:var(--text-muted); font-size:13.5px; margin-top:6px; display:flex; gap:6px;">${iconPin()} ${escapeHtml(o.cliente.endereco)}</div>
      <div style="color:var(--text-muted); font-size:13.5px; margin-top:4px;">📞 ${escapeHtml(o.cliente.telefone || 'Telefone não informado')}</div>
      <p><b>Serviço:</b> ${osServiceLabel(o)}</p><div style="margin-top:12px;"><span class="chip ${o.status==='PENDENTE'?'pendente':o.status==='EM_ANDAMENTO'?'andamento':'concluido'}">${statusLabel(o.status)}</span></div>
    </div>

    <button class="btn btn-outline" id="routeBtn">📍 Como chegar?</button>
    <div class="nav-modal" id="navModal" style="display:none"><div class="nav-modal-card"><button class="modal-close" id="closeNavModal">✕</button><h3>📍 ${escapeHtml(o.cliente.nome)}</h3><p>${escapeHtml(o.cliente.endereco)}</p><div class="nav-option" id="mapsOption">🗺️ <span><b>Google Maps</b><small>Abrir rota e navegação</small></span></div><div class="nav-option" id="uberOption">🚗 <span><b>Uber</b><small>Solicitar uma viagem até o cliente</small></span></div><div class="nav-option" id="copyAddress">📋 <span><b>Copiar endereço</b><small>Utilizar em qualquer aplicativo</small></span></div></div></div>

    ${already ? `
      <div class="section-label">Check-in Realizado</div>
      <div class="card">
        <div class="kv"><span class="k">Horário</span><span class="v">${fmtTime(o.checkin?.timestamp)}</span></div>
      </div>
      <button class="btn btn-primary" style="margin-top:16px;" id="continueBtn">
        ${o.status==='EM_ANDAMENTO' ? (ownsReport(o)?'Continuar atendimento':'Acompanhar atendimento') : 'Ver relatório'}
      </button>
    ` : `
      <div class="section-label">Iniciar Atendimento</div>
      <div class="card">
        <div style="font-size:13px; color:var(--text-muted); text-align:center; margin-bottom:16px;">Registre o check-in no local para iniciar o atendimento.</div>
        <button class="btn btn-primary" id="checkinBtn">Fazer check-in</button>
      </div>
    `}
  </div>`;
}

const REPORT_FIELDS = [
  ['tipoChamado','Tipo de chamado',['Garantia','Assistência Técnica','Upgrade','Outros']],
  ['sistemaCliente','Tipo de sistema do cliente'],
  ['motivo','Motivo do atendimento'],
  ['pendencias','Restaram pendências necessitando novo agendamento',['Não','Sim']],
  ['pendenciasDescricao','Descrição das pendências'],
  ['cameras','Sistema de câmeras',['Não se aplica','Somente câmeras (sem gravação)','NVR/DVR']],
  ['gravacao','Configuração de gravação',['Não se aplica','Regular - contactar programador','Detecção de Movimento']],
  ['gravacaoDescricao','Observações da gravação'],
  ['limpeza','Necessária limpeza do rack e equipamentos',['Não','Sim']],
  ['limpezaDescricao','Observações da limpeza'],
  ['retirada','Retirada de equipamento para assistência técnica',['Não','Sim']],
  ['retiradaDescricao','Equipamentos retirados: equipamento / marca / modelo / número de série'],
  ['instalacao','Troca ou instalação de equipamentos',['Não','Sim']],
  ['instalacaoDescricao','Equipamentos instalados: equipamento / marca / modelo / número de série'],
  ['responsavel','Nome do responsável que acompanhou o atendimento']
];
function reportFields(o) {
  const values = o.camposServico || {};
  return `<details class="card report-fields"><summary>Preencher relatório de atendimento</summary>${REPORT_FIELDS.map(([key,label,options])=>`<div class="field"><label for="report-${key}">${label}</label>${options ? `<select id="report-${key}" data-report-field="${key}"><option value="">Não informado</option>${options.map(value=>`<option ${values[key]===value?'selected':''}>${value}</option>`).join('')}</select>` : `<textarea id="report-${key}" data-report-field="${key}" maxlength="4000">${escapeHtml(values[key])}</textarea>`}</div>`).join('')}</details>`;
}

// ---- 5c. TÉCNICO: execução do serviço (descrição + fotos) ----
function screenTechExec(){
  const o = findOS(state.params.id);
  return `
  ${topbar('Execução do serviço')}
  <div class="screen">
    <div class="section-label">Tipo de serviço</div><div class="card"><b>${osServiceLabel(o)}</b><div class="service-fields" id="serviceFields">${o.tipoServico==='MANUTENCAO_WIFI'?'Modelo do equipamento · Quantidade de Access Points · SSID · Teste de conexão':o.tipoServico==='INSTALACAO_REDE'?'Pontos instalados · Equipamentos · Testes realizados':'Preencha os detalhes técnicos na descrição do atendimento.'}</div></div><div class="section-label">Descrição do atendimento</div>
    <div class="desc-row">
      <div class="field">
        <textarea id="descField" placeholder="Descreva o serviço realizado…">${escapeHtml(o.descricao||'')}</textarea>
      </div>
      <button class="mic-btn" id="micBtn" title="Ditar por voz">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
    </div>

    ${reportFields(o)}
    <div class="section-label">Evidências do serviço</div><div class="photo-category"><label>Categoria da foto</label><select id="photoCategory"><option value="ANTES">📷 Antes do serviço</option><option value="DURANTE">📷 Durante o serviço</option><option value="DEPOIS">📷 Após a conclusão</option><option value="EQUIPAMENTOS">📷 Equipamentos utilizados</option></select></div><label class="photo-add">📷 Toque para anexar foto (câmera ou galeria)<input type="file" accept="image/*" id="photoInput" style="display:none;"></label>
    ${photoGallery(o,true)}

    <button class="btn btn-primary" style="margin-top:22px;" id="toSignBtn">Finalizar e coletar assinatura</button>
  </div>`;
}

// ---- 5d. TÉCNICO: assinatura + checkout ----
function screenTechSignature(){
  return `
  ${topbar('Check-out')}
  <div class="screen">
    <div class="section-label">Assinatura do cliente</div>
    <div class="sig-pad-wrap"><canvas id="sigCanvas"></canvas></div>
    <div class="sig-caption">Peça para o cliente assinar com o dedo na tela</div>
    <button class="btn btn-ghost small" id="clearSigBtn" style="margin-top:10px;">Limpar assinatura</button>
    <button class="btn btn-primary" style="margin-top:18px;" id="finishBtn" disabled>Concluir atendimento</button>
  </div>`;
}

// ---- 5e. TÉCNICO: relatório final ----
function screenTechReport(){
  const o = findOS(state.params.id);
  return `
  ${topbar('Relatório')}
  <div class="screen">
    <div class="report-header">
      <div class="stamp">✓ Atendimento concluído</div>
      <div style="font-size:13px; color:var(--text-muted);">OS #${o.id.slice(-6)}</div>
    </div>
    <div class="card">
      <div class="kv"><span class="k">Cliente</span><span class="v">${escapeHtml(o.cliente.nome)}</span></div>
      <div class="kv"><span class="k">Endereço</span><span class="v">${escapeHtml(o.cliente.endereco)}</span></div>
      <div class="kv"><span class="k">Técnico</span><span class="v">${escapeHtml(o.tecnicoNome)}</span></div>
      <div class="kv"><span class="k">Check-in</span><span class="v">${fmtTime(o.checkin?.timestamp)}</span></div>
      <div class="kv"><span class="k">Check-out</span><span class="v">${fmtTime(o.checkout?.timestamp)}</span></div>
      <div class="kv"><span class="k">Duração</span><span class="v">${fmtDur(o.checkin?.timestamp, o.checkout?.timestamp)}</span></div>
    </div>
    <div class="section-label">Descrição</div>
    <div class="card" style="font-size:13.5px; line-height:1.5;">${escapeHtml(o.descricao || '—')}</div>
    ${photoGallery(o)}
    <div class="section-label">Assinatura</div>
    <div class="sig-pad-wrap" style="padding:8px;"><img src="${o.assinatura}" style="width:100%; display:block;"></div>

    <button class="btn btn-primary" style="margin-top:20px;" id="pdfBtn">⬇ Baixar relatório em PDF</button>
    <button class="btn btn-ghost" style="margin-top:10px;" data-nav="tech_agenda">Voltar à agenda</button>
  </div>`;
}

// ---- 5f. ADMIN: painel ----
function screenAdminPanel(){
  const total = OS_LIST.length;
  const pend = OS_LIST.filter(o=>o.status==='PENDENTE').length;
  const and = OS_LIST.filter(o=>o.status==='EM_ANDAMENTO').length;
  const conc = OS_LIST.filter(o=>o.status==='CONCLUIDO').length;
  const pendentesAprovacao = PENDING_CACHE.length;

  const f = state.params.filters || { tecnico:'all', status:'all', busca:'' };
  let list = [...OS_LIST];
  if(f.tecnico!=='all') list = list.filter(o=>(o.tecnicoIds||[o.tecnicoId]).includes(f.tecnico));
  if(f.status!=='all') list = list.filter(o=>o.status===f.status);
  if(f.busca) list = list.filter(o=>o.cliente.nome.toLowerCase().includes(f.busca.toLowerCase()));
  list.sort((a,b)=> (b.data+b.hora).localeCompare(a.data+a.hora));

  return `
  ${topbar('Painel administrativo', {showBack:false, settings:true, settingsBadge:NOTIF_CACHE.naoLidas})}
  ${adminTabs('os')}
  <div class="screen" style="padding-bottom:90px;">
    <div class="scope-note">${iconLock()} Logado como ${state.currentUser.nome} · acesso total</div>

    ${pendentesAprovacao ? `
      <div class="pending-alert" data-nav="admin_pending">
        <span>🔔 ${pendentesAprovacao} ${pendentesAprovacao===1?'solicitação':'solicitações'} de cadastro aguardando aprovação</span>
        <span class="chip pendente">Revisar</span>
      </div>
    ` : ''}

    <div class="stat-grid">
      <div class="stat-card"><div class="n">${total}</div><div class="l">Ordens de serviço</div></div>
      <div class="stat-card"><div class="n">${pend}</div><div class="l">Pendentes</div></div>
      <div class="stat-card"><div class="n">${and}</div><div class="l">Em andamento</div></div>
      <div class="stat-card"><div class="n">${conc}</div><div class="l">Concluídas</div></div>
    </div>

    <div class="section-label">Buscar atendimentos já executados</div>
    <div class="field"><input type="text" id="buscaFieldAdmin" placeholder="Buscar por cliente…" value="${f.busca}"></div>
    <div class="filters">
      <select id="fTecFiltroAdmin">
        <option value="all" ${f.tecnico==='all'?'selected':''}>Todos os técnicos</option>
        ${TECNICOS.map(t=>`<option value="${t.id}" ${f.tecnico===t.id?'selected':''}>${t.nome}</option>`).join('')}
      </select>
      <select id="fStatusFiltroAdmin">
        <option value="all" ${f.status==='all'?'selected':''}>Todos os status</option>
        <option value="PENDENTE" ${f.status==='PENDENTE'?'selected':''}>Pendente</option>
        <option value="EM_ANDAMENTO" ${f.status==='EM_ANDAMENTO'?'selected':''}>Em andamento</option>
        <option value="CONCLUIDO" ${f.status==='CONCLUIDO'?'selected':''}>Já executadas</option>
      </select>
    </div>

    <div class="section-label">Ordens de serviço ${f.status!=='all'||f.tecnico!=='all'||f.busca ? '(filtradas)' : ''}</div>
    ${list.length ? list.map(o=>`
      <div class="os-card st-${o.status}" ${o.status==='CONCLUIDO' ? `data-open-admin="${o.id}"` : ''}>
        <div class="time">${o.hora}</div>
        <div class="info" style="flex:1">
          <b>${escapeHtml(o.cliente.nome)}</b><div class="service-preview">${osServiceLabel(o)}</div>
          <div class="addr">${iconPin()} ${escapeHtml(o.tecnicoNome)} · ${new Date(o.data+'T00:00').toLocaleDateString('pt-BR')}</div>
          <div class="meta" style="flex-wrap: wrap;">
            <span class="chip ${o.status==='PENDENTE'?'pendente':o.status==='EM_ANDAMENTO'?'andamento':'concluido'}">${statusLabel(o.status)}</span>
            ${o.status === 'CONCLUIDO' ? `<span class="chip" style="background:var(--surface-2); color:var(--text-muted);">Toque para ver relatório</span>` : ''}
            ${state.role==='ADMIN'?`<button class="btn btn-danger small" data-del-os="${o.id}" style="margin-left:auto; padding: 4px 10px; font-size: 11px;">Excluir</button>`:''}
          </div>
        </div>
      </div>`).join('') : `<div class="empty">Nenhuma OS encontrada com esses filtros.</div>`}
  </div>
  <button class="fab" id="newOsBtn" title="Nova OS">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
  </button>`;
}

// ---- 5f-bis. ADMIN: relatório de um atendimento concluído (para enviar ao cliente) ----
function screenAdminDetail(){
  const o = findOS(state.params.id);
  return `
  ${topbar('Relatório do atendimento')}
  <div class="screen">
    <div class="report-header">
      <div class="stamp">✓ Atendimento concluído</div>
      <div style="font-size:13px; color:var(--text-muted);">OS #${o.id.slice(-6)}</div>
    </div>
    <div class="card">
      <div class="kv"><span class="k">Cliente</span><span class="v">${escapeHtml(o.cliente.nome)}</span></div>
      <div class="kv"><span class="k">Endereço</span><span class="v">${escapeHtml(o.cliente.endereco)}</span></div>
      <div class="kv"><span class="k">E-mail do cliente</span><span class="v">${escapeHtml(o.cliente.email || '—')}</span></div>
      <div class="kv"><span class="k">Técnico</span><span class="v">${escapeHtml(o.tecnicoNome)}</span></div>
      <div class="kv"><span class="k">Tipo de serviço</span><span class="v">${osServiceLabel(o)}</span></div>
      <div class="kv"><span class="k">Check-in</span><span class="v">${fmtTime(o.checkin?.timestamp)}</span></div>
      <div class="kv"><span class="k">Check-out</span><span class="v">${fmtTime(o.checkout?.timestamp)}</span></div>
      <div class="kv"><span class="k">Duração</span><span class="v">${fmtDur(o.checkin?.timestamp, o.checkout?.timestamp)}</span></div>
    </div>
    <div class="section-label">Descrição</div>
    <div class="card" style="font-size:13.5px; line-height:1.5;">${escapeHtml(o.descricao || '—')}</div>
    ${photoGallery(o)}
    <div class="section-label">Assinatura</div>
    <div class="sig-pad-wrap" style="padding:8px;"><img src="${o.assinatura}" style="width:100%; display:block;"></div>

    <button class="btn btn-primary" style="margin-top:20px;" id="pdfBtnAdmin">⬇ Baixar relatório em PDF</button>
    <button class="btn btn-outline" style="margin-top:10px;" id="sendClientBtn">✉ Enviar relatório ao cliente</button>
  </div>`;
}

// ---- 5f-ter. ADMIN: aprovação de cadastros pendentes (decide Técnico ou Admin) ----
function screenAdminPending(){
  return `
  ${topbar('Cadastros pendentes')}
  <div class="screen">
    ${PENDING_CACHE.length ? PENDING_CACHE.map(r=>`
      <div class="card" style="margin-bottom:12px;">
        <b style="font-size:15px;">${r.nome}</b>
        <div style="color:var(--text-muted); font-size:13px; margin-top:2px;">${r.email}</div>
        <div style="color:var(--text-muted); font-size:11.5px; margin-top:6px;">Solicitado em ${new Date(r.solicitadoEm).toLocaleString('pt-BR')}</div>
        <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
          <button class="btn btn-primary small" data-approve="${r.id}:TECNICO">Aprovar como Técnico</button>
          <button class="btn btn-outline small" data-approve="${r.id}:VISUALIZADOR">Somente dashboard</button>
          <button class="btn btn-outline small" data-approve="${r.id}:ADMIN">Aprovar como Admin</button>
          <button class="btn btn-danger small" data-reject="${r.id}" style="margin-left:auto;">Recusar</button>
        </div>
      </div>
    `).join('') : `<div class="empty">Nenhuma solicitação de cadastro pendente no momento.</div>`}
  </div>`;
}

function adminTabs(active) {
  return `<nav class="admin-tabs" aria-label="Administração"><button class="settings-tab ${active==='os'?'active':''}" data-nav="admin_panel">Ordens de serviço</button><button class="settings-tab ${active==='clientes'?'active':''}" data-nav="admin_clientes">Clientes</button></nav>`;
}
function screenClientes() {
  const editing = CLIENTES.find(c => c.id === state.params.editId);
  const form = state.params.newClient || editing;
  const fields = [['nome','Nome'],['endereco','Endereço'],['telefone','Telefone de contato (opcional)'],['tipoSistema','Tipo do sistema'],['email','E-mail (opcional)']];
  return `${topbar('Cadastro de clientes')}${adminTabs('clientes')}<div class="screen">
    <button class="btn btn-primary" id="newClientBtn">Cadastrar cliente</button>
    ${form ? `<form id="clientForm" class="card client-form"><h2>${editing?'Editar cliente':'Novo cliente'}</h2>${fields.map(([key,label])=>`<div class="field"><label for="client-${key}">${label}</label><input id="client-${key}" type="${key==='telefone'?'tel':key==='email'?'email':'text'}" maxlength="${key==='endereco'?700:key==='tipoSistema'?500:key==='telefone'?80:key==='nome'?180:200}" ${['email','telefone'].includes(key)?'':'required'} value="${escapeHtml(editing?.[key])}"></div>`).join('')}<p id="clientError" role="alert"></p><button class="btn btn-primary" type="submit">Salvar cliente</button><button class="btn btn-ghost" id="cancelClient" type="button">Cancelar</button></form>` : ''}
    <div class="field"><label for="clientSearch">Buscar cliente cadastrado</label><input id="clientSearch" type="text" placeholder="Nome do cliente"></div>
    <div id="clientList">${CLIENTES.map(c=>`<article class="card client-card" data-client-name="${escapeHtml(c.nome.toLocaleLowerCase('pt-BR'))}"><h3>${escapeHtml(c.nome)}</h3><p>${escapeHtml(c.endereco)}</p><p>${escapeHtml(c.telefone)}</p><p><b>Sistema:</b> ${escapeHtml(c.tipoSistema || 'Não informado')}</p><button class="btn btn-outline" data-edit-client="${escapeHtml(c.id)}">Editar dados</button><button class="btn btn-danger" data-delete-client="${escapeHtml(c.id)}">Excluir cliente</button></article>`).join('')}</div><p id="clientEmpty" ${CLIENTES.length?'hidden':''}>Nenhum cliente encontrado.</p>
  </div>`;
}

// ---- 5g. ADMIN: nova OS (cadastro de cliente + agendamento) ----
function screenAdminNew(){
  return `
  ${topbar('Nova ordem de serviço')}
  <div class="screen">
    <div class="section-label">Cliente cadastrado</div>
    <div class="field"><label for="osClientSearch">Buscar pelo nome</label><input id="osClientSearch" type="text" placeholder="Digite o nome do cliente"></div>
    <div class="field"><label for="osClient">Selecione o cliente</label><select id="osClient"><option value="">Selecione...</option>${CLIENTES.map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.nome)} — ${escapeHtml(c.endereco)}</option>`).join('')}</select></div>
    <div class="card" id="osClientDetails">Selecione um cliente para carregar os dados.</div>
    <button class="btn btn-ghost" data-nav="admin_clientes">Abrir cadastro de clientes</button>

    <div class="section-label">Tipo de serviço</div><div class="field"><label>Serviço</label><select id="fTipoServico"><option value="INSTALACAO_REDE">🌐 Instalação de rede</option><option value="MANUTENCAO_WIFI">📡 Manutenção de Wi‑Fi</option><option value="INSTALACAO_CAMERAS">📷 Instalação de câmeras</option><option value="MANUTENCAO_PREVENTIVA">🔧 Manutenção preventiva</option><option value="SUPORTE">💻 Suporte técnico</option><option value="INSTALACAO_EQUIPAMENTOS">🖥️ Instalação de equipamentos</option><option value="INFRAESTRUTURA">🔌 Infraestrutura</option><option value="EMERGENCIAL">⚠️ Atendimento emergencial</option><option value="PERSONALIZADO">Outro — escrever tipo de serviço</option></select></div><div class="field" id="customServiceField" hidden><label for="customService">Tipo de serviço a prestar</label><input id="customService" type="text" maxlength="300" placeholder="Descreva o tipo de serviço"></div><div class="section-label">Agendamento</div>
    <div class="field"><label>Técnicos da equipe (selecione um ou mais)</label>
      <div class="team-options">${TECNICOS.map(t=>`<label><input type="checkbox" name="fTecnicos" value="${escapeHtml(t.id)}"> ${escapeHtml(t.nome)}</label>`).join('')}</div>
    </div>
    <div style="display:flex; gap:10px;">
      <div class="field" style="flex:1"><label>Data</label><input type="date" id="fData" value="${localDate()}"></div>
      <div class="field" style="flex:1"><label>Horário</label><input type="time" id="fHora" value="09:00"></div>
    </div>

    <button class="btn btn-primary" style="margin-top:8px;" id="saveOsBtn">Criar ordem de serviço</button>
  </div>`;
}

// ---- 5h. VISUALIZADOR: dashboard (somente leitura) ----
function screenDashboard(){
  const f = state.params.filters || { tecnico:'all', status:'all', busca:'' };
  let list = [...OS_LIST];
  if(f.tecnico!=='all') list = list.filter(o=>(o.tecnicoIds||[o.tecnicoId]).includes(f.tecnico));
  if(f.status!=='all') list = list.filter(o=>o.status===f.status);
  if(f.busca) list = list.filter(o=>o.cliente.nome.toLowerCase().includes(f.busca.toLowerCase()));
  list.sort((a,b)=> (b.data+b.hora).localeCompare(a.data+a.hora));

  const total = OS_LIST.length, conc = OS_LIST.filter(o=>o.status==='CONCLUIDO').length;
  const and = OS_LIST.filter(o=>o.status==='EM_ANDAMENTO').length, pend = OS_LIST.filter(o=>o.status==='PENDENTE').length;

  return `
  ${topbar('Dashboard', {showBack:false})}
  <div class="screen">
    <div class="scope-note">${iconLock()} Logado como ${state.currentUser.nome} · somente leitura</div>
    <div class="stat-grid">
      <div class="stat-card"><div class="n">${total}</div><div class="l">Total de OS</div></div>
      <div class="stat-card"><div class="n">${conc}</div><div class="l">Concluídas</div></div>
      <div class="stat-card"><div class="n">${and}</div><div class="l">Em andamento</div></div>
      <div class="stat-card"><div class="n">${pend}</div><div class="l">Pendentes</div></div>
    </div>

    <div class="field" style="margin-top:14px;"><input type="text" id="buscaField" placeholder="Buscar por cliente…" value="${f.busca}"></div>
    <div class="filters">
      <select id="fTecFiltro">
        <option value="all" ${f.tecnico==='all'?'selected':''}>Todos os técnicos</option>
        ${TECNICOS.map(t=>`<option value="${t.id}" ${f.tecnico===t.id?'selected':''}>${t.nome}</option>`).join('')}
      </select>
      <select id="fStatusFiltro">
        <option value="all" ${f.status==='all'?'selected':''}>Todos os status</option>
        <option value="PENDENTE" ${f.status==='PENDENTE'?'selected':''}>Pendente</option>
        <option value="EM_ANDAMENTO" ${f.status==='EM_ANDAMENTO'?'selected':''}>Em andamento</option>
        <option value="CONCLUIDO" ${f.status==='CONCLUIDO'?'selected':''}>Concluído</option>
      </select>
    </div>

    ${list.length ? list.map(o=>`
      <div class="os-card st-${o.status}" data-view-os="${o.id}">
        <div class="time">${o.hora}</div>
        <div class="info" style="flex:1">
          <b>${escapeHtml(o.cliente.nome)}</b><div class="service-preview">${osServiceLabel(o)}</div>
          <div class="addr">${iconPin()} ${escapeHtml(o.tecnicoNome)} · ${new Date(o.data+'T00:00').toLocaleDateString('pt-BR')}</div>
          <div class="meta"><span class="chip ${o.status==='PENDENTE'?'pendente':o.status==='EM_ANDAMENTO'?'andamento':'concluido'}">${statusLabel(o.status)}</span></div>
        </div>
      </div>`).join('') : `<div class="empty">Nenhuma OS encontrada.</div>`}
  </div>`;
}

// ---- 5i. VISUALIZADOR: detalhe somente-leitura ----
function screenViewDetail(){
  const o = findOS(state.params.id);
  return `
  ${topbar('Detalhe da OS')}
  <div class="screen">
    <div class="card">
      <div class="kv"><span class="k">Cliente</span><span class="v">${escapeHtml(o.cliente.nome)}</span></div>
      <div class="kv"><span class="k">Endereço</span><span class="v">${escapeHtml(o.cliente.endereco)}</span></div>
      <div class="kv"><span class="k">Técnico</span><span class="v">${escapeHtml(o.tecnicoNome)}</span></div>
      <div class="kv"><span class="k">Status</span><span class="v">${statusLabel(o.status)}</span></div>
      <div class="kv"><span class="k">Check-in</span><span class="v">${fmtTime(o.checkin?.timestamp)}</span></div>
      <div class="kv"><span class="k">Check-out</span><span class="v">${fmtTime(o.checkout?.timestamp)}</span></div>
    </div>
    ${o.descricao ? `<div class="section-label">Descrição</div><div class="card" style="font-size:13.5px;">${o.descricao}</div>` : ''}
    ${o.status==='CONCLUIDO' ? `<button class="btn btn-primary" style="margin-top:18px;" id="pdfBtnView">⬇ Baixar relatório em PDF</button>` : `<div class="empty" style="padding:24px 0;">Relatório ainda não finalizado.</div>`}
  </div>`;
}

// ---- 5j. CONFIGURAÇÕES (técnico e admin) ----
function screenSettings(){
  const u = state.currentUser;
  const isAdmin = u.perfil === 'ADMIN';
  const aba = state.params.aba || 'perfil';
  const dominioEmpresa = 'taagbrasil.com.br';
  const tipoLogin = u.email.toLowerCase().endsWith('@'+dominioEmpresa) ? 'Login corporativo (TAAG)' : 'Login pessoal';


  return `
  ${topbar('Configurações')}
  <div class="screen">
    <div class="settings-tabs">
      <button class="settings-tab ${aba==='perfil'?'active':''}" data-set-aba="perfil">Perfil</button>
      <button class="settings-tab ${aba==='logins'?'active':''}" data-set-aba="logins">Meus logins</button>
      ${isAdmin ? `<button class="settings-tab ${aba==='aprovacao'?'active':''}" data-set-aba="aprovacao">Aprovação${PENDING_CACHE.length?` <span class="tab-badge">${PENDING_CACHE.length}</span>`:''}</button>` : ''}
    </div>

    ${aba==='perfil' ? `
      <div class="card">
        <div class="kv"><span class="k">Nome</span><span class="v">${u.nome}</span></div>
        <div class="kv"><span class="k">Perfil de acesso</span><span class="v">${roleLabel(u.perfil)}</span></div>
        ${u.tecnicoId ? `<div class="kv"><span class="k">Técnico vinculado</span><span class="v">${TECNICOS.find(t=>t.id===u.tecnicoId)?.nome||'—'}</span></div>` : ''}
      </div>
    ` : ''}

    ${aba==='logins' ? `
      <div class="card"><b>Conta FieldService</b><p>${escapeHtml(u.email)}</p></div>
      <h2>Acessos a softwares</h2>
      <button class="btn btn-primary" id="addAccess" type="button">Adicionar informações de acesso</button>
      <form id="accessForm" class="card" style="margin-top:12px" hidden>
        <div class="field"><label for="accessSystem">Software / sistema</label><input id="accessSystem" type="text" maxlength="120" required></div>
        <div class="field"><label for="accessUrl">Endereço do sistema (opcional)</label><input id="accessUrl" type="url" maxlength="1000" placeholder="https://"></div>
        <div class="field"><label for="accessUser">Usuário / e-mail de acesso</label><input id="accessUser" type="text" maxlength="200" required autocomplete="off"></div>
        <div class="field"><label for="accessNotes">Observações (opcional)</label><textarea id="accessNotes" maxlength="2000" placeholder="Informações sobre este acesso. Não inclua senhas."></textarea></div>
        <p id="accessError" role="alert"></p>
        <button class="btn btn-primary" type="submit">Salvar acesso</button>
        <button class="btn btn-ghost" id="cancelAccess" type="button">Cancelar</button>
      </form>
      <p class="access-note">Estas informações ficam disponíveis apenas na sua conta.</p>
      ${ACCESS_CACHE.length ? ACCESS_CACHE.map(a=>`<div class="card access-card"><h3>${escapeHtml(a.sistema)}</h3><p><b>Usuário:</b> ${escapeHtml(a.usuario)}</p>${a.endereco ? `<p><a href="${escapeHtml(a.endereco)}" target="_blank" rel="noopener noreferrer">Abrir sistema</a></p>` : ''}${a.observacoes ? `<p class="access-notes">${escapeHtml(a.observacoes)}</p>` : ''}</div>`).join('') : '<p>Nenhum acesso cadastrado.</p>'}
    ` : ''}

    ${aba==='aprovacao' && isAdmin ? `
      <div class="card">
        <div style="font-size:13.5px;">${PENDING_CACHE.length} ${PENDING_CACHE.length===1?'solicitação':'solicitações'} de cadastro aguardando aprovação.</div>
        <button class="btn btn-primary" style="margin-top:14px;" data-nav="admin_pending">Abrir aprovações</button>
      </div>
    ` : ''}
  </div>`;
}

const VIEWS = {
  connection_error: () => `<div class="screen"><h1>Conexão indisponível</h1><p>Não foi possível carregar o sistema. Sua sessão foi mantida.</p><button class="btn btn-primary" id="retryConnection">Tentar novamente</button></div>`,
  login: screenLogin, tech_agenda: screenTechAgenda, tech_detail: screenTechDetail,
  tech_exec: screenTechExec, tech_signature: screenTechSignature, tech_report: screenTechReport,
  admin_clientes: screenClientes, admin_panel: screenAdminPanel, admin_new: screenAdminNew, admin_detail: screenAdminDetail, admin_pending: screenAdminPending,
  view_dashboard: screenDashboard, view_detail: screenViewDetail, settings: screenSettings
};

function render(){
  if(!state.currentUser && !['login','password','pending_registration','connection_error'].includes(state.view))state.view='login';
  prepareFeatures();
  if (state.currentUser && state.view === 'login') state.view = rootScreenFor(state.role);
  document.getElementById('app').dataset.view = state.view;
  document.getElementById('app').innerHTML = VIEWS[state.view]();
  const exitButton = document.getElementById('sessionLogout');
  exitButton.hidden = !state.currentUser;
  exitButton.onclick = logout;
  bindEvents();
  bindFeatures();
}

/* ============================================================
   6. EVENTOS DE CADA TELA
   ============================================================ */
function bindEvents(){
  const app = document.getElementById('app');
  app.querySelectorAll('[data-report-field]').forEach(el => { el.oninput = () => { const o = findOS(state.params.id); o.camposServico ||= {}; o.camposServico[el.dataset.reportField] = el.value; }; });
  const newClient = document.getElementById('newClientBtn');
  if (newClient) {
    newClient.onclick = () => { state.params = { newClient: true }; render(); };
    app.querySelectorAll('[data-delete-client]').forEach(b=>b.onclick=async()=>{
      if(!confirm('Excluir este cliente do cadastro? As informações já registradas nas ordens de serviço serão preservadas.'))return;
      b.disabled=true;
      try{await api('/clientes/'+encodeURIComponent(b.dataset.deleteClient),{method:'DELETE'});CLIENTES=CLIENTES.filter(c=>c.id!==b.dataset.deleteClient);state.params={};render();toast('Cliente excluído.');}
      catch(e){toast(e.message);b.disabled=false;}
    });
    app.querySelectorAll('[data-edit-client]').forEach(b => b.onclick = () => { state.params = { editId: b.dataset.editClient }; render(); });
    document.getElementById('clientSearch').oninput = event => {
      const term = event.target.value.trim().toLocaleLowerCase('pt-BR'); let count = 0;
      app.querySelectorAll('[data-client-name]').forEach(card => { card.hidden = !card.dataset.clientName.includes(term); if (!card.hidden) count++; });
      document.getElementById('clientEmpty').hidden = count > 0;
    };
    const form = document.getElementById('clientForm');
    if (form) {
      document.getElementById('cancelClient').onclick = () => { state.params = {}; render(); };
      form.onsubmit = async event => {
        event.preventDefault(); const editId = state.params.editId; const button = form.querySelector('[type="submit"]'); button.disabled = true;
        const body = Object.fromEntries(['nome','endereco','telefone','tipoSistema','email'].map(key => [key, document.getElementById('client-'+key).value.trim()]));
        try {
          const { cliente } = await api('/clientes' + (editId ? '/' + encodeURIComponent(editId) : ''), { method: editId ? 'PUT' : 'POST', body });
          const i = CLIENTES.findIndex(c => c.id === cliente.id); if (i < 0) CLIENTES.push(cliente); else CLIENTES[i] = cliente;
          state.params = {}; render(); toast('Cliente salvo no cadastro.');
        } catch (err) { document.getElementById('clientError').textContent = err.message; button.disabled = false; }
      };
    }
  }
  const clientSelect = document.getElementById('osClient');
  if (clientSelect) {
    clientSelect.onchange = () => {
      const c = CLIENTES.find(item => item.id === clientSelect.value);
      document.getElementById('osClientDetails').innerHTML = c ? `<b>${escapeHtml(c.nome)}</b><p>${escapeHtml(c.endereco)}</p><p>${escapeHtml(c.telefone)}</p><p>Sistema: ${escapeHtml(c.tipoSistema || 'Não informado')}</p>` : 'Selecione um cliente para carregar os dados.';
    };
    document.getElementById('osClientSearch').oninput = event => {
      const term = event.target.value.trim().toLocaleLowerCase('pt-BR');
      const matches = CLIENTES.filter(c => c.nome.toLocaleLowerCase('pt-BR').includes(term));
      clientSelect.innerHTML = '<option value="">Selecione...</option>' + matches.map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.nome)} — ${escapeHtml(c.endereco)}</option>`).join('');
      if (matches.length === 1) clientSelect.value = matches[0].id;
      clientSelect.onchange();
    };
    document.getElementById('fTipoServico').onchange = event => { document.getElementById('customServiceField').hidden = event.target.value !== 'PERSONALIZADO'; };
  }
  const accessForm = document.getElementById('accessForm');
  if (accessForm) {
    document.getElementById('addAccess').onclick = () => { accessForm.hidden = false; document.getElementById('accessSystem').focus(); };
    document.getElementById('cancelAccess').onclick = () => { accessForm.reset(); accessForm.hidden = true; document.getElementById('accessError').textContent = ''; };
    accessForm.onsubmit = async event => {
      event.preventDefault();
      const submit = accessForm.querySelector('[type="submit"]'); submit.disabled = true;
      try {
        const { acesso } = await api('/acessos', { method: 'POST', body: { sistema: document.getElementById('accessSystem').value, endereco: document.getElementById('accessUrl').value, usuario: document.getElementById('accessUser').value, observacoes: document.getElementById('accessNotes').value } });
        ACCESS_CACHE.push(acesso); render(); toast('Acesso salvo.');
      } catch (err) { document.getElementById('accessError').textContent = err.message; submit.disabled = false; }
    };
  }
  const filters = document.getElementById('agendaFilterForm');
  if (filters) {
    filters.onsubmit = event => {
      event.preventDefault();
      const inicio = document.getElementById('agendaInicio').value;
      const fim = document.getElementById('agendaFim').value;
      if (inicio && fim && inicio > fim) { toast('A data final deve ser igual ou posterior à inicial.'); return; }
      Object.assign(agendaFilters, { cliente: document.getElementById('agendaCliente').value, inicio, fim, status: document.getElementById('agendaStatus').value });
      render();
    };
    document.getElementById('clearAgendaFilters').onclick = () => { Object.assign(agendaFilters, { cliente: '', inicio: '', fim: '', status: '' }); render(); };
  }
  const retry = document.getElementById('retryConnection');
  if (retry) retry.onclick = () => location.reload();

  app.querySelectorAll('[data-nav="back"]').forEach(b=>b.onclick = back);
  app.querySelectorAll('[data-nav="logout"]').forEach(b=>b.onclick = logout);
  app.querySelectorAll('[data-nav]').forEach(b=>{
    const v = b.getAttribute('data-nav');
    if(v!=='back' && v!=='logout') b.onclick = ()=>nav(v);
  });

  /* ---- LOGIN / CADASTRO ---- */
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  if(loginForm){
    const emailEl = document.getElementById('loginEmail');
    const senhaEl = document.getElementById('loginSenha');
    const errEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    const btnLabel = document.getElementById('loginBtnLabel');
    const goToRegister = document.getElementById('goToRegister');
    const goToLogin = document.getElementById('goToLogin');
    const regErrEl = document.getElementById('registerError');

    // Cadastro é um link (não uma aba fixa): clicar nele abre as opções de cadastro
    goToRegister.onclick = ()=>{
      loginForm.style.display = 'none'; goToRegister.style.display = 'none';
      registerForm.style.display = 'block'; goToLogin.style.display = 'block';
      errEl.style.display='none';
    };
    goToLogin.onclick = ()=>{
      registerForm.style.display = 'none'; goToLogin.style.display = 'none';
      loginForm.style.display = 'block'; goToRegister.style.display = 'block';
      if(regErrEl) regErrEl.style.display='none';
    };

    document.getElementById('togglePass').onclick = ()=>{
      const show = senhaEl.type === 'password';
      senhaEl.type = show ? 'text' : 'password';
      document.getElementById('togglePass').innerHTML = iconEye(show);
    };

    loginForm.onsubmit = async (ev)=>{
      ev.preventDefault();
      errEl.style.display='none';
      btn.disabled = true; btnLabel.textContent = 'Autenticando…';
      try{
        const { usuario } = await apiLogin(emailEl.value, senhaEl.value);
        await afterLogin(usuario);
        toast('Bem-vindo, ' + usuario.nome.split(' ')[0] + ' · ' + roleLabel(usuario.perfil));
        nav(rootScreenFor(usuario.perfil));
      }catch(err){
        errEl.textContent = err.message || 'E-mail ou senha inválidos.';
        errEl.style.display='block';
        loginForm.classList.remove('shake'); void loginForm.offsetWidth; loginForm.classList.add('shake');
      }finally{
        btn.disabled = false; btnLabel.textContent = 'Entrar';
      }
    };

    // Cadastro NÃO deixa a pessoa escolher o próprio perfil — vira uma solicitação
    // pendente no servidor, e só o admin principal decide (no painel administrativo)
    // se a conta será Técnico ou Administrador.
    registerForm.onsubmit = async (ev) => {
      ev.preventDefault();
      const nome = document.getElementById('regNome').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const senha = document.getElementById('regSenha').value;
      const senha2 = document.getElementById('regSenha2').value;
      const registerBtn = document.getElementById('registerBtn');

      if(senha !== senha2){
        regErrEl.textContent = 'As senhas não coincidem.';
        regErrEl.style.display = 'block';
        return;
      }
      regErrEl.style.display = 'none';
      registerBtn.disabled = true;
      try{
        await apiRegister(nome, email, senha);
        toast('Cadastro enviado! Aguarde a aprovação do administrador.');
        state.currentUser=null;state.role=null;state.history=[];nav('pending_registration');
      }catch(err){
        regErrEl.textContent = err.message || 'Não foi possível enviar o cadastro.';
        regErrEl.style.display = 'block';
      }finally{
        registerBtn.disabled = false;
      }
    };
  }

  /* ---- AGENDA TÉCNICO ---- */
  app.querySelectorAll('[data-open-os]').forEach(el=>{
    el.onclick = ()=>nav('tech_detail', { id: el.getAttribute('data-open-os') });
  });

  /* ---- DETALHE OS (rota + check-in) ---- */
  const routeBtn = document.getElementById('routeBtn');
  if(routeBtn) routeBtn.onclick = ()=>{ const m=document.getElementById('navModal'); m.style.display='flex'; };
  const closeNavModal=document.getElementById('closeNavModal'); if(closeNavModal) closeNavModal.onclick=()=>document.getElementById('navModal').style.display='none';
  const currentOS=findOS(state.params.id); const addr=currentOS?.cliente?.endereco;
  const mapsOption=document.getElementById('mapsOption'); if(mapsOption) mapsOption.onclick=()=>openRoute(addr);
  const uberOption=document.getElementById('uberOption'); if(uberOption) uberOption.onclick=()=>openUber(addr);
  const copyAddress=document.getElementById('copyAddress'); if(copyAddress) copyAddress.onclick=async()=>{ try{await navigator.clipboard.writeText(addr);toast('Endereço copiado');}catch(e){toast('Não foi possível copiar');} };

  const continueBtn = document.getElementById('continueBtn');
  if(continueBtn) continueBtn.onclick = ()=>{ const o=findOS(state.params.id); nav(o.status==='EM_ANDAMENTO'?(ownsReport(o)?'tech_exec':'team_progress'):'tech_report',{id:o.id}); };

  const checkinBtn = document.getElementById('checkinBtn');
  if(checkinBtn) checkinBtn.onclick = async () => {
    checkinBtn.disabled = true; checkinBtn.textContent = 'Registrando…';
    try{
      const { os } = await apiCheckin(currentOS.id);
      updateOsCache(os);
      toast('Check-in registrado');
      nav('tech_exec',{id:os.id});
    }catch(err){
      toast(err.message || 'Não foi possível registrar o check-in.');
      checkinBtn.disabled = false; checkinBtn.textContent = 'Fazer check-in';
    }
  };

  /* ---- EXECUÇÃO (descrição, voz, fotos) ---- */
  const descField = document.getElementById('descField');
  if(descField){
    descField.oninput = ()=>{ findOS(state.params.id).descricao = descField.value; };
    const micBtn = document.getElementById('micBtn');
    micBtn.onclick = ()=> toggleDictation(micBtn, descField, state.params.id);

    document.getElementById('photoInput').onchange = e => handlePhoto(e, state.params.id, document.getElementById('photoCategory').value);

    document.getElementById('toSignBtn').onclick = async ()=>{
      const o=findOS(state.params.id);
      const cats=(o.fotos||[]).map(f=>f.categoria);
      if(!cats.includes('ANTES')||!cats.includes('DEPOIS')){
        toast('Registre pelo menos uma foto ANTES e uma DEPOIS do serviço');
        return;
      }
      const button=document.getElementById('toSignBtn');button.disabled=true;
      try { await saveAllPhotoDescriptions(o); nav('tech_signature', { id: state.params.id }); }
      catch(err){toast(err.message);}finally{button.disabled=false;}
    };
  }

  /* ---- ASSINATURA / CHECKOUT ---- */
  const canvas = document.getElementById('sigCanvas');
  if(canvas) setupSignaturePad(canvas, state.params.id);

  /* ---- RELATÓRIO ---- */
  const pdfBtn = document.getElementById('pdfBtn') || document.getElementById('pdfBtnView') || document.getElementById('pdfBtnAdmin');
  if(pdfBtn) pdfBtn.onclick = ()=> gerarPDF(findOS(state.params.id));

  /* ---- ADMIN ---- */
  const newOsBtn = document.getElementById('newOsBtn');
  if(newOsBtn) newOsBtn.onclick = ()=>nav('admin_new');

  app.querySelectorAll('[data-del-os]').forEach(b=>{
    b.onclick = async (ev)=>{
      ev.stopPropagation();
      if(!confirm('Excluir definitivamente esta ordem de serviço e seu relatório, incluindo fotos e assinatura?')) return;
      const id = b.getAttribute('data-del-os');
      try{
        await apiDeleteOS(id);
        OS_LIST = OS_LIST.filter(o=>o.id!==id);
        render();
      }catch(err){ toast(err.message || 'Não foi possível excluir.'); }
    };
  });

  // filtro do painel administrativo — busca atendimentos já executados (RF de auditoria)
  // preserva o foco/cursor do campo após o render(), senão o input perde o foco a
  // cada tecla digitada (o innerHTML recria o elemento do zero)
  ['buscaFieldAdmin','fTecFiltroAdmin','fStatusFiltroAdmin'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.oninput = el.onchange = ()=>{
      const cursor = el.selectionStart;
      state.params.filters = {
        busca: document.getElementById('buscaFieldAdmin').value,
        tecnico: document.getElementById('fTecFiltroAdmin').value,
        status: document.getElementById('fStatusFiltroAdmin').value
      };
      render();
      const novoEl = document.getElementById(id);
      if(novoEl){ novoEl.focus(); if(cursor!=null && novoEl.setSelectionRange) try{ novoEl.setSelectionRange(cursor, cursor); }catch(e){} }
    };
  });

  // abrir relatório de um atendimento concluído a partir do painel
  app.querySelectorAll('[data-open-admin]').forEach(el=>{
    el.onclick = ()=>nav('admin_detail', { id: el.getAttribute('data-open-admin') });
  });

  const sendClientBtn = document.getElementById('sendClientBtn');
  if(sendClientBtn) sendClientBtn.onclick = ()=>{
    const o = findOS(state.params.id);
    if(!o.cliente.email){
      toast('Este cliente não tem e-mail cadastrado. Edite a OS para adicionar.');
      return;
    }
    const assunto = encodeURIComponent('Relatório de atendimento — ' + o.cliente.nome);
    const corpo = encodeURIComponent(
      'Olá,\n\nSegue o relatório do atendimento realizado em ' +
      (o.checkout ? new Date(o.checkout.timestamp).toLocaleDateString('pt-BR') : '—') +
      ' (' + osServiceLabel(o) + ').\n\n' +
      'Obs: baixe o PDF pelo botão "Baixar relatório em PDF" e anexe-o a este e-mail antes de enviar.\n\nAtenciosamente,\nEquipe TAAG'
    );
    window.open(`mailto:${o.cliente.email}?subject=${assunto}&body=${corpo}`, '_blank', 'noopener,noreferrer');
    toast('Abrindo seu aplicativo de e-mail para enviar ao cliente…');
  };

  // abas da tela de Configurações — marca notificações como lidas ao abrir "Notificações"
  app.querySelectorAll('[data-set-aba]').forEach(b=>{
    b.onclick = async ()=>{
      state.params.aba = b.getAttribute('data-set-aba');
      render();
    };
  });

  // aprovação de cadastros pendentes (admin principal decide Técnico ou Admin)
  app.querySelectorAll('[data-approve]').forEach(b=>{
    b.onclick = async ()=>{
      const [reqId, perfilEscolhido] = b.getAttribute('data-approve').split(':');
      b.disabled = true;
      try{
        const resposta = await apiApprove(reqId, perfilEscolhido);
        // recarrega técnicos (pode ter surgido um técnico novo) e a fila de pendentes
        const [tecRes, pendRes] = await Promise.all([apiGetTecnicos(), apiGetPending()]);
        TECNICOS = tecRes.tecnicos; PENDING_CACHE = pendRes.solicitacoes;
        toast(resposta.mensagem);
        render();
      }catch(err){
        toast(err.message || 'Não foi possível aprovar.');
        b.disabled = false;
      }
    };
  });
  app.querySelectorAll('[data-reject]').forEach(b=>{
    b.onclick = async ()=>{
      const reqId = b.getAttribute('data-reject');
      if(!confirm('Recusar esta solicitação de cadastro?')) return;
      try{
        await apiReject(reqId);
        PENDING_CACHE = (await apiGetPending()).solicitacoes;
        toast('Solicitação recusada');
        render();
      }catch(err){ toast(err.message || 'Não foi possível recusar.'); }
    };
  });

  const saveOsBtn = document.getElementById('saveOsBtn');
  if(saveOsBtn) saveOsBtn.onclick = async ()=>{
    const clienteId = document.getElementById('osClient').value;
    const tipoServico = document.getElementById('fTipoServico').value;
    const tipoServicoPersonalizado = document.getElementById('customService').value.trim();
    if (!clienteId) { toast('Selecione um cliente cadastrado.'); return; }
    if (tipoServico === 'PERSONALIZADO' && !tipoServicoPersonalizado) { toast('Escreva o tipo de serviço.'); return; }

    saveOsBtn.disabled = true;
    try{
      const { os } = await apiCreateOS({
        clienteId, tipoServico, tipoServicoPersonalizado,
        tecnicoIds: [...document.querySelectorAll('[name=fTecnicos]:checked')].map(el=>el.value),
        data: document.getElementById('fData').value,
        hora: document.getElementById('fHora').value,
      });
      OS_LIST.push(os);
      toast('Ordem de serviço criada');
      nav('admin_panel');
    }catch(err){
      toast(err.message || 'Não foi possível criar a ordem de serviço.');
    }finally{
      saveOsBtn.disabled = false;
    }
  };

  /* ---- VISUALIZADOR: filtros ---- */
  ['buscaField','fTecFiltro','fStatusFiltro'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.oninput = el.onchange = ()=>{
      const cursor = el.selectionStart;
      state.params.filters = {
        busca: document.getElementById('buscaField').value,
        tecnico: document.getElementById('fTecFiltro').value,
        status: document.getElementById('fStatusFiltro').value
      };
      render();
      const novoEl = document.getElementById(id);
      if(novoEl){ novoEl.focus(); if(cursor!=null && novoEl.setSelectionRange) try{ novoEl.setSelectionRange(cursor, cursor); }catch(e){} }
    };
  });
  app.querySelectorAll('[data-view-os]').forEach(el=>{
    el.onclick = ()=>nav('view_detail', { id: el.getAttribute('data-view-os') });
  });
}

/* ============================================================
   7. RECURSOS DE HARDWARE / NAVEGADOR
   ============================================================ */

// ---- 7a. Ditado por voz ----
let recognition = null;
function toggleDictation(btn, textarea, osId){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ toast('Ditado por voz não suportado neste navegador'); return; }
  if(recognition){ recognition.stop(); return; }
  recognition = new SR();
  recognition.lang = 'pt-BR';
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.onresult = (e)=>{
    let text = '';
    for(let i=e.resultIndex;i<e.results.length;i++) text += e.results[i][0].transcript;
    textarea.value = (textarea.value + ' ' + text).trim();
    findOS(osId).descricao = textarea.value;
  };
  recognition.onend = ()=>{ btn.classList.remove('rec'); recognition = null; };
  recognition.start();
  btn.classList.add('rec');
}

// ---- 7b. Foto com marca d'água automática — agora sobe pro servidor (POST /api/os/:id/fotos) ----
function handlePhoto(e, osId, category="EVIDENCIA"){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev =>{
    const img = new Image();
    img.onload = async ()=>{
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 900/img.width);
      canvas.width = img.width*scale; canvas.height = img.height*scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img,0,0,canvas.width,canvas.height);

      const o = findOS(osId);
      const barH = 46;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(0, canvas.height-barH, canvas.width, barH);
      ctx.fillStyle = '#fff'; ctx.font = '13px Inter, sans-serif';
      const agora = new Date();
      const linha1 = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      const linha2 = 'Check-in Realizado: ' + fmtTime(o.checkin?.timestamp);
      ctx.fillText(linha1, 10, canvas.height-26);
      ctx.fillText(linha2, 10, canvas.height-9);

      const dataUrl = canvas.toDataURL('image/jpeg', .85);
      try{
        const { fotos } = reportDraft ? {fotos:[...(o.fotos||[]),{id:crypto.randomUUID(),categoria:category,src:dataUrl}]} : await apiUploadFoto(osId, category, dataUrl);
        o.fotos = fotos; // servidor devolve a lista completa e atualizada de fotos da OS
        render();
      }catch(err){
        toast(err.message || 'Não foi possível anexar a foto.');
      }
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// ---- 7c. Assinatura digital + checkout (POST /api/os/:id/checkout) ----
function setupSignaturePad(canvas, osId){
  const ctx = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const resize = ()=>{
    canvas.width = canvas.clientWidth*ratio; canvas.height = canvas.clientHeight*ratio;
    ctx.scale(ratio,ratio); ctx.lineWidth=2.4; ctx.lineCap='round'; ctx.strokeStyle='#0A0C10';
  };
  resize();
  let drawing=false, has=false;
  const pos = e=>{
    const r = canvas.getBoundingClientRect();
    return [ (e.touches? e.touches[0].clientX : e.clientX) - r.left, (e.touches? e.touches[0].clientY : e.clientY) - r.top ];
  };
  const start = e=>{ drawing=true; has=true; const [x,y]=pos(e); ctx.beginPath(); ctx.moveTo(x,y); document.getElementById('finishBtn').disabled=false; };
  const move = e=>{ if(!drawing) return; e.preventDefault(); const [x,y]=pos(e); ctx.lineTo(x,y); ctx.stroke(); };
  const end = ()=> drawing=false;
  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);

  document.getElementById('clearSigBtn').onclick = ()=>{
    ctx.clearRect(0,0,canvas.width,canvas.height); has=false;
    document.getElementById('finishBtn').disabled = true;
  };
  document.getElementById('finishBtn').onclick = async ()=>{
    if(!has) return;
    const finishBtn = document.getElementById('finishBtn');
    finishBtn.disabled = true; finishBtn.textContent = 'Concluindo…';
    try{
      const o = findOS(osId);
      const assinaturaDataUrl = canvas.toDataURL('image/png');
      const body = { descricao: o.descricao || '', camposServico: o.camposServico || {}, assinatura: assinaturaDataUrl };
      const { os } = reportDraft ? await api('/os/'+encodeURIComponent(osId)+'/report', {method:'PATCH', body:{...body,fotos:o.fotos.map(f=>(OS_LIST.find(item=>item.id===osId)?.fotos||[]).some(saved=>saved.id===f.id&&saved.src===f.src)?{id:f.id,categoria:f.categoria,descricao:f.descricao||''}:{categoria:f.categoria,src:f.src,descricao:f.descricao||''})}}) : await apiCheckout(osId, body);
      reportDraft = null;
      updateOsCache(os);
      toast('Atendimento concluído');
      nav('tech_report', { id: osId });
    }catch(err){
      toast(err.message || 'Não foi possível concluir o atendimento.');
      finishBtn.disabled = false; finishBtn.textContent = 'Concluir atendimento';
    }
  };
}

// ---- 7d. Geração de PDF (client-side, com os dados já carregados do backend) ----
async function gerarPDF(o){
  if(!window.jspdf){ toast('Biblioteca de PDF ainda carregando — tente novamente em instantes.'); return; }
  try {
    const logo = await fetch(LOGO_SRC).then(res => { if (!res.ok) throw new Error('Logo indisponível'); return res.blob(); }).then(blob => new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }));
    const doc = buildTaagReport(window.jspdf.jsPDF, o, logo);
    doc.save('relatorio_' + o.cliente.nome.replace(/\s+/g,'_') + '_' + o.id.slice(-6) + '.pdf');
  } catch (err) { toast('Não foi possível gerar o relatório: ' + err.message); }
}

/* ============================================================
   8. INICIALIZAÇÃO
   ------------------------------------------------------------
   Ao carregar a página, primeiro tentamos restaurar a sessão via
   GET /api/auth/me (o cookie httpOnly já viaja sozinho com a
   requisição). Se existir sessão válida, pulamos direto pra tela
   certa — sem isso, a pessoa teria que logar de novo a cada F5.
   ============================================================ */
(async function init(){
  const tempoMinimoSplash = new Promise(r=>setTimeout(r, 1200));

  try{
    const { usuario } = await apiMe();
    await afterLogin(usuario);
    state.view = rootScreenFor(usuario.perfil);
  }catch(err){
    // 401 é o caso normal de "ninguém logado ainda" — qualquer outro erro
    // (rede) já avisa a pessoa que o backend pode não estar respondendo
    if(err.status !== 401) toast(err.message);
    if (err.status === 401) { state.currentUser = null; state.role = null; state.currentTech = null; }
    state.view = err.status === 401 ? 'login' : 'connection_error';
  }

  await tempoMinimoSplash;
  render();
  document.getElementById('splash').style.display = 'none';
})();
