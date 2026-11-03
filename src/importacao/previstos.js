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
export function conciliarPrevistos(itens, previstos, contaId, maxDias = 7, categoriaDe = null) {
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
      // previsões de despesa fixa levam o nome da categoria (não a descrição do banco):
      // a mesma categoria conta como descrição parecida
      const mesmaCategoria = Boolean(p.categoria_id && categoriaDe && categoriaDe(it) === p.categoria_id);
      const sim = Math.max(semelhanca(p.descricao, it.descricao), mesmaCategoria ? 0.5 : 0);
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
 * A previsão leva o nome da categoria como descrição (ex.: "Moradia › Aluguel"), não o texto
 * do extrato do mês anterior; sem categoria, mantém a descrição original.
 * @param {object[]} realizados lançamentos REALIZADO recentes
 * @param {object[]} previstos lançamentos PREVISTO existentes
 * @param {(l) => boolean} ehFixa
 * @param {string} hoje 'AAAA-MM-DD' (não cria previsões no passado)
 * @param {(categoriaId) => string} [nomeCategoria] rótulo da categoria para a descrição
 */
export function planejarFixas(realizados, previstos, ehFixa, hoje, meses = 3, nomeCategoria = null) {
  const chave = (l) => `${l.conta_id}|${l.tipo}|${chaveDescricao(l.descricao)}`;
  const chaveCat = (l, mes) => `${l.conta_id}|${l.tipo}|${l.categoria_id}|${mes}`;
  const ultimos = new Map();
  for (const l of realizados) {
    if (l.tipo !== 'SAIDA' || !ehFixa(l) || !chaveDescricao(l.descricao)) continue;
    const k = chave(l);
    if (!ultimos.has(k) || ultimos.get(k).data < l.data) ultimos.set(k, l);
  }
  const ocupado = new Set([...realizados, ...previstos].map((l) => `${chave(l)}|${l.data.slice(0, 7)}`));
  // previsões já criadas com o nome da categoria: cada uma cobre uma despesa daquela categoria no mês
  const previstasPorCategoria = new Map();
  for (const p of previstos) {
    if (!p.categoria_id) continue;
    const k = chaveCat(p, p.data.slice(0, 7));
    previstasPorCategoria.set(k, (previstasPorCategoria.get(k) || 0) + 1);
  }

  const saida = [];
  for (const [k, l] of ultimos) {
    const rotulo = (l.categoria_id && nomeCategoria?.(l.categoria_id)) || l.descricao;
    for (let i = 1; i <= meses; i++) {
      const data = somarMesesData(l.data, i);
      const mes = data.slice(0, 7);
      if (data < hoje || ocupado.has(`${k}|${mes}`)) continue;
      if (l.categoria_id && rotulo !== l.descricao) {
        const kc = chaveCat(l, mes);
        const livres = previstasPorCategoria.get(kc) || 0;
        if (livres > 0) {
          previstasPorCategoria.set(kc, livres - 1);
          continue;
        }
      }
      saida.push({
        tipo: 'SAIDA',
        conta_id: l.conta_id,
        categoria_id: l.categoria_id || null,
        forma_pagamento: l.forma_pagamento || null,
        despesa_fixa: l.despesa_fixa ?? null,
        status: 'PREVISTO',
        valor: Number(l.valor),
        data,
        descricao: rotulo.slice(0, 200),
        serie_tipo: 'FIXA',
        origem: l, // só para a tela de confirmação (não vai para o banco)
      });
    }
  }
  return saida.sort((a, b) => (a.data < b.data ? -1 : 1));
}

/**
 * Lançamentos futuros "da mesma conta fixa" depois de um previsto editado, para replicar
 * o novo valor: mesma série, ou mesma conta + tipo e (mesma categoria ou mesma descrição).
 * Parcelas de outra série ficam de fora (duas compras parceladas podem ter a mesma categoria).
 * @param {object} editado previsto já com os campos novos (id, data, conta_id, tipo, categoria_id, descricao)
 * @param {string|null} serieId série original do lançamento editado
 * @param {object[]} previstos lançamentos PREVISTO existentes
 */
export function proximosParecidos(editado, serieId, previstos) {
  const chave = chaveDescricao(editado.descricao);
  return previstos
    .filter((p) => {
      if (p.status !== 'PREVISTO' || p.id === editado.id || p.data <= editado.data) return false;
      if (serieId && p.serie_id === serieId) return true;
      if (p.conta_id !== editado.conta_id || p.tipo !== editado.tipo || p.serie_tipo === 'PARCELA') return false;
      const mesmaCategoria = Boolean(editado.categoria_id && p.categoria_id === editado.categoria_id);
      return mesmaCategoria || (chave.length >= 3 && chaveDescricao(p.descricao) === chave);
    })
    .sort((a, b) => (a.data < b.data ? -1 : 1));
}

/** Mesma data com outro dia do mês (limitado ao último dia: 31 vira 30 ou 28/29). */
export function comDiaDoMes(dataISO, dia) {
  return somarMesesData(`${dataISO.slice(0, 8)}${String(dia).padStart(2, '0')}`, 0);
}

/**
 * O que muda em cada próximo lançamento quando um previsto é editado: o valor novo e/ou o
 * novo dia do mês (cada um continua no seu mês). Só devolve quem realmente muda.
 * @returns {{p: object, valor: number, data: string}[]}
 */
export function alteracoesParaProximos(original, editado, proximos) {
  const mudouValor = centavos(original.valor) !== centavos(editado.valor);
  const diaNovo = Number(editado.data.slice(8));
  const mudouDia = Number(String(original.data).slice(8)) !== diaNovo;
  return proximos
    .map((p) => ({
      p,
      valor: mudouValor ? Number(editado.valor) : Number(p.valor),
      data: mudouDia ? comDiaDoMes(p.data, diaNovo) : p.data,
    }))
    .filter((a) => centavos(a.valor) !== centavos(a.p.valor) || a.data !== a.p.data);
}
