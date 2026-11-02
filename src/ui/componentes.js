// Componentes de interface reutilizáveis: toast, modais, selects, etc.

import { html, renderizar } from '../lib/html.js';
import { categoriasDoTipo, contasAtivas } from '../estado.js';
import { FORMAS_PAGAMENTO } from '../importacao/modelo.js';
import { iconeCategoria } from '../assets/icons/index.js';

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// ---------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------
export function avisar(mensagem, tipo = 'sucesso') {
  const area = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  el.textContent = mensagem;
  area.append(el);
  setTimeout(() => el.classList.add('saindo'), 3500);
  setTimeout(() => el.remove(), 4000);
}

export function avisarErro(e) {
  avisar(e?.message || 'Algo deu errado.', 'erro');
}

/** Executa uma ação assíncrona travando o botão e mostrando erro amigável. */
export async function comCarregando(botao, fn) {
  if (botao) {
    botao.disabled = true;
    botao.classList.add('carregando');
  }
  try {
    return await fn();
  } catch (e) {
    avisarErro(e);
    return undefined;
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.classList.remove('carregando');
    }
  }
}

// ---------------------------------------------------------------------
// Modais (elemento <dialog> nativo)
// ---------------------------------------------------------------------
/**
 * Abre um modal com formulário. `aoEnviar(dadosDoForm, form)` deve devolver
 * true/undefined para fechar, ou false para manter aberto.
 */
export function abrirModal({ titulo, corpo, textoOk = 'Salvar', aoEnviar, aoMontar, perigo = false }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal';
  renderizar(
    dlg,
    html`<form method="dialog" class="modal-form" novalidate>
      <header class="modal-topo">
        <h2 tabindex="-1" autofocus>${titulo}</h2>
        <button type="button" class="btn-icone" data-fechar aria-label="Fechar">✕</button>
      </header>
      <div class="modal-corpo">${corpo}</div>
      <footer class="modal-rodape">
        <button type="button" class="btn btn-secundario" data-fechar>Cancelar</button>
        <button type="submit" class="btn ${perigo ? 'btn-perigo' : 'btn-primario'}">${textoOk}</button>
      </footer>
    </form>`,
  );
  document.body.append(dlg);

  const form = $('form', dlg);
  const fechar = () => {
    dlg.close();
    dlg.remove();
  };
  $$('[data-fechar]', dlg).forEach((b) => b.addEventListener('click', fechar));
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    fechar();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const botao = $('button[type=submit]', form);
    // erro -> comCarregando devolve undefined e o modal continua aberto
    const r = await comCarregando(botao, async () => {
      const resultado = await aoEnviar?.(Object.fromEntries(new FormData(form)), form);
      return resultado === false ? 'manter' : 'fechar';
    });
    if (r === 'fechar') fechar();
  });

  aoMontar?.(form, dlg);
  dlg.showModal();
  return { dlg, form, fechar };
}

export function confirmar(mensagem, { titulo = 'Confirmar', textoOk = 'Confirmar', perigo = true } = {}) {
  return new Promise((resolve) => {
    let respondeu = false;
    const { dlg } = abrirModal({
      titulo,
      corpo: html`<p>${mensagem}</p>`,
      textoOk,
      perigo,
      aoEnviar: () => {
        respondeu = true;
        resolve(true);
        return true;
      },
    });
    dlg.addEventListener('close', () => respondeu || resolve(false));
  });
}

// ---------------------------------------------------------------------
// Opções de <select>
// ---------------------------------------------------------------------
export function opcoesContas(selecionada, { incluirVazia = false, rotuloVazio = 'Todas as contas' } = {}) {
  return html`${incluirVazia ? html`<option value="">${rotuloVazio}</option>` : ''}
    ${contasAtivas().map((c) => html`<option value="${c.id}" ${c.id === selecionada ? 'selected' : ''}>${c.nome}</option>`)}`;
}

export function opcoesCategorias(tipo, selecionada, { rotuloVazio = 'Sem categoria' } = {}) {
  const grupos = new Map();
  for (const c of categoriasDoTipo(tipo)) {
    if (!grupos.has(c.nome)) grupos.set(c.nome, []);
    grupos.get(c.nome).push(c);
  }
  return html`<option value="">${rotuloVazio}</option>
    ${[...grupos].map(
      ([nome, itens]) => html`<optgroup label="${String(itens[0].icone || '').startsWith('svg:') ? '' : itens[0].icone || ''} ${nome}">
        ${itens.map((c) => html`<option value="${c.id}" ${c.id === selecionada ? 'selected' : ''}>${c.subcategoria || c.nome}</option>`)}
      </optgroup>`,
    )}`;
}

/** @param {string[]} [meios] formas aceitas pela conta (padrão: todas) */
export function opcoesFormaPagamento(selecionada, meios = FORMAS_PAGAMENTO) {
  const lista = selecionada && !meios.includes(selecionada) ? [...meios, selecionada] : meios;
  return html`${lista.map((f) => html`<option ${f === selecionada ? 'selected' : ''}>${f}</option>`)}`;
}

/** Ícone colorido da categoria + nome (ou "A classificar"). */
export function chipCategoria(cat, { completo = true } = {}) {
  if (!cat) return html`<span class="chip chip-pendente"><span class="chip-icone">?</span><span>A classificar</span></span>`;
  return html`<span class="chip">
    <span class="chip-icone cor-${cat.cor || 'cinza'}">${iconeCategoria(cat.icone)}</span>
    <span>${completo && cat.subcategoria ? html`${cat.nome} <small>${cat.subcategoria}</small>` : cat.nome}</span>
  </span>`;
}

export function estadoVazio(texto, acao = '') {
  return html`<div class="vazio"><p>${texto}</p>${acao}</div>`;
}

/** Baixa um arquivo gerado no navegador. */
export function baixarArquivo(bytes, nome, tipo) {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
