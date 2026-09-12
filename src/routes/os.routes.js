/**
 * ============================================================
 *  ROTAS DE ORDENS DE SERVIÇO (src/routes/os.routes.js)
 * ------------------------------------------------------------
 *  O QUE VIVE AQUI:
 *   GET    /api/os              - lista OS (com escopo por perfil)
 *   GET    /api/os/:id          - detalhe de uma OS
 *   POST   /api/os              - cria OS (somente ADMIN)
 *   DELETE /api/os/:id          - exclui OS (somente ADMIN)
 *   POST   /api/os/:id/checkin  - técnico registra chegada
 *   POST   /api/os/:id/checkout - técnico finaliza (descrição + assinatura)
 *   POST   /api/os/:id/fotos    - anexa foto (por categoria)
 *
 *  A REGRA MAIS IMPORTANTE DESTE ARQUIVO:
 *  "Técnico só vê e só mexe na própria agenda" deixa de ser um
 *  filtro visual (que qualquer um burla trocando o JS no
 *  DevTools) e passa a ser uma decisão do SERVIDOR: o GET /api/os
 *  filtra por req.session.tecnicoId ANTES de responder, e as
 *  rotas de check-in/checkout usam requireOwnOsOrElevated para
 *  recusar (403) qualquer tentativa de mexer na OS de outro
 *  técnico — mesmo que a pessoa saiba o ID da OS de cor.
 * ============================================================
 */

const express = require('express');
const { readCollection, writeCollection, genId } = require('../db');
const { requireAuth, requireRole, requireOwnOsOrElevated } = require('../auth/middleware');

const router = express.Router();

// categorias de evidência fotográfica — precisam bater exatamente com os valores
// que o <select id="photoCategory"> do frontend envia (ver app.js)
const CATEGORIAS_FOTO_VALIDAS = ['ANTES', 'DURANTE', 'DEPOIS', 'EQUIPAMENTOS', 'EVIDENCIA'];

async function getOsById(id) {
  return (await readCollection('ordens_servico')).find((o) => o.id === id);
}

/** Junta a OS com os dados do cliente e do técnico — o frontend não precisa fazer join nenhum. */
async function comDadosRelacionados(os) {
  const cliente = os.clienteSnapshot || (await readCollection('clientes')).find((c) => c.id === os.clienteId) || null;
  const tecnico = (await readCollection('tecnicos')).find((t) => t.id === os.tecnicoId) || null;
  return { ...os, cliente, tecnicoNome: tecnico ? tecnico.nome : '—' };
}

// ---------- GET /api/os ----------
// escopo automático por perfil: é a peça central da autorização deste app
router.get('/', requireAuth, async (req, res) => {
  let lista = await readCollection('ordens_servico');

  if (req.session.perfil === 'TECNICO') {
    // um técnico jamais recebe do servidor a OS de outro técnico —
    // não é um "esconder na tela", o dado nem sai do backend
    lista = lista.filter((o) => o.tecnicoId === req.session.tecnicoId);
  }
  // ADMIN e VISUALIZADOR recebem tudo (VISUALIZADOR não tem rotas de escrita habilitadas abaixo)

  res.json({ ordens: await Promise.all(lista.map(comDadosRelacionados)) });
});

// ---------- GET /api/os/:id ----------
router.get('/:id', requireAuth, requireOwnOsOrElevated(getOsById), async (req, res) => {
  const os = await getOsById(req.params.id);
  if (!os) return res.status(404).json({ erro: 'Ordem de serviço não encontrada.' });
  res.json({ os: await comDadosRelacionados(os) });
});

// ---------- POST /api/os (somente ADMIN) ----------
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { clienteId, tecnicoId, tipoServico, tipoServicoPersonalizado, data, hora } = req.body || {};
  if (!tecnicoId || !data || !hora) {
    return res.status(400).json({ erro: 'Preencha técnico, data e horário.' });
  }

  const cliente = (await readCollection('clientes')).find(c => c.id === clienteId);
  if (!cliente) return res.status(400).json({ erro: 'Selecione um cliente cadastrado na aba Clientes.' });
  if (!(await readCollection('tecnicos')).some(t => t.id === tecnicoId)) return res.status(400).json({ erro: 'Técnico inválido.' });
  const tipos = ['INSTALACAO_REDE','MANUTENCAO_WIFI','INSTALACAO_CAMERAS','MANUTENCAO_PREVENTIVA','SUPORTE','INSTALACAO_EQUIPAMENTOS','INFRAESTRUTURA','EMERGENCIAL','PERSONALIZADO'];
  if (!tipos.includes(tipoServico)) return res.status(400).json({ erro: 'Tipo de serviço inválido.' });
  if (tipoServico === 'PERSONALIZADO' && (typeof tipoServicoPersonalizado !== 'string' || !tipoServicoPersonalizado.trim() || tipoServicoPersonalizado.length > 300)) return res.status(400).json({ erro: 'Descreva o tipo de serviço em até 300 caracteres.' });

  const ordens = await readCollection('ordens_servico');
  const novaOs = {
    id: genId('os'),
    clienteId,
    clienteSnapshot: { ...cliente },
    camposServico: { sistemaCliente: cliente.tipoSistema || '' },
    tecnicoId,
    tipoServico,
    tipoServicoPersonalizado: tipoServico === 'PERSONALIZADO' ? tipoServicoPersonalizado.trim() : '',
    data,
    hora,
    status: 'PENDENTE',
    descricao: '',
    fotos: [],
    assinatura: null,
    checkin: null,
    checkout: null,
  };
  ordens.push(novaOs);
  await writeCollection('ordens_servico', ordens);

  // notifica o técnico responsável — mesma regra de negócio que já existia no frontend,
  // agora disparada de um lugar que não pode ser burlado (o próprio backend, na criação real)
  const notificacoes = await readCollection('notificacoes');
  const dataFormatada = new Date(`${data}T00:00`).toLocaleDateString('pt-BR');
  notificacoes.push({
    id: genId('notif'),
    tecnicoId,
    paraAdmin: false,
    mensagem: `Novo atendimento agendado em ${dataFormatada} às ${hora}`,
    criadoEm: new Date().toISOString(),
    lida: false,
  });
  await writeCollection('notificacoes', notificacoes);

  res.status(201).json({ os: await comDadosRelacionados(novaOs) });
});

// ---------- DELETE /api/os/:id (somente ADMIN) ----------
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const ordens = await readCollection('ordens_servico');
  const existe = ordens.some((o) => o.id === req.params.id);
  if (!existe) return res.status(404).json({ erro: 'Ordem de serviço não encontrada.' });

  await writeCollection('ordens_servico', ordens.filter((o) => o.id !== req.params.id));
  res.json({ ok: true });
});

// ---------- POST /api/os/:id/checkin (somente o técnico dono da OS) ----------
router.post('/:id/checkin', requireAuth, requireRole('TECNICO'), requireOwnOsOrElevated(getOsById), async (req, res) => {
  const ordens = await readCollection('ordens_servico');
  const os = ordens.find((o) => o.id === req.params.id);
  if (!os) return res.status(404).json({ erro: 'Ordem de serviço não encontrada.' });
  if (os.status !== 'PENDENTE') {
    return res.status(409).json({ erro: 'Esta OS já teve o check-in registrado.' });
  }

  os.status = 'EM_ANDAMENTO';
  os.checkin = { timestamp: new Date().toISOString() };
  await writeCollection('ordens_servico', ordens);

  res.json({ os: await comDadosRelacionados(os) });
});

// ---------- POST /api/os/:id/checkout (somente o técnico dono da OS) ----------
// body: { descricao, tipoServico, camposServico, assinatura(dataURL) }
router.post('/:id/checkout', requireAuth, requireRole('TECNICO'), requireOwnOsOrElevated(getOsById), async (req, res) => {
  const { descricao, camposServico, assinatura } = req.body || {};
  if (!assinatura) {
    return res.status(400).json({ erro: 'A assinatura do cliente é obrigatória para concluir o atendimento.' });
  }

  const ordens = await readCollection('ordens_servico');
  const os = ordens.find((o) => o.id === req.params.id);
  if (!os) return res.status(404).json({ erro: 'Ordem de serviço não encontrada.' });
  if (os.status !== 'EM_ANDAMENTO') {
    return res.status(409).json({ erro: 'Esta OS precisa estar em andamento (com check-in feito) para ser concluída.' });
  }

  os.status = 'CONCLUIDO';
  os.descricao = descricao || '';
  os.camposServico = camposServico || {};
  os.assinatura = assinatura;
  os.checkout = { timestamp: new Date().toISOString() };
  await writeCollection('ordens_servico', ordens);

  res.json({ os: await comDadosRelacionados(os) });
});

// ---------- POST /api/os/:id/fotos (somente o técnico dono da OS) ----------
// body: { categoria, dataUrl }
// Nota de arquitetura: guardar a foto como dataURL dentro do JSON funciona para o
// protótipo, mas não escala — a evolução natural é subir o arquivo para um object
// storage (S3, Cloudflare R2 etc.) e guardar aqui só a URL resultante.
router.post('/:id/fotos', requireAuth, requireRole('TECNICO'), requireOwnOsOrElevated(getOsById), async (req, res) => {
  const { categoria, dataUrl } = req.body || {};
  if (!CATEGORIAS_FOTO_VALIDAS.includes(categoria) || !dataUrl) {
    return res.status(400).json({ erro: `Informe categoria válida (${CATEGORIAS_FOTO_VALIDAS.join(', ')}) e a imagem (dataUrl).` });
  }
  // limite simples de tamanho (~5MB em base64) — evita que um upload gigante trave o arquivo JSON
  if (dataUrl.length > 7_000_000) {
    return res.status(413).json({ erro: 'Imagem muito grande (máximo ~5MB).' });
  }

  const ordens = await readCollection('ordens_servico');
  const os = ordens.find((o) => o.id === req.params.id);
  if (!os) return res.status(404).json({ erro: 'Ordem de serviço não encontrada.' });

  os.fotos = os.fotos || [];
  os.fotos.push({ id: genId('foto'), categoria, src: dataUrl, criadoEm: new Date().toISOString() });
  await writeCollection('ordens_servico', ordens);

  res.status(201).json({ fotos: os.fotos });
});

module.exports = router;
