/* Modelo TAAG: conteúdo técnico primeiro; todas as fotos em páginas adicionais. */
function buildTaagReport(jsPDF, o, logo) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const c = o.camposServico || {};
  const margin = 18, width = 174, bottom = 274;
  let y = 0;
  const text = value => String(value || 'Não informado');
  function header() {
    if (logo) doc.addImage(logo, 'PNG', margin, 12, 42, 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(['Contato: Charlys Wallace Vieira de Carvalho', 'Empresa: Taag', 'Telefone: 11 93353-9384', 'Email: Programacao05@taagbrasil.com.br'], 65, 13);
    doc.setDrawColor(30); doc.line(margin, 31, 192, 31);
    doc.setFontSize(11); doc.text('RELATÓRIO DE ATENDIMENTO', margin, 38);
    const identification = doc.splitTextToSize('O.S.: ' + text(o.cliente.nome), width);
    doc.text(identification, margin, 44);
    y = 49 + identification.length * 5;
  }
  function nextPage() { doc.addPage(); header(); }
  function lines(value, bold = false) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(10);
    for (const line of doc.splitTextToSize(text(value), width)) {
      if (y > bottom) nextPage();
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(10);
      doc.text(line, margin, y); y += 4.6;
    }
  }
  function section(label, value, minHeight = 0) {
    if (y + 14 > bottom) nextPage();
    lines(label, true); const start = y, page = doc.getNumberOfPages(); lines(value); if (page === doc.getNumberOfPages()) y = Math.max(y, start + minHeight); y += 3;
  }
  header();
  lines('TIPO DE CHAMADO: ' + text(c.tipoChamado));
  lines('Cliente: ' + text(o.cliente.nome));
  lines('Endereço: ' + text(o.cliente.endereco));
  lines('Equipe atribuída: ' + text(o.tecnicoNome));
  lines('Responsável pelo atendimento: ' + text(o.responsavelNome || o.tecnicoNome));
  if (o.tipoServicoPersonalizado) lines('Tipo de serviço: ' + o.tipoServicoPersonalizado); y += 3;
  section('TIPO DE SISTEMA DO CLIENTE', c.sistemaCliente);
  section('MOTIVO DO ATENDIMENTO', c.motivo);
  section('SERVIÇOS REALIZADOS', o.descricao, 15);
  section('RESTARAM PENDÊNCIAS NECESSITANDO NOVO AGENDAMENTO', text(c.pendencias) + (c.pendenciasDescricao ? '\nDescrição: ' + c.pendenciasDescricao : ''));
  section('SISTEMA DE CÂMERAS', text(c.cameras) + '\nConfiguração de gravação: ' + text(c.gravacao) + (c.gravacaoDescricao ? '\nObservações: ' + c.gravacaoDescricao : ''));
  section('NECESSÁRIA LIMPEZA DO RACK E EQUIPAMENTOS', text(c.limpeza) + (c.limpezaDescricao ? '\nObservações: ' + c.limpezaDescricao : ''));
  section('RETIRADA DE EQUIPAMENTO PARA ASSISTÊNCIA TÉCNICA', text(c.retirada) + (c.retiradaDescricao ? '\nEquipamento / Marca / Modelo / Número de série:\n' + c.retiradaDescricao : ''));
  section('TROCA OU INSTALAÇÃO DE EQUIPAMENTOS', text(c.instalacao) + (c.instalacaoDescricao ? '\nEquipamento / Marca / Modelo / Número de série:\n' + c.instalacaoDescricao : ''));
  section('RESPONSÁVEL QUE ACOMPANHOU O ATENDIMENTO', c.responsavel);
  const dateTime = value => value ? new Date(value).toLocaleString('pt-BR') : 'Não informado';
  lines('HORÁRIO DE CHEGADA: ' + dateTime(o.checkin?.timestamp));
  lines('HORÁRIO DE SAÍDA: ' + dateTime(o.checkout?.timestamp));
  if (o.assinatura) {
    if (y + 28 > bottom) nextPage();
    lines('Assinatura do cliente:', true);
    try { doc.addImage(o.assinatura, 'PNG', margin, y, 65, 22); }
    catch { throw new Error('assinatura inválida'); }
  }
  const categories = { ANTES: 'Antes do serviço', DURANTE: 'Durante o serviço', DEPOIS: 'Após a conclusão', EQUIPAMENTOS: 'Equipamentos utilizados' };
  (o.fotos || []).forEach((photo, index) => {
    nextPage();
    section('EVIDÊNCIAS FOTOGRÁFICAS', `Foto ${index + 1} de ${o.fotos.length} - ${categories[photo.categoria] || 'Registro do atendimento'}`);
    if(photo.descricao) section('DESCRIÇÃO DA FOTO', photo.descricao);
    if(bottom-y<40) nextPage();
    try {
      const properties = doc.getImageProperties(photo.src);
      const scale = Math.min(width / properties.width, (bottom - y - 5) / properties.height);
      const w = properties.width * scale, h = properties.height * scale;
      doc.addImage(photo.src, properties.fileType, margin + (width - w) / 2, y, w, h);
    } catch { throw new Error(`não foi possível incluir a foto ${index + 1}`); }
  });
  const count = doc.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(`TAAG - Página ${i} de ${count}`, 192, 287, { align: 'right' });
  }
  return doc;
}
if (typeof module !== 'undefined') module.exports = { buildTaagReport };
