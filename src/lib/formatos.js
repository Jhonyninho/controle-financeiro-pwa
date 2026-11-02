// Conversões de texto, data e dinheiro (pt-BR).
// Datas circulam no app SEMPRE como string 'AAAA-MM-DD' (sem Date/UTC),
// e valores como Number com 2 casas.

/** Remove acentos, deixa maiúsculo e colapsa espaços. */
export function normalizarTexto(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dataValida(a, m, d) {
  if (a < 2000 || a > 2100 || m < 1 || m > 12 || d < 1) return false;
  const diasNoMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return d <= diasNoMes;
}

function iso(a, m, d) {
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Converte data vinda da planilha para 'AAAA-MM-DD'.
 * Aceita: número serial do Excel, Date, 'DD/MM/AAAA', 'DD/MM/AA', 'DD-MM-AAAA', 'AAAA-MM-DD'.
 * Retorna null se inválida.
 */
export function parseData(v) {
  if (v === null || v === undefined || v === '') return null;

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return parseData(iso(v.getFullYear(), v.getMonth() + 1, v.getDate()));
  }

  if (typeof v === 'number' && Number.isFinite(v)) {
    // Serial do Excel (sistema 1900): dia 1 = 1900-01-01, com o bug do 29/02/1900.
    if (v < 1 || v > 80000) return null;
    const ms = Math.round((Math.floor(v) - 25569) * 86400000);
    const d = new Date(ms);
    const r = iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    return dataValida(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) ? r : null;
  }

  const s = String(v).trim().split(/[ T]/)[0];
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    let a = Number(m[3]);
    if (m[3].length === 2) a += 2000;
    const mes = Number(m[2]);
    const dia = Number(m[1]);
    return dataValida(a, mes, dia) ? iso(a, mes, dia) : null;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return dataValida(a, mes, dia) ? iso(a, mes, dia) : null;
  }
  return null;
}

/**
 * Converte valor monetário para Number (com sinal).
 * Aceita: 1250.5, '1.250,50', '-R$ 1.250,50', '1250,50-', '(1.250,50)', '1,250.50'.
 * Retorna null se inválido.
 */
export function parseValor(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;

  let s = String(v).trim().replace(/\s|R\$/gi, '');
  if (!s) return null;

  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { negativo = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { negativo = !negativo; s = s.slice(1); }
  else if (s.startsWith('+')) { s = s.slice(1); }

  if (!/^[\d.,]+$/.test(s)) return null;

  const ultVirgula = s.lastIndexOf(',');
  const ultPonto = s.lastIndexOf('.');
  if (ultVirgula > ultPonto) {
    // pt-BR: vírgula decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (ultPonto > ultVirgula && ultVirgula !== -1) {
    // en-US: 1,250.50
    s = s.replace(/,/g, '');
  } else if ((s.match(/\./g) || []).length > 1) {
    // 1.250.000 (só milhar)
    s = s.replace(/\./g, '');
  }

  if (s.includes(',') || (s.match(/\./g) || []).length > 1) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((negativo ? -n : n) * 100) / 100;
}

export function formatarMoeda(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** 'AAAA-MM-DD' -> 'DD/MM/AAAA' */
export function formatarData(isoStr) {
  if (!isoStr) return '';
  const [a, m, d] = String(isoStr).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
