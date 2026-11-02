// Preferências visuais deste aparelho: fonte, cor do HUD de entrada e menu recolhido.
// Ficam no localStorage porque a tela de login aparece antes de carregar o perfil.

import { campanhaDoDia } from './campanhas.js';
import { hojeISO } from './meses.js';

const CHAVE = 'cf.aparencia';

export const FONTES = [
  { id: 'sora', nome: 'Sora', descricao: 'Arredondada, a padrão', familia: "'Sora Variable'" },
  { id: 'nunito', nome: 'Nunito', descricao: 'Bem arredondada e amigável', familia: "'Nunito Variable'" },
  { id: 'outfit', nome: 'Outfit', descricao: 'Geométrica e moderna', familia: "'Outfit Variable'" },
  { id: 'manrope', nome: 'Manrope', descricao: 'Limpa, boa para números', familia: "'Manrope Variable'" },
  { id: 'inter', nome: 'Inter', descricao: 'Neutra, de painel', familia: "'Inter Variable'" },
  { id: 'rajdhani', nome: 'Rajdhani', descricao: 'Técnica, estilo HUD', familia: "'Rajdhani'" },
];

// Cada fonte só é baixada quando escolhida (o Vite gera um arquivo por fonte).
const CARREGAR = {
  sora: () => Promise.resolve(),
  nunito: () => import('@fontsource-variable/nunito'),
  outfit: () => import('@fontsource-variable/outfit'),
  manrope: () => import('@fontsource-variable/manrope'),
  inter: () => import('@fontsource-variable/inter'),
  rajdhani: () => import('@fontsource/rajdhani/latin-700.css'), // 500 e 600 já vêm com o HUD
};

export const CORES_HUD = [
  { id: 'auto', nome: 'Automática', descricao: 'Segue a campanha do mês (Outubro Rosa, Novembro Azul…)' },
  { id: 'ciano', nome: 'Ciano', holo: '#38e1ff', gelo: '#bff6ff' },
  { id: 'azul', nome: 'Azul', holo: '#4d8dff', gelo: '#d3e2ff' },
  { id: 'violeta', nome: 'Violeta', holo: '#a68bff', gelo: '#e6ddff' },
  { id: 'rosa', nome: 'Rosa', holo: '#ff5fb4', gelo: '#ffd9ee' },
  { id: 'vermelho', nome: 'Vermelho', holo: '#ff5a5a', gelo: '#ffd6d6' },
  { id: 'laranja', nome: 'Laranja', holo: '#ff9a3c', gelo: '#ffe3c7' },
  { id: 'amarelo', nome: 'Amarelo', holo: '#ffd23f', gelo: '#fff3c4' },
  { id: 'verde', nome: 'Verde', holo: '#3ef0a0', gelo: '#cffbe6' },
  { id: 'branco', nome: 'Branco', holo: '#dfe8ff', gelo: '#ffffff' },
];

// Tons do app gerados a partir da cor do HUD (substituem o tema do perfil neste aparelho).
export const TONS_HUD = [
  { id: 'vibrante', nome: 'HUD vibrante', descricao: 'A cor do HUD com um tom vizinho, fundo levemente tingido' },
  { id: 'mono', nome: 'HUD monocromático', descricao: 'Só a cor do HUD, em claro e escuro' },
  { id: 'suave', nome: 'HUD suave', descricao: 'A cor do HUD mais clara e menos saturada' },
];

const PADRAO = { fonte: 'sora', hud: 'auto', menuRecolhido: false, campanhas: true, tomHud: null };

export function lerAparencia() {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE) || '{}') || {};
    return {
      fonte: FONTES.some((f) => f.id === p.fonte) ? p.fonte : PADRAO.fonte,
      hud: CORES_HUD.some((c) => c.id === p.hud) ? p.hud : PADRAO.hud,
      menuRecolhido: p.menuRecolhido === true,
      campanhas: p.campanhas !== false,
      tomHud: TONS_HUD.some((t) => t.id === p.tomHud) ? p.tomHud : null,
    };
  } catch {
    return { ...PADRAO };
  }
}

export function salvarAparencia(mudancas) {
  const nova = { ...lerAparencia(), ...mudancas };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(nova));
  } catch {
    /* sem storage: vale só nesta sessão */
  }
  aplicarAparencia(nova);
  return nova;
}

/** Cor efetiva do HUD (resolve "automática" pela campanha do dia). */
export function corDoHud(id = lerAparencia().hud, hoje = hojeISO()) {
  if (id !== 'auto') return CORES_HUD.find((c) => c.id === id) || CORES_HUD[1];
  const campanha = campanhaDoDia(hoje);
  return CORES_HUD.find((c) => c.id === campanha?.corHud) || CORES_HUD[1];
}

export function precarregarFontes() {
  for (const f of FONTES) CARREGAR[f.id]().catch(() => {});
}

export async function aplicarFonte(id) {
  const fonte = FONTES.find((f) => f.id === id) || FONTES[0];
  try {
    await CARREGAR[fonte.id]();
  } catch {
    /* sem rede no primeiro uso: fica a fonte do sistema até carregar */
  }
  document.documentElement.style.setProperty('--fonte', `${fonte.familia}, 'Sora Variable', system-ui, sans-serif`);
}

export function aplicarAparencia(a = lerAparencia()) {
  const raiz = document.documentElement;
  aplicarFonte(a.fonte);
  const cor = corDoHud(a.hud);
  raiz.style.setProperty('--holo', cor.holo);
  raiz.style.setProperty('--gelo', cor.gelo);
  raiz.classList.toggle('menu-recolhido', a.menuRecolhido);
  if (a.tomHud) raiz.dataset.temaHud = a.tomHud;
  else delete raiz.dataset.temaHud;
}
