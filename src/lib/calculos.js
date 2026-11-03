// Cálculos financeiros puros (sem acesso a dados), usados no Resumo e Relatórios.
// Valores são somados em centavos inteiros para não acumular erro de ponto flutuante.
//
// Regras:
//  - Categorias "fora dos gastos" (transferências, pagamento de fatura, investimentos)
//    não entram em entradas/saídas/gastos por categoria — só no saldo da conta.
//  - Compras no Crédito não mexem no saldo da conta: vão para a fatura (fatura_mes).

const centavos = (v) => Math.round(Number(v) * 100);
const reais = (c) => c / 100;

/** Mesmo cálculo da função SQL calcular_fatura_mes: devolve 'AAAA-MM' do vencimento. */
export function mesDaFatura(dataISO, diaFechamento, diaVencimento) {
  let [a, m] = dataISO.split('-').map(Number);
  const d = Number(dataISO.slice(8, 10));
  let somar = 0;
  if (diaFechamento && d > diaFechamento) somar++;
  if (diaFechamento && diaVencimento && diaVencimento <= diaFechamento) somar++;
  const total = a * 12 + (m - 1) + somar;
  a = Math.floor(total / 12);
  m = (total % 12) + 1;
  return `${a}-${String(m).padStart(2, '0')}`;
}

/** @param {Set<string>} [ignorar] ids de categorias fora dos gastos */
export function totais(lancamentos, ignorar = new Set()) {
  let e = 0;
  let s = 0;
  for (const l of lancamentos) {
    if (l.categoria_id && ignorar.has(l.categoria_id)) continue;
    if (l.tipo === 'ENTRADA') e += centavos(l.valor);
    else s += centavos(l.valor);
  }
  return { entradas: reais(e), saidas: reais(s), saldo: reais(e - s) };
}

/**
 * Resumo do mês por conta:
 *  - movimento: tudo que passou pela conta no mês (exceto compras no crédito)
 *  - fatura: compras no crédito com vencimento no mês, menos estornos/créditos na fatura
 */
export function resumoPorConta(contas, lancamentos, periodo) {
  // periodo: 'AAAA-MM' ou { inicio: 'AAAA-MM-DD', fim: 'AAAA-MM-DD' }
  const { inicio, fim } = typeof periodo === 'string' ? { inicio: `${periodo}-01`, fim: `${periodo}-31` } : periodo;
  const primeiraFatura = `${inicio.slice(0, 7)}-01`;
  return contas.map((conta) => {
    const daConta = lancamentos.filter((l) => l.conta_id === conta.id);
    const movimento = totais(daConta.filter((l) => l.forma_pagamento !== 'Crédito' && l.data >= inicio && l.data <= fim));
    let fatura = null;
    if (conta.tem_credito) {
      // faturas que vencem dentro do período
      const t = totais(daConta.filter((l) => l.forma_pagamento === 'Crédito' && l.fatura_mes && l.fatura_mes >= primeiraFatura && l.fatura_mes <= fim));
      const valor = Math.max(0, reais(centavos(t.saidas) - centavos(t.entradas)));
      const limite = conta.limite_credito ? Number(conta.limite_credito) : null;
      fatura = { valor, limite, uso: limite ? Math.min(100, (valor / limite) * 100) : null };
    }
    return { conta, ...movimento, fatura };
  });
}

/** Soma por categoria (de um tipo), do maior para o menor, com percentual. */
export function porCategoria(lancamentos, tipo = 'SAIDA', ignorar = new Set()) {
  const mapa = new Map();
  let total = 0;
  for (const l of lancamentos) {
    if (l.tipo !== tipo || (l.categoria_id && ignorar.has(l.categoria_id))) continue;
    const k = l.categoria_id || null;
    const c = centavos(l.valor);
    mapa.set(k, (mapa.get(k) || 0) + c);
    total += c;
  }
  return [...mapa]
    .map(([categoria_id, c]) => ({ categoria_id, valor: reais(c), percentual: total ? (c / total) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

/**
 * Agrupa o resultado de porCategoria pela categoria "mãe" (nome), usando o mapa id -> {nome}.
 * Útil para o gráfico: "Mercado" em vez de "Mercado › Supermercado" + "Mercado › Padaria".
 */
export function agruparPorCategoriaMae(itens, categoriaPorId) {
  const mapa = new Map();
  let total = 0;
  for (const it of itens) {
    const cat = it.categoria_id ? categoriaPorId(it.categoria_id) : null;
    const chave = cat ? cat.nome : null;
    const atual = mapa.get(chave) || { nome: chave, categoria: cat, centavos: 0 };
    atual.centavos += centavos(it.valor);
    mapa.set(chave, atual);
    total += centavos(it.valor);
  }
  return [...mapa.values()]
    .map((g) => ({ nome: g.nome, categoria: g.categoria, valor: reais(g.centavos), percentual: total ? (g.centavos / total) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

/** Série mensal (entradas, saídas, saldo e acumulado) para a lista de meses 'AAAA-MM'. */
export function serieMensal(lancamentos, meses, ignorar = new Set()) {
  let acumulado = 0;
  return meses.map((mes) => {
    const t = totais(lancamentos.filter((l) => l.data.startsWith(mes)), ignorar);
    acumulado += centavos(t.saldo);
    return { mes, ...t, acumulado: reais(acumulado) };
  });
}

/** Variação percentual entre dois valores (null quando não há base de comparação). */
export function variacao(atual, anterior) {
  if (!anterior) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

/**
 * Saldo de cada conta mês a mês (o "transbordo" para o mês seguinte).
 * - saldoAntes: Map conta_id -> saldo no dia anterior ao início do período
 * - lancamentos: realizados do período (compras no Crédito são ignoradas: vão para a fatura)
 * - meses: lista 'AAAA-MM' em ordem
 * Transferências entre contas entram numa conta e saem da outra, então se anulam no consolidado.
 */
export function saldosMensais(contas, saldoAntes, lancamentos, meses) {
  const porConta = contas.map((conta) => {
    let saldo = centavos(saldoAntes.get(conta.id) || 0);
    const linhas = meses.map((mes) => {
      const doMes = lancamentos.filter((l) => l.conta_id === conta.id && l.forma_pagamento !== 'Crédito' && l.data.startsWith(mes));
      const e = doMes.filter((l) => l.tipo === 'ENTRADA').reduce((s, l) => s + centavos(l.valor), 0);
      const sa = doMes.filter((l) => l.tipo === 'SAIDA').reduce((s, l) => s + centavos(l.valor), 0);
      const inicial = saldo;
      saldo = inicial + e - sa;
      return { mes, inicial: reais(inicial), entradas: reais(e), saidas: reais(sa), final: reais(saldo) };
    });
    return { conta, meses: linhas, saldoFinal: reais(saldo) };
  });

  const consolidado = meses.map((mes, i) => {
    const soma = (campo) => reais(porConta.reduce((s, c) => s + centavos(c.meses[i][campo]), 0));
    return { mes, inicial: soma('inicial'), entradas: soma('entradas'), saidas: soma('saidas'), final: soma('final') };
  });
  return { porConta, consolidado };
}

/**
 * Saldo previsto: o que há nas contas + o que ainda vai entrar − o que ainda vai sair até `ate`
 * (lançamentos PREVISTO, inclusive os vencidos e não pagos). Previsto no crédito entra pela
 * fatura: conta só quando a fatura vence até o mês de `ate`.
 * @param {number} saldoContas soma dos saldos reais das contas
 * @param {object[]} previstos
 * @param {string} ate 'AAAA-MM-DD'
 */
export function saldoPrevisto(saldoContas, previstos, ate) {
  const inicioMes = `${ate.slice(0, 7)}-01`;
  let entradas = 0;
  let saidas = 0;
  for (const p of previstos) {
    if (p.status !== 'PREVISTO') continue;
    const entra = p.forma_pagamento === 'Crédito' ? Boolean(p.fatura_mes) && p.fatura_mes <= inicioMes : p.data <= ate;
    if (!entra) continue;
    const c = Math.round(Number(p.valor) * 100);
    if (p.tipo === 'ENTRADA') entradas += c;
    else saidas += c;
  }
  return {
    saldo: (Math.round(Number(saldoContas) * 100) + entradas - saidas) / 100,
    entradas: entradas / 100,
    saidas: saidas / 100,
  };
}
