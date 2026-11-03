// Lançamentos futuros (previstos): contas a pagar/receber, parcelas, recorrências.
// Abas no topo (estilo pasta) com contadores: próximos 30 dias, vencidos, a pagar, a receber,
// parcelas, fixas e todos.

import * as api from '../servicos/api.js';
import { html, renderizar } from '../lib/html.js';
import { formatarData, formatarMoeda } from '../lib/formatos.js';
import { hojeISO, nomeMes, somarDias } from '../lib/meses.js';
import { categoriaPorId, contaPorId } from '../estado.js';
import { ehFixa } from '../lib/analise.js';
import { $, abrirModal, avisar, chipCategoria, confirmar, estadoVazio, opcoesContas } from '../ui/componentes.js';
import { abrirFormLancamento } from './formLancamento.js';
import { oferecerFixas, planoDeFixas } from '../ui/fixas.js';

let lista = [];
let filtroConta = '';
let plano = [];
let abaAtiva = 'proximos';
const selecionados = new Set(); // ids marcados para excluir em lote (só da aba/conta visível)

function abas(hoje) {
  const em30 = somarDias(hoje, 30);
  return [
    { id: 'proximos', titulo: 'Próximos 30 dias', ico: 'i-agenda', filtro: (l) => l.data >= hoje && l.data <= em30 },
    { id: 'vencidos', titulo: 'Vencidos', ico: 'i-agenda', filtro: (l) => l.data < hoje, alerta: true },
    { id: 'pagar', titulo: 'A pagar', ico: 'i-importar', filtro: (l) => l.tipo === 'SAIDA' },
    { id: 'receber', titulo: 'A receber', ico: 'i-importar', filtro: (l) => l.tipo === 'ENTRADA' },
    { id: 'parcelas', titulo: 'Parcelas', ico: 'i-lista', filtro: (l) => l.serie_tipo === 'PARCELA' },
    { id: 'fixas', titulo: 'Despesas fixas', ico: 'i-lista', filtro: (l) => l.serie_tipo === 'FIXA' || ehFixa(l, categoriaPorId) },
    { id: 'todos', titulo: 'Todos', ico: 'i-lista', filtro: () => true },
  ];
}

function desenhar(el) {
  const hoje = hojeISO();
  const daConta = lista.filter((l) => !filtroConta || l.conta_id === filtroConta);
  const lista_abas = abas(hoje).map((a) => ({ ...a, itens: daConta.filter(a.filtro) }));
  const aba = lista_abas.find((a) => a.id === abaAtiva) || lista_abas[0];
  const visiveis = aba.itens;
  renderizar(
    $('#abas-futuros', el),
    html`${lista_abas.map((a) => html`<button role="tab" class="aba-pasta ${a.id === aba.id ? 'ativa' : ''} ${a.alerta && a.itens.length ? 'com-alerta' : ''}"
      data-aba="${a.id}" aria-selected="${a.id === aba.id}" tabindex="${a.id === aba.id ? 0 : -1}" aria-controls="area-futuros">
      <svg aria-hidden="true"><use href="#${a.ico}" /></svg><span>${a.titulo}</span><b>${a.itens.length}</b></button>`)}`,
  );
  const porMes = new Map();
  for (const l of visiveis) {
    const mes = l.data.slice(0, 7);
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes).push(l);
  }

  renderizar(
    $('#area-futuros', el),
    visiveis.length
      ? html`<div class="barra-selecao">
          <span class="sel-contagem" aria-live="polite"></span>
          <span>
            <button type="button" class="btn-link" data-marcar="1">Marcar todos</button>
            <button type="button" class="btn-link" data-marcar="0">Desmarcar</button>
            <button type="button" class="btn btn-perigo btn-pequeno" data-acao="excluir-selecionados" disabled>Excluir selecionados</button>
          </span>
        </div>
        ${[...porMes].map(([mes, itens]) => {
          const saldo = itens.reduce((s, l) => s + (l.tipo === 'ENTRADA' ? 1 : -1) * Number(l.valor), 0);
          return html`<section class="bloco">
            <header class="bloco-topo">
              <label class="sel-mes"><input type="checkbox" data-sel-mes="${mes}" aria-label="Marcar todos de ${nomeMes(mes)}" />
                <h3>${nomeMes(mes)}</h3></label>
              <span class="${saldo >= 0 ? 'positivo' : 'negativo'}">Previsto: ${formatarMoeda(saldo)}</span>
            </header>
            <div class="tabela-rolagem"><table class="tabela lista-lanc">
              <tbody>${itens.map(
                (l) => html`<tr class="${l.data < hoje ? 'atrasado' : ''}">
                  <td class="col-sel"><input type="checkbox" data-sel="${l.id}" data-mes="${mes}" aria-label="Selecionar ${l.descricao}"
                    ${selecionados.has(l.id) ? 'checked' : ''} /></td>
                  <td data-rotulo="Vencimento">${formatarData(l.data)}${l.data < hoje ? html` <span class="selo selo-alerta">vencido</span>` : ''}</td>
                  <td data-rotulo="Descrição" class="col-desc">${l.descricao}${l.serie_tipo === 'PARCELA' ? html` <span class="selo">parcela</span>` : l.serie_tipo === 'FIXA' ? html` <span class="selo">fixa</span>` : ''}
                    <small class="so-celular">${formatarData(l.data).slice(0, 5)}, ${contaPorId(l.conta_id)?.nome || ''}${l.data < hoje ? ', vencido' : ''}</small></td>
                  <td data-rotulo="Categoria">${chipCategoria(categoriaPorId(l.categoria_id))}</td>
                  <td data-rotulo="Conta">${contaPorId(l.conta_id)?.nome || '—'}</td>
                  <td data-rotulo="Valor" class="num ${l.tipo === 'ENTRADA' ? 'positivo' : 'negativo'}">${l.tipo === 'SAIDA' ? '−' : '+'} ${formatarMoeda(l.valor)}</td>
                  <td class="acoes">
                    <button class="btn btn-pequeno" data-acao="confirmar" data-id="${l.id}">${l.tipo === 'SAIDA' ? 'Paguei' : 'Recebi'}</button>
                    <button class="btn-icone" data-acao="editar" data-id="${l.id}" aria-label="Editar">✎</button>
                    <button class="btn-icone" data-acao="excluir" data-id="${l.id}" aria-label="Excluir">✕</button>
                  </td>
                </tr>`,
              )}</tbody>
            </table></div>
          </section>`;
        })}`
      : estadoVazio(
          lista.length
            ? `Nada em "${aba.titulo}"${filtroConta ? ' para esta conta' : ''}.`
            : 'Nenhum lançamento futuro. Cadastre contas a pagar, parcelas ou recebimentos previstos.',
        ),
  );
  atualizarSelecao(el);
}

/** Contagem, botão de excluir e caixas "marcar o mês" conforme o que está marcado (sem redesenhar). */
function atualizarSelecao(el) {
  const caixas = [...el.querySelectorAll('[data-sel]')];
  const n = caixas.filter((c) => c.checked).length;
  const contagem = $('.sel-contagem', el);
  if (contagem) contagem.textContent = n ? `${n} selecionado(s)` : 'Marque para excluir vários de uma vez';
  const botao = $('[data-acao="excluir-selecionados"]', el);
  if (botao) {
    botao.disabled = !n;
    botao.textContent = n ? `Excluir ${n}` : 'Excluir selecionados';
  }
  for (const m of el.querySelectorAll('[data-sel-mes]')) {
    const doMes = caixas.filter((c) => c.dataset.mes === m.dataset.selMes);
    const marcadas = doMes.filter((c) => c.checked).length;
    m.checked = marcadas > 0 && marcadas === doMes.length;
    m.indeterminate = marcadas > 0 && marcadas < doMes.length;
  }
}

async function carregar(el) {
  lista = await api.listarFuturos();
  const existentes = new Set(lista.map((l) => l.id));
  for (const id of selecionados) if (!existentes.has(id)) selecionados.delete(id);
  desenhar(el);
  plano = await planoDeFixas(lista).catch(() => []);
  renderizar(
    $('#area-fixas', el),
    plano.length
      ? html`<div class="faixa-info">
          <span>${plano.length === 1 ? '1 despesa fixa ainda não tem previsão' : `${plano.length} previsões de despesas fixas estão faltando`} para os próximos meses.</span>
          <button class="btn btn-primario btn-pequeno" data-acao="prever-fixas">Revisar e prever</button>
        </div>`
      : html``,
  );
}

export function confirmarPagamento(l, recarregar) {
  abrirModal({
    titulo: l.tipo === 'SAIDA' ? 'Confirmar pagamento' : 'Confirmar recebimento',
    textoOk: 'Confirmar',
    corpo: html`<p><strong>${l.descricao}</strong> — ${formatarMoeda(l.valor)}</p>
      <label>Data em que ${l.tipo === 'SAIDA' ? 'foi pago' : 'foi recebido'}
        <input type="date" name="data" required value="${l.data <= hojeISO() ? l.data : hojeISO()}" />
      </label>`,
    async aoEnviar(f) {
      await api.confirmarFuturo(l.id, f.data);
      avisar('Lançamento confirmado e movido para os realizados.');
      await recarregar();
    },
  });
}

export default {
  titulo: 'Lançamentos futuros',
  usaMes: false,
  async montar(el) {
    renderizar(
      el,
      html`
        <div class="tela-topo">
          <h2>Lançamentos futuros</h2>
          <button class="btn btn-primario" data-acao="novo">Novo lançamento futuro</button>
        </div>
        <form class="filtros"><select name="conta">${opcoesContas(filtroConta, { incluirVazia: true })}</select></form>
        <div id="area-fixas"></div>
        <div class="abas-pasta" id="abas-futuros" role="tablist" aria-label="Filtrar lançamentos futuros"></div>
        <div id="area-futuros" class="painel-abas" role="tabpanel"></div>`,
    );

    $('.filtros', el).addEventListener('input', (e) => {
      filtroConta = e.target.value;
      selecionados.clear();
      desenhar(el);
    });

    $('#area-futuros', el).addEventListener('change', (e) => {
      const caixa = e.target.closest('[data-sel], [data-sel-mes]');
      if (!caixa) return;
      const alvo = caixa.dataset.selMes
        ? [...el.querySelectorAll(`[data-sel][data-mes="${caixa.dataset.selMes}"]`)]
        : [caixa];
      for (const c of alvo) {
        c.checked = caixa.checked;
        if (c.checked) selecionados.add(c.dataset.sel);
        else selecionados.delete(c.dataset.sel);
      }
      atualizarSelecao(el);
    });

    el.addEventListener('keydown', (e) => {
      if (!e.target.matches('.aba-pasta') || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const ids = abas(hojeISO()).map((a) => a.id);
      abaAtiva = ids[(ids.indexOf(abaAtiva) + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length];
      desenhar(el);
      $(`[data-aba="${abaAtiva}"]`, el).focus();
    });

    el.addEventListener('click', async (e) => {
      const aba = e.target.closest('[data-aba]');
      if (aba) {
        abaAtiva = aba.dataset.aba;
        selecionados.clear();
        return desenhar(el);
      }
      const marcar = e.target.closest('[data-marcar]');
      if (marcar) {
        for (const c of el.querySelectorAll('[data-sel]')) {
          c.checked = marcar.dataset.marcar === '1';
          if (c.checked) selecionados.add(c.dataset.sel);
          else selecionados.delete(c.dataset.sel);
        }
        return atualizarSelecao(el);
      }
      const b = e.target.closest('[data-acao]');
      if (!b) return;
      const recarregar = () => carregar(el);
      if (b.dataset.acao === 'excluir-selecionados') {
        const ids = [...el.querySelectorAll('[data-sel]:checked')].map((c) => c.dataset.sel);
        if (!ids.length || !(await confirmar(`Excluir ${ids.length} lançamento(s) futuro(s)?`, { textoOk: 'Excluir' }))) return;
        try {
          await api.excluirPrevistos(ids);
          ids.forEach((id) => selecionados.delete(id));
          avisar(`${ids.length} lançamento(s) excluído(s).`);
          await recarregar();
        } catch (err) {
          avisar(err.message, 'erro');
        }
        return;
      }
      if (b.dataset.acao === 'novo') return abrirFormLancamento({ status: 'PREVISTO', aoSalvar: recarregar });
      if (b.dataset.acao === 'prever-fixas') return oferecerFixas(plano, recarregar);
      const l = lista.find((x) => x.id === b.dataset.id);
      if (!l) return;
      if (b.dataset.acao === 'confirmar') confirmarPagamento(l, recarregar);
      if (b.dataset.acao === 'editar') abrirFormLancamento({ lancamento: l, aoSalvar: recarregar });
      if (b.dataset.acao === 'excluir' && (await confirmar(`Excluir "${l.descricao}"?`, { textoOk: 'Excluir' }))) {
        try {
          await api.excluirLancamento(l.id);
          avisar('Excluído.');
          await recarregar();
        } catch (err) {
          avisar(err.message, 'erro');
        }
      }
    });

    await carregar(el);
  },
};
