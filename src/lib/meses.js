// Meses no formato 'AAAA-MM'. Sem Date local para não sofrer com fuso.

export function mesAtual(agora = new Date()) {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

export function hojeISO(agora = new Date()) {
  return `${mesAtual(agora)}-${String(agora.getDate()).padStart(2, '0')}`;
}

export function deslocarMes(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function limitesMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

const NOMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function nomeMes(mes, curto = false) {
  const [a, m] = mes.split('-').map(Number);
  const nome = NOMES[m - 1];
  return curto ? `${nome.slice(0, 3)}/${String(a).slice(2)}` : `${nome} de ${a}`;
}

/** Mesma data N meses depois, ajustando para o último dia quando o mês é mais curto (31/01 + 1 = 28/02). */
export function somarMesesData(dataISO, n) {
  const [a, m, d] = dataISO.split('-').map(Number);
  const mes = deslocarMes(`${a}-${String(m).padStart(2, '0')}`, n);
  const { fim } = limitesMes(mes);
  const dia = Math.min(d, Number(fim.slice(8)));
  return `${mes}-${String(dia).padStart(2, '0')}`;
}

export function somarDias(dataISO, dias) {
  const [a, m, d] = dataISO.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}
