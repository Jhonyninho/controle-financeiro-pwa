// Análise financeira: fixos x variáveis, comparativos mês a mês, alertas e metas.
// Funções puras (sem acesso a dados). Valores somados em centavos.

import { deslocarMes } from './meses.js';

const centavos = (v) => Math.round(Number(v) * 100);
const reais = (c) => c / 100;

/** Despesa fixa: marcação do lançamento, senão a da subcategoria. */
export function ehFixa(l, categoriaPorId) {
  if (l.tipo !== 'SAIDA') return false;
  if (l.despesa_fixa === true || l.despesa_fixa === false) return l.despesa_fixa;
  return Boolean(l.categoria_id && categoriaPorId(l.categoria_id)?.fixa);
}

/** Os n meses anteriores a `mes` (do mais antigo ao mais recente). */
export function mesesAnteriores(mes, n) {
  return Array.from({ length: n }, (_, i) => deslocarMes(mes, i - n));
}

const contaNoGasto = (l, ignorar) => !(l.categoria_id && ignorar.has(l.categoria_id));

/** Entradas, saídas fixas e saídas variáveis de uma lista. */
export function separarGastos(lancamentos, ignorar, fixa) {
  let e = 0;
  let f = 0;
  let v = 0;
  for (const l of lancamentos) {
    if (!contaNoGasto(l, ignorar)) continue;
    if (l.tipo === 'ENTRADA') e += centavos(l.valor);
    else if (fixa(l)) f += centavos(l.valor);
    else v += centavos(l.valor);
  }
  return { entradas: reais(e), fixos: reais(f), variaveis: reais(v), saidas: reais(f + v) };
}

/** Saídas por categoria-mãe, mês a mês. */
export function seriePorGrupo(lancamentos, meses, ignorar, categoriaPorId, fixa = () => false) {
  const idx = new Map(meses.map((m, i) => [m, i]));
  const grupos = new Map();
  for (const l of lancamentos) {
    if (l.tipo !== 'SAIDA' || !contaNoGasto(l, ignorar)) continue;
    const i = idx.get(l.data.slice(0, 7));
    if (i === undefined) continue;
    const cat = l.categoria_id ? categoriaPorId(l.categoria_id) : null;
    const nome = cat?.nome || null;
    if (!grupos.has(nome)) grupos.set(nome, { nome, categoria: cat, meses: meses.map(() => 0), fixo: 0, total: 0 });
    const g = grupos.get(nome);
    const c = centavos(l.valor);
    g.meses[i] += c;
    g.total += c;
    if (fixa(l)) g.fixo += c;
  }
  return [...grupos.values()]
    .map((g) => ({
      nome: g.nome,
      categoria: g.categoria,
      meses: g.meses.map(reais),
      total: reais(g.total),
      media: reais(Math.round(g.total / meses.length)),
      fixa: g.fixo * 2 > g.total, // mais da metade do gasto do grupo é fixo
    }))
    .sort((a, b) => b.total - a.total);
}

export const MEIOS = ['Crédito', 'Débito', 'Pix', 'Dinheiro', 'Boleto', 'TED', 'Outro'];

/** Saídas por meio de pagamento, mês a mês (compras no crédito pela data da compra). */
export function seriePorMeio(lancamentos, meses, ignorar) {
  const idx = new Map(meses.map((m, i) => [m, i]));
  const tabela = meses.map((mes) => ({ mes, valores: {}, total: 0 }));
  for (const l of lancamentos) {
    if (l.tipo !== 'SAIDA' || !contaNoGasto(l, ignorar)) continue;
    const i = idx.get(l.data.slice(0, 7));
    if (i === undefined) continue;
    const meio = MEIOS.includes(l.forma_pagamento) ? l.forma_pagamento : 'Outro';
    const linha = tabela[i];
    linha.valores[meio] = (linha.valores[meio] || 0) + centavos(l.valor);
    linha.total += centavos(l.valor);
  }
  const usados = MEIOS.filter((m) => tabela.some((t) => t.valores[m]));
  return {
    meios: usados,
    porMes: tabela.map((t) => ({
      mes: t.mes,
      total: reais(t.total),
      valores: Object.fromEntries(usados.map((m) => [m, reais(t.valores[m] || 0)])),
    })),
  };
}

// Dicas práticas por categoria (nomes das categorias padrão).
const DICAS = {
  Restaurantes: 'Defina um teto semanal para delivery e restaurantes e cozinhe em lote no fim de semana.',
  Mercado: 'Faça lista antes de ir ao mercado, compare marcas próprias e evite compras picadas durante a semana.',
  Transporte: 'Compare aplicativo com transporte público ou carona nos trajetos repetidos do mês.',
  Compras: 'Use a regra das 48 horas: espere dois dias antes de comprar o que não estava planejado.',
  Lazer: 'Reserve um valor fixo de lazer no início do mês e procure programas gratuitos da sua cidade.',
  Assinaturas: 'Revise as assinaturas e cancele as que não usou no último mês; alterne streamings em vez de manter todos.',
  'Cuidados pessoais': 'Espace serviços recorrentes e compare pacotes mensais com avulsos.',
  Viagens: 'Planeje viagens com antecedência e separe um valor mensal para elas, em vez de pagar tudo de uma vez.',
  Saúde: 'Peça genéricos na farmácia e verifique se o plano cobre consultas que você paga à parte.',
  'Impostos e tarifas': 'Negocie a isenção de tarifas com o banco ou migre para uma conta digital sem mensalidade.',
};
const DICA_GERAL = 'Defina um limite mensal para esta categoria e acompanhe o gasto semanalmente.';

/**
 * Alertas do mês: compara o mês com a média dos 3 anteriores.
 * Custos fixos são avaliados à parte para não esconderem desvios do dia a dia.
 */
export function gerarAlertas({ lancamentos, mes, ignorar, categoriaPorId, fixa }) {
  const anteriores = mesesAnteriores(mes, 3);
  const grupos = seriePorGrupo(lancamentos, [...anteriores, mes], ignorar, categoriaPorId, fixa);
  const comHistorico = anteriores.filter((m) => lancamentos.some((l) => l.data.startsWith(m)));
  const n = comHistorico.length;
  const alertas = [];

  if (n) {
    const posicoes = comHistorico.map((m) => anteriores.indexOf(m));
    for (const g of grupos) {
      if (g.fixa || !g.nome) continue;
      const atual = g.meses[3];
      const media = reais(Math.round(posicoes.reduce((s, i) => s + centavos(g.meses[i]), 0) / n));
      const excesso = atual - media;
      if (media > 0 && excesso >= 50 && atual > media * 1.2) {
        alertas.push({
          tipo: 'variavel',
          nivel: atual > media * 1.5 ? 'alto' : 'medio',
          nome: g.nome,
          categoria: g.categoria,
          atual,
          media,
          excesso: reais(centavos(excesso)),
          dica: DICAS[g.nome] || DICA_GERAL,
        });
      }
    }
  }

  const doMes = lancamentos.filter((l) => l.data.startsWith(mes));
  const s = separarGastos(doMes, ignorar, fixa);
  if (n) {
    const ant = separarGastos(lancamentos.filter((l) => comHistorico.some((m) => l.data.startsWith(m))), ignorar, fixa);
    const mediaFixos = ant.fixos / n;
    if (mediaFixos > 0 && s.fixos > mediaFixos * 1.1 && s.fixos - mediaFixos >= 50) {
      alertas.push({
        tipo: 'fixos', nivel: 'medio', nome: 'Custos fixos', atual: s.fixos, media: reais(Math.round(mediaFixos * 100)),
        excesso: reais(Math.round((s.fixos - mediaFixos) * 100)),
        dica: 'Seus custos fixos subiram. Confira reajustes de aluguel, planos e contas de consumo, e renegocie o que for possível.',
      });
    }
  }
  if (s.entradas > 0 && s.variaveis > s.entradas * 0.5) {
    alertas.push({
      tipo: 'renda', nivel: 'alto', nome: 'Gastos variáveis', atual: s.variaveis, media: s.entradas,
      excesso: reais(centavos(s.variaveis - s.entradas * 0.5)),
      dica: 'Os gastos variáveis passaram da metade da renda do mês. Escolha duas categorias para segurar até o fim do mês.',
    });
  }
  const peso = { alto: 0, medio: 1 };
  return alertas.sort((a, b) => peso[a.nivel] - peso[b.nivel] || b.excesso - a.excesso);
}

/**
 * Simulador de meta: quanto guardar por mês e onde cortar para chegar lá.
 * Os cortes sugeridos saem das categorias variáveis com maior média, até 30% de cada.
 */
export function simularMeta({ valorAlvo, guardado = 0, prazoMeses, mediaEntradas, mediaSaidas, variaveis = [] }) {
  const falta = Math.max(0, centavos(valorAlvo) - centavos(guardado));
  const necessario = Math.ceil(falta / Math.max(1, prazoMeses));
  const capacidade = centavos(mediaEntradas) - centavos(mediaSaidas);
  let gap = Math.max(0, necessario - Math.max(0, capacidade));
  const cortes = [];
  for (const g of [...variaveis].sort((a, b) => b.media - a.media)) {
    if (gap <= 0) break;
    const max = Math.floor(centavos(g.media) * 0.3);
    if (max < 1000) continue; // cortes menores que R$ 10 não valem a sugestão
    const corte = Math.min(max, gap);
    cortes.push({ nome: g.nome, categoria: g.categoria, media: g.media, corte: reais(corte), pct: (corte / centavos(g.media)) * 100 });
    gap -= corte;
  }
  return {
    falta: reais(falta),
    necessarioMes: reais(necessario),
    capacidadeMes: reais(capacidade),
    taxaNecessaria: mediaEntradas > 0 ? (necessario / centavos(mediaEntradas)) * 100 : null,
    viavel: capacidade >= necessario,
    viavelComCortes: gap <= 0,
    faltaAposCortes: reais(Math.max(0, gap)),
    cortes,
  };
}

/** Comparação com a regra 50/30/20 (necessidades / desejos / poupança). */
export function orcamento503020({ entradas, fixos, variaveis }) {
  if (!entradas) return null;
  const pct = (v) => (v / entradas) * 100;
  const sobra = entradas - fixos - variaveis;
  return {
    necessidades: pct(fixos),
    desejos: pct(variaveis),
    poupanca: pct(sobra),
    ideal: { necessidades: 50, desejos: 30, poupanca: 20 },
  };
}
