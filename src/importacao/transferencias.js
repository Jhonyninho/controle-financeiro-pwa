// Reconhecimento de transferências entre as contas do próprio usuário.
//
// 1. Pelo nome do titular: "PIX ENVIADO RAFAEL A C MOREIRA" menciona o próprio
//    usuário (nome completo "Rafael Augusto Conceição Moreira"), mesmo abreviado.
// 2. Pelo par: o mesmo valor saindo de uma conta e entrando em outra em até
//    3 dias (vale quando o extrato não traz o nome).

import { normalizarTexto } from '../lib/formatos.js';

const LIGACOES = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);
const PALAVRAS_TRANSFERENCIA = /\b(PIX|TED|DOC|TEF|TRANSF\w*|TRANSFERENCIA)\b/;

/** Partes significativas do nome: "Rafael Augusto da Conceição" -> ['RAFAEL','AUGUSTO','CONCEICAO'] */
export function partesDoNome(nome) {
  return normalizarTexto(nome)
    .split(' ')
    .filter((t) => t.length >= 2 && !LIGACOES.has(t));
}

/**
 * A descrição menciona o titular? Exige o primeiro nome por extenso seguido de
 * pelo menos 2 partes do restante do nome, na ordem, inteiras ou abreviadas
 * ("W", "C", "S" ou "CONC" contam como abreviação).
 */
export function mencionaTitular(descricao, partes) {
  if (!partes || partes.length < 2) return false;
  const [primeiro, ...resto] = partes;
  const exigido = Math.min(2, resto.length);
  const palavras = normalizarTexto(descricao).split(' ');

  for (let i = 0; i < palavras.length; i++) {
    if (palavras[i] !== primeiro) continue;
    let acertos = 0;
    let desde = 0;
    for (const p of palavras.slice(i + 1, i + 7)) {
      if (LIGACOES.has(p)) continue;
      const k = resto.findIndex((t, idx) => idx >= desde && (t === p || t.startsWith(p)));
      if (k === -1) break;
      acertos++;
      desde = k + 1;
    }
    if (acertos >= exigido) return true;
  }
  return false;
}

function diasEntre(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.abs(Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000;
}

/**
 * Procura, entre lançamentos de OUTRAS contas, o espelho de cada item novo:
 * mesmo valor, tipo oposto, até `maxDias` de diferença e cara de transferência
 * (Pix/TED/DOC/TRANSF) em pelo menos um dos lados. Cada existente é usado uma vez.
 *
 * @returns {Map<number, object>} índice do item novo -> lançamento existente
 */
export function encontrarPares(itens, existentes, contaId, maxDias = 3, exigirPalavra = true) {
  const pares = new Map();
  const usados = new Set();
  itens.forEach((it, idx) => {
    if (it.erros?.length || !it.data || !it.valor) return;
    let melhor = null;
    let melhorDias = Infinity;
    for (const ex of existentes) {
      if (ex.conta_id === contaId || usados.has(ex.id)) continue;
      if (ex.tipo === it.tipo || Math.round(Number(ex.valor) * 100) !== Math.round(it.valor * 100)) continue;
      const dias = diasEntre(ex.data, it.data);
      if (dias > maxDias) continue;
      const pareceTransf = PALAVRAS_TRANSFERENCIA.test(normalizarTexto(it.descricao)) || PALAVRAS_TRANSFERENCIA.test(normalizarTexto(ex.descricao));
      if (exigirPalavra && !pareceTransf) continue;
      if (dias < melhorDias) {
        melhor = ex;
        melhorDias = dias;
      }
    }
    if (melhor) {
      pares.set(idx, melhor);
      usados.add(melhor.id);
    }
  });
  return pares;
}

/**
 * Concilia transferências já classificadas como "entre minhas contas":
 * casa cada saída com uma entrada de mesmo valor em OUTRA conta em até 3 dias.
 * @returns {{ pares: [object, object][], semPar: object[] }}
 */
export function conciliarTransferencias(lancamentos, maxDias = 3) {
  const saidas = lancamentos.filter((l) => l.tipo === 'SAIDA');
  const entradas = lancamentos.filter((l) => l.tipo === 'ENTRADA');
  const pares = [];
  const usadas = new Set();
  for (const s of saidas) {
    const achados = encontrarPares([{ ...s, valor: Number(s.valor), erros: [] }], entradas.filter((e) => !usadas.has(e.id)), s.conta_id, maxDias, false);
    const par = achados.get(0);
    if (par) {
      usadas.add(par.id);
      pares.push([s, par]);
    }
  }
  const pareados = new Set(pares.flatMap(([a, b]) => [a.id, b.id]));
  return { pares, semPar: lancamentos.filter((l) => !pareados.has(l.id)) };
}

/**
 * Conta salário: a entrada importada na conta vinculada veio da conta salário.
 * Monta o que falta gravar na conta salário para os dois lados fecharem:
 *  - a saída da transferência (mesma data e valor da entrada importada)
 *  - o salário no mês a que ele se refere (`dataSalario`), contando como receita daquele mês
 * Não repete o que já existe: salário no mês de referência (mesmo valor ou categoria Salário),
 * ou saída de mesmo valor até 3 dias da transferência.
 * @param {{data:string, valor:number}} item entrada importada na conta vinculada
 * @param {{contaSalario:object, contaDestino:object, dataSalario:string, existentes:object[],
 *   catTransferencia?:string|null, catSalario?:string|null}} p existentes = lançamentos da conta salário
 * @returns {object[]} lançamentos REALIZADO a criar
 */
export function lancamentosDaContaSalario(item, { contaSalario, contaDestino, dataSalario, existentes, catTransferencia = null, catSalario = null }) {
  const c = (v) => Math.round(Number(v) * 100);
  const daConta = existentes.filter((l) => l.conta_id === contaSalario.id && l.status !== 'PREVISTO');
  const dias = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
  const saida = [];
  // salário já registrado no mês: mesmo valor, ou lançado na categoria Salário (pode ter valor diferente do transferido)
  const temSalario = daConta.some((l) => l.tipo === 'ENTRADA' && l.data.slice(0, 7) === dataSalario.slice(0, 7)
    && (c(l.valor) === c(item.valor) || (catSalario && l.categoria_id === catSalario)));
  if (!temSalario) {
    saida.push({
      conta_id: contaSalario.id, tipo: 'ENTRADA', status: 'REALIZADO', valor: Number(item.valor),
      data: dataSalario, descricao: 'Salário', categoria_id: catSalario,
    });
  }
  if (!daConta.some((l) => l.tipo === 'SAIDA' && c(l.valor) === c(item.valor) && dias(l.data, item.data) <= 3)) {
    saida.push({
      conta_id: contaSalario.id, tipo: 'SAIDA', status: 'REALIZADO', valor: Number(item.valor),
      data: item.data, descricao: `Transferência para ${contaDestino.nome}`.slice(0, 200), categoria_id: catTransferencia,
    });
  }
  return saida;
}
