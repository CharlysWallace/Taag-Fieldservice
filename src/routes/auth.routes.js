/**
 * ============================================================
 *  ROTAS DE AUTENTICAÇÃO E CADASTRO (src/routes/auth.routes.js)
 * ------------------------------------------------------------
 *  O QUE VIVE AQUI:
 *   POST /api/auth/login             - login por e-mail/senha
 *   GET  /api/auth/me                - "quem sou eu" (sessão atual)
 *   POST /api/auth/logout            - encerra a sessão
 *   POST /api/auth/register          - cria uma SOLICITAÇÃO de cadastro
 *   GET  /api/auth/pending           - lista solicitações pendentes (admin)
 *   POST /api/auth/pending/:id/approve  - aprova como TECNICO ou ADMIN
 *   POST /api/auth/pending/:id/reject   - recusa a solicitação
 *
 *  UTILIDADE NO APP COMO UM TODO:
 *  Esta é a peça que resolve, do lado do servidor, duas regras de
 *  negócio que o frontend já tinha desenhado na tela mas não
 *  conseguia garantir sozinho:
 *   1) "o cadastro não deixa a pessoa escolher o próprio perfil"
 *      — aqui, POST /register NUNCA recebe nem aceita um campo
 *      "perfil"; a conta some para dentro de "pendente" até
 *      alguém com perfil ADMIN chamar /approve.
 *   2) "só o admin principal decide Técnico ou Admin" — ver o
 *      requireRole('ADMIN') nas rotas de pendentes abaixo.
 * ============================================================
 */

const express = require('express');
const { readCollection, writeCollection, genId } = require('../db');
const { hashPassword, comparePassword } = require('../auth/hash');
const { requireAuth, requireRole } = require('../auth/middleware');

const router = express.Router();

/** Monta o objeto de usuário "seguro" para devolver ao frontend — nunca inclui o hash da senha. */
function toPublicUser(u) {
  const { senhaHash, ...resto } = u;
  return resto;
}

// ---------- POST /api/auth/login ----------
router.post('/login', async (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) {
    return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  }

  const usuarios = await readCollection('usuarios');
  const user = usuarios.find((u) => u.email.toLowerCase() === String(email).toLowerCase());

  // mensagem de erro propositalmente genérica (não revela se o e-mail existe ou não)
  if (!user || !comparePassword(senha, user.senhaHash)) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
  }

  // grava só o essencial na sessão (o cookie é assinado, mas ainda assim evitamos
  // colocar dados sensíveis nele — nenhuma senha ou hash entra aqui)
  req.session.userId = user.id;
  req.session.perfil = user.perfil;
  req.session.tecnicoId = user.tecnicoId || null;

  res.json({ usuario: toPublicUser(user) });
});

// ---------- GET /api/auth/me ----------
// usado pelo frontend ao carregar a página, para saber se já existe uma sessão válida
// (equivalente ao "continuar logado" — sem isso, o usuário perderia a sessão a cada F5)
router.get('/me', requireAuth, async (req, res) => {
  const usuarios = await readCollection('usuarios');
  const user = usuarios.find((u) => u.id === req.session.userId);
  if (!user) return res.status(401).json({ erro: 'Sessão inválida.' });
  res.json({ usuario: toPublicUser(user) });
});

// ---------- POST /api/auth/logout ----------
router.post('/logout', async (req, res) => {
  req.session = null; // cookie-session: atribuir null limpa o cookie de sessão
  res.json({ ok: true });
});

// ---------- POST /api/auth/register ----------
// cria uma SOLICITAÇÃO, nunca uma conta pronta — reforça a regra "quem decide o
// perfil é o admin principal", não a própria pessoa se cadastrando
router.post('/register', async (req, res) => {
  const { nome, email, senha } = req.body || {};
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Preencha nome, e-mail e senha.' });
  }
  if (String(senha).length < 6) {
    return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' });
  }

  const emailLower = String(email).toLowerCase();
  const usuarios = await readCollection('usuarios');
  const pendentes = await readCollection('solicitacoes_cadastro');

  const jaExiste =
    usuarios.some((u) => u.email.toLowerCase() === emailLower) ||
    pendentes.some((p) => p.email.toLowerCase() === emailLower && p.status === 'PENDENTE');
  if (jaExiste) {
    return res.status(409).json({ erro: 'Este e-mail já está em uso ou aguardando aprovação.' });
  }

  const solicitacao = {
    id: genId('req'),
    nome,
    email,
    senhaHash: hashPassword(senha), // já sai com hash — a senha em texto puro nunca chega a ficar salva
    status: 'PENDENTE',
    solicitadoEm: new Date().toISOString(),
  };
  pendentes.push(solicitacao);
  await writeCollection('solicitacoes_cadastro', pendentes);

  // avisa o(s) administrador(es): notificação com paraAdmin:true (ver notifications.routes.js)
  const notificacoes = await readCollection('notificacoes');
  notificacoes.push({
    id: genId('notif'),
    tecnicoId: null,
    paraAdmin: true,
    mensagem: `Nova solicitação de cadastro: ${nome} (${email})`,
    criadoEm: new Date().toISOString(),
    lida: false,
  });
  await writeCollection('notificacoes', notificacoes);

  res.status(201).json({ ok: true, mensagem: 'Cadastro enviado! Aguarde a aprovação do administrador.' });
});

// ---------- GET /api/auth/pending (somente ADMIN) ----------
router.get('/pending', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const pendentes = (await readCollection('solicitacoes_cadastro')).filter((p) => p.status === 'PENDENTE');
  // nunca devolve o senhaHash pro frontend, mesmo pro admin
  res.json({ solicitacoes: pendentes.map(({ senhaHash, ...resto }) => resto) });
});

// ---------- POST /api/auth/pending/:id/approve (somente ADMIN) ----------
// body: { perfil: 'TECNICO' | 'ADMIN' | 'VISUALIZADOR' }
// é AQUI, e só aqui, que o perfil da nova conta é decidido — nunca na tela de cadastro
router.post('/pending/:id/approve', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { perfil } = req.body || {};
  if (!['TECNICO', 'ADMIN', 'VISUALIZADOR'].includes(perfil)) {
    return res.status(400).json({ erro: 'Perfil inválido. Use TECNICO, ADMIN ou VISUALIZADOR.' });
  }

  const pendentes = await readCollection('solicitacoes_cadastro');
  const solicitacao = pendentes.find((p) => p.id === req.params.id && p.status === 'PENDENTE');
  if (!solicitacao) return res.status(404).json({ erro: 'Solicitação não encontrada ou já revisada.' });

  let tecnicoId = null;
  if (perfil === 'TECNICO') {
    const tecnicos = await readCollection('tecnicos');
    tecnicoId = genId('t');
    tecnicos.push({ id: tecnicoId, nome: solicitacao.nome });
    await writeCollection('tecnicos', tecnicos);
  }

  const usuarios = await readCollection('usuarios');
  usuarios.push({
    id: genId('u'),
    nome: solicitacao.nome,
    email: solicitacao.email,
    senhaHash: solicitacao.senhaHash,
    perfil,
    tecnicoId,
    principal: false,
  });
  await writeCollection('usuarios', usuarios);

  solicitacao.status = 'APROVADO';
  await writeCollection('solicitacoes_cadastro', pendentes);

  res.json({ ok: true, mensagem: `${solicitacao.nome} aprovado(a) como ${perfil}.` });
});

// ---------- POST /api/auth/pending/:id/reject (somente ADMIN) ----------
router.post('/pending/:id/reject', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const pendentes = await readCollection('solicitacoes_cadastro');
  const solicitacao = pendentes.find((p) => p.id === req.params.id && p.status === 'PENDENTE');
  if (!solicitacao) return res.status(404).json({ erro: 'Solicitação não encontrada ou já revisada.' });

  solicitacao.status = 'RECUSADO';
  await writeCollection('solicitacoes_cadastro', pendentes);
  res.json({ ok: true, mensagem: 'Solicitação recusada.' });
});

module.exports = router;
