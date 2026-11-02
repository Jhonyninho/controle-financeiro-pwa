// Saudações faladas ao entrar no app, gravadas uma única vez com a voz neural do Gemini
// (scripts/gerar-falas.mjs → public/falas/*.mp3) e sorteadas a cada entrada.
//
// Cada saudação = abertura (período do dia + tratamento) + às vezes um comentário (que
// depende do dia: segunda, sexta, fim de semana, início ou fim do mês). Os áudios são os
// mesmos para todo mundo, então nunca contêm o nome do usuário.
//
// Ao mudar um texto, mude também o id (o áudio antigo não é reaproveitado por engano).

const TRATAMENTOS = {
  senhor: { v: ', senhor', o: 'o', ele: 'o senhor' },
  senhora: { v: ', senhora', o: 'a', ele: 'a senhora' },
  neutro: { v: '', o: null, ele: null },
};

// Aberturas por período. `nome: true` = fala "Maviz" (só usada se o assistente se chamar M.A.V.I.Z.).
// Cada função recebe o tratamento e devolve o texto (ou null quando não serve para ele).
const ABERTURAS = {
  manha: [
    { id: 'm1', nome: true, f: (t) => `Bom dia${t.v}. Maviz online e à sua disposição.` },
    { id: 'm2', f: (t) => `Bom dia${t.v}. Os sistemas financeiros já estão operacionais.` },
    { id: 'm3', f: (t) => `Bom dia${t.v}. Espero que o café esteja tão equilibrado quanto o orçamento.` },
    { id: 'm4', nome: true, f: (t) => `Bom dia${t.v}. Aqui é Maviz. Painel carregado, números atualizados.` },
  ],
  tarde: [
    { id: 't1', nome: true, f: (t) => `Boa tarde${t.v}. Aqui é Maviz, tudo sob controle por aqui.` },
    { id: 't2', f: (t) => `Boa tarde${t.v}. Seus números já estão carregados.` },
    { id: 't3', f: (t) => (t.o ? `Boa tarde${t.v}. Que bom tê-l${t.o} de volta ao painel.` : 'Boa tarde. Que bom ver o painel aberto novamente.') },
    { id: 't4', f: (t) => `Boa tarde${t.v}. Uma pausa para as finanças é sempre uma decisão sensata.` },
  ],
  noite: [
    { id: 'n1', nome: true, f: (t) => `Boa noite${t.v}. Maviz online, painel financeiro ativo.` },
    { id: 'n2', f: (t) => `Boa noite${t.v}. Encerrando o dia com uma conferência das contas? Excelente hábito.` },
    { id: 'n3', f: (t) => `Boa noite${t.v}. Tudo preparado para a revisão do dia.` },
    { id: 'n4', nome: true, f: (t) => `Boa noite${t.v}. Aqui é Maviz. Os relatórios aguardam a sua análise.` },
  ],
  madrugada: [
    { id: 'z1', nome: true, f: (t) => (t.o ? `Ainda acordad${t.o}${t.v}? Aqui é Maviz, sempre de plantão.` : 'Acordado a esta hora? Aqui é Maviz, sempre de plantão.') },
    { id: 'z2', f: (t) => `Boa noite${t.v}. Consultar as finanças a esta hora é uma dedicação admirável.` },
    { id: 'z3', f: (t) => (t.ele ? `Boa madrugada${t.v}. Os sistemas nunca dormem, e pelo visto ${t.ele} também não.` : 'Boa madrugada. Os sistemas nunca dormem, e pelo visto ninguém por aqui.') },
  ],
};

// Comentários (servem para qualquer tratamento).
const COMENTARIOS = {
  geral: [
    { id: 'g1', texto: 'Vamos verificar como estão as finanças hoje?' },
    { id: 'g2', texto: 'Recomendo uma olhada rápida nos lançamentos recentes.' },
    { id: 'g3', texto: 'Quando desejar, preparo o diagnóstico do mês.' },
    { id: 'g4', texto: 'Um lembrete discreto: pequenos gastos também somam.' },
    { id: 'g5', texto: 'Disciplina hoje, tranquilidade amanhã.' },
    { id: 'g6', texto: 'Os relatórios estão atualizados e à sua espera.' },
  ],
  segunda: [
    { id: 's1', texto: 'Nova semana, nova oportunidade de manter o orçamento em ordem.' },
    { id: 's2', texto: 'Segunda-feira: um ótimo dia para planejar os gastos da semana.' },
  ],
  sexta: [
    { id: 'x1', texto: 'Sexta-feira. Aproveite o fim de semana, com moderação nos gastos, naturalmente.' },
    { id: 'x2', texto: 'Sexta-feira chegou. O orçamento do fim de semana agradece a prudência.' },
  ],
  fimDeSemana: [
    { id: 'w1', texto: 'O fim de semana é ótimo para descansar, e para revisar as contas com calma.' },
    { id: 'w2', texto: 'Mesmo no fim de semana, os números seguem sob vigilância.' },
  ],
  inicioDoMes: [
    { id: 'i1', texto: 'Mês novo começando. Um bom momento para definir as metas.' },
    { id: 'i2', texto: 'Início de mês: hora de conferir as contas fixas que vão vencer.' },
  ],
  fimDoMes: [
    { id: 'f1', texto: 'O mês está terminando. Vale conferir as faturas que ainda vão vencer.' },
    { id: 'f2', texto: 'Reta final do mês. Prudência nos gastos até o próximo salário.' },
  ],
};

export function periodoDaHora(hora) {
  if (hora >= 5 && hora < 12) return 'manha';
  if (hora >= 12 && hora < 18) return 'tarde';
  if (hora >= 18 || hora < 1) return 'noite';
  return 'madrugada'; // 1h às 5h
}

const tratamentoDe = (t) => (t === 'senhor' || t === 'senhora' ? t : 'neutro');

/** Todas as falas que existem (o script de geração grava uma por id). */
export function todasAsFalas() {
  const falas = [];
  for (const [periodo, lista] of Object.entries(ABERTURAS)) {
    for (const trat of Object.keys(TRATAMENTOS)) {
      for (const a of lista) {
        const texto = a.f(TRATAMENTOS[trat]);
        if (texto) falas.push({ id: `a-${periodo}-${trat}-${a.id}`, texto, nome: Boolean(a.nome) });
      }
    }
  }
  for (const [ctx, lista] of Object.entries(COMENTARIOS)) {
    for (const c of lista) falas.push({ id: `c-${ctx}-${c.id}`, texto: c.texto, nome: false });
  }
  return falas;
}

/** Contextos do dia (para os comentários especiais). `data` = 'AAAA-MM-DD'. */
export function contextosDoDia(data) {
  const [a, m, d] = data.split('-').map(Number);
  // dia da semana sem Date em UTC: Date.UTC evita fuso
  const semana = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const ctx = [];
  if (semana === 1) ctx.push('segunda');
  if (semana === 5) ctx.push('sexta');
  if (semana === 0 || semana === 6) ctx.push('fimDeSemana');
  if (d <= 5) ctx.push('inicioDoMes');
  if (d >= ultimo - 5) ctx.push('fimDoMes');
  return ctx;
}

/**
 * Sorteia uma saudação: abertura do período (e tratamento) + comentário (às vezes nenhum),
 * evitando as falas usadas nas últimas entradas.
 * disponiveis: Set de ids com áudio gravado (null = considera todos).
 * Devolve [{ id, texto }] (1 ou 2 falas) ou [] se não houver áudio para o período.
 */
export function sortearSaudacao({ hora, data, tratamento = 'nome', comNome = true, recentes = [], disponiveis = null, aleatorio = Math.random }) {
  const periodo = periodoDaHora(hora);
  const trat = tratamentoDe(tratamento);
  const todas = todasAsFalas().filter((f) => !disponiveis || disponiveis.has(f.id));
  const evitar = new Set(recentes);
  const escolher = (lista) => {
    if (!lista.length) return null;
    const novas = lista.filter((f) => !evitar.has(f.id));
    const pool = novas.length ? novas : lista;
    return pool[Math.floor(aleatorio() * pool.length) % pool.length];
  };

  const aberturas = todas.filter((f) => f.id.startsWith(`a-${periodo}-${trat}-`) && (comNome || !f.nome));
  const abertura = escolher(aberturas);
  if (!abertura) return [];

  // 1 em cada 4 entradas fica só com a abertura (mais natural do que sempre duas frases)
  if (aleatorio() < 0.25) return [abertura];
  const especiais = contextosDoDia(data).flatMap((c) => todas.filter((f) => f.id.startsWith(`c-${c}-`)));
  const gerais = todas.filter((f) => f.id.startsWith('c-geral-'));
  // datas especiais têm prioridade na metade das vezes
  const comentario = (especiais.length && aleatorio() < 0.5 ? escolher(especiais) : null) || escolher(gerais);
  return comentario ? [abertura, comentario] : [abertura];
}
