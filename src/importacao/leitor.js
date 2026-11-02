// Leitura e validação da planilha de importação (.xlsx, .xls, .csv).
// Tudo roda no navegador: o arquivo do usuário nunca é enviado a servidor.

import { normalizarTexto, parseData, parseValor } from '../lib/formatos.js';
import { ABA_LANCAMENTOS, COLUNAS, FORMAS_PAGAMENTO } from './modelo.js';

export const LIMITE_BYTES = 5 * 1024 * 1024;
export const LIMITE_LINHAS = 5000;
const LINHAS_PROCURA_CABECALHO = 20;
const EXTENSOES = ['xlsx', 'xls', 'csv'];

export class ErroImportacao extends Error {}

/** Decodifica CSV: tenta UTF-8 e cai para Windows-1252 (padrão do Excel no Brasil). */
function decodificarTexto(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function detectarSeparador(texto) {
  const primeira = texto.split(/\r?\n/, 1)[0] || '';
  const contar = (c) => primeira.split(c).length - 1;
  return [';', ',', '\t'].sort((a, b) => contar(b) - contar(a))[0];
}

/** Lê o arquivo e devolve as linhas brutas (array de arrays). */
export function lerLinhas(XLSX, bytes, nomeArquivo) {
  const ext = String(nomeArquivo).split('.').pop().toLowerCase();
  if (!EXTENSOES.includes(ext)) {
    throw new ErroImportacao('Formato não suportado. Envie um arquivo .xlsx, .xls ou .csv.');
  }
  if (bytes.byteLength > LIMITE_BYTES) {
    throw new ErroImportacao('Arquivo muito grande (máximo 5 MB).');
  }

  let wb;
  try {
    if (ext === 'csv') {
      const texto = decodificarTexto(bytes);
      // raw: mantém tudo como texto, quem interpreta datas/valores é o nosso parser
      wb = XLSX.read(texto, { type: 'string', raw: true, FS: detectarSeparador(texto) });
    } else {
      wb = XLSX.read(bytes, { type: 'array', cellFormula: false, cellHTML: false });
    }
  } catch {
    throw new ErroImportacao('Não foi possível ler o arquivo. Verifique se ele não está corrompido ou protegido por senha.');
  }

  const nomeAba =
    wb.SheetNames.find((n) => normalizarTexto(n) === normalizarTexto(ABA_LANCAMENTOS)) || wb.SheetNames[0];
  const ws = wb.Sheets[nomeAba];
  if (!ws) throw new ErroImportacao('A planilha está vazia.');

  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
}

/** Encontra a linha de cabeçalho e o índice de cada coluna do modelo. */
export function mapearCabecalho(linhas) {
  const limite = Math.min(linhas.length, LINHAS_PROCURA_CABECALHO);
  for (let i = 0; i < limite; i++) {
    const celulas = (linhas[i] || []).map(normalizarTexto);
    const indices = {};
    for (const col of COLUNAS) {
      const idx = celulas.findIndex((c) => c && col.aliases.includes(c));
      if (idx !== -1) indices[col.chave] = idx;
    }
    if (COLUNAS.filter((c) => c.obrigatoria).every((c) => indices[c.chave] !== undefined)) {
      return { linhaCabecalho: i, indices };
    }
  }
  throw new ErroImportacao(
    'Cabeçalho não encontrado. A planilha precisa ter as colunas "Data", "Descrição" e "Valor" (use o modelo do app).',
  );
}

const LINHA_DE_SALDO = /^(SALDO|S A L D O|TOTAL|SUBTOTAL)\b/;

function normalizarFormaPagamento(v) {
  const n = normalizarTexto(v);
  if (!n) return null;
  return FORMAS_PAGAMENTO.find((f) => normalizarTexto(f) === n) || 'Outro';
}

/**
 * Converte as linhas brutas em lançamentos validados.
 * @returns {{ itens: object[], ignoradas: number }}
 *   itens[].erros: lista de problemas (item com erro não é importado)
 */
export function interpretarLinhas(linhas) {
  const { linhaCabecalho, indices } = mapearCabecalho(linhas);
  const itens = [];
  let ignoradas = 0;

  const cel = (linha, chave) => (indices[chave] === undefined ? '' : linha[indices[chave]]);

  for (let i = linhaCabecalho + 1; i < linhas.length; i++) {
    const linha = linhas[i] || [];
    const bruto = {
      data: cel(linha, 'data'),
      descricao: String(cel(linha, 'descricao') ?? '').trim(),
      valor: cel(linha, 'valor'),
    };

    if (bruto.data === '' && bruto.descricao === '' && bruto.valor === '') continue;
    if (LINHA_DE_SALDO.test(normalizarTexto(bruto.descricao))) {
      ignoradas++;
      continue;
    }

    if (itens.length >= LIMITE_LINHAS) {
      throw new ErroImportacao(`A planilha tem mais de ${LIMITE_LINHAS} lançamentos. Divida em arquivos menores.`);
    }

    const erros = [];
    const data = parseData(bruto.data);
    if (!data) erros.push('Data inválida');

    const valorComSinal = parseValor(bruto.valor);
    if (valorComSinal === null) erros.push('Valor inválido');
    else if (valorComSinal === 0) erros.push('Valor zerado');
    else if (Math.abs(valorComSinal) >= 1e9) erros.push('Valor fora do limite');

    if (!bruto.descricao) erros.push('Descrição vazia');

    itens.push({
      linha: i + 1, // número da linha como o usuário vê no Excel
      data,
      tipo: valorComSinal !== null && valorComSinal > 0 ? 'ENTRADA' : 'SAIDA',
      valor: valorComSinal === null ? null : Math.abs(valorComSinal),
      descricao: bruto.descricao.slice(0, 200),
      categoria: String(cel(linha, 'categoria') ?? '').trim(),
      subcategoria: String(cel(linha, 'subcategoria') ?? '').trim(),
      forma_pagamento: normalizarFormaPagamento(cel(linha, 'forma_pagamento')),
      erros,
    });
  }

  if (itens.length === 0) {
    throw new ErroImportacao('Nenhum lançamento encontrado abaixo do cabeçalho.');
  }
  return { itens, ignoradas };
}

/** Chave de duplicidade: mesma conta + data + valor + tipo + descrição + nº da ocorrência no arquivo. */
export async function calcularHashes(itens) {
  const ocorrencias = new Map();
  const enc = new TextEncoder();
  for (const it of itens) {
    if (it.erros.length) continue;
    const base = [it.data, it.valor.toFixed(2), it.tipo, normalizarTexto(it.descricao)].join('|');
    const n = (ocorrencias.get(base) || 0) + 1;
    ocorrencias.set(base, n);
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${base}|${n}`));
    it.hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return itens;
}

/** Fluxo completo: bytes do arquivo -> itens validados com hash. */
export async function lerPlanilha(XLSX, bytes, nomeArquivo) {
  const linhas = lerLinhas(XLSX, bytes, nomeArquivo);
  const resultado = interpretarLinhas(linhas);
  await calcularHashes(resultado.itens);
  return resultado;
}
