// Conversão pura dos dados da Pluggy para o formato do app.
// Usado pelas Edge Functions (Deno) e testado com Vitest (tests/openFinance.test.js).
// Sem dependências: só JS padrão.

const FUSO = 'America/Sao_Paulo';

/** '2026-11-04T03:00:00.000Z' -> '2026-11-04' no horário de Brasília. */
export function dataLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA formata como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Remove caracteres de controle e espaços repetidos; limita ao tamanho da coluna. */
export function limparDescricao(texto, max = 200) {
  return String(texto ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const FORMAS = { PIX: 'Pix', TED: 'TED', DOC: 'TED', TEF: 'TED', BOLETO: 'Boleto', CARTAO: 'Débito' };

/** Forma de pagamento do app a partir dos metadados da Pluggy. */
export function formaPagamento(tx, tipoConta) {
  if (tipoConta === 'CREDIT') return 'Crédito';
  const metodo = String(tx?.paymentData?.paymentMethod || tx?.operationType || '').toUpperCase();
  if (FORMAS[metodo]) return FORMAS[metodo];
  const desc = String(tx?.description || '').toUpperCase();
  if (/\bPIX\b/.test(desc)) return 'Pix';
  if (/\b(TED|DOC)\b/.test(desc)) return 'TED';
  if (/\bBOLETO\b/.test(desc)) return 'Boleto';
  return null;
}

/** Tipo da conta da Pluggy -> BANK | CREDIT (ou null para tipos que não tratamos). */
export function tipoDaConta(conta) {
  const t = String(conta?.type || '').toUpperCase();
  return t === 'BANK' || t === 'CREDIT' ? t : null;
}

/**
 * Transação da Pluggy -> linha de `transacoes_pendentes` (sem user_id/conta_externa_id).
 * Retorna null quando a transação não deve entrar: ainda pendente no banco, valor zerado ou data inválida.
 */
export function mapearTransacao(tx, tipoConta) {
  if (!tx || !tx.id) return null;
  if (tx.status && String(tx.status).toUpperCase() !== 'POSTED') return null;
  const valor = Math.round(Math.abs(Number(tx.amount)) * 100) / 100;
  if (!Number.isFinite(valor) || valor === 0 || valor >= 1e9) return null;
  const data = dataLocal(tx.date);
  if (!data) return null;

  const t = String(tx.type || '').toUpperCase();
  let tipo;
  if (t === 'CREDIT') tipo = 'ENTRADA';
  else if (t === 'DEBIT') tipo = 'SAIDA';
  else tipo = Number(tx.amount) > 0 ? 'ENTRADA' : 'SAIDA';

  return {
    transacao_id: String(tx.id).slice(0, 100),
    data,
    valor,
    tipo,
    descricao: limparDescricao(tx.description || tx.descriptionRaw) || 'Sem descrição',
    forma_pagamento: formaPagamento(tx, tipoConta),
  };
}

/** Status do item da Pluggy -> status da conexão no app. */
export function statusDaConexao(item) {
  const s = String(item?.status || '').toUpperCase();
  if (s === 'UPDATED') return 'ATUALIZADO';
  if (s === 'UPDATING') return 'ATUALIZANDO';
  if (s === 'LOGIN_ERROR' || s === 'WAITING_USER_INPUT') return 'LOGIN_NECESSARIO';
  if (s === 'OUTDATED' && item?.executionStatus === 'USER_AUTHORIZATION_REVOKED') return 'LOGIN_NECESSARIO';
  if (s === 'OUTDATED') return 'ERRO';
  return 'ATUALIZANDO';
}

/** Compara dois textos em tempo constante (cabeçalho secreto do webhook). */
export function iguaisTempoConstante(a, b) {
  const x = new TextEncoder().encode(String(a ?? ''));
  const y = new TextEncoder().encode(String(b ?? ''));
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0 && x.length > 0;
}
