// Drill-down de uma categoria: subcategorias (com percentual) e os lançamentos do período.

import { html } from '../lib/html.js';
import { formatarData, formatarMoeda } from '../lib/formatos.js';
import { porCategoria } from '../lib/calculos.js';
import { ehFixa } from '../lib/analise.js';
import { categoriaPorId, contaPorId } from '../estado.js';
import { abrirModal, chipCategoria } from './componentes.js';

const LIMITE_LINHAS = 300;

/**
 * @param {object} p
 * @param {string|null} p.nome nome da categoria-mãe (null = sem categoria)
 * @param {'SAIDA'|'ENTRADA'} p.tipo
 * @param {object[]} p.lancamentos lançamentos do período (qualquer categoria; o filtro é feito aqui)
 * @param {string} p.periodo texto do período, ex.: "outubro de 2026"
 */
export function abrirDetalheCategoria({ nome, tipo, lancamentos, periodo }) {
  const doGrupo = lancamentos.filter(
    (l) => l.tipo === tipo && (nome === null ? !l.categoria_id : categoriaPorId(l.categoria_id)?.nome === nome),
  );
  const subs = porCategoria(doGrupo, tipo);
  const total = subs.reduce((s, c) => s + c.valor, 0);
  const cat = doGrupo[0] ? categoriaPorId(doGrupo[0].categoria_id) : null;
  const fixas = doGrupo.filter((l) => ehFixa(l, categoriaPorId)).reduce((s, l) => s + Number(l.valor), 0);
  const ordenados = [...doGrupo].sort((a, b) => (a.data < b.data ? 1 : -1));

  abrirModal({
    titulo: nome || 'A classificar',
    textoOk: 'Fechar',
    corpo: html`<div class="detalhe-cat">
      <header class="detalhe-topo">
        ${chipCategoria(cat, { completo: false })}
        <div>
          <strong>${formatarMoeda(total)}</strong>
          <small>${periodo}, ${doGrupo.length} lançamento(s)${tipo === 'SAIDA' && fixas ? `, ${formatarMoeda(fixas)} em despesas fixas` : ''}</small>
        </div>
      </header>
      ${subs.length > 1 || (subs[0] && categoriaPorId(subs[0].categoria_id)?.subcategoria)
        ? html`<h3 class="detalhe-sub">Subcategorias</h3>
            <ul class="barras">${subs.map((s) => {
              const c = categoriaPorId(s.categoria_id);
              return html`<li>
                <div class="barra-rotulo"><span>${c?.subcategoria || c?.nome || 'Sem categoria'}${c?.fixa ? html` <span class="selo">fixa</span>` : ''}</span>
                  <span class="barra-valor"><strong>${formatarMoeda(s.valor)}</strong><small>${s.percentual.toFixed(0)}%</small></span>
                </div>
                <progress class="cor-${c?.cor || 'cinza'}" max="100" value="${s.percentual.toFixed(1)}">${s.percentual.toFixed(0)}%</progress>
              </li>`;
            })}</ul>`
        : ''}
      <h3 class="detalhe-sub">Lançamentos</h3>
      <ul class="linhas linhas-detalhe">${ordenados.slice(0, LIMITE_LINHAS).map(
        (l) => html`<li>
          <span class="linha-data">${formatarData(l.data).slice(0, 5)}</span>
          <span class="linha-desc">${l.descricao}
            <small>${[categoriaPorId(l.categoria_id)?.subcategoria, contaPorId(l.conta_id)?.nome, l.forma_pagamento].filter(Boolean).join(', ')}</small>
          </span>
          <strong class="${l.tipo === 'ENTRADA' ? 'positivo' : 'negativo'}">${formatarMoeda(l.valor)}</strong>
        </li>`,
      )}</ul>
      ${ordenados.length > LIMITE_LINHAS ? html`<p class="dica">Mostrando os ${LIMITE_LINHAS} mais recentes de ${ordenados.length}.</p>` : ''}
    </div>`,
    aoMontar(form) {
      // só leitura: o botão Cancelar sobra
      form.querySelector('.modal-rodape .btn-secundario')?.remove();
    },
    aoEnviar: () => true,
  });
}
