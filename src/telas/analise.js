// Análise financeira, desempenho e metas: comparativos mês a mês (categoria e meio de
// pagamento), alertas que isolam os custos fixos, simulador de metas, orçamento 50/30/20
// e diagnóstico com IA (Gemini).

import * as api from '../servicos/api.js';
import { html, renderizar } from '../lib/html.js';
import { formatarMoeda, parseValor } from '../lib/formatos.js';
import { deslocarMes, nomeMes } from '../lib/meses.js';
import { variacao } from '../lib/calculos.js';
import {
  MEIOS, ehFixa, gerarAlertas, mesesAnteriores, orcamento503020, separarGastos, seriePorGrupo, seriePorMeio, simularMeta,
} from '../lib/analise.js';
import { icone } from '../assets/icons/index.js';
import { estado, categoriaPorId, categoriasForaDosGastos } from '../estado.js';
import { $, $$, abrirModal, avisar, avisarErro, chipCategoria, comCarregando, confirmar, estadoVazio } from '../ui/componentes.js';
import { abrirDetalheCategoria } from '../ui/detalheCategoria.js';
import { ErroIA, gerarDiagnostico, iaConfigurada, montarPayloadIA, usoIA, configIA } from '../servicos/ia.js';
import { configVoz, criarNarrador, dividirFrases, roteiroDoDiagnostico, vozDisponivel } from '../servicos/voz.js';

const MESES_JANELA = 6;
let guiaAtiva = 'comparativo';
const pct = (v) => `${v >= 0 ? '' : '−'}${Math.abs(v).toFixed(0)}%`;
const sinal = (v) => (v === null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(0)}%`);

// ---------------------------------------------------------------------
// Comparativos
// ---------------------------------------------------------------------
function graficoMeios(serie) {
  const { meios, porMes } = serie;
  if (!meios.length) return estadoVazio('Sem gastos no período.');
  const max = Math.max(...porMes.map((m) => m.total), 1);
  const ALT = 26;
  const ESP = 12;
  const ROT = 62;
  const LARG = 560;
  const util = LARG - ROT - 8;
  const altura = porMes.length * (ALT + ESP);
  return html`<figure class="grafico-meios">
    <ul class="legenda-meios">${meios.map((m) => html`<li><i class="marca-seg seg-${MEIOS.indexOf(m)}" aria-hidden="true"></i>${m}</li>`)}</ul>
    <svg viewBox="0 0 ${LARG} ${altura}" class="svg-meios" role="img" aria-label="Gastos por meio de pagamento, mês a mês">
      ${porMes.map((linha, i) => {
        const y = i * (ALT + ESP);
        let x = ROT;
        return html`<g>
          <text x="0" y="${y + ALT / 2 + 4}" class="rot-mes">${nomeMes(linha.mes, true)}</text>
          ${meios.map((m) => {
            const v = linha.valores[m];
            if (!v) return '';
            const w = Math.max(2, (v / max) * util - 2);
            const r = html`<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${ALT}" rx="4" class="seg-${MEIOS.indexOf(m)}">
              <title>${nomeMes(linha.mes)}: ${m} ${formatarMoeda(v)} (${((v / linha.total) * 100).toFixed(0)}%)</title>
            </rect>`;
            x += w + 2;
            return r;
          })}
        </g>`;
      })}
    </svg>
    <div class="tabela-rolagem"><table class="tabela tabela-compacta">
      <thead><tr><th>Mês</th>${meios.map((m) => html`<th class="num">${m}</th>`)}<th class="num">Total</th></tr></thead>
      <tbody>${porMes.map((l) => html`<tr><td>${nomeMes(l.mes, true)}</td>${meios.map((m) => html`<td class="num">${formatarMoeda(l.valores[m])}</td>`)}<td class="num"><strong>${formatarMoeda(l.total)}</strong></td></tr>`)}</tbody>
    </table></div>
  </figure>`;
}

function guiaComparativo(d) {
  const { meses, grupos, meios } = d;
  const ult = meses.length - 1;
  return html`<h3 class="titulo-guia">Gastos por categoria, mês a mês</h3>
    ${grupos.length
      ? html`<div class="tabela-rolagem"><table class="tabela tabela-meses">
          <thead><tr><th>Categoria</th>${meses.map((m) => html`<th class="num">${nomeMes(m, true)}</th>`)}<th class="num">vs média</th></tr></thead>
          <tbody>${grupos.slice(0, 14).map((g) => {
            const anteriores = g.meses.slice(0, ult);
            const media = anteriores.reduce((s, v) => s + v, 0) / Math.max(1, anteriores.length);
            const v = variacao(g.meses[ult], media);
            return html`<tr class="linha-clicavel" data-detalhe="${g.nome ?? ''}" tabindex="0">
              <td>${chipCategoria(g.categoria, { completo: false })}${g.fixa ? html` <span class="selo">fixa</span>` : ''}</td>
              ${g.meses.map((valor, i) => html`<td class="num ${i === ult ? 'col-atual' : ''}">${valor ? formatarMoeda(valor) : '—'}</td>`)}
              <td class="num ${v === null ? '' : v > 10 ? 'negativo' : v < -10 ? 'positivo' : ''}">${sinal(v)}</td>
            </tr>`;
          })}</tbody>
        </table></div>
        <p class="dica">Toque numa linha para ver subcategorias e lançamentos de ${nomeMes(meses[ult])}.</p>`
      : estadoVazio('Sem gastos no período.')}
    <h3 class="titulo-guia">Por meio de pagamento</h3>
    <p class="dica">Compras no crédito contam no mês da compra. Pagamento de fatura e transferências não entram, para não contar duas vezes.</p>
    ${graficoMeios(meios)}`;
}

// ---------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------
function guiaAlertas(d) {
  const { alertas, atual, mes } = d;
  return html`<div class="kpis kpis-3">
      <div class="kpi"><span>Custos fixos</span><strong>${formatarMoeda(atual.fixos)}</strong><small>aluguel, contas, assinaturas, parcelas</small></div>
      <div class="kpi"><span>Gastos variáveis</span><strong>${formatarMoeda(atual.variaveis)}</strong><small>onde está a margem de corte</small></div>
      <div class="kpi"><span>Receitas</span><strong class="positivo">${formatarMoeda(atual.entradas)}</strong><small>${nomeMes(mes)}</small></div>
    </div>
    ${alertas.length
      ? html`<ul class="lista-alertas">${alertas.map(
          (a) => html`<li class="alerta-card alerta-${a.nivel}">
            <span class="alerta-ico">${icone('ui-alerta')}</span>
            <div>
              <strong>${a.tipo === 'renda' ? 'Gastos variáveis acima de 50% da renda' : `${a.nome}: ${formatarMoeda(a.atual)} no mês`}</strong>
              <small>${a.tipo === 'renda'
                ? `${formatarMoeda(a.atual)} de ${formatarMoeda(a.media)} recebidos`
                : `Média dos meses anteriores ${formatarMoeda(a.media)}, ${formatarMoeda(a.excesso)} acima (${sinal(variacao(a.atual, a.media))})`}</small>
              <p>${a.dica}</p>
            </div>
            <span class="selo ${a.nivel === 'alto' ? 'selo-alerta' : ''}">${a.nivel === 'alto' ? 'atenção' : 'observar'}</span>
          </li>`,
        )}</ul>`
      : estadoVazio('Nenhum desvio relevante neste mês. Os gastos variáveis estão dentro da sua média.')}
    <p class="legenda">Os alertas comparam cada categoria variável com a média dos 3 meses anteriores (acima de 20% e de R$ 50).
      Custos fixos são avaliados à parte, para que um reajuste de aluguel não esconda um excesso no delivery.
      Marque o que é fixo em Configurações › Categorias.</p>`;
}

// ---------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------
function resultadoSimulacao(r) {
  if (!r) return '';
  return html`<div class="simulacao">
    <div class="kpis kpis-3">
      <div class="kpi"><span>Guardar por mês</span><strong>${formatarMoeda(r.necessarioMes)}</strong>
        <small>${r.taxaNecessaria === null ? 'sem receitas na média' : `${r.taxaNecessaria.toFixed(0)}% da sua renda média`}</small></div>
      <div class="kpi"><span>Sobra média hoje</span><strong class="${r.capacidadeMes >= 0 ? 'positivo' : 'negativo'}">${formatarMoeda(r.capacidadeMes)}</strong><small>receitas menos despesas</small></div>
      <div class="kpi"><span>Situação</span><strong class="${r.viavel ? 'positivo' : r.viavelComCortes ? '' : 'negativo'}">${r.viavel ? 'No ritmo' : r.viavelComCortes ? 'Possível com cortes' : 'Prazo apertado'}</strong>
        <small>${r.viavel ? 'a sobra atual já cobre a meta' : `faltam ${formatarMoeda(r.necessarioMes - Math.max(0, r.capacidadeMes))} por mês`}</small></div>
    </div>
    ${!r.viavel && r.cortes.length
      ? html`<h4>Onde cortar para chegar lá</h4>
          <ul class="lista-cortes">${r.cortes.map((c) => html`<li>
            ${chipCategoria(c.categoria, { completo: false })}
            <span>média ${formatarMoeda(c.media)}/mês</span>
            <strong>−${formatarMoeda(c.corte)} (${pct(c.pct)})</strong>
          </li>`)}</ul>
          ${r.faltaAposCortes > 0 ? html`<p class="dica">Mesmo com esses cortes faltariam ${formatarMoeda(r.faltaAposCortes)} por mês: aumente o prazo ou busque uma renda extra.</p>` : ''}`
      : ''}
  </div>`;
}

function guiaMetas(d) {
  const { metas, base } = d;
  return html`<div class="metas-topo">
      <p class="dica">Base de cálculo: média de ${base.rotulo}, receitas ${formatarMoeda(base.entradas)} e despesas ${formatarMoeda(base.saidas)} por mês.</p>
      <button class="btn btn-primario" data-acao="nova-meta">Nova meta</button>
    </div>
    ${metas.length
      ? html`<div class="grade-metas">${metas.map((m) => {
          const r = simularMeta({ valorAlvo: m.valor_alvo, guardado: m.valor_guardado, prazoMeses: m.prazo_meses, mediaEntradas: base.entradas, mediaSaidas: base.saidas, variaveis: base.variaveis });
          const prog = Math.min(100, (Number(m.valor_guardado) / Number(m.valor_alvo)) * 100);
          return html`<article class="meta-card">
            <header>
              <span class="cartao-config-ico">${icone('ui-meta')}</span>
              <div><strong>${m.nome}</strong><small>${formatarMoeda(m.valor_alvo)} em ${m.prazo_meses} meses</small></div>
              <span class="acoes">
                <button class="btn-icone" data-acao="editar-meta" data-id="${m.id}" aria-label="Editar ${m.nome}">✎</button>
                <button class="btn-icone" data-acao="excluir-meta" data-id="${m.id}" aria-label="Excluir ${m.nome}">✕</button>
              </span>
            </header>
            <progress class="limite" max="100" value="${prog.toFixed(1)}"></progress>
            <small>${formatarMoeda(m.valor_guardado)} guardados (${prog.toFixed(0)}%)</small>
            ${resultadoSimulacao(r)}
          </article>`;
        })}</div>`
      : estadoVazio('Crie uma meta (reserva de emergência, viagem, entrada de um imóvel) para ver quanto guardar por mês e onde cortar.')}`;
}

function abrirFormMeta(meta, d, aoSalvar) {
  const m = meta || { nome: '', valor_alvo: '', valor_guardado: 0, prazo_meses: 12 };
  const reserva = Math.round(d.base.fixos * 6);
  abrirModal({
    titulo: meta ? 'Editar meta' : 'Nova meta',
    textoOk: 'Salvar meta',
    corpo: html`<div class="grade-form">
      <label class="campo-largo">Objetivo <input name="nome" required maxlength="80" value="${m.nome}" placeholder="Ex.: Reserva de emergência" /></label>
      <label>Valor desejado (R$) <input name="valor_alvo" inputmode="decimal" required maxlength="16" value="${m.valor_alvo ? String(m.valor_alvo).replace('.', ',') : ''}" /></label>
      <label>Prazo (meses) <input name="prazo_meses" inputmode="numeric" pattern="[0-9]*" required maxlength="3" value="${m.prazo_meses}" /></label>
      <label>Já guardado (R$) <input name="valor_guardado" inputmode="decimal" maxlength="16" value="${String(m.valor_guardado || 0).replace('.', ',')}" /></label>
      ${!meta && reserva > 0
        ? html`<p class="campo-largo dica">Sugestão: uma reserva de emergência de 6 meses dos seus custos fixos seria ${formatarMoeda(reserva)}.
            <button type="button" class="btn-link" data-reserva="${reserva}">Usar este valor</button></p>`
        : ''}
      <div class="campo-largo area-simulacao"></div>
    </div>`,
    aoMontar(form) {
      const simular = () => {
        const alvo = parseValor($('[name=valor_alvo]', form).value);
        const prazo = Number($('[name=prazo_meses]', form).value);
        const guardado = parseValor($('[name=valor_guardado]', form).value) || 0;
        renderizar(
          $('.area-simulacao', form),
          alvo > 0 && prazo > 0
            ? resultadoSimulacao(simularMeta({ valorAlvo: alvo, guardado, prazoMeses: prazo, mediaEntradas: d.base.entradas, mediaSaidas: d.base.saidas, variaveis: d.base.variaveis }))
            : html`<p class="dica">Preencha valor e prazo para simular.</p>`,
        );
      };
      form.addEventListener('input', simular);
      form.addEventListener('click', (e) => {
        const b = e.target.closest('[data-reserva]');
        if (!b) return;
        $('[name=nome]', form).value ||= 'Reserva de emergência';
        $('[name=valor_alvo]', form).value = String(b.dataset.reserva).replace('.', ',');
        simular();
      });
      simular();
    },
    async aoEnviar(f) {
      const valor_alvo = parseValor(f.valor_alvo);
      const prazo_meses = Number(f.prazo_meses);
      const valor_guardado = parseValor(f.valor_guardado || '0') || 0;
      if (!(valor_alvo > 0) || !(prazo_meses >= 1 && prazo_meses <= 600) || valor_guardado < 0) {
        avisar('Confira o valor e o prazo (1 a 600 meses).', 'erro');
        return false;
      }
      await api.salvarMeta({ id: meta?.id, nome: f.nome.trim(), valor_alvo, prazo_meses, valor_guardado });
      avisar('Meta salva.');
      await aoSalvar();
    },
  });
}

// ---------------------------------------------------------------------
// Orçamento e educação financeira
// ---------------------------------------------------------------------
function barraOrcamento(rotulo, real, ideal, inverter) {
  const bom = inverter ? real >= ideal : real <= ideal;
  return html`<li class="orc-linha">
    <div class="barra-rotulo"><span>${rotulo}</span>
      <span class="barra-valor"><strong class="${bom ? 'positivo' : 'negativo'}">${real.toFixed(0)}%</strong><small>referência ${ideal}%</small></span>
    </div>
    <progress class="${bom ? 'cor-verde' : 'cor-vermelho'}" max="100" value="${Math.max(0, Math.min(100, real)).toFixed(1)}"></progress>
  </li>`;
}

function guiaOrcamento(d) {
  const o = orcamento503020({ entradas: d.base.entradas, fixos: d.base.fixos, variaveis: d.base.variaveisTotal });
  const reserva = d.base.fixos * 6;
  return html`<h3 class="titulo-guia">Regra 50/30/20 com a sua média</h3>
    ${o
      ? html`<ul class="barras">
          ${barraOrcamento('Necessidades (custos fixos)', o.necessidades, 50)}
          ${barraOrcamento('Desejos (gastos variáveis)', o.desejos, 30)}
          ${barraOrcamento('Poupança e investimentos (sobra)', o.poupanca, 20, true)}
        </ul>
        <p class="legenda">50% da renda para o essencial, 30% para o estilo de vida e 20% para o futuro. É um ponto de partida, não uma lei:
          ajuste à sua realidade, mas tente manter a parte do futuro acima de zero todo mês.</p>`
      : estadoVazio('Sem receitas no período para calcular o orçamento.')}
    <div class="grade-dicas">
      <article class="painel dica-card">
        <h4>Reserva de emergência</h4>
        <p>O primeiro objetivo: de 3 a 6 meses dos seus custos fixos${reserva > 0 ? html`, ou seja, entre <strong>${formatarMoeda(d.base.fixos * 3)}</strong> e <strong>${formatarMoeda(reserva)}</strong>` : ''}.
          Guarde em aplicação de baixo risco e resgate imediato.</p>
      </article>
      <article class="painel dica-card">
        <h4>Investimentos básicos</h4>
        <p>Para a reserva: Tesouro Selic ou CDB com liquidez diária que pague perto de 100% do CDI, protegidos pelo FGC no caso do CDB.
          Para prazos mais longos, LCI/LCA e Tesouro IPCA+. Compare taxas e prazos antes de aplicar.</p>
      </article>
      <article class="painel dica-card">
        <h4>Renda extra</h4>
        <p>Venda o que não usa, ofereça um serviço que já domina (aulas, design, manutenção, revisão de textos), faça freelas pontuais
          e direcione 100% desse dinheiro para a meta, para não virar mais consumo.</p>
      </article>
      <article class="painel dica-card">
        <h4>Hábitos que mais ajudam</h4>
        <p>Pague-se primeiro: transfira o valor da meta assim que o salário cair. Revise assinaturas a cada 3 meses.
          Evite parcelar o dia a dia: parcelas tornam gastos variáveis em fixos.</p>
      </article>
    </div>
    <p class="legenda">Conteúdo educativo, não é recomendação de investimento.</p>`;
}

// ---------------------------------------------------------------------
// IA
// ---------------------------------------------------------------------
const chaveCacheIA = (mes) => `cf.ia.diag.${mes}`;

function lerCacheIA(mes) {
  try {
    return JSON.parse(sessionStorage.getItem(chaveCacheIA(mes)) || 'null');
  } catch {
    return null;
  }
}

// ---- narração em voz alta ----
let narrador = null;
let ouvindoSaida = false;
function pararNarrador() {
  narrador?.parar();
  narrador = null;
}

function playerVoz(r) {
  const cv = configVoz();
  const frases = dividirFrases(roteiroDoDiagnostico(r));
  const minutos = Math.max(1, Math.round(frases.join(' ').split(' ').length / 150));
  return html`<div class="narrador" id="narrador">
      <span class="narrador-orbe" id="narrador-orbe" aria-hidden="true"><i></i><i></i><i></i></span>
      <div class="narrador-info">
        <strong>${cv.estilo === 'assistente' ? `Ouvir ${cv.assistente}` : 'Ouvir o diagnóstico'}</strong>
        <small id="narrador-estado">${cv.motor === 'gemini' ? `voz neural ${cv.vozGemini}` : 'voz do navegador'}, cerca de ${minutos} min</small>
      </div>
      <div class="narrador-botoes">
        <button class="btn btn-primario btn-pequeno" data-acao="voz-ouvir">Ouvir</button>
        <button class="btn btn-secundario btn-pequeno" data-acao="voz-pausar" hidden>Pausar</button>
        <button class="btn btn-secundario btn-pequeno" data-acao="voz-parar" hidden>Parar</button>
      </div>
    </div>
    <div class="narrador-transcricao" id="narrador-transcricao" hidden>
      <p class="narrador-legenda" id="narrador-legenda"></p>
      <details><summary>Transcrição completa</summary>
        <ol class="narrador-frases">${frases.map((f, i) => html`<li data-frase="${i}">${f}</li>`)}</ol>
      </details>
    </div>`;
}

function iniciarNarrador(el, r) {
  pararNarrador();
  if (!ouvindoSaida) {
    ouvindoSaida = true;
    window.addEventListener('hashchange', pararNarrador);
  }
  const orbe = $('#narrador-orbe', el);
  const legenda = $('#narrador-legenda', el);
  const rotulo = $("#narrador-estado", el);
  const botoes = (tocando) => {
    $('[data-acao=voz-ouvir]', el).hidden = tocando;
    $('[data-acao=voz-pausar]', el).hidden = !tocando;
    $('[data-acao=voz-parar]', el).hidden = !tocando;
    $('#narrador', el).classList.toggle('falando', tocando);
  };
  $('#narrador-transcricao', el).hidden = false;
  botoes(true);
  const cv = configVoz();
  const quem = cv.estilo === 'assistente' ? cv.assistente : null;
  rotulo.textContent = quem ? `${quem} está preparando a análise em voz…` : 'Preparando a voz…';
  const n = criarNarrador(roteiroDoDiagnostico(r), {
    aoMotor: (m) => (rotulo.textContent = quem ? `${quem} está falando` : m === 'gemini' ? `Falando com a voz neural ${cv.vozGemini}` : 'Falando com a voz do navegador'),
    aoAviso: (msg) => avisar(msg, 'erro'),
    aoFrase: (i) => {
      legenda.textContent = n.frases[i] || '';
      $$('[data-frase]', el).forEach((li) => li.classList.toggle('atual', Number(li.dataset.frase) === i));
    },
    aoNivel: (v) => orbe.style.setProperty('--nivel', v.toFixed(2)),
    aoFim: () => {
      botoes(false);
      rotulo.textContent = 'Narração concluída. Toque em Ouvir para repetir.';
      narrador = null;
    },
  });
  narrador = n;
  n.iniciar().catch((e) => {
    botoes(false);
    rotulo.textContent = e.message;
  });
}

function resultadoIA(r) {
  return html`<div class="diag-ia">
    ${vozDisponivel() ? playerVoz(r) : ''}
    <p class="diag-resumo">${r.resumo}</p>
    ${r.pontos_fortes.length ? html`<h4>Pontos fortes</h4><ul>${r.pontos_fortes.map((t) => html`<li>${t}</li>`)}</ul>` : ''}
    ${r.pontos_de_atencao.length ? html`<h4>Pontos de atenção</h4><ul>${r.pontos_de_atencao.map((t) => html`<li>${t}</li>`)}</ul>` : ''}
    ${r.estrategias.length
      ? html`<h4>Estratégias de economia</h4>
          <ul class="lista-estrategias">${r.estrategias.map((e) => html`<li>
            <strong>${e.titulo}</strong>${e.economia ? html`<span class="selo selo-ok">≈ ${formatarMoeda(e.economia)}/mês</span>` : ''}
            <p>${e.acao}</p>
          </li>`)}</ul>`
      : ''}
    ${r.metas.length ? html`<h4>Sobre as suas metas</h4><ul>${r.metas.map((t) => html`<li>${t}</li>`)}</ul>` : ''}
    <p class="legenda">Gerado por IA a partir de números agregados. Pode conter imprecisões; confira antes de decidir.</p>
  </div>`;
}

function guiaIA(d) {
  if (!iaConfigurada()) {
    return estadoVazio(
      'Cadastre sua chave gratuita do Google Gemini para receber um diagnóstico personalizado do mês.',
      html`<a class="btn btn-primario" href="#/configuracoes">Ir para Configurações</a>`,
    );
  }
  const cache = lerCacheIA(d.mes);
  const u = usoIA();
  const c = configIA();
  return html`<div class="ia-topo">
      <p class="dica">Modelo ${c.modelo}. Usadas hoje: ${u.hoje} de ${c.porDia}.</p>
      <button class="btn btn-primario" data-acao="gerar-ia">${cache ? 'Gerar novamente' : `Gerar diagnóstico de ${nomeMes(d.mes)}`}</button>
    </div>
    <details class="dados-enviados"><summary>Ver exatamente o que será enviado</summary><pre>${JSON.stringify(d.payload, null, 2)}</pre></details>
    <div id="area-ia">${cache ? resultadoIA(cache) : ''}</div>`;
}

// ---------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------
export default {
  titulo: 'Análise e metas',
  usaMes: true,
  async montar(el) {
    const mes = estado.mes;
    const meses = Array.from({ length: MESES_JANELA }, (_, i) => deslocarMes(mes, i - MESES_JANELA + 1));
    const [lancamentos, metas] = await Promise.all([api.lancamentosPeriodo(meses[0], mes), api.listarMetas()]);

    const ignorar = categoriasForaDosGastos();
    const fixa = (l) => ehFixa(l, categoriaPorId);
    const grupos = seriePorGrupo(lancamentos, meses, ignorar, categoriaPorId, fixa);
    const doMes = lancamentos.filter((l) => l.data.startsWith(mes));
    const atual = separarGastos(doMes, ignorar, fixa);

    // base das médias: meses anteriores com dados (até 3); sem histórico, o próprio mês
    let mesesBase = mesesAnteriores(mes, 3).filter((m) => lancamentos.some((l) => l.data.startsWith(m)));
    if (!mesesBase.length) mesesBase = [mes];
    const daBase = lancamentos.filter((l) => mesesBase.some((m) => l.data.startsWith(m)));
    const somaBase = separarGastos(daBase, ignorar, fixa);
    const n = mesesBase.length;
    const base = {
      rotulo: n === 1 ? nomeMes(mesesBase[0]) : `${n} meses (${nomeMes(mesesBase[0], true)} a ${nomeMes(mesesBase.at(-1), true)})`,
      entradas: somaBase.entradas / n,
      saidas: somaBase.saidas / n,
      fixos: somaBase.fixos / n,
      variaveis: seriePorGrupo(daBase, mesesBase, ignorar, categoriaPorId, fixa)
        .filter((g) => !g.fixa && g.nome)
        .map((g) => ({ nome: g.nome, categoria: g.categoria, media: g.total / n })),
    };
    base.variaveisTotal = somaBase.variaveis / n;

    const d = {
      mes, meses, lancamentos, grupos, atual, metas,
      meios: seriePorMeio(lancamentos, meses, ignorar),
      alertas: gerarAlertas({ lancamentos, mes, ignorar, categoriaPorId, fixa }),
      base,
    };
    d.payload = montarPayloadIA({
      mes,
      mesAtual: atual,
      media3m: { entradas: base.entradas, fixos: base.fixos, variaveis: base.variaveisTotal },
      grupos,
      meios: d.meios,
      metas,
      alertas: d.alertas,
    });

    const guias = {
      comparativo: { ico: 'i-grafico', titulo: 'Comparativo mensal', resumo: `${MESES_JANELA} meses`, conteudo: () => guiaComparativo(d) },
      alertas: { ico: 'i-alvo', contador: d.alertas.length, alerta: d.alertas.length > 0, titulo: 'Alertas inteligentes', resumo: d.alertas.length ? `${d.alertas.length} alerta(s)` : 'tudo em ordem', conteudo: () => guiaAlertas(d) },
      metas: { ico: 'i-carteira', contador: metas.length, titulo: 'Metas de economia', resumo: metas.length ? `${metas.length} meta(s)` : 'crie a primeira', conteudo: () => guiaMetas(d) },
      orcamento: { ico: 'i-etiqueta', titulo: 'Orçamento e dicas', resumo: 'regra 50/30/20', conteudo: () => guiaOrcamento({ base: d.base }) },
      ia: { ico: 'i-ia', titulo: 'Diagnóstico com IA', resumo: iaConfigurada() ? 'Gemini' : 'desligado', conteudo: () => guiaIA(d) },
    };

    renderizar(
      el,
      html`<div class="tela-topo"><h2>Análise de ${nomeMes(mes)}</h2><span class="dica">comparado aos ${MESES_JANELA - 1} meses anteriores</span></div>
        <div class="guias guias-pasta">
          <div class="guias-lista abas-pasta" role="tablist" aria-label="Análises" aria-orientation="horizontal">
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
    if (!guias[guiaAtiva]) guiaAtiva = 'comparativo';
    desenharGuia();

    const recarregar = () => window.dispatchEvent(new Event('hashchange'));
    const detalhar = (alvo) =>
      abrirDetalheCategoria({ nome: alvo.dataset.detalhe || null, tipo: 'SAIDA', lancamentos: doMes, periodo: nomeMes(mes) });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('[data-detalhe]')) return detalhar(e.target);
      if (!e.target.matches('[role=tab]') || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const ids = Object.keys(guias);
      const passo = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      guiaAtiva = ids[(ids.indexOf(guiaAtiva) + passo + ids.length) % ids.length];
      desenharGuia();
      $(`#guia-${guiaAtiva}`, el).focus();
    });

    el.addEventListener('click', async (e) => {
      const tab = e.target.closest('[role=tab]');
      if (tab) {
        guiaAtiva = tab.dataset.guia;
        return desenharGuia();
      }
      const det = e.target.closest('[data-detalhe]');
      if (det) return detalhar(det);
      const b = e.target.closest('[data-acao]');
      if (!b) return;
      const meta = metas.find((m) => m.id === b.dataset.id);
      try {
        switch (b.dataset.acao) {
          case 'nova-meta':
            return abrirFormMeta(null, d, recarregar);
          case 'editar-meta':
            return abrirFormMeta(meta, d, recarregar);
          case 'excluir-meta':
            if (meta && (await confirmar(`Excluir a meta "${meta.nome}"?`, { textoOk: 'Excluir' }))) {
              await api.excluirMeta(meta.id);
              avisar('Meta excluída.');
              recarregar();
            }
            return;
          case 'voz-ouvir': {
            const r = lerCacheIA(mes);
            if (r) iniciarNarrador(el, r);
            return;
          }
          case 'voz-pausar':
            if (!narrador) return;
            if (narrador.pausado) {
              narrador.continuar();
              b.textContent = 'Pausar';
            } else {
              narrador.pausar();
              b.textContent = 'Continuar';
            }
            return;
          case 'voz-parar': {
            pararNarrador();
            $('[data-acao=voz-ouvir]', el).hidden = false;
            $('[data-acao=voz-pausar]', el).hidden = true;
            b.hidden = true;
            $('#narrador', el).classList.remove('falando');
            $('#narrador-orbe', el).style.setProperty('--nivel', '0');
            return;
          }
          case 'gerar-ia':
            pararNarrador();
            return comCarregando(b, async () => {
              renderizar($('#area-ia', el), html`<div class="carregando-tela" aria-busy="true">Analisando suas finanças…</div>`);
              try {
                const cv = configVoz();
                const r = await gerarDiagnostico(d.payload, { assistente: cv.estilo === 'assistente' ? cv.assistente : null });
                try {
                  sessionStorage.setItem(chaveCacheIA(mes), JSON.stringify(r));
                } catch {
                  /* sem storage */
                }
                renderizar($('#area-ia', el), resultadoIA(r));
                if (configVoz().lerAuto && vozDisponivel()) iniciarNarrador(el, r);
              } catch (err) {
                renderizar($('#area-ia', el), html`<div class="faixa-alerta">${err instanceof ErroIA ? err.message : 'Não foi possível gerar o diagnóstico.'}</div>`);
                if (!(err instanceof ErroIA)) throw err;
              }
            });
        }
      } catch (err) {
        avisarErro(err);
      }
    });
  },
};
