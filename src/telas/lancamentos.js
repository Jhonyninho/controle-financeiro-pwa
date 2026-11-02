// Lançamentos realizados do mês: filtros, edição, exclusão.

import * as api from '../servicos/api.js';
import { html, renderizar } from '../lib/html.js';
import { formatarData, formatarMoeda, normalizarTexto } from '../lib/formatos.js';
import { limitesMes } from '../lib/meses.js';
import { intervaloAtual, estado, categoriaPorId, categoriasForaDosGastos, contaPorId, nomeCategoria } from '../estado.js';
import { $, avisar, chipCategoria, confirmar, estadoVazio, opcoesContas } from '../ui/componentes.js';
import { abrirFormLancamento } from './formLancamento.js';
import { barraPeriodo, ligarBarraPeriodo } from '../ui/periodo.js';

const filtros = { conta: '', tipo: '', categoria: '', busca: '' };
let lista = [];

function aplicarFiltros() {
  const busca = normalizarTexto(filtros.busca);
  return lista.filter(
    (l) =>
      (!filtros.conta || l.conta_id === filtros.conta) &&
      (!filtros.tipo || l.tipo === filtros.tipo) &&
      (!filtros.categoria || (filtros.categoria === 'sem' ? !l.categoria_id : l.categoria_id === filtros.categoria)) &&
      (!busca || normalizarTexto(`${l.descricao} ${nomeCategoria(l.categoria_id)}`).includes(busca)),
  );
}

function opcoesFiltroCategoria() {
  const usadas = [...new Set(lista.map((l) => l.categoria_id).filter(Boolean))]
    .map((id) => ({ id, nome: nomeCategoria(id) }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return html`<option value="">Todas as categorias</option>
    <option value="sem" ${filtros.categoria === 'sem' ? 'selected' : ''}>A classificar</option>
    ${usadas.map((c) => html`<option value="${c.id}" ${c.id === filtros.categoria ? 'selected' : ''}>${c.nome}</option>`)}`;
}

function linha(l) {
  const conta = contaPorId(l.conta_id);
  return html`<tr>
    <td data-rotulo="Data">${formatarData(l.data)}</td>
    <td data-rotulo="Descrição" class="col-desc">${l.descricao}${l.importacao_id ? html` <span class="selo">importado</span>` : ''}
      <small class="so-celular">${formatarData(l.data).slice(0, 5)}, ${conta?.nome || ''}${l.forma_pagamento ? `, ${l.forma_pagamento}` : ''}</small></td>
    <td data-rotulo="Categoria">${chipCategoria(categoriaPorId(l.categoria_id))}</td>
    <td data-rotulo="Conta">${conta?.nome || '—'}${l.forma_pagamento ? html`<small class="bloco-texto">${l.forma_pagamento}</small>` : ''}</td>
    <td data-rotulo="Valor" class="num ${l.tipo === 'ENTRADA' ? 'positivo' : 'negativo'}">${l.tipo === 'SAIDA' ? '−' : '+'} ${formatarMoeda(l.valor)}</td>
    <td class="acoes">
      <button class="btn-icone" data-acao="editar" data-id="${l.id}" aria-label="Editar">✎</button>
      <button class="btn-icone" data-acao="excluir" data-id="${l.id}" aria-label="Excluir">✕</button>
    </td>
  </tr>`;
}

function desenharTabela(el) {
  const visiveis = aplicarFiltros();
  const fora = categoriasForaDosGastos();
  const contaveis = visiveis.filter((l) => !fora.has(l.categoria_id));
  const entradas = contaveis.filter((l) => l.tipo === 'ENTRADA').reduce((s, l) => s + Number(l.valor), 0);
  const saidas = contaveis.filter((l) => l.tipo === 'SAIDA').reduce((s, l) => s + Number(l.valor), 0);
  const pendentes = lista.filter((l) => !l.categoria_id).length;

  renderizar(
    $('#area-tabela', el),
    html`
      <div class="totais">
        <span>Entradas <strong class="positivo">${formatarMoeda(entradas)}</strong></span>
        <span>Saídas <strong class="negativo">${formatarMoeda(saidas)}</strong></span>
        <span>Saldo <strong class="${entradas - saidas >= 0 ? 'positivo' : 'negativo'}">${formatarMoeda(entradas - saidas)}</strong></span>
        ${pendentes ? html`<button class="btn-link" data-acao="pendentes">${pendentes} sem categoria</button>` : ''}
      </div>
      ${visiveis.length
        ? html`<div class="tabela-rolagem"><table class="tabela lista-lanc">
            <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th class="num">Valor</th><th></th></tr></thead>
            <tbody>${visiveis.map(linha)}</tbody>
          </table></div>`
        : estadoVazio(lista.length ? 'Nenhum lançamento com esses filtros.' : 'Nenhum lançamento neste período.')}`,
  );
  renderizar($('[name=categoria]', el), opcoesFiltroCategoria());
}

async function carregar(el) {
  const { inicio, fim } = intervaloAtual();
  lista = await api.lancamentosEntreDatas(inicio, fim);
  desenharTabela(el);
}

export default {
  titulo: 'Lançamentos',
  usaMes: true,
  async montar(el) {
    renderizar(
      el,
      html`
        <div class="tela-topo">
          <h2>Lançamentos</h2>
          <button class="btn btn-primario" data-acao="novo">Novo lançamento</button>
        </div>
        ${barraPeriodo()}
        <form class="filtros" id="filtros">
          <input type="search" name="busca" placeholder="Buscar descrição ou categoria" value="${filtros.busca}" maxlength="100" />
          <select name="conta">${opcoesContas(filtros.conta, { incluirVazia: true })}</select>
          <select name="tipo">
            <option value="">Todos os tipos</option>
            <option value="ENTRADA" ${filtros.tipo === 'ENTRADA' ? 'selected' : ''}>Entradas</option>
            <option value="SAIDA" ${filtros.tipo === 'SAIDA' ? 'selected' : ''}>Saídas</option>
          </select>
          <select name="categoria"></select>
        </form>
        <div id="area-tabela"></div>`,
    );

    ligarBarraPeriodo(el);
    $('#filtros', el).addEventListener('input', (e) => {
      filtros[e.target.name] = e.target.value;
      desenharTabela(el);
    });
    $('#filtros', el).addEventListener('submit', (e) => e.preventDefault());

    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-acao]');
      if (!b) return;
      const recarregar = () => carregar(el);
      if (b.dataset.acao === 'novo') abrirFormLancamento({ aoSalvar: recarregar });
      if (b.dataset.acao === 'pendentes') {
        filtros.categoria = 'sem';
        desenharTabela(el);
      }
      const l = lista.find((x) => x.id === b.dataset.id);
      if (!l) return;
      if (b.dataset.acao === 'editar') abrirFormLancamento({ lancamento: l, aoSalvar: recarregar });
      if (b.dataset.acao === 'excluir' && (await confirmar(`Excluir "${l.descricao}" (${formatarMoeda(l.valor)})?`, { textoOk: 'Excluir' }))) {
        try {
          await api.excluirLancamento(l.id);
          avisar('Lançamento excluído.');
          await recarregar();
        } catch (err) {
          avisar(err.message, 'erro');
        }
      }
    });

    await carregar(el);
  },
};
