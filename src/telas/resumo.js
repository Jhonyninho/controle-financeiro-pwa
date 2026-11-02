// Resumo (tela inicial): saudação, avisos do dia (campanhas, feriados, datas do bolso),
// órbita Fluxo/Patrimônio, cartões coloridos das contas, atalhos, maiores gastos e vencimentos.

import * as api from '../servicos/api.js';
import { html, renderizar } from '../lib/html.js';
import { formatarData, formatarMoeda } from '../lib/formatos.js';
import { deslocarMes, hojeISO, limitesMes, nomeMes, somarDias } from '../lib/meses.js';
import { agruparPorCategoriaMae, porCategoria, resumoPorConta, totais, variacao } from '../lib/calculos.js';
import { intervaloAtual, estado, categoriaPorId, categoriasForaDosGastos, contaPorId, definirMes } from '../estado.js';
import { $, chipCategoria, estadoVazio } from '../ui/componentes.js';
import { icone } from '../assets/icons/index.js';
import { lerAparencia } from '../lib/aparencia.js';
import { avisosDoDia } from '../lib/campanhas.js';
import { abrirFormLancamento } from './formLancamento.js';
import { confirmarPagamento } from './futuros.js';
import { ligarCarteira } from '../ui/carteira.js';
import { instalarApp, sugerirInstalacao } from '../ui/instalar.js';
import { cartaoConta } from './contas.js';
import { barraPeriodo, ligarBarraPeriodo } from '../ui/periodo.js';
import { abrirDetalheCategoria } from '../ui/detalheCategoria.js';

const CHAVE_VISAO = 'cf.visaoResumo';
function lerVisao() {
  try {
    return localStorage.getItem(CHAVE_VISAO) === 'patrimonio' ? 'patrimonio' : 'fluxo';
  } catch {
    return 'fluxo';
  }
}
function salvarVisao(v) {
  try {
    localStorage.setItem(CHAVE_VISAO, v);
  } catch {
    /* sem storage */
  }
}
const RAIO = 92;
const CIRC = 2 * Math.PI * RAIO;
const animar = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const plural = (n, um, varios) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

function orbita(t, tAnt, rotuloAnterior, livre) {
  const consumo = t.entradas ? Math.min(t.saidas / t.entradas, 1) : t.saidas ? 1 : 0;
  const pct = t.entradas ? Math.round((t.saidas / t.entradas) * 100) : null;
  const vEnt = variacao(t.entradas, tAnt.entradas);
  const vSai = variacao(t.saidas, tAnt.saidas);
  const seta = (v, inverter) =>
    v === null
      ? ''
      : html`<small class="${(inverter ? v <= 0 : v >= 0) ? 'positivo' : 'negativo'}">${v >= 0 ? '+' : ''}${v.toFixed(0)}% em relação a ${rotuloAnterior}</small>`;

  return html`<section class="orbita">
    <div class="orbita-anel girando">
      <svg viewBox="0 0 220 220" role="img" aria-label="${pct === null ? 'Sem entradas no mês' : `${pct}% das entradas já foram gastos`}">
        <defs>
          <linearGradient id="grad-orbita" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" class="grad-a" />
            <stop offset="100%" class="grad-b" />
          </linearGradient>
        </defs>
        <circle class="anel-trilho" cx="110" cy="110" r="${RAIO}" />
        <circle class="anel-trilho anel-tracejado" cx="110" cy="110" r="${RAIO + 14}" />
        <circle class="anel-valor ${consumo >= 1 ? 'estourado' : ''}" cx="110" cy="110" r="${RAIO}"
          stroke-dasharray="${(CIRC * consumo).toFixed(1)} ${CIRC.toFixed(1)}" transform="rotate(-90 110 110)">
          ${animar()
            ? html`<animate attributeName="stroke-dasharray" from="0 ${CIRC.toFixed(1)}" to="${(CIRC * consumo).toFixed(1)} ${CIRC.toFixed(1)}" dur="1.1s" calcMode="spline" keySplines="0.22 1 0.36 1" keyTimes="0;1" fill="freeze" />`
            : ''}
        </circle>
      </svg>
      <div class="orbita-centro">
        <span>${livre ? 'Resultado do período' : 'Saldo do mês'}</span>
        <strong class="${t.saldo >= 0 ? '' : 'negativo'}">${formatarMoeda(t.saldo)}</strong>
        <small>${pct === null ? 'Nenhuma entrada ainda' : `${pct}% da renda gasta`}</small>
      </div>
    </div>
    <dl class="orbita-fluxos">
      <div class="fluxo fluxo-entrada"><dt>Entrou</dt><dd>${formatarMoeda(t.entradas)}</dd>${seta(vEnt)}</div>
      <div class="fluxo fluxo-saida"><dt>Saiu</dt><dd>${formatarMoeda(t.saidas)}</dd>${seta(vSai, true)}</div>
    </dl>
  </section>`;
}

const SEGMENTOS = 6;

/** Visão 2: patrimônio = soma dos saldos reais das contas, com o anel dividido por conta. */
function patrimonio(contas, saldos, faturasAbertas, fim) {
  const itens = contas
    .map((c) => ({ conta: c, saldo: saldos.get(c.id) ?? 0 }))
    .sort((a, b) => b.saldo - a.saldo);
  const total = itens.reduce((s, i) => s + i.saldo, 0);
  const positivos = itens.filter((i) => i.saldo > 0);
  const somaPos = positivos.reduce((s, i) => s + i.saldo, 0);
  const liquido = total - Math.max(0, faturasAbertas);
  const GAP = positivos.length > 1 ? 4 : 0;
  let acumulado = 0;
  const arcos = positivos.map((i, n) => {
    const comp = (CIRC * i.saldo) / somaPos;
    const arco = { n: n % SEGMENTOS, comp: Math.max(0, comp - GAP), offset: -acumulado };
    acumulado += comp;
    return arco;
  });

  return html`<section class="orbita orbita-patrimonio">
    <div class="orbita-anel girando">
      <svg viewBox="0 0 220 220" role="img" aria-label="Patrimônio de ${formatarMoeda(total)} distribuído em ${itens.length} conta(s)">
        <circle class="anel-trilho" cx="110" cy="110" r="${RAIO}" />
        <circle class="anel-trilho anel-tracejado" cx="110" cy="110" r="${RAIO + 14}" />
        ${arcos.map(
          (a) => html`<circle class="anel-segmento seg-${a.n}" cx="110" cy="110" r="${RAIO}"
            stroke-dasharray="${a.comp.toFixed(1)} ${CIRC.toFixed(1)}" stroke-dashoffset="${a.offset.toFixed(1)}" transform="rotate(-90 110 110)" />`,
        )}
      </svg>
      <div class="orbita-centro">
        <span>Patrimônio em ${formatarData(fim).slice(0, 5)}</span>
        <strong class="${total >= 0 ? '' : 'negativo'}">${formatarMoeda(total)}</strong>
        <small>${faturasAbertas > 0 ? `${formatarMoeda(liquido)} após faturas` : 'soma dos saldos das contas'}</small>
      </div>
    </div>
    <div class="patrimonio-legenda">
      <ul>${itens.map((i) => {
        const pos = positivos.indexOf(i);
        return html`<li>
          <i class="marca-seg ${pos >= 0 ? `seg-${pos % SEGMENTOS}` : 'seg-vazio'}" aria-hidden="true"></i>
          <span>${i.conta.nome}</span>
          <strong class="${i.saldo < 0 ? 'negativo' : ''}">${formatarMoeda(i.saldo)}</strong>
        </li>`;
      })}</ul>
      ${faturasAbertas > 0
        ? html`<p class="patrimonio-fatura"><span>Faturas de cartão a vencer</span><strong class="negativo">−${formatarMoeda(faturasAbertas)}</strong></p>`
        : ''}
      <p class="dica">Saldo de cada conta = saldo inicial cadastrado + movimentos realizados. Compras no crédito só saem da conta quando a fatura é paga.</p>
    </div>
  </section>`;
}

function conteudoCartao(r, { mes, fim, livre }, saldoFim) {
  const f = r.fatura;
  return html`
    <div class="cartao-saldo">
      <span>Saldo em ${formatarData(fim).slice(0, 5)}</span>
      <strong class="${saldoFim < 0 ? 'negativo' : ''}">${formatarMoeda(saldoFim)}</strong>
      <small>Movimento ${livre ? 'no período' : 'no mês'} ${r.saldo >= 0 ? '+' : ''}${formatarMoeda(r.saldo)}</small>
    </div>
    ${f
      ? html`<div class="cartao-fatura">
          <div class="cartao-fatura-linha">
            <span>${livre ? 'Faturas que vencem no período' : `Fatura de ${nomeMes(mes, true)}`}${!livre && r.conta.dia_vencimento ? `, vence dia ${r.conta.dia_vencimento}` : ''}</span>
            <strong>${formatarMoeda(f.valor)}</strong>
          </div>
          ${f.limite
            ? html`<progress class="limite ${f.uso > 80 ? 'alto' : ''}" max="100" value="${f.uso.toFixed(1)}"></progress>
                <small>${f.uso.toFixed(0)}% do limite de ${formatarMoeda(f.limite)}</small>`
            : ''}
        </div>`
      : ''}`;
}

// ---------------------------------------------------------------------
// Início (modelo C): saudação, avisos do dia, órbita + cartões das contas,
// atalhos com números vivos, maiores gastos e próximos vencimentos.
// ---------------------------------------------------------------------
const CHAVE_FECHADOS = 'cf.avisosFechados';
function avisosFechados() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE_FECHADOS) || '[]'));
  } catch {
    return new Set();
  }
}
function fecharAviso(chave) {
  const s = avisosFechados();
  s.add(chave);
  try {
    localStorage.setItem(CHAVE_FECHADOS, JSON.stringify([...s].slice(-80)));
  } catch {
    /* sem storage */
  }
}

function saudacao() {
  const h = new Date().getHours();
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function dataPorExtenso(d = new Date()) {
  const t = `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES_NOME[d.getMonth()]}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const horaAgora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function blocoAvisos(avisos) {
  if (!avisos.length) return '';
  return html`<div class="avisos-dia">${avisos.map(
    (a) => html`<aside class="aviso-dia aviso-${a.tipo} hud-${a.cor || (a.tipo === 'feriado' ? 'ciano' : 'amarelo')}" data-aviso="${a.chave}">
      <span class="aviso-ico" aria-hidden="true">${icone(a.tipo === 'campanha' ? 'ui-meta' : a.tipo === 'feriado' ? 'ui-relogio' : 'ui-sino')}</span>
      <div><strong>${a.titulo}</strong><p>${a.texto}</p>${a.acao ? html`<button class="btn btn-primario btn-pequeno" data-acao="${a.acao.id}">${a.acao.texto}</button>` : ''}</div>
      <button class="btn-icone" data-fechar-aviso="${a.chave}" aria-label="Fechar aviso ${a.titulo}">✕</button>
    </aside>`,
  )}</div>`;
}

function atalho({ href, ico, cor, titulo, texto, contador = '' }) {
  return html`<a class="atalho cor-${cor}" href="${href}">
    <span class="atalho-topo"><span class="atalho-ico">${icone(ico)}</span>${contador ? html`<span class="atalho-contador">${contador}</span>` : ''}</span>
    <strong>${titulo}</strong><small>${texto}</small>
  </a>`;
}

function diaMes(iso) {
  return html`<span class="venc-data"><b>${iso.slice(8, 10)}</b>${MESES_NOME[Number(iso.slice(5, 7)) - 1].slice(0, 3)}</span>`;
}

export default {
  titulo: 'Resumo',
  usaMes: true,
  async montar(el) {
    const mes = estado.mes;
    const { inicio, fim, livre } = intervaloAtual();
    const dias = Math.round((Date.parse(fim) - Date.parse(inicio)) / 86400000) + 1;
    const anterior = livre
      ? { inicio: somarDias(inicio, -dias), fim: somarDias(inicio, -1) }
      : limitesMes(deslocarMes(mes, -1));
    const [comFaturas, doAnterior, futuros, saldosFim, metas, importacoes] = await Promise.all([
      // ~2 meses antes do início para incluir compras no crédito que vencem dentro do período
      api.lancamentosEntreDatas(somarDias(inicio, -62), fim),
      api.lancamentosEntreDatas(anterior.inicio, anterior.fim),
      api.listarFuturos(),
      api.saldoContasEm(fim),
      api.listarMetas().catch(() => []),
      api.listarImportacoes().catch(() => []),
    ]);
    const visao = lerVisao();
    const inicioMesFim = `${fim.slice(0, 7)}-01`;
    const faturasAbertas = comFaturas
      .filter((l) => l.forma_pagamento === 'Crédito' && l.data <= fim && l.fatura_mes && l.fatura_mes > inicioMesFim)
      .reduce((s, l) => s + (l.tipo === 'SAIDA' ? 1 : -1) * Number(l.valor), 0);

    const ignorar = categoriasForaDosGastos();
    const realizados = comFaturas.filter((l) => l.data >= inicio && l.data <= fim);
    const t = totais(realizados, ignorar);
    const tAnt = totais(doAnterior, ignorar);
    const pendentes = realizados.filter((l) => !l.categoria_id).length;

    const contas = estado.contas.filter((c) => c.ativo && c.mostrar_resumo);
    const porConta = resumoPorConta(contas, comFaturas, { inicio, fim });
    const grupos = agruparPorCategoriaMae(porCategoria(realizados, 'SAIDA', ignorar), categoriaPorId);

    const hoje = hojeISO();
    const vencidos = futuros.filter((l) => l.data < hoje);
    const em7 = futuros.filter((l) => l.data >= hoje && l.data <= somarDias(hoje, 7));
    const proximos = futuros.filter((l) => l.data <= somarDias(hoje, 15)).slice(0, 6);
    const ultimaImp = importacoes[0]?.criado_em?.slice(0, 10);
    const diasImp = ultimaImp ? Math.round((Date.parse(hoje) - Date.parse(ultimaImp)) / 86400000) : null;
    let iaPronta = false;
    try {
      iaPronta = Boolean(sessionStorage.getItem(`cf.ia.diag.${mes}`));
    } catch {
      /* sem storage */
    }

    const ap = lerAparencia();
    const fechados = avisosFechados();
    const avisos = ap.campanhas ? avisosDoDia(hoje).filter((a) => !fechados.has(a.chave)).slice(0, 2) : [];
    if (sugerirInstalacao() && !fechados.has('instalar-app')) {
      avisos.unshift({
        chave: 'instalar-app', tipo: 'app', cor: 'ciano', titulo: 'Instale o app no celular',
        texto: 'Abre em tela cheia direto do ícone, como um aplicativo.', acao: { id: 'instalar', texto: 'Instalar' },
      });
    }

    let avisoVazio = '';
    if (!realizados.length && !livre) {
      const ultimo = await api.ultimoMesComDados().catch(() => null);
      if (ultimo && ultimo !== mes) {
        avisoVazio = html`<div class="faixa-info">
          <span>Nenhum lançamento em ${nomeMes(mes)}. Seus dados mais recentes são de ${nomeMes(ultimo)}.</span>
          <button class="btn btn-primario btn-pequeno" data-ir-mes="${ultimo}">Ver ${nomeMes(ultimo)}</button>
        </div>`;
      }
    }

    const primeiroNome = (estado.perfil?.nome || '').trim().split(/\s+/)[0];
    const periodoTxt = livre ? 'no período' : 'no mês';

    renderizar(
      el,
      html`
        <header class="inicio-cabecalho">
          <div>
            <h2 class="inicio-saudacao">${saudacao()}${primeiroNome ? `, ${primeiroNome}` : ''}</h2>
            <p class="inicio-data">${dataPorExtenso()} <span class="inicio-hora" id="inicio-hora">${horaAgora()}</span></p>
          </div>
          <div class="inicio-acoes">
            <a class="btn btn-secundario" href="#/importar"><svg aria-hidden="true"><use href="#i-importar" /></svg>Importar extrato</a>
            <button class="btn btn-primario" data-acao="novo"><svg aria-hidden="true"><use href="#i-mais" /></svg>Novo lançamento</button>
          </div>
        </header>
        ${blocoAvisos(avisos)}
        ${barraPeriodo()}
        ${avisoVazio}

        <div class="inicio-topo">
          <div class="inicio-heroi">
            <fieldset class="opcoes-pilula seletor-visao" aria-label="Visão do saldo">
              <label><input type="radio" name="visao" value="fluxo" ${visao === 'fluxo' ? 'checked' : ''} /><span>Fluxo do ${livre ? 'período' : 'mês'}</span></label>
              <label><input type="radio" name="visao" value="patrimonio" ${visao === 'patrimonio' ? 'checked' : ''} /><span>Patrimônio</span></label>
            </fieldset>
            ${visao === 'fluxo'
              ? orbita(t, tAnt, livre ? 'o período anterior' : nomeMes(deslocarMes(mes, -1), true), livre)
              : patrimonio(estado.contas.filter((c) => c.ativo), saldosFim, faturasAbertas, fim)}
          </div>
          <section class="inicio-contas">
            <div class="secao-titulo"><h3>Minhas contas</h3><a class="btn-link" href="#/contas">Gerenciar</a></div>
            ${porConta.length
              ? html`<div class="carteira" data-carteira>${porConta.map((r) => cartaoConta(r.conta, conteudoCartao(r, { mes, fim, livre }, saldosFim.get(r.conta.id) ?? 0)))}</div>
                  <button class="carteira-alca" data-carteira-alca aria-expanded="false"><i aria-hidden="true"></i><span>Ver os cartões</span></button>`
              : estadoVazio('Nenhuma conta aparece no resumo ainda.', html`<a class="btn btn-secundario" href="#/contas">Cadastrar conta</a>`)}
          </section>
          <section class="inicio-atalhos">
          <div class="secao-titulo"><h3>Atalhos</h3></div>
          <nav class="atalhos" aria-label="Atalhos">
            ${atalho({ href: '#/lancamentos', ico: 'ui-cartao', cor: 'azul', titulo: 'Lançamentos', texto: `${realizados.length} ${periodoTxt}` })}
            ${atalho({
              href: '#/futuros', ico: 'ui-relogio', cor: 'amarelo', titulo: 'Futuros',
              texto: em7.length ? `${plural(em7.length, 'vence', 'vencem')} em 7 dias` : 'nada nos próximos 7 dias',
              contador: vencidos.length ? plural(vencidos.length, 'vencido', 'vencidos') : '',
            })}
            ${atalho({ href: '#/importar', ico: 'cat-transferencia', cor: 'ciano', titulo: 'Importar extrato', texto: diasImp === null ? 'nenhuma importação ainda' : diasImp === 0 ? 'última hoje' : `última há ${plural(diasImp, 'dia', 'dias')}` })}
            ${atalho({ href: '#/relatorios', ico: 'cat-investimento', cor: 'violeta', titulo: 'Relatórios', texto: 'categorias, saldos e meses' })}
            ${atalho({ href: '#/analise', ico: 'ui-meta', cor: 'verde', titulo: 'Análise e metas', texto: metas.length ? plural(metas.length, 'meta ativa', 'metas ativas') : 'crie sua primeira meta' })}
            ${atalho({ href: '#/analise', ico: 'ui-ia', cor: 'rosa', titulo: 'Diagnóstico IA', texto: iaPronta ? 'pronto para ouvir' : `gerar para ${nomeMes(mes, true)}` })}
          </nav>
          </section>
        </div>

        ${pendentes
          ? html`<a class="faixa-alerta" href="#/lancamentos">${pendentes === 1 ? '1 lançamento está' : `${pendentes} lançamentos estão`} sem categoria ${livre ? 'neste período' : 'neste mês'}. Classificar agora</a>`
          : ''}


        <div class="inicio-listas">
          <section class="painel">
            <div class="secao-titulo"><h3>Maiores gastos ${livre ? 'do período' : 'do mês'}</h3><a class="btn-link" href="#/relatorios">Ver relatório</a></div>
            ${grupos.length
              ? html`<ul class="barras">${grupos.slice(0, 6).map(
                  (g) => html`<li>
                    <button class="barra-clicavel" data-detalhe="${g.nome ?? ''}" aria-label="Detalhar ${g.nome || 'sem categoria'}">
                      <div class="barra-rotulo">${chipCategoria(g.categoria, { completo: false })}
                        <span class="barra-valor"><strong>${formatarMoeda(g.valor)}</strong><small>${g.percentual.toFixed(0)}%</small></span>
                      </div>
                      <progress class="cor-${g.categoria?.cor || 'cinza'}" max="100" value="${g.percentual.toFixed(1)}">${g.percentual.toFixed(0)}%</progress>
                    </button>
                  </li>`,
                )}</ul>
                <p class="dica">Toque numa categoria para ver as subcategorias e os lançamentos.</p>`
              : estadoVazio(`Sem gastos registrados ${periodoTxt}.`)}
          </section>
          <section class="painel">
            <div class="secao-titulo"><h3>Próximos vencimentos</h3><a class="btn-link" href="#/futuros">Ver todos</a></div>
            ${proximos.length
              ? html`<ul class="vencimentos">${proximos.map((l) => html`<li class="${l.data < hoje ? 'atrasado' : ''}">
                  ${diaMes(l.data)}
                  <span class="venc-desc">${l.descricao}
                    <small>${contaPorId(l.conta_id)?.nome || ''}${l.data < hoje ? ', vencido' : l.serie_tipo === 'FIXA' ? ', fixa' : l.serie_tipo === 'PARCELA' ? ', parcela' : ''}</small></span>
                  <strong class="${l.tipo === 'ENTRADA' ? 'positivo' : 'negativo'}">${l.tipo === 'SAIDA' ? '−' : '+'}${formatarMoeda(l.valor)}</strong>
                  <button class="btn btn-secundario btn-pequeno" data-pagar="${l.id}">${l.tipo === 'SAIDA' ? 'Paguei' : 'Recebi'}</button>
                </li>`)}</ul>`
              : estadoVazio('Nada previsto para os próximos 15 dias.', html`<a class="btn btn-secundario" href="#/futuros">Cadastrar futuro</a>`)}
          </section>
        </div>`,
    );

    // relógio do cabeçalho (para sozinho quando a tela sai)
    const relogio = setInterval(() => {
      const h = $('#inicio-hora', el);
      if (!h || !el.isConnected) return clearInterval(relogio);
      h.textContent = horaAgora();
    }, 15000);

    ligarBarraPeriodo(el);
    ligarCarteira(el);

    el.addEventListener('change', (e) => {
      if (e.target.name !== 'visao') return;
      salvarVisao(e.target.value);
      window.dispatchEvent(new Event('hashchange'));
    });

    el.addEventListener('click', (e) => {
      const fechar = e.target.closest('[data-fechar-aviso]');
      if (fechar) {
        fecharAviso(fechar.dataset.fecharAviso);
        fechar.closest('[data-aviso]').remove();
        return;
      }
      if (e.target.closest('[data-acao=instalar]')) {
        instalarApp().then((r) => r === 'instalado' && e.target.closest('[data-aviso]')?.remove());
        return;
      }
      if (e.target.closest('[data-acao=novo]')) {
        return abrirFormLancamento({ status: 'REALIZADO', aoSalvar: () => window.dispatchEvent(new Event('hashchange')) });
      }
      const pagar = e.target.closest('[data-pagar]');
      if (pagar) {
        const l = futuros.find((x) => x.id === pagar.dataset.pagar);
        if (l) confirmarPagamento(l, async () => window.dispatchEvent(new Event('hashchange')));
        return;
      }
      const ir = e.target.closest('[data-ir-mes]');
      if (ir) return definirMes(ir.dataset.irMes);
      const det = e.target.closest('[data-detalhe]');
      if (det) {
        abrirDetalheCategoria({
          nome: det.dataset.detalhe || null,
          tipo: 'SAIDA',
          lancamentos: realizados,
          periodo: livre ? `${formatarData(inicio)} a ${formatarData(fim)}` : nomeMes(mes),
        });
      }
    });
  },
};
