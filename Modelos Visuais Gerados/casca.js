// Ícones + trilho lateral compartilhados pelos modelos. Protótipo estático.
const P = {
  inicio: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  calendario: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 14h3M13.5 14h3M7.5 17.5h3"/>',
  importar: '<path d="M12 3v12M7 10l5 5 5-5M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>',
  grafico: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  alvo: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  ia: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  carteira: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19v4"/><rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M16 13.5h2"/>',
  etiqueta: '<path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z"/><circle cx="8" cy="8" r="1.4"/>',
  engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.5"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  sair: '<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15M10 8l-4 4 4 4M6 12h10"/>',
  busca: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  seta: '<path d="M9 6l6 6-6 6"/>',
  sino: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
  cartao: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 9.5h19M6 15h4"/>',
  banco: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/>',
  subir: '<path d="M7 17L17 7M9 7h8v8"/>',
  descer: '<path d="M17 7L7 17M15 17H7V9"/>',
  relogio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  mercado: '<path d="M3 4h2l2.2 11h11L21 7H6.2"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  casa: '<path d="M3 11l9-7 9 7M5.5 9.5V20h13V9.5M10 20v-5h4v5"/>',
  carro: '<path d="M4 16v-4l2-5h12l2 5v4M3 16h18v3H3zM6.5 19v1.5M17.5 19v1.5"/><circle cx="7.5" cy="13.5" r=".8"/><circle cx="16.5" cy="13.5" r=".8"/>',
  garfo: '<path d="M6 3v7a2 2 0 0 0 2 2v9M10 3v7a2 2 0 0 1-2 2M8 3v6M16 21V3c2.5 1.5 3 5 3 8h-3"/>',
  coracao: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10C19.5 15.4 12 20 12 20z"/>',
  play: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z"/>',
  filtro: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};

const icone = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24">${P[n] || ''}</svg>`;

const ITENS = [
  ['inicio', 'Início', 'c-laranja', 'modelo-A-inicio-modulos.html'],
  ['lista', 'Lançamentos', 'c-azul', 'tela-lancamentos.html'],
  ['calendario', 'Lançamentos futuros', 'c-ambar', '#'],
  ['importar', 'Importar extrato', 'c-ciano', '#'],
  'sep',
  ['grafico', 'Relatórios', 'c-violeta', '#'],
  ['alvo', 'Análise e metas', 'c-verde', '#'],
  ['ia', 'Diagnóstico com IA', 'c-rosa', '#'],
  'sep',
  ['carteira', 'Contas', 'c-azul', '#'],
  ['etiqueta', 'Categorias e regras', 'c-violeta', '#'],
  ['engrenagem', 'Configurações', '', 'tela-configuracoes.html'],
];

function montarCasca() {
  const ativo = document.body.dataset.ativo || 'inicio';
  const trilho = document.querySelector('.trilho');
  if (trilho) {
    trilho.innerHTML = `<div class="logo">CF</div>${ITENS.map((it) =>
      it === 'sep'
        ? '<span class="sep so-desktop"></span>'
        : `<a href="${it[3]}" data-dica="${it[1]}" class="${ativo === it[0] ? 'ativo' : ''} ${['carteira', 'etiqueta', 'ia', 'importar'].includes(it[0]) ? 'so-desktop' : ''}">${icone(it[0], ativo === it[0] ? '' : it[2])}</a>`,
    ).join('')}
      <div class="fim"><a href="#" data-dica="Tema">${icone('sol', 'c-ambar')}</a><span class="avatar">JW</span><a href="#" data-dica="Sair">${icone('sair', 'c-rosa')}</a></div>`;
  }
  document.querySelectorAll('[data-i]').forEach((e) => { e.insertAdjacentHTML('afterbegin', icone(e.dataset.i)); });
  const rel = document.querySelector('[data-relogio]');
  if (rel) {
    const tic = () => { rel.textContent = new Date().toLocaleTimeString('pt-BR'); };
    tic(); setInterval(tic, 1000);
  }
  const h = new Date().getHours();
  document.querySelectorAll('[data-saudacao]').forEach((e) => { e.textContent = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; });
}
montarCasca();
