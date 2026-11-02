// Diagnóstico financeiro com a API do Google Gemini (camada gratuita).
//
// Privacidade:
//  - a chave é do próprio usuário e fica só neste navegador (localStorage), nunca no banco;
//  - só vão números agregados e nomes de categoria: nada de descrição de lançamento,
//    nome de conta, nome de pessoa, e-mail ou data exata.
// Limites: o app controla requisições por minuto e por dia antes de chamar a API.

const API = 'https://generativelanguage.googleapis.com/v1beta';
const CHAVE_CONFIG = 'cf.ia';
const CHAVE_USO = 'cf.ia.uso';
const MODELO_PADRAO = 'gemini-2.5-flash';

export const LIMITES_PADRAO = { porMinuto: 5, porDia: 100 };

export class ErroIA extends Error {}

// ---------------------------------------------------------------------
// Configuração (por navegador)
// ---------------------------------------------------------------------
function ler(chave, padrao) {
  try {
    return JSON.parse(localStorage.getItem(chave) || 'null') ?? padrao;
  } catch {
    return padrao;
  }
}
function gravar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* sem storage */
  }
}

export function configIA() {
  const c = ler(CHAVE_CONFIG, {});
  return {
    chave: typeof c.chave === 'string' ? c.chave : '',
    modelo: /^[a-z0-9.-]{3,60}$/.test(c.modelo || '') ? c.modelo : MODELO_PADRAO,
    porMinuto: Number(c.porMinuto) > 0 ? Math.min(Number(c.porMinuto), 60) : LIMITES_PADRAO.porMinuto,
    porDia: Number(c.porDia) > 0 ? Math.min(Number(c.porDia), 2000) : LIMITES_PADRAO.porDia,
  };
}

export function salvarConfigIA(c) {
  const atual = configIA();
  gravar(CHAVE_CONFIG, { ...atual, ...c });
}

export function esquecerChaveIA() {
  try {
    localStorage.removeItem(CHAVE_CONFIG);
    localStorage.removeItem(CHAVE_USO);
  } catch {
    /* sem storage */
  }
}

export const iaConfigurada = () => configIA().chave.length >= 20;

// ---------------------------------------------------------------------
// Controle de cota (janela deslizante de 1 min e 24 h)
// ---------------------------------------------------------------------
export function usoIA(agora = Date.now()) {
  const marcas = ler(CHAVE_USO, []).filter((t) => typeof t === 'number' && agora - t < 86400000);
  return { marcas, ultimoMinuto: marcas.filter((t) => agora - t < 60000).length, hoje: marcas.length };
}

/** Lança ErroIA quando a próxima chamada estouraria a cota configurada. */
export function verificarCota(limites = configIA(), agora = Date.now()) {
  const u = usoIA(agora);
  if (u.hoje >= limites.porDia) throw new ErroIA(`Limite diário de ${limites.porDia} análises atingido. Tente amanhã.`);
  if (u.ultimoMinuto >= limites.porMinuto) {
    const espera = Math.ceil((60000 - (agora - Math.min(...u.marcas.filter((t) => agora - t < 60000)))) / 1000);
    throw new ErroIA(`Muitas análises seguidas. Aguarde ${espera}s.`);
  }
  return u;
}

export function registrarUso(agora = Date.now()) {
  const { marcas } = usoIA(agora);
  gravar(CHAVE_USO, [...marcas, agora]);
}

// ---------------------------------------------------------------------
// Payload anonimizado
// ---------------------------------------------------------------------
const r2 = (v) => Math.round(Number(v) || 0);
const nomeSeguro = (s) => String(s || 'Sem categoria').replace(/[^\p{L}\p{N} &,.()-]/gu, '').slice(0, 40);

/**
 * @param {object} d
 * @param {string} d.mes 'AAAA-MM'
 * @param {{entradas, fixos, variaveis}} d.mesAtual
 * @param {{entradas, fixos, variaveis}} d.media3m médias dos 3 meses anteriores
 * @param {{nome, total, media, fixa, meses}[]} d.grupos série por categoria (último elemento de meses = mês atual)
 * @param {{meios, porMes}} d.meios
 * @param {{nome, valor_alvo, valor_guardado, prazo_meses}[]} d.metas
 * @param {object[]} d.alertas
 */
export function montarPayloadIA(d) {
  return {
    moeda: 'BRL',
    mes_referencia: d.mes,
    mes: { receitas: r2(d.mesAtual.entradas), despesas_fixas: r2(d.mesAtual.fixos), despesas_variaveis: r2(d.mesAtual.variaveis) },
    media_3_meses_anteriores: { receitas: r2(d.media3m.entradas), despesas_fixas: r2(d.media3m.fixos), despesas_variaveis: r2(d.media3m.variaveis) },
    categorias_despesa: d.grupos.slice(0, 15).map((g) => ({
      categoria: nomeSeguro(g.nome),
      tipo: g.fixa ? 'fixa' : 'variavel',
      mes: r2(g.meses.at(-1)),
      media_mensal: r2(g.media),
    })),
    meios_de_pagamento_mes: Object.fromEntries(Object.entries(d.meios.porMes.at(-1)?.valores || {}).map(([k, v]) => [k, r2(v)])),
    metas: d.metas.slice(0, 5).map((m, i) => ({
      meta: `Meta ${i + 1}`,
      valor_alvo: r2(m.valor_alvo),
      ja_guardado: r2(m.valor_guardado),
      prazo_meses: m.prazo_meses,
    })),
    alertas_do_app: d.alertas.slice(0, 6).map((a) => ({ categoria: nomeSeguro(a.nome), atual: r2(a.atual), referencia: r2(a.media) })),
  };
}

export const PROMPT_SISTEMA = `Você é um consultor de finanças pessoais brasileiro, direto e empático.
Recebe um JSON com números agregados do mês de uma pessoa (valores em reais, arredondados) e
devolve um diagnóstico em português do Brasil.

Regras:
- Use apenas os números do JSON; não invente receitas, dívidas ou fatos sobre a pessoa.
- Separe custos fixos (difíceis de mudar no curto prazo) de gastos variáveis (onde está a margem de ação).
- Compare o mês com a média dos 3 meses anteriores e cite valores em R$.
- Estratégias devem ser práticas, específicas para as categorias recebidas e com economia mensal estimada realista.
- Se houver metas, diga se o ritmo atual atinge cada uma no prazo e o que mudar.
- Sugestões de investimento só em termos gerais e educativos (reserva de emergência, Tesouro Selic, CDB com liquidez diária);
  não recomende produtos, corretoras ou ativos específicos.
- Tom respeitoso, sem julgamento, sem emojis. Frases curtas.`;

/**
 * Personalidade do assistente (o nome é o do assistente, nunca o do usuário). O texto também é
 * narrado em voz, então: frases curtas, sem siglas soltas e com valores fáceis de falar.
 */
export function promptSistema(assistente) {
  if (!assistente) return PROMPT_SISTEMA;
  return `${PROMPT_SISTEMA}

Personalidade: você é ${assistente}, o assistente financeiro de inteligência artificial deste app.
Fale como um assistente de IA sofisticado: preciso, elegante, confiante e com um leve humor seco,
sempre gentil. Pode usar expressões como "análise concluída", "detectei", "recomendo". O texto será lido em voz alta:
prefira frases curtas e naturais de ouvir.`;
}

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    resumo: { type: 'STRING', description: 'Diagnóstico geral em 2 a 4 frases.' },
    pontos_fortes: { type: 'ARRAY', items: { type: 'STRING' } },
    pontos_de_atencao: { type: 'ARRAY', items: { type: 'STRING' } },
    estrategias: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          titulo: { type: 'STRING' },
          acao: { type: 'STRING' },
          economia_mensal_estimada: { type: 'NUMBER' },
        },
        required: ['titulo', 'acao'],
      },
    },
    metas: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['resumo', 'pontos_de_atencao', 'estrategias'],
};

function lista(v, max) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.slice(0, 600)).slice(0, max) : [];
}

/** Normaliza a resposta (texto nunca vira HTML: a tela escapa tudo). */
export function lerRespostaIA(texto) {
  let j;
  try {
    j = JSON.parse(texto);
  } catch {
    throw new ErroIA('A IA devolveu uma resposta em formato inesperado. Tente de novo.');
  }
  return {
    resumo: String(j.resumo || '').slice(0, 1500),
    pontos_fortes: lista(j.pontos_fortes, 6),
    pontos_de_atencao: lista(j.pontos_de_atencao, 8),
    estrategias: (Array.isArray(j.estrategias) ? j.estrategias : []).slice(0, 8).map((e) => ({
      titulo: String(e?.titulo || '').slice(0, 120),
      acao: String(e?.acao || '').slice(0, 600),
      economia: Number.isFinite(Number(e?.economia_mensal_estimada)) ? Math.max(0, Number(e.economia_mensal_estimada)) : null,
    })),
    metas: lista(j.metas, 5),
  };
}

// ---------------------------------------------------------------------
// Chamadas
// ---------------------------------------------------------------------

// Modelos com cota na camada gratuita, em ordem de preferência. Nomes novos
// que aparecem na listagem (ex.: "omni", "pro") muitas vezes têm cota 0 no free tier.
export const MODELOS_GRATUITOS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest'];

export class ErroCota extends ErroIA {}

export async function chamar(caminho, { chave, corpo, sinal } = {}) {
  let r;
  try {
    r = await fetch(`${API}/${caminho}`, {
      method: corpo ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body: corpo ? JSON.stringify(corpo) : undefined,
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
      signal: sinal,
    });
  } catch {
    throw new ErroIA('Sem conexão com a API do Gemini.');
  }
  if (r.ok) return r.json();
  const detalhe = await r.text().catch(() => '');
  if (r.status === 400 && /API key/i.test(detalhe)) throw new ErroIA('Chave da API inválida. Confira em Configurações.');
  if (r.status === 400 && /location|region|country/i.test(detalhe)) throw new ErroIA('A camada gratuita do Gemini não está disponível para esta região/conta.');
  if (r.status === 401 || r.status === 403) throw new ErroIA('Chave da API inválida ou sem permissão. Confira em Configurações.');
  if (r.status === 404) throw new ErroIA('Modelo indisponível. Use "Testar chave" em Configurações para escolher outro.');
  if (r.status === 429) {
    const semCota = /limit:\s*0\b/.test(detalhe);
    throw new ErroCota(
      semCota
        ? 'Este modelo não tem cota gratuita para a sua chave.'
        : 'Cota gratuita do Gemini esgotada por agora (limite por minuto ou por dia do Google). Tente mais tarde.',
    );
  }
  if (r.status === 400) throw new ErroIA('A API do Gemini recusou o pedido. Use "Testar chave" em Configurações.');
  throw new ErroIA('A API do Gemini não respondeu. Tente mais tarde.');
}

const corpoTeste = { contents: [{ role: 'user', parts: [{ text: 'Responda apenas: ok' }] }], generationConfig: { maxOutputTokens: 8 } };

/** Valida a chave e escolhe o primeiro modelo gratuito que realmente responde. */
export async function testarChave(chave) {
  const r = await chamar('models?pageSize=200', { chave });
  const modelos = (r.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name || '').replace(/^models\//, ''))
    .filter((n) => /^gemini-[a-z0-9.-]+$/.test(n));
  const candidatos = MODELOS_GRATUITOS.filter((n) => modelos.includes(n));
  if (!candidatos.length) throw new ErroIA('A chave funciona, mas nenhum modelo da camada gratuita está disponível para ela.');
  let ultimo;
  for (const modelo of candidatos) {
    try {
      await chamar(`models/${modelo}:generateContent`, { chave, corpo: corpoTeste });
      return { modelo, modelos };
    } catch (e) {
      if (!(e instanceof ErroCota)) throw e;
      ultimo = e;
    }
  }
  throw new ErroIA(`A chave é válida, mas o Google não liberou cota gratuita agora (${ultimo?.message || 'erro 429'}). Tente de novo em alguns minutos.`);
}

export async function gerarDiagnostico(payload, { sinal, assistente = null } = {}) {
  const cfg = configIA();
  if (!cfg.chave) throw new ErroIA('Cadastre sua chave do Gemini em Configurações.');
  verificarCota(cfg);
  registrarUso();
  const corpo = {
    systemInstruction: { parts: [{ text: promptSistema(assistente) }] },
    contents: [{ role: 'user', parts: [{ text: `Dados do mês (JSON):\n${JSON.stringify(payload)}` }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 4096, responseMimeType: 'application/json', responseSchema: ESQUEMA },
  };
  // Se o modelo salvo ficar sem cota, tenta os outros modelos gratuitos (cada um tem a sua cota).
  const ordem = [cfg.modelo, ...MODELOS_GRATUITOS.filter((m) => m !== cfg.modelo)];
  let r;
  let ultimo;
  for (const modelo of ordem) {
    try {
      r = await chamar(`models/${modelo}:generateContent`, { chave: cfg.chave, sinal, corpo });
      if (modelo !== cfg.modelo) salvarConfigIA({ modelo });
      break;
    } catch (e) {
      if (!(e instanceof ErroCota) && !/Modelo indisponível/.test(e.message)) throw e;
      ultimo = e;
    }
  }
  if (!r) throw new ErroIA(`Cota gratuita do Gemini esgotada em todos os modelos gratuitos (${ultimo?.message}). Tente mais tarde.`);
  const texto = r?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!texto) throw new ErroIA('A IA não devolveu conteúdo (pode ter sido bloqueado pelo filtro de segurança).');
  return lerRespostaIA(texto);
}
