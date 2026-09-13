/**
 * ============================================================
 *  SERVIDOR (server.js) — ponto de entrada do backend
 * ------------------------------------------------------------
 *  O QUE ISSO FAZ, EM ORDEM:
 *   1. Roda o seed (só na primeira vez) — ver src/seed.js
 *   2. Serve o frontend (pasta /public) como arquivos estáticos —
 *      isso é o que faz o app inteiro (tela + API) rodar na MESMA
 *      origem (http://localhost:3000). Antes o frontend rodava
 *      isolado, sem servidor nenhum, falando com window.storage;
 *      agora ele é servido por este mesmo processo, o que evita
 *      todo o problema de CORS/cookie entre domínios diferentes —
 *      não existe requisição "cross-origin" quando tudo vem do
 *      mesmo endereço.
 *   3. Configura a sessão via cookie assinado (cookie-session) —
 *      é isso que substitui o `state.currentUser` que antes só
 *      existia na memória do navegador.
 *   4. Pluga as quatro famílias de rotas (auth, os, técnicos,
 *      notificações) sob o prefixo /api.
 *
 *  COMO ISSO SE ENCAIXA NO APP COMO UM TODO:
 *  Esta é a versão final e integrada: `npm start` sobe o backend
 *  E o frontend juntos. Abrir http://localhost:3000 no navegador
 *  já mostra o app funcionando de ponta a ponta, com dados
 *  persistidos no servidor (não mais isolados por navegador).
 * ============================================================
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const { ensureSeed } = require('./src/seed');
const { initDatabase, usePostgres } = require('./src/db');
const authRoutes = require('./src/routes/auth.routes');
const osRoutes = require('./src/routes/os.routes');
const tecnicosRoutes = require('./src/routes/tecnicos.routes');
const notificationsRoutes = require('./src/routes/notifications.routes');

const app = express();

// Render encerra o HTTPS no proxy e encaminha a requisição para o Node.
// Confiar no primeiro proxy permite que req.secure reconheça corretamente
// o cabeçalho X-Forwarded-Proto=https e que cookies secure sejam enviados.
app.set('trust proxy', 1);

// aceita JSON grande o suficiente para uma foto em base64 + o resto do payload
app.use(express.json({ limit: '8mb' }));

// 2) sessão via cookie assinado — não precisa de tabela de sessões no servidor.
// sameSite:'lax' funciona perfeitamente aqui porque o frontend é servido pelo
// MESMO servidor (não é mais um cenário cross-origin como antes).
const COOKIE_SECRET = process.env.COOKIE_SECRET;
if (!COOKIE_SECRET) {
  console.warn(
    '[server] AVISO: COOKIE_SECRET não definido no .env — usando um valor de desenvolvimento. ' +
      'Defina um valor forte antes de ir para produção (veja .env.example).'
  );
}
app.use(
  cookieSession({
    name: 'fieldservice_session',
    secret: COOKIE_SECRET || 'dev-secret-troque-isso-em-producao',
    maxAge: 400 * 24 * 60 * 60 * 1000, // persistente, renovado durante o uso
    httpOnly: true, // JavaScript do navegador não consegue ler este cookie (mitiga XSS)
    sameSite: 'lax', // mitiga CSRF básico mantendo login em navegação normal
    secure: process.env.NODE_ENV === 'production', // exige HTTPS em produção
  })
);

// Atualizar a sessão em cada requisição autenticada renova o cookie persistente.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (req.session.userId) req.session.renewedAt = Date.now();
  next();
});

// 3) rotas da API
app.use('/api/password', require('./src/routes/password.routes'));
app.use('/api/auth', authRoutes);
app.use('/api/clientes', require('./src/routes/clientes.routes'));
app.use('/api/acessos', require('./src/routes/access.routes'));
app.use('/api/help', require('./src/routes/help.routes'));
app.use('/api/dashboard', require('./src/routes/dashboard.routes'));
app.use('/api/os', osRoutes);
app.use('/api/tecnicos', tecnicosRoutes);
app.use('/api/notificacoes', notificationsRoutes);

// checagem simples de saúde do servidor (útil para monitoramento/deploy)
app.get('/api/health', (req, res) => res.json({ ok: true, hora: new Date().toISOString() }));

// 4) frontend estático — index.html, style.css, app.js, logo, tudo dentro de /public
app.use(express.static(path.join(__dirname, 'public')));

// qualquer rota que não seja /api/* e não bater em um arquivo estático cai no
// index.html — assim o app funciona mesmo se alguém atualizar a página (F5)
// em qualquer momento da navegação (não existem rotas de servidor por tela,
// a navegação entre telas é toda feita em JavaScript dentro do app.js)
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// captura erros que passaram batido pelas rotas, pra nunca devolver um HTML de stack trace
app.use((err, req, res, next) => {
  console.error('[server] Falha:', err.name, err.status || 500);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await initDatabase();
  await ensureSeed();
  app.listen(PORT, () => {
    console.log(`\n  FieldService App rodando em http://localhost:${PORT}`);
    console.log(`  Persistência: ${usePostgres ? 'PostgreSQL' : 'JSON local'}`);
    console.log('  (frontend + backend servidos juntos, na mesma origem)\n');
  });
}

start().catch((err) => {
  console.error('[server] Falha ao iniciar aplicação:', err);
  process.exit(1);
});

