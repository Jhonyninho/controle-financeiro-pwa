// Estado compartilhado do app (dados de referência carregados após o login).

import * as api from './servicos/api.js';
import { limitesMes, mesAtual } from './lib/meses.js';

const CHAVE_MES = 'cf.mes';

function lerMesSalvo() {
  try {
    const v = sessionStorage.getItem(CHAVE_MES);
    return /^\d{4}-\d{2}$/.test(v || '') ? v : null;
  } catch {
    return null;
  }
}

export const mesFoiEscolhido = () => Boolean(lerMesSalvo());

const CHAVE_PERIODO = 'cf.periodo';
function lerPeriodo() {
  try {
    const p = JSON.parse(sessionStorage.getItem(CHAVE_PERIODO) || 'null');
    const ok = p && /^\d{4}-\d{2}-\d{2}$/.test(p.de) && /^\d{4}-\d{2}-\d{2}$/.test(p.ate);
    return ok ? { livre: Boolean(p.livre), de: p.de, ate: p.ate } : null;
  } catch {
    return null;
  }
}
function salvarPeriodo() {
  try {
    sessionStorage.setItem(CHAVE_PERIODO, JSON.stringify(estado.periodo));
  } catch {
    /* sem storage */
  }
}

export const estado = {
  usuario: null, // auth user
  perfil: null,
  contas: [],
  categorias: [],
  mes: lerMesSalvo() || mesAtual(),
  // período personalizado (De/Até) compartilhado por Resumo e Lançamentos
  periodo: lerPeriodo() || { livre: false, de: '', ate: '' },
};

const ouvintes = new Set();
export function aoMudar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
function avisar() {
  ouvintes.forEach((fn) => fn(estado));
}

/** Intervalo em vigor: o período personalizado, ou o mês selecionado. */
export function intervaloAtual() {
  const p = estado.periodo;
  return p.livre && p.de && p.ate ? { inicio: p.de, fim: p.ate, livre: true } : { ...limitesMes(estado.mes), livre: false };
}

export function definirPeriodoLivre(de, ate) {
  const [inicio, fim] = de <= ate ? [de, ate] : [ate, de];
  estado.periodo = { livre: true, de: inicio, ate: fim };
  salvarPeriodo();
  avisar();
}

export function usarMesSelecionado() {
  estado.periodo = { ...estado.periodo, livre: false };
  salvarPeriodo();
  avisar();
}

export function definirMes(mes) {
  estado.mes = mes;
  if (estado.periodo.livre) {
    estado.periodo = { ...estado.periodo, livre: false };
    salvarPeriodo();
  }
  try {
    sessionStorage.setItem(CHAVE_MES, mes);
  } catch {
    /* armazenamento indisponível: segue só em memória */
  }
  avisar();
}

export async function carregarReferencias() {
  const [perfil, contas, categorias] = await Promise.all([api.buscarPerfil(), api.listarContas(), api.listarCategorias()]);
  Object.assign(estado, { perfil, contas, categorias });
}

export async function recarregarContas() {
  estado.contas = await api.listarContas();
}

export async function recarregarCategorias() {
  estado.categorias = await api.listarCategorias();
}

// ---- consultas rápidas ----
export const contaPorId = (id) => estado.contas.find((c) => c.id === id);
export const categoriaPorId = (id) => estado.categorias.find((c) => c.id === id);

export function nomeCategoria(id) {
  const c = categoriaPorId(id);
  if (!c) return '';
  return c.subcategoria ? `${c.nome} › ${c.subcategoria}` : c.nome;
}

export const contasAtivas = () => estado.contas.filter((c) => c.ativo && !c.encerrada_em);

/** Contas salário vinculadas a uma conta (o salário cai nelas e depois é transferido para a conta). */
export const contasSalarioDe = (contaId) =>
  estado.contas.filter((c) => c.ativo && c.tipo === 'SALARIO' && c.conta_vinculada_id === contaId);

/** Formas de pagamento disponíveis numa conta, conforme os meios habilitados nela. */
export function meiosDaConta(conta) {
  if (!conta) return ['Outro'];
  if (conta.tipo === 'CARTEIRA') return ['Dinheiro', 'Pix', 'Outro'];
  const meios = [];
  if (conta.tem_debito) meios.push('Débito');
  if (conta.tem_credito) meios.push('Crédito');
  if (conta.tem_pix) meios.push('Pix');
  if (conta.tem_ted) meios.push('TED');
  meios.push('Boleto', 'Outro');
  return meios;
}

/** Ids das categorias que não contam como receita/despesa (transferências, fatura, investimentos). */
export const categoriasForaDosGastos = () => new Set(estado.categorias.filter((c) => c.fora_dos_gastos).map((c) => c.id));
export const categoriasDoTipo = (tipo) => estado.categorias.filter((c) => c.tipo === tipo && c.ativo);

export function limparEstado() {
  Object.assign(estado, { usuario: null, perfil: null, contas: [], categorias: [] });
  aplicarTema('aurora');
}

// ---- tema do app (paleta de destaque) ----
export const TEMAS = [
  { id: 'aurora', nome: 'Aurora', descricao: 'Ciano e violeta, o visual original' },
  { id: 'esmeralda', nome: 'Esmeralda', descricao: 'Verde-água e menta, mais calmo' },
  { id: 'solar', nome: 'Solar', descricao: 'Âmbar e laranja, quente' },
  { id: 'magenta', nome: 'Magenta', descricao: 'Rosa e violeta, vibrante' },
  { id: 'gelo', nome: 'Gelo', descricao: 'Azul-claro e branco, discreto' },
];

export function aplicarTema(tema) {
  const id = TEMAS.some((t) => t.id === tema) ? tema : 'aurora';
  if (id === 'aurora') delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = id;
}
