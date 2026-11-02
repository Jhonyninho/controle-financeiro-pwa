// Pacote padrão de ícones vetoriais (sprite SVG servido como arquivo do próprio site,
// compatível com a CSP). Categorias guardam o ícone como "svg:cat-mercado" ou um emoji.

import { html } from '../../lib/html.js';
import sprite from './icones.svg?url';

export const ICONES_CATEGORIA = [
  ['cat-mercado', 'Mercado'], ['cat-restaurante', 'Restaurante'], ['cat-moradia', 'Moradia'], ['cat-energia', 'Energia'],
  ['cat-agua', 'Água'], ['cat-internet', 'Internet'], ['cat-transporte', 'Transporte'], ['cat-combustivel', 'Combustível'],
  ['cat-saude', 'Saúde'], ['cat-educacao', 'Educação'], ['cat-assinatura', 'Assinatura'], ['cat-compras', 'Compras'],
  ['cat-lazer', 'Lazer'], ['cat-viagem', 'Viagem'], ['cat-pet', 'Pet'], ['cat-familia', 'Família'], ['cat-imposto', 'Impostos'],
  ['cat-divida', 'Dívidas'], ['cat-investimento', 'Investimento'], ['cat-transferencia', 'Transferência'],
  ['cat-salario', 'Salário'], ['cat-presente', 'Presente'], ['cat-beleza', 'Beleza'], ['cat-doacao', 'Doação'], ['cat-outros', 'Outros'],
];

export const ICONE_TIPO_CONTA = {
  CORRENTE: 'conta-corrente', DIGITAL: 'conta-digital', POUPANCA: 'conta-poupanca',
  CARTEIRA: 'conta-carteira', INVESTIMENTO: 'conta-investimento', CARTAO: 'conta-cartao',
};

const VALIDO = /^[a-z]+-[a-z]+$/;

/** <svg> com um ícone do pacote. */
export function icone(id, classe = 'ico') {
  if (!VALIDO.test(id)) return '';
  return html`<svg class="${classe}" aria-hidden="true"><use href="${sprite}#${id}" /></svg>`;
}

/** Ícone de categoria: "svg:cat-x" vira vetor, qualquer outro texto é emoji. */
export function iconeCategoria(valor) {
  const v = String(valor || '');
  if (v.startsWith('svg:')) return icone(v.slice(4), 'ico ico-cat');
  return v || '🏷️';
}
