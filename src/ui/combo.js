// Seletor de categoria com busca em tempo real (combobox).
// Substitui o <select> longo: o usuário digita parte do nome ("merc", "uber")
// e escolhe com o mouse ou com ↑ ↓ Enter. O valor fica num <input hidden>,
// que dispara 'change' (com bubbles) ao escolher — então formulários e
// delegação de eventos continuam funcionando como com um <select>.

import { html, renderizar } from '../lib/html.js';
import { normalizarTexto } from '../lib/formatos.js';
import { categoriaPorId, categoriasDoTipo } from '../estado.js';
import { $, $$, chipCategoria } from './componentes.js';

/** Marcação do campo. `atributos` extras vão no input hidden (ex.: data-idx). */
export function campoCategoria({ nome = 'categoria_id', tipo, valor = '', rotuloVazio = 'Sem categoria', dados = {} }) {
  const cat = valor ? categoriaPorId(valor) : null;
  const extras = Object.entries(dados).map(([k, v]) => html` data-${k}="${v}"`);
  return html`<div class="combo" data-tipo="${tipo}" data-vazio="${rotuloVazio}">
    <input type="hidden" name="${nome}" value="${valor || ''}"${extras} />
    <button type="button" class="combo-botao ${cat ? '' : 'pendente'}" aria-haspopup="listbox" aria-expanded="false">
      ${cat ? chipCategoria(cat) : html`<span class="combo-vazio">${rotuloVazio}</span>`}
      <span class="combo-seta" aria-hidden="true">▾</span>
    </button>
  </div>`;
}

let aberto = null; // { combo, painel, opcoes, ativo }

function fechar(devolverFoco = true) {
  if (!aberto) return;
  const { combo, painel } = aberto;
  painel.remove();
  const botao = $('.combo-botao', combo);
  botao.setAttribute('aria-expanded', 'false');
  if (devolverFoco) botao.focus();
  aberto = null;
}

function posicionar() {
  if (!aberto) return;
  const r = $('.combo-botao', aberto.combo).getBoundingClientRect();
  const p = aberto.painel;
  const largura = Math.max(r.width, 300);
  const espacoAbaixo = window.innerHeight - r.bottom;
  const alto = Math.min(380, Math.max(espacoAbaixo, r.top) - 16);
  p.style.width = `${Math.min(largura, window.innerWidth - 16)}px`;
  p.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - largura - 8))}px`;
  p.style.maxHeight = `${alto}px`;
  if (espacoAbaixo >= 220 || espacoAbaixo >= r.top) {
    p.style.top = `${r.bottom + 6}px`;
    p.style.bottom = '';
  } else {
    p.style.bottom = `${window.innerHeight - r.top + 6}px`;
    p.style.top = '';
  }
}

function desenharOpcoes(filtro) {
  const { combo, painel } = aberto;
  const termo = normalizarTexto(filtro);
  const atual = $('input[type=hidden]', combo).value;
  const lista = categoriasDoTipo(combo.dataset.tipo).filter(
    (c) => !termo || normalizarTexto(`${c.nome} ${c.subcategoria}`).includes(termo),
  );
  aberto.opcoes = [{ id: '', rotulo: combo.dataset.vazio }, ...lista.map((c) => ({ id: c.id, cat: c }))];
  if (termo && lista.length) aberto.opcoes.shift(); // ao buscar, "sem categoria" sai do caminho
  aberto.ativo = Math.max(0, aberto.opcoes.findIndex((o) => o.id === atual));

  renderizar(
    $('.combo-lista', painel),
    aberto.opcoes.length
      ? html`${aberto.opcoes.map(
          (o, i) => html`<li role="option" id="combo-op-${i}" data-i="${i}" aria-selected="${o.id === atual}" class="${i === aberto.ativo ? 'ativa' : ''}">
            ${o.cat ? chipCategoria(o.cat) : html`<span class="combo-vazio">${o.rotulo}</span>`}
          </li>`,
        )}`
      : html`<li class="combo-nada">Nenhuma categoria com "${filtro}"</li>`,
  );
  marcarAtivo();
}

function marcarAtivo() {
  const { painel, ativo } = aberto;
  $$('[role=option]', painel).forEach((li) => li.classList.toggle('ativa', Number(li.dataset.i) === ativo));
  const li = $(`#combo-op-${ativo}`, painel);
  $('.combo-busca', painel).setAttribute('aria-activedescendant', li ? li.id : '');
  li?.scrollIntoView({ block: 'nearest' });
}

function escolher(i) {
  const op = aberto?.opcoes[i];
  if (!op) return;
  const { combo } = aberto;
  const input = $('input[type=hidden]', combo);
  input.value = op.id;
  renderizar(
    $('.combo-botao', combo),
    html`${op.cat ? chipCategoria(op.cat) : html`<span class="combo-vazio">${combo.dataset.vazio}</span>`}<span class="combo-seta" aria-hidden="true">▾</span>`,
  );
  $('.combo-botao', combo).classList.toggle('pendente', !op.id);
  fechar();
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function abrir(combo) {
  fechar(false);
  const painel = document.createElement('div');
  painel.className = 'combo-painel';
  renderizar(
    painel,
    html`<input class="combo-busca" type="search" placeholder="Buscar categoria…" autocomplete="off"
        role="combobox" aria-expanded="true" aria-controls="combo-lista" aria-autocomplete="list" />
      <ul class="combo-lista" id="combo-lista" role="listbox"></ul>`,
  );
  // dentro de um <dialog> o painel precisa ficar no mesmo "top layer"
  (combo.closest('dialog') || document.body).append(painel);
  aberto = { combo, painel, opcoes: [], ativo: 0 };
  $('.combo-botao', combo).setAttribute('aria-expanded', 'true');

  const busca = $('.combo-busca', painel);
  busca.addEventListener('input', () => desenharOpcoes(busca.value));
  busca.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = aberto.opcoes.length;
      aberto.ativo = (aberto.ativo + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      marcarAtivo();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      escolher(aberto.ativo);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // não fecha o modal junto
      fechar();
    } else if (e.key === 'Tab') {
      fechar(false);
    }
  });
  painel.addEventListener('mousedown', (e) => e.preventDefault()); // mantém o foco na busca
  painel.addEventListener('click', (e) => {
    const li = e.target.closest('[role=option]');
    if (li) escolher(Number(li.dataset.i));
  });

  desenharOpcoes('');
  posicionar();
  busca.focus();
}

// Delegação global: funciona para qualquer combo criado em qualquer tela/modal.
document.addEventListener('click', (e) => {
  const botao = e.target.closest('.combo-botao');
  if (botao) {
    const combo = botao.closest('.combo');
    if (aberto?.combo === combo) fechar();
    else abrir(combo);
    return;
  }
  if (aberto && !e.target.closest('.combo-painel')) fechar(false);
});
window.addEventListener('resize', () => fechar(false));
document.addEventListener('scroll', (e) => {
  if (aberto && !e.target.closest?.('.combo-painel')) posicionar();
}, true);

/** Atualiza o tipo (ENTRADA/SAIDA) de um combo, limpando a escolha. */
export function trocarTipoCombo(container, tipo, opcoes = {}) {
  renderizar(container, campoCategoria({ ...opcoes, tipo, valor: '' }));
}
