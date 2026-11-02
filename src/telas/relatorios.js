// Relatórios com guias laterais e período livre (De/Até):
//  - Visão geral: totais e evolução mensal
//  - Saldos por conta: saldo inicial, entradas, saídas e saldo final mês a mês (transbordo)
//  - Despesas e receitas por categoria
//  - Transferências: pares conciliados entre contas e o que ficou sem par

import * as api from '../servicos/api.js';
import { html, renderizar } from '../lib/html.js';
import { formatarData, formatarMoeda } from '../lib/formatos.js';
import { deslocarMes, limitesMes, nomeMes, somarDias } from '../lib/meses.js';
import { porCategoria, saldosMensais, serieMensal, totais, variacao } from '../lib/calculos.js';
import { conciliarTransferencias } from '../importacao/transferencias.js';
import { estado, categoriaPorId, categoriasForaDosGastos, contaPorId } from '../estado.js';
import { $, $$, avisar, avisarErro, chipCategoria, estadoVazio } from '../ui/componentes.js';
import { revisarSalarioImportado } from './importar.js';
import { abrirDetalheCategoria } from '../ui/detalheCategoria.js';

let periodo = { modo: '6', de: '', ate: '' };
let guiaAtiva = 'geral';

const MODOS = [
  ['3', '3 meses'],
  ['6', '6 meses'],
  ['12', '12 meses'],
  ['ano', 'Este ano'],
  ['livre', 'Personalizado'],
];

/** Intervalo de datas do período escolhido. */
function intervalo() {
  if (periodo.modo === 'livre' && periodo.de && periodo.ate) {
    return periodo.de <= periodo.ate ? { inicio: periodo.de, fim: periodo.ate } : { inicio: periodo.ate, fim: periodo.de };
  }
  if (periodo.modo === 'ano') {
    const ano = estado.mes.slice(0, 4);
    return { inicio: `${ano}-01-01`, fim: limitesMes(estado.mes).fim };
  }
  const n = Number(periodo.modo) || 6;
  return { inicio: limitesMes(deslocarMes(estado.mes, 1 - n)).inicio, fim: limitesMes(estado.mes).fim };
}

function mesesEntre(inicio, fim) {
  const meses = [];
  for (let m = inicio.slice(0, 7); m <= fim.slice(0, 7); m = deslocarMes(m, 1)) meses.push(m);
  return meses;
}

const corValor = (v) => (v < 0 ? 'negativo' : v > 0 ? 'positivo' : '');

// ---------------------------------------------------------------------
// Conteúdo de cada guia
// ---------------------------------------------------------------------
function guiaGeral(d) {
  const { t, serie, meses } = d;
  const maior = Math.max(1, ...serie.flatMap((m) => [m.entradas, m.saidas]));
  return html`
    <div class="kpis">
      <div class="kpi positivo"><span>Entradas no período</span><strong>${formatarMoeda(t.entradas)}</strong><small>média ${formatarMoeda(t.entradas / meses.length)}/mês</small></div>
      <div class="kpi negativo"><span>Saídas no período</span><strong>${formatarMoeda(t.saidas)}</strong><small>média ${formatarMoeda(t.saidas / meses.length)}/mês</small></div>
      <div class="kpi ${t.saldo >= 0 ? 'positivo' : 'negativo'}"><span>Resultado do período</span><strong>${formatarMoeda(t.saldo)}</strong>
        <small>${t.entradas ? `${((t.saldo / t.entradas) * 100).toFixed(0)}% da renda poupada` : ''}</small></div>
    </div>
    <h2 class="titulo-guia">Evolução mensal</h2>
    <div class="tabela-rolagem"><table class="tabela tabela-responsiva">
      <thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th class="num">Resultado</th><th class="num">Acumulado</th></tr></thead>
      <tbody>${serie.map(
        (m) => html`<tr>
          <td data-rotulo="Mês">${nomeMes(m.mes, true)}</td>
          <td data-rotulo="Entradas"><div class="barra-celula"><progress class="p-entrada" max="${maior}" value="${m.entradas}"></progress><span>${formatarMoeda(m.entradas)}</span></div></td>
          <td data-rotulo="Saídas"><div class="barra-celula"><progress class="p-saida" max="${maior}" value="${m.saidas}"></progress><span>${formatarMoeda(m.saidas)}</span></div></td>
          <td data-rotulo="Resultado" class="num ${corValor(m.saldo)}">${formatarMoeda(m.saldo)}</td>
          <td data-rotulo="Acumulado" class="num ${corValor(m.acumulado)}">${formatarMoeda(m.acumulado)}</td>
        </tr>`,
      )}</tbody>
    </table></div>
    <p class="legenda">Entradas e saídas não incluem transferências entre suas contas, pagamento de fatura nem aplicações.</p>`;
}

function guiaSaldos(d) {
  const { saldos, fim } = d;
  if (!saldos.porConta.length) return estadoVazio('Nenhuma conta ativa.');
  const semInicial = saldos.porConta.filter((c) => !c.conta.saldo_inicial_data);
  const linhaMes = (m) => html`<tr>
    <td data-rotulo="Mês">${nomeMes(m.mes, true)}</td>
    <td data-rotulo="Saldo inicial" class="num ${corValor(m.inicial)}">${formatarMoeda(m.inicial)}</td>
    <td data-rotulo="Entradas" class="num positivo">${formatarMoeda(m.entradas)}</td>
    <td data-rotulo="Saídas" class="num negativo">${formatarMoeda(m.saidas)}</td>
    <td data-rotulo="Saldo final" class="num ${corValor(m.final)}"><strong>${formatarMoeda(m.final)}</strong></td>
  </tr>`;

  return html`
    <div class="saldo-contas">
      ${saldos.porConta.map((c) => {
        const ini = c.meses[0]?.inicial ?? 0;
        return html`<div class="saldo-conta skin-${c.conta.skin || 'padrao'} ${c.conta.saldo_inicial_data ? '' : 'sem-inicial'}">
          <span>${c.conta.nome}</span>
          <strong class="${corValor(c.saldoFinal)}">${formatarMoeda(c.saldoFinal)}</strong>
          <small>${c.conta.saldo_inicial_data
            ? `em ${formatarData(fim)}, ${c.saldoFinal - ini >= 0 ? '+' : ''}${formatarMoeda(c.saldoFinal - ini)} no período`
            : 'sem saldo inicial cadastrado'}</small>
        </div>`;
      })}
      <div class="saldo-conta">
        <span>Todas as contas</span>
        <strong class="${corValor(saldos.consolidado.at(-1)?.final ?? 0)}">${formatarMoeda(saldos.consolidado.at(-1)?.final ?? 0)}</strong>
        <small>saldo consolidado em ${formatarData(fim)}</small>
      </div>
    </div>
    ${semInicial.length
      ? html`<div class="faixa-alerta">
          ${semInicial.map((c) => c.conta.nome).join(', ')} sem saldo inicial: o saldo parte de zero.
          Cadastre o "saldo anterior" do primeiro extrato em <a href="#/contas">Contas</a> para bater com o banco.
        </div>`
      : ''}

    <h2 class="titulo-guia">Saldo mês a mês</h2>
    <div class="tabela-rolagem"><table class="tabela tabela-responsiva">
      <thead><tr><th>Mês</th><th class="num">Saldo inicial</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo final</th></tr></thead>
      <tbody>
        ${saldos.porConta.map((c) => html`<tr class="subtitulo-conta"><td colspan="5">${c.conta.nome}</td></tr>${c.meses.map(linhaMes)}`)}
        <tr class="subtitulo-conta"><td colspan="5">Consolidado (todas as contas)</td></tr>
        ${saldos.consolidado.map(linhaMes)}
      </tbody>
    </table></div>
    <p class="legenda">O saldo final de cada mês é o saldo inicial do mês seguinte. Transferências entram na conta de destino e saem da de origem,
      então se anulam no consolidado. Compras no crédito não mexem no saldo: o que sai da conta é o pagamento da fatura.</p>`;
}

function guiaCategorias(d, tipo) {
  const { lancamentos, meses, ignorar } = d;
  const mesFinal = meses.at(-1);
  const doMesFinal = lancamentos.filter((l) => l.data.startsWith(mesFinal));
  const finalPorCat = new Map(porCategoria(doMesFinal, tipo, ignorar).map((c) => [c.categoria_id, c.valor]));
  const cats = porCategoria(lancamentos, tipo, ignorar).map((c) => {
    const media = c.valor / meses.length;
    const atual = finalPorCat.get(c.categoria_id) || 0;
    return { ...c, media, atual, var: variacao(atual, media) };
  });
  const saida = tipo === 'SAIDA';
  if (!cats.length) return estadoVazio(saida ? 'Sem despesas no período.' : 'Sem receitas no período.');

  return html`
    <p class="dica">Comparação de ${nomeMes(mesFinal)} com a média mensal do período. Toque numa linha para ver subcategorias e lançamentos.</p>
    <div class="tabela-rolagem"><table class="tabela tabela-responsiva">
      <thead><tr><th>Categoria</th><th class="num">Total</th><th class="num">% do total</th><th class="num">Média/mês</th><th class="num">${nomeMes(mesFinal, true)}</th><th class="num">vs média</th></tr></thead>
      <tbody>${cats.map((c) => {
        const ruim = saida ? c.var > 10 : c.var < -10;
        const bom = saida ? c.var < -10 : c.var > 10;
        return html`<tr class="linha-clicavel" tabindex="0" data-detalhe="${categoriaPorId(c.categoria_id)?.nome ?? ''}" data-tipo="${tipo}">
          <td data-rotulo="Categoria">${chipCategoria(categoriaPorId(c.categoria_id))}</td>
          <td data-rotulo="Total" class="num">${formatarMoeda(c.valor)}</td>
          <td data-rotulo="%" class="num">${c.percentual.toFixed(1)}%</td>
          <td data-rotulo="Média/mês" class="num">${formatarMoeda(c.media)}</td>
          <td data-rotulo="Último mês" class="num">${formatarMoeda(c.atual)}</td>
          <td data-rotulo="vs média" class="num ${c.var === null ? '' : ruim ? 'negativo' : bom ? 'positivo' : ''}">${c.var === null ? '—' : `${c.var >= 0 ? '+' : ''}${c.var.toFixed(0)}%`}</td>
        </tr>`;
      })}</tbody>
    </table></div>`;
}

function guiaTransferencias(d) {
  const { conciliacao } = d;
  const { pares, semPar } = conciliacao;
  const entradasSemPar = semPar.filter((l) => l.tipo === 'ENTRADA');
  return html`
    <div class="kpis">
      <div class="kpi"><span>Conciliadas</span><strong>${pares.length}</strong><small>saída e entrada encontradas</small></div>
      <div class="kpi ${semPar.length ? 'alerta' : ''}"><span>Sem par</span><strong>${semPar.length}</strong><small>o outro lado não está em nenhuma conta cadastrada</small></div>
    </div>

    ${entradasSemPar.length
      ? html`<div class="faixa-info"><span>${entradasSemPar.length} entrada(s) vieram de você mesmo sem saída correspondente. Se for o salário vindo da conta-salário, ele deve contar como receita.</span>
          <button class="btn btn-primario btn-pequeno" data-acao="revisar-salario">Revisar se é salário</button></div>`
      : ''}

    <h2 class="titulo-guia">Conciliadas</h2>
    ${pares.length
      ? html`<div class="tabela-rolagem"><table class="tabela tabela-responsiva">
          <thead><tr><th>Saiu de</th><th></th><th>Entrou em</th><th class="num">Valor</th></tr></thead>
          <tbody>${pares.map(
            ([s, e]) => html`<tr>
              <td data-rotulo="Saiu de">${contaPorId(s.conta_id)?.nome || '—'} <small class="bloco-texto">${formatarData(s.data)}</small></td>
              <td class="seta" aria-hidden="true">→</td>
              <td data-rotulo="Entrou em">${contaPorId(e.conta_id)?.nome || '—'} <small class="bloco-texto">${formatarData(e.data)}</small></td>
              <td data-rotulo="Valor" class="num">${formatarMoeda(s.valor)}</td>
            </tr>`,
          )}</tbody>
        </table></div>`
      : estadoVazio('Nenhuma transferência conciliada no período. Importe os extratos das duas contas envolvidas.')}

    <h2 class="titulo-guia">Sem par</h2>
    ${semPar.length
      ? html`<ul class="linhas">${semPar.map(
          (l) => html`<li>
            <span class="linha-data">${formatarData(l.data).slice(0, 5)}</span>
            <span class="linha-desc">${l.descricao}<small>${contaPorId(l.conta_id)?.nome || ''}, ${l.tipo === 'ENTRADA' ? 'entrou' : 'saiu'}</small></span>
            <strong class="${l.tipo === 'ENTRADA' ? 'positivo' : 'negativo'}">${l.tipo === 'SAIDA' ? '−' : '+'}${formatarMoeda(l.valor)}</strong>
          </li>`,
        )}</ul>`
      : estadoVazio('Tudo conciliado.')}`;
}

// ---------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------
export default {
  titulo: 'Relatórios',
  usaMes: true,
  async montar(el) {
    const { inicio, fim } = intervalo();
    if (periodo.modo !== 'livre') Object.assign(periodo, { de: inicio, ate: fim });

    renderizar(
      el,
      html`<div class="tela-topo">
          <h2>Relatórios</h2>
          <span class="dica">${formatarData(inicio)} a ${formatarData(fim)}</span>
        </div>
        <form class="periodo" id="form-periodo">
          <fieldset class="opcoes-pilula" aria-label="Período">
            ${MODOS.map(([v, t]) => html`<label><input type="radio" name="modo" value="${v}" ${periodo.modo === v ? 'checked' : ''} /><span>${t}</span></label>`)}
          </fieldset>
          <label>De <input type="date" name="de" value="${periodo.de}" ${periodo.modo === 'livre' ? '' : 'disabled'} /></label>
          <label>Até <input type="date" name="ate" value="${periodo.ate}" ${periodo.modo === 'livre' ? '' : 'disabled'} /></label>
          <button type="submit" class="btn btn-secundario" ${periodo.modo === 'livre' ? '' : 'hidden'}>Aplicar</button>
        </form>
        <div id="area-relatorio"><div class="carregando-tela">Calculando…</div></div>`,
    );

    const recarregar = () => window.dispatchEvent(new Event('hashchange'));
    const form = $('#form-periodo', el);
    form.addEventListener('change', (e) => {
      if (e.target.name !== 'modo') return;
      periodo.modo = e.target.value;
      if (periodo.modo === 'livre') {
        $$('[name=de], [name=ate]', form).forEach((i) => (i.disabled = false));
        $('button[type=submit]', form).hidden = false;
        $('[name=de]', form).focus();
      } else recarregar();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const de = $('[name=de]', form).value;
      const ate = $('[name=ate]', form).value;
      if (!de || !ate) return avisar('Informe as duas datas.', 'erro');
      Object.assign(periodo, { modo: 'livre', de, ate });
      recarregar();
    });

    // dados
    const ignorar = categoriasForaDosGastos();
    const idsTransf = estado.categorias.filter((c) => c.nome === 'Transferências' && c.subcategoria === 'Entre minhas contas').map((c) => c.id);
    const [lancamentos, saldoAntes] = await Promise.all([
      api.lancamentosEntreDatas(inicio, fim),
      api.saldoContasEm(somarDias(inicio, -1)),
    ]);
    const meses = mesesEntre(inicio, fim);
    const contas = estado.contas.filter((c) => c.ativo);
    const d = {
      inicio, fim, meses, lancamentos, ignorar,
      t: totais(lancamentos, ignorar),
      serie: serieMensal(lancamentos, meses, ignorar),
      saldos: saldosMensais(contas, saldoAntes, lancamentos, meses),
      conciliacao: conciliarTransferencias(lancamentos.filter((l) => idsTransf.includes(l.categoria_id))),
    };

    const guias = {
      geral: { ico: 'i-resumo', titulo: 'Visão geral', resumo: `resultado ${formatarMoeda(d.t.saldo)}`, conteudo: () => guiaGeral(d) },
      saldos: { ico: 'i-carteira', titulo: 'Saldos por conta', resumo: `consolidado ${formatarMoeda(d.saldos.consolidado.at(-1)?.final ?? 0)}`, conteudo: () => guiaSaldos(d) },
      despesas: { ico: 'i-grafico', titulo: 'Despesas por categoria', resumo: formatarMoeda(d.t.saidas), conteudo: () => guiaCategorias(d, 'SAIDA') },
      receitas: { ico: 'i-importar', titulo: 'Receitas por categoria', resumo: formatarMoeda(d.t.entradas), conteudo: () => guiaCategorias(d, 'ENTRADA') },
      transferencias: {
        titulo: 'Transferências',
        ico: 'i-lista',
        contador: d.conciliacao.semPar.length,
        alerta: d.conciliacao.semPar.length > 0,
        resumo: `${d.conciliacao.pares.length} conciliada(s), ${d.conciliacao.semPar.length} sem par`,
        conteudo: () => guiaTransferencias(d),
      },
    };
    if (!guias[guiaAtiva]) guiaAtiva = 'geral';

    if (!lancamentos.length) {
      renderizar($('#area-relatorio', el), estadoVazio(`Sem lançamentos entre ${formatarData(inicio)} e ${formatarData(fim)}.`));
      return;
    }

    renderizar(
      $('#area-relatorio', el),
      html`<div class="guias guias-pasta">
          <div class="guias-lista abas-pasta" role="tablist" aria-label="Relatórios" aria-orientation="horizontal">
            ${Object.entries(guias).map(([id, g]) => html`<button role="tab" class="aba-pasta ${g.alerta ? 'com-alerta' : ''}" id="guia-${id}" data-guia="${id}" aria-controls="painel-guia" title="${g.resumo}">
              <svg aria-hidden="true"><use href="#${g.ico}" /></svg><span>${g.titulo}</span>${g.contador !== undefined ? html`<b>${g.contador}</b>` : ''}
            </button>`)}
          </div>
          <section class="painel guias-painel painel-abas-pasta" id="painel-guia" role="tabpanel" tabindex="0"></section>
        </div>`,
    );

    const desenharGuia = () => {
      $$('[role=tab]', el).forEach((b) => {
        const ativa = b.dataset.guia === guiaAtiva;
        b.classList.toggle('ativa', ativa);
        b.setAttribute('aria-selected', String(ativa));
        b.tabIndex = ativa ? 0 : -1;
      });
      $('#painel-guia', el).setAttribute('aria-labelledby', `guia-${guiaAtiva}`);
      renderizar($('#painel-guia', el), html`<div class="titulo-painel-linha"><h2 class="titulo-painel">${guias[guiaAtiva].titulo}</h2><small>${guias[guiaAtiva].resumo}</small></div>${guias[guiaAtiva].conteudo()}`);
    };
    desenharGuia();

    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-acao=revisar-salario]')) {
        try {
          await revisarSalarioImportado(() => window.dispatchEvent(new Event("hashchange")));
        } catch (err) {
          avisarErro(err);
        }
        return;
      }
      const det = e.target.closest('[data-detalhe]');
      if (det) {
        return abrirDetalheCategoria({ nome: det.dataset.detalhe || null, tipo: det.dataset.tipo, lancamentos: d.lancamentos, periodo: `${formatarData(inicio)} a ${formatarData(fim)}` });
      }
      const b = e.target.closest('[role=tab]');
      if (!b) return;
      guiaAtiva = b.dataset.guia;
      desenharGuia();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('[data-detalhe]')) {
        return abrirDetalheCategoria({ nome: e.target.dataset.detalhe || null, tipo: e.target.dataset.tipo, lancamentos: d.lancamentos, periodo: `${formatarData(inicio)} a ${formatarData(fim)}` });
      }
      if (!e.target.matches('[role=tab]') || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const ids = Object.keys(guias);
      const passo = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      guiaAtiva = ids[(ids.indexOf(guiaAtiva) + passo + ids.length) % ids.length];
      desenharGuia();
      $(`#guia-${guiaAtiva}`, el).focus();
    });
  },
};

