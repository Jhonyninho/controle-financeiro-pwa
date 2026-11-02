// Campanhas de conscientização do mês, feriados nacionais e datas que mexem
// com o bolso. Tudo calculado no aparelho a partir da data (sem rede).
// Datas como 'AAAA-MM-DD'.

import { somarDias } from './meses.js';

/** Campanha de saúde/conscientização de cada mês (Brasil). */
export const CAMPANHAS = {
  '01': { id: 'janeiro-branco', nome: 'Janeiro Branco', tema: 'saúde mental', corHud: 'branco',
    texto: 'Mês de cuidar da saúde mental. Reserve um tempo para você, durma bem e converse com alguém de confiança quando o peso apertar.' },
  '02': { id: 'fevereiro-roxo', nome: 'Fevereiro Roxo', tema: 'lúpus, fibromialgia e Alzheimer', corHud: 'violeta',
    texto: 'Mês de atenção ao lúpus, à fibromialgia e ao Alzheimer. Dores e esquecimentos frequentes merecem uma consulta.' },
  '03': { id: 'marco-lilas', nome: 'Março Lilás', tema: 'câncer de colo do útero', corHud: 'violeta',
    texto: 'Mês de prevenção do câncer de colo do útero. O preventivo em dia e a vacina contra o HPV salvam vidas.' },
  '04': { id: 'abril-azul', nome: 'Abril Azul', tema: 'autismo', corHud: 'azul',
    texto: 'Mês de conscientização sobre o autismo. Informação e acolhimento fazem diferença para muitas famílias.' },
  '05': { id: 'maio-amarelo', nome: 'Maio Amarelo', tema: 'segurança no trânsito', corHud: 'amarelo',
    texto: 'Mês da segurança no trânsito. Cinto, capacete e celular longe do volante. Chegue bem.' },
  '06': { id: 'junho-vermelho', nome: 'Junho Vermelho', tema: 'doação de sangue', corHud: 'vermelho',
    texto: 'Mês de incentivo à doação de sangue. Uma doação pode ajudar até quatro pessoas.' },
  '07': { id: 'julho-amarelo', nome: 'Julho Amarelo', tema: 'hepatites virais', corHud: 'amarelo',
    texto: 'Mês de combate às hepatites virais. O teste é rápido e gratuito no SUS, e há vacina para as hepatites A e B.' },
  '08': { id: 'agosto-lilas', nome: 'Agosto Lilás', tema: 'fim da violência contra a mulher', corHud: 'violeta',
    texto: 'Mês de combate à violência contra a mulher. Em caso de violência, ligue 180. A ligação é gratuita e sigilosa.' },
  '09': { id: 'setembro-amarelo', nome: 'Setembro Amarelo', tema: 'valorização da vida', corHud: 'amarelo',
    texto: 'Mês de valorização da vida. Se cuide e cuide de quem está perto. Precisa conversar? O CVV atende 24h pelo 188.' },
  '10': { id: 'outubro-rosa', nome: 'Outubro Rosa', tema: 'câncer de mama', corHud: 'rosa',
    texto: 'Mês de prevenção do câncer de mama. Se cuide: autoexame e mamografia em dia. Lembre as mulheres que você ama.' },
  '11': { id: 'novembro-azul', nome: 'Novembro Azul', tema: 'saúde do homem', corHud: 'azul',
    texto: 'Mês da saúde do homem e da prevenção do câncer de próstata. Se cuide: faça o check-up e leve quem você ama junto.' },
  '12': { id: 'dezembro-vermelho', nome: 'Dezembro Vermelho', tema: 'prevenção ao HIV', corHud: 'vermelho',
    texto: 'Mês de prevenção ao HIV e outras ISTs. O teste é gratuito no SUS. Cuide-se nas festas.' },
};

export function campanhaDoDia(hoje) {
  const c = CAMPANHAS[hoje.slice(5, 7)];
  return c ? { ...c, chave: `${c.id}-${hoje.slice(0, 4)}` } : null;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const diaSemana = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = domingo

/** n-ésimo dia da semana `ds` do mês (n=1 primeiro; n=-1 último). */
function enesimo(ano, mes, ds, n) {
  const mm = String(mes).padStart(2, '0');
  if (n > 0) {
    let d = `${ano}-${mm}-01`;
    while (diaSemana(d) !== ds) d = somarDias(d, 1);
    return somarDias(d, 7 * (n - 1));
  }
  let d = somarDias(`${mes === 12 ? ano + 1 : ano}-${String((mes % 12) + 1).padStart(2, '0')}-01`, -1);
  while (diaSemana(d) !== ds) d = somarDias(d, -1);
  return d;
}

/** Datas do ano: feriados nacionais e datas comerciais/financeiras. */
export function datasDoAno(ano) {
  const p = pascoa(ano);
  const fixo = (mmdd) => `${ano}-${mmdd}`;
  // Black Friday: sexta depois da 4ª quinta-feira de novembro
  const blackFriday = somarDias(enesimo(ano, 11, 4, 4), 1);
  return [
    { id: 'ano-novo', data: fixo('01-01'), nome: 'Ano Novo', feriado: true, antes: 3,
      texto: 'Feliz Ano Novo! Bom momento para definir uma meta de economia para o ano em Análise e metas.' },
    { id: 'ipva', data: fixo('01-10'), nome: 'IPVA e material escolar', antes: 9, depois: 10,
      texto: 'Janeiro concentra IPVA, IPTU e material escolar. Pagar à vista costuma ter desconto; confira se cabe na sobra do mês.' },
    { id: 'carnaval', data: somarDias(p, -47), nome: 'Carnaval', feriado: true, antes: 5,
      texto: 'Carnaval chegando! Defina um teto para a folia antes de sair e curta sem susto na fatura.' },
    { id: 'consumidor', data: fixo('03-15'), nome: 'Dia do Consumidor', antes: 2,
      texto: 'Dia do Consumidor tem muita promoção. Compare preços e compre só o que já estava na lista.' },
    { id: 'imposto-renda', data: fixo('04-15'), nome: 'Imposto de Renda', antes: 30, depois: 45,
      texto: 'Época da declaração do Imposto de Renda. Separe os informes de rendimentos; o relatório de receitas ajuda.' },
    { id: 'sexta-santa', data: somarDias(p, -2), nome: 'Sexta-feira Santa', feriado: true, antes: 3,
      texto: 'Feriado de Páscoa chegando. Bom descanso!' },
    { id: 'tiradentes', data: fixo('04-21'), nome: 'Tiradentes', feriado: true, antes: 2, texto: 'Feriado de Tiradentes. Bom descanso!' },
    { id: 'trabalho', data: fixo('05-01'), nome: 'Dia do Trabalho', feriado: true, antes: 2,
      texto: 'Feriado do Dia do Trabalho. Que tal revisar quanto do seu trabalho virou reserva este ano?' },
    { id: 'maes', data: enesimo(ano, 5, 0, 2), nome: 'Dia das Mães', antes: 7,
      texto: 'Dia das Mães chegando. Defina quanto quer gastar no presente antes de ir às compras.' },
    { id: 'corpus-christi', data: somarDias(p, 60), nome: 'Corpus Christi', feriado: true, antes: 2, texto: 'Feriado de Corpus Christi. Bom descanso!' },
    { id: 'pais', data: enesimo(ano, 8, 0, 2), nome: 'Dia dos Pais', antes: 7,
      texto: 'Dia dos Pais chegando. Um presente planejado não pesa na fatura.' },
    { id: 'independencia', data: fixo('09-07'), nome: 'Independência', feriado: true, antes: 2, texto: 'Feriado da Independência. Bom descanso!' },
    { id: 'criancas', data: fixo('10-12'), nome: 'Dia das Crianças', feriado: true, antes: 7,
      texto: 'Dia das Crianças e de Nossa Senhora Aparecida. Combine o valor do presente com antecedência.' },
    { id: 'finados', data: fixo('11-02'), nome: 'Finados', feriado: true, antes: 2, texto: 'Feriado de Finados.' },
    { id: 'proclamacao', data: fixo('11-15'), nome: 'Proclamação da República', feriado: true, antes: 2, texto: 'Feriado da Proclamação da República. Bom descanso!' },
    { id: 'consciencia-negra', data: fixo('11-20'), nome: 'Consciência Negra', feriado: true, antes: 2, texto: 'Feriado do Dia da Consciência Negra.' },
    { id: 'black-friday', data: blackFriday, nome: 'Black Friday', antes: 7,
      texto: 'Black Friday chegando. Faça uma lista agora, acompanhe os preços desde já e evite parcelar o que não estava planejado.' },
    { id: 'decimo-terceiro', data: fixo('11-30'), nome: '13º salário', antes: 5, depois: 3,
      texto: 'A 1ª parcela do 13º sai até 30/11. Que tal separar uma parte para a reserva ou para quitar dívidas antes de gastar?' },
    { id: 'decimo-terceiro-2', data: fixo('12-20'), nome: '13º salário', antes: 5,
      texto: 'A 2ª parcela do 13º sai até 20/12. Lembre dos gastos de janeiro (IPVA, IPTU, material escolar) antes de gastar tudo.' },
    { id: 'natal', data: fixo('12-25'), nome: 'Natal', feriado: true, antes: 10,
      texto: 'Natal chegando! Monte a lista de presentes com um teto por pessoa e acompanhe aqui no app.' },
  ];
}

/** Avisos que valem hoje: campanha do mês + datas dentro da janela (antes/depois). */
export function avisosDoDia(hoje) {
  const ano = Number(hoje.slice(0, 4));
  const avisos = [];
  const campanha = campanhaDoDia(hoje);
  if (campanha) avisos.push({ tipo: 'campanha', chave: campanha.chave, titulo: campanha.nome, texto: campanha.texto, cor: campanha.corHud });
  for (const d of [...datasDoAno(ano), ...datasDoAno(ano + 1)]) {
    const de = somarDias(d.data, -(d.antes ?? 0));
    const ate = somarDias(d.data, d.depois ?? 0);
    if (hoje < de || hoje > ate) continue;
    const dias = Math.round((Date.parse(d.data) - Date.parse(hoje)) / 86400000);
    const quando = dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : dias > 1 ? `em ${dias} dias` : null;
    avisos.push({
      tipo: d.feriado ? 'feriado' : 'financas',
      chave: `${d.id}-${d.data}`,
      titulo: quando ? `${d.nome} ${quando}` : d.nome,
      texto: d.texto,
      data: d.data,
    });
  }
  return avisos;
}
