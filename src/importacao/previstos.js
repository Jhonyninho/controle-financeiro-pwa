// Lançamentos futuros gerados pelo app: parcelas, despesas fixas replicadas e a
// conciliação "previsto -> realizado" quando o extrato de verdade é importado.
// Funções puras (sem acesso a dados), testadas em tests/previstos.test.js.

import { chaveDescricao } from './classificador.js';
import { somarMesesData } from '../lib/meses.js';

const centavos = (v) => Math.round(Number(v) * 100);
const diasEntre = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

/** Palavras significativas da descrição (sem números, 3+ letras). */
function palavras(descricao) {
  return new Set(chaveDescricao(descricao).split(' ').filter((p) => p.length >= 3 && !/^PARC/i.test(p)));
}

function semelhanca(a, b) {
  const pa = palavras(a);
  const pb = palavras(b);
  if (!pa.size || !pb.size) return 0;
  let comum = 0;
  for (const p of pa) if (pb.has(p)) comum++;
  return comum / Math.min(pa.size, pb.size);
}

/**
 * "PARC 03/10", "3/10", "(3/10)", "parcela 3 de 10" -> { atual: 3, total: 10 } (ou null).
 */
export function extrairParcela(descricao) {
  const t = String(descricao || '');
  const m = t.match(/(?:^|[^\d/])(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})(?![\d/])/i);
  if (!m) return null;
  const atual = Number(m[1]);
  const total = Number(m[2]);
  if (total < 2 || total > 420 || atual < 1 || atual > total) return null;
  return { atual, total };
}

/** Descrição sem a marcação de parcela, para montar "Loja X (4/10)". */
export function descricaoSemParcela(descricao) {
  return String(descricao || '')
    .replace(/\(?\s*(?:parc(?:ela)?\.?\s*)?\d{1,3}\s*(?:\/|de)\s*\d{1,3}\s*\)?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parcelas futuras a partir da parcela já paga.
 * @returns lançamentos PREVISTO (sem id) das parcelas atual+1 … total
 */
export function gerarParcelas(base, { atual, total, valor, primeiraData, serieId }) {
  const nome = descricaoSemParcela(base.descricao) || base.descricao;
  const saida = [];
  for (let n = atual + 1; n <= total; n++) {
    saida.push({
      tipo: base.tipo,
      conta_id: base.conta_id,
      categoria_id: base.categoria_id || null,
      forma_pagamento: base.forma_pagamento || null,
      despesa_fixa: base.despesa_fixa ?? null,
      status: 'PREVISTO',
      valor,
      data: somarMesesData(primeiraData, n - atual - 1),
      descricao: `${nome} (${n}/${total})`.slice(0, 200),
      serie_id: serieId,
      serie_tipo: 'PARCELA',
      parcela_atual: n,
      parcela_total: total,
    });
  }
  return saida;
}

/**
 * Anti-duplicidade na importação: para cada linha do extrato, procura um lançamento
 * PREVISTO da mesma conta e tipo que ele "realiza" (mesma data aproximada, valor e descrição).
 *  - valor igual (centavos) e até 7 dias: basta uma palavra em comum, ou até 3 dias sem palavra
 *  - valor até 15% diferente (contas de consumo): mesma descrição e até 7 dias
 * Cada previsto é usado no máximo uma vez.
 * @returns Map índiceDoItem -> previsto
 */
export function conciliarPrevistos(itens, previstos, contaId, maxDias = 7) {
  const livres = previstos.filter((p) => p.status === 'PREVISTO' && p.conta_id === contaId);
  const usados = new Set();
  const saida = new Map();
  itens.forEach((it, idx) => {
    if (it.erros?.length || it.duplicado) return;
    let melhor = null;
    let melhorNota = 0;
    for (const p of livres) {
      if (usados.has(p.id) || p.tipo !== it.tipo) continue;
      const dias = diasEntre(p.data, it.data);
      if (dias > maxDias) continue;
      const sim = semelhanca(p.descricao, it.descricao);
      const cIt = centavos(it.valor);
      const cP = centavos(p.valor);
      let nota = 0;
      if (cIt === cP && (sim > 0 || dias <= 3)) nota = 2 + sim - dias / 100;
      else if (Math.abs(cIt - cP) <= cP * 0.15 && sim >= 0.5) nota = 1 + sim - dias / 100;
      if (nota > melhorNota) {
        melhor = p;
        melhorNota = nota;
      }
    }
    if (melhor) {
      usados.add(melhor.id);
      saida.set(idx, melhor);
    }
  });
  return saida;
}

/**
 * Despesas fixas sem previsão nos próximos meses.
 * Pega o último pagamento de cada despesa fixa (mesma conta + descrição) e projeta
 * o mesmo valor para os `meses` seguintes, pulando meses que já têm previsto ou realizado.
 * @param {object[]} realizados lançamentos REALIZADO recentes
 * @param {object[]} previstos lançamentos PREVISTO existentes
 * @param {(l) => boolean} ehFixa
 * @param {string} hoje 'AAAA-MM-DD' (não cria previsões no passado)
 */
export function planejarFixas(realizados, previstos, ehFixa, hoje, meses = 3) {
  const chave = (l) => `${l.conta_id}|${l.tipo}|${chaveDescricao(l.descricao)}`;
  const ultimos = new Map();
  for (const l of realizados) {
    if (l.tipo !== 'SAIDA' || !ehFixa(l) || !chaveDescricao(l.descricao)) continue;
    const k = chave(l);
    if (!ultimos.has(k) || ultimos.get(k).data < l.data) ultimos.set(k, l);
  }
  const ocupado = new Set([...realizados, ...previstos].map((l) => `${chave(l)}|${l.data.slice(0, 7)}`));

  const saida = [];
  for (const [k, l] of ultimos) {
    for (let i = 1; i <= meses; i++) {
      const data = somarMesesData(l.data, i);
      if (data < hoje || ocupado.has(`${k}|${data.slice(0, 7)}`)) continue;
      saida.push({
        tipo: 'SAIDA',
        conta_id: l.conta_id,
        categoria_id: l.categoria_id || null,
        forma_pagamento: l.forma_pagamento || null,
        despesa_fixa: l.despesa_fixa ?? null,
        status: 'PREVISTO',
        valor: Number(l.valor),
        data,
        descricao: l.descricao,
        serie_tipo: 'FIXA',
        origem: l, // só para a tela de confirmação (não vai para o banco)
      });
    }
  }
  return saida.sort((a, b) => (a.data < b.data ? -1 : 1));
}
