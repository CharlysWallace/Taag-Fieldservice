/**
 * ============================================================
 *  SEED — DADOS INICIAIS (src/seed.js)
 * ------------------------------------------------------------
 *  O QUE ISSO FAZ:
 *  Popula data/*.json na primeira execução, com os MESMOS
 *  técnicos, usuários e ordens de serviço que já existiam no
 *  app.js do frontend — só que agora as senhas ficam com hash
 *  (ver src/auth/hash.js) em vez de texto puro.
 *
 *  UTILIDADE NO APP COMO UM TODO:
 *  Isso existe para que, no dia em que o frontend passar a
 *  conversar com este backend (troca de window.storage por
 *  fetch('/api/...')), NENHUMA credencial precise mudar — quem
 *  já testava com charlys.wallace@taagbrasil.com.br continua
 *  entrando com o mesmo e-mail e a mesma senha, só que agora de
 *  verdade autenticado pelo servidor.
 *
 *  Roda automaticamente ao iniciar o servidor (server.js chama
 *  ensureSeed()) apenas se data/usuarios.json ainda não existir
 *  — ou seja, não sobrescreve dados que a equipe já tiver criado
 *  usando o app de verdade.
 * ============================================================
 */

const { readCollection, writeCollection, collectionExists } = require('./db');
const { hashPassword } = require('./auth/hash');

async function ensureSeed() {
  if (await collectionExists('usuarios')) {
    const existentes = await readCollection('usuarios');
    if (existentes.length > 0) {
      console.log('[seed] Dados já existem — seed não reexecutado.');
      return;
    }
  }

  console.log('[seed] Primeira execução detectada — populando dados iniciais…');

  // -------- técnicos --------
  const tecnicos = [
    { id: 't1', nome: 'Charlys Wallace' },
    { id: 't2', nome: 'Bruno Gomes' },
    { id: 't3', nome: 'Hebert Vinicios' },
    { id: 't4', nome: 'Felipy Oliveira' },
  ];

  // -------- usuários (mesma senha padrão do protótipo: Taag@2026, agora com hash) --------
  const senhaPadraoHash = hashPassword('Taag@2026');
  const usuarios = [
    { id: 'u1', nome: 'Charlys Wallace', email: 'programacao05@taagbrasil.com.br', senhaHash: senhaPadraoHash, perfil: 'TECNICO', tecnicoId: 't1', principal: false },
    { id: 'u2', nome: 'Bruno Gomes', email: 'programacao01@taagbrasil.com.br', senhaHash: senhaPadraoHash, perfil: 'TECNICO', tecnicoId: 't2', principal: false },
    { id: 'u3', nome: 'Hebert Vinicios', email: 'tecnico01@taagbrasil.com.br', senhaHash: senhaPadraoHash, perfil: 'TECNICO', tecnicoId: 't3', principal: false },
    { id: 'u4', nome: 'Felipy Oliveira', email: 'visualizador@taagbrasil.com.br', senhaHash: senhaPadraoHash, perfil: 'VISUALIZADOR', tecnicoId: 't4', principal: false },
    { id: 'u5', nome: 'Charlys Wallace Vieira de Carvalho', email: 'charlys.wallace@taagbrasil.com.br', senhaHash: senhaPadraoHash, perfil: 'ADMIN', tecnicoId: null, principal: true },
  ];

  // -------- clientes --------
  const clientes = [
    { id: 'c1', nome: 'Mercado Boa Vista', endereco: 'Av. Paulista, 1200 - Bela Vista, São Paulo - SP', telefone: '(11) 4002-8922', email: 'contato@mercadoboavista.com.br' },
    { id: 'c2', nome: 'Condomínio Jardins', endereco: 'Rua Haddock Lobo, 595 - Cerqueira César, São Paulo - SP', telefone: '(11) 3061-4477', email: 'sindico@condominiojardins.com.br' },
    { id: 'c3', nome: 'Escritório Vértice', endereco: 'Rua Oscar Freire, 300 - Jardins, São Paulo - SP', telefone: '(11) 3898-2200', email: 'financeiro@escritoriovertice.com.br' },
  ];

  // -------- ordens de serviço (mesmo cenário de demonstração do frontend) --------
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86400000);
  const ymd = (d) => d.toISOString().slice(0, 10);

  const ordensServico = [
    {
      id: 'os1', clienteId: 'c1', tecnicoId: 't1', tipoServico: 'SUPORTE',
      data: ymd(hoje), hora: '09:00', status: 'PENDENTE',
      descricao: '', fotos: [], assinatura: null, checkin: null, checkout: null,
    },
    {
      id: 'os2', clienteId: 'c2', tecnicoId: 't2', tipoServico: 'MANUTENCAO_WIFI',
      data: ymd(hoje), hora: '11:30', status: 'PENDENTE',
      descricao: '', fotos: [], assinatura: null, checkin: null, checkout: null,
    },
    {
      id: 'os3', clienteId: 'c3', tecnicoId: 't1', tipoServico: 'INSTALACAO_REDE',
      data: ymd(ontem), hora: '14:00', status: 'CONCLUIDO',
      descricao: 'Substituição do roteador principal e reorganização do rack de rede.',
      fotos: [],
      assinatura: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120"><path d="M20 80 Q 50 20 80 70 T 140 60 Q 160 90 190 50 T 250 70" stroke="black" stroke-width="3" fill="none" stroke-linecap="round"/></svg>').toString('base64'),
      checkin: { timestamp: new Date(ontem.getTime() + 50 * 60000).toISOString() },
      checkout: { timestamp: new Date(ontem.getTime() + 134 * 60000).toISOString() },
    },
  ];

  await writeCollection('tecnicos', tecnicos);
  await writeCollection('usuarios', usuarios);
  await writeCollection('clientes', clientes);
  await writeCollection('ordens_servico', ordensServico);
  await writeCollection('solicitacoes_cadastro', []);
  await writeCollection('notificacoes', []);

  console.log('[seed] Concluído:', tecnicos.length, 'técnicos,', usuarios.length, 'usuários,', ordensServico.length, 'OS.');
}

module.exports = { ensureSeed };

// permite rodar `npm run seed` manualmente também
if (require.main === module) {
  const { initDatabase } = require('./db');
  (async () => {
    await initDatabase();
    await ensureSeed();
  })().catch((err) => { console.error('[seed] Falha:', err); process.exit(1); });
}
