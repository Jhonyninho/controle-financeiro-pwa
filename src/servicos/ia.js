// Diagnóstico financeiro com IA, usando a chave gratuita do próprio usuário.
//
// Provedores (todos chamados direto do navegador, sem servidor):
//  - Groq: grátis, sem cartão e muito rápido (Llama 3.3 70B). Recomendado.
//  - OpenRouter: modelos gratuitos variados (":free").
//  - Google Gemini: camada gratuita pequena; também fornece uma das vozes neurais.
//
// Privacidade:
//  - a chave é do próprio usuário e fica só neste navegador (localStorage), nunca no banco;
//  - só vão números agregados e nomes de categoria: nada de descrição de lançamento,
//    nome de conta, nome de pessoa, e-mail ou data exata.
// Limites: o app controla requisições por minuto e por dia antes de chamar a API.

const API = 'https://generativelanguage.googleapis.com/v1beta';
const CHAVE_CONFIG = 'cf.ia';
const CHAVE_USO = 'cf.ia.uso';

export const LIMITES_PADRAO = { porMinuto: 5, porDia: 100 };

export class ErroIA extends Error {}

// Modelos com cota na camada gratuita do Gemini, em ordem de preferência. Nomes novos
// que aparecem na listagem (ex.: "omni", "pro") muitas vezes têm cota 0 no free tier.
export const MODELOS_GRATUITOS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-flash-lite-latest', 'gemini-flash-latest'];

export const PROVEDORES = {
  groq: {
    nome: 'Groq',
    descricao: 'grátis, sem cartão e muito rápido (recomendado)',
    site: 'https://console.groq.com/keys',
    api: 'https://api.groq.com/openai/v1',
    modelos: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'],
    jsonNativo: true,
    limites: { porMinuto: 10, porDia: 300 },
  },
  openrouter: {
    nome: 'OpenRouter',
    descricao: 'modelos gratuitos variados, cerca de 50 análises por dia',
    site: 'https://openrouter.ai/settings/keys',
    api: 'https://openrouter.ai/api/v1',
    modelos: [
      'meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-chat-v3-0324:free', 'qwen/qwen-2.5-72b-instruct:free',
      'mistralai/mistral-small-3.2-24b-instruct:free', 'google/gemma-3-27b-it:free',
    ],
    jsonNativo: false,
    limites: { porMinuto: 5, porDia: 45 },
  },
  gemini: {
    nome: 'Google Gemini',
    descricao: 'cota gratuita pequena e respostas mais lentas',
    site: 'https://aistudio.google.com/apikey',
    modelos: MODELOS_GRATUITOS,
    limites: LIMITES_PADRAO,
  },
};

const modeloValido = (m) => typeof m === 'string' && /^[A-Za-z0-9._:/-]{3,80}$/.test(m);

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

/**
 * Configuração da IA neste aparelho. Versões antigas guardavam só { chave, modelo } do Gemini.
 * Devolve também `chave`/`modelo` do provedor ativo, por conveniência.
 */
export function configIA() {
  const c = ler(CHAVE_CONFIG, {}) || {};
  const chaves = { groq: '', openrouter: '', gemini: '' };
  for (const p of Object.keys(chaves)) if (typeof c.chaves?.[p] === 'string') chaves[p] = c.chaves[p];
  if (!chaves.gemini && typeof c.chave === 'string') chaves.gemini = c.chave;
  const modelos = {};
  for (const p of Object.keys(chaves)) if (modeloValido(c.modelos?.[p])) modelos[p] = c.modelos[p];
  if (!modelos.gemini && modeloValido(c.modelo)) modelos.gemini = c.modelo;

  const provedor = PROVEDORES[c.provedor] ? c.provedor : chaves.gemini && !chaves.groq ? 'gemini' : 'groq';
  const lim = PROVEDORES[provedor].limites;
  return {
    provedor,
    chaves,
    modelos,
    chave: chaves[provedor],
    modelo: modelos[provedor] || PROVEDORES[provedor].modelos[0],
    porMinuto: Number(c.porMinuto) > 0 ? Math.min(Number(c.porMinuto), 60) : lim.porMinuto,
    porDia: Number(c.porDia) > 0 ? Math.min(Number(c.porDia), 2000) : lim.porDia,
    limitesProprios: Number(c.porMinuto) > 0 || Number(c.porDia) > 0,
  };
}

/** m: { provedor?, chave? (do provedor), modelo?, porMinuto?, porDia? } */
export function salvarConfigIA(m = {}) {
  const bruto = ler(CHAVE_CONFIG, {}) || {};
  const a = configIA();
  const provedor = PROVEDORES[m.provedor] ? m.provedor : a.provedor;
  const chaves = { ...a.chaves };
  if (typeof m.chave === 'string') chaves[provedor] = m.chave.trim();
  const modelos = { ...a.modelos };
  if (modeloValido(m.modelo)) modelos[provedor] = m.modelo;
  gravar(CHAVE_CONFIG, {
    provedor,
    chaves,
    modelos,
    porMinuto: 'porMinuto' in m ? m.porMinuto : bruto.porMinuto,
    porDia: 'porDia' in m ? m.porDia : bruto.porDia,
  });
}

/** Apaga a chave de um provedor (ou toda a configuração da IA, sem argumento). */
export function esquecerChaveIA(provedor) {
  if (PROVEDORES[provedor]) {
    const bruto = ler(CHAVE_CONFIG, {}) || {};
    const chaves = { ...configIA().chaves, [provedor]: '' };
    gravar(CHAVE_CONFIG, { ...bruto, chave: undefined, chaves });
    return;
  }
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
export function promptSistema(assistente, { tratamento = null } = {}) {
  if (!assistente) return PROMPT_SISTEMA;
  const formal = tratamento === 'senhor' || tratamento === 'senhora';
  const comoTratar = formal
    ? `Trate o usuário com respeito por "${tratamento}" (sem nome próprio).`
    : 'Dirija-se ao usuário de forma cordial, sem pronome de tratamento e sem nome próprio.';
  const respeito = formal ? `"Com todo o respeito, ${tratamento}..."` : '"Com todo o respeito..."';
  return `${PROMPT_SISTEMA}

Personalidade: você é ${assistente}, o assistente virtual de inteligência artificial deste app de finanças.
Seja extremamente sofisticado, culto, cortês e sutilmente irônico quando apropriado, sempre respeitoso.
Use português do Brasil com vocabulário formal, elegante e preciso, de polidez quase britânica.
${comoTratar}
Seu humor acompanha a saúde financeira do mês:
- Finanças saudáveis (entradas maiores que saídas, gastos essenciais, metas em dia): tom leve, espirituoso e sutilmente bem-humorado; elogie a disciplina com elegância, com ironia refinada e simpática.
- Desperdício (saídas maiores que entradas, gastos supérfluos ou por impulso crescendo, alertas de excesso): mude para um tom firme, severo e sarcástico, com broncas elegantes e diretas, como ${respeito} ou "acredito que a matemática deste mês esteja seriamente comprometida". Não passe pano para compras por impulso e cobre responsabilidade, sem ofender nem humilhar.
- Mês misto: reconheça o que vai bem e seja firme no que vai mal.
Seja conciso e direto. Pode usar expressões como "análise concluída", "detectei", "recomendo".
O texto será lido em voz alta: frases limpas e curtas, sem siglas soltas, naturais de ouvir.
Não fale o próprio nome no meio do texto.`;
}

/** Formato da resposta para provedores sem esquema nativo (Groq/OpenRouter). */
const FORMATO_JSON = `
Responda SOMENTE com um objeto JSON válido (sem markdown, sem texto antes ou depois), exatamente com estas chaves:
{"resumo": "diagnóstico geral em 2 a 4 frases",
 "pontos_fortes": ["..."],
 "pontos_de_atencao": ["..."],
 "estrategias": [{"titulo": "...", "acao": "...", "economia_mensal_estimada": 0}],
 "metas": ["..."]}`;

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
    // alguns modelos embrulham o JSON em ```json ... ``` ou acrescentam texto em volta
    const ini = String(texto).indexOf('{');
    const fim = String(texto).lastIndexOf('}');
    try {
      j = JSON.parse(String(texto).slice(ini, fim + 1));
    } catch {
      throw new ErroIA('A IA devolveu uma resposta em formato inesperado. Tente de novo.');
    }
  }
  if (!j || typeof j !== 'object') throw new ErroIA('A IA devolveu uma resposta em formato inesperado. Tente de novo.');
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

export class ErroCota extends ErroIA {}

// ---- Groq / OpenRouter (API no formato da OpenAI) ----------------------------
async function chamarCompat(provedor, caminho, { chave, corpo, sinal } = {}) {
  const p = PROVEDORES[provedor];
  let r;
  try {
    r = await fetch(`${p.api}/${caminho}`, {
      method: corpo ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(chave ? { Authorization: `Bearer ${chave}` } : {}),
        ...(provedor === 'openrouter' ? { 'X-Title': 'Controle Financeiro' } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
      signal: sinal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new ErroIA(`Sem conexão com o ${p.nome}.`);
  }
  if (r.ok) return r.json();
  const detalhe = await r.text().catch(() => '');
  if (r.status === 401 || r.status === 403) throw new ErroIA(`Chave do ${p.nome} inválida. Confira em Configurações.`);
  if (r.status === 402) throw new ErroCota(`O ${p.nome} pediu créditos para este modelo.`);
  if (r.status === 429) throw new ErroCota(`Limite gratuito do ${p.nome} atingido por agora. Tente em alguns minutos.`);
  if (r.status === 404 || /model.*(not|decommission|exist|found|available)/i.test(detalhe)) throw new ErroIA('Modelo indisponível.');
  if (r.status === 413) throw new ErroIA('Pedido grande demais para o modelo gratuito.');
  throw new ErroIA(`O ${p.nome} não respondeu (erro ${r.status}). Tente mais tarde.`);
}

function textoCompat(r) {
  return r?.choices?.[0]?.message?.content || '';
}

/** Modelos a tentar, do salvo para os demais da lista do provedor. */
function ordemDeModelos(provedor, salvo) {
  const lista = PROVEDORES[provedor].modelos;
  return [salvo, ...lista.filter((m) => m !== salvo)].filter(Boolean);
}

async function testarCompat(provedor, chave) {
  const p = PROVEDORES[provedor];
  const lista = await chamarCompat(provedor, 'models', { chave: provedor === 'groq' ? chave : undefined });
  const ids = (lista?.data || []).map((m) => String(m.id || ''));
  let candidatos = p.modelos.filter((m) => ids.includes(m));
  if (provedor === 'openrouter') {
    // a lista de gratuitos muda com frequência: completa com outros ":free"
    candidatos = [...candidatos, ...ids.filter((id) => id.endsWith(':free') && !candidatos.includes(id) && modeloValido(id)).slice(0, 6)];
  }
  if (!candidatos.length) throw new ErroIA(`Nenhum modelo gratuito conhecido disponível no ${p.nome} agora.`);
  let ultimo;
  for (const modelo of candidatos) {
    try {
      await chamarCompat(provedor, 'chat/completions', {
        chave,
        corpo: { model: modelo, messages: [{ role: 'user', content: 'Responda apenas: ok' }], max_tokens: 5 },
      });
      return { modelo, modelos: ids };
    } catch (e) {
      if (!(e instanceof ErroCota) && e.message !== 'Modelo indisponível.') throw e;
      ultimo = e;
    }
  }
  throw new ErroIA(`A chave é válida, mas nenhum modelo gratuito respondeu agora (${ultimo?.message}).`);
}

async function diagnosticoCompat(cfg, payload, { sinal, assistente, tratamento }) {
  const p = PROVEDORES[cfg.provedor];
  const mensagens = [
    { role: 'system', content: `${promptSistema(assistente, { tratamento })}\n${FORMATO_JSON}` },
    { role: 'user', content: `Dados do mês (JSON):\n${JSON.stringify(payload)}` },
  ];
  let ultimo;
  for (const modelo of ordemDeModelos(cfg.provedor, cfg.modelo)) {
    try {
      const r = await chamarCompat(cfg.provedor, 'chat/completions', {
        chave: cfg.chave,
        sinal,
        corpo: {
          model: modelo,
          messages: mensagens,
          temperature: 0.4,
          max_tokens: 2500,
          ...(p.jsonNativo ? { response_format: { type: 'json_object' } } : {}),
        },
      });
      const texto = textoCompat(r);
      if (!texto) throw new ErroIA('A IA não devolveu conteúdo.');
      if (modelo !== cfg.modelo) salvarConfigIA({ provedor: cfg.provedor, modelo });
      return lerRespostaIA(texto);
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      if (!(e instanceof ErroCota) && e.message !== 'Modelo indisponível.') throw e;
      ultimo = e;
    }
  }
  throw new ErroCota(`${ultimo?.message || 'Sem cota gratuita agora.'} Se acontecer sempre, troque o provedor em Configurações.`);
}

// ---- Gemini ---------------------------------------------------------------------

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

/** Valida a chave do provedor e escolhe o primeiro modelo gratuito que realmente responde. */
export async function testarChave(chave, provedor = 'gemini') {
  if (provedor !== 'gemini') return testarCompat(provedor, chave);
  return testarGemini(chave);
}

async function testarGemini(chave) {
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

export async function gerarDiagnostico(payload, { sinal, assistente = null, tratamento = null } = {}) {
  const cfg = configIA();
  if (!cfg.chave) throw new ErroIA(`Cadastre sua chave do ${PROVEDORES[cfg.provedor].nome} em Configurações.`);
  verificarCota(cfg);
  registrarUso();
  if (cfg.provedor !== 'gemini') return diagnosticoCompat(cfg, payload, { sinal, assistente, tratamento });
  const corpo = {
    systemInstruction: { parts: [{ text: promptSistema(assistente, { tratamento }) }] },
    contents: [{ role: 'user', parts: [{ text: `Dados do mês (JSON):\n${JSON.stringify(payload)}` }] }],
    generationConfig: {
      temperature: 0.4, maxOutputTokens: 4096, responseMimeType: 'application/json', responseSchema: ESQUEMA,
    },
  };
  // Se o modelo salvo ficar sem cota, tenta os outros modelos gratuitos (cada um tem a sua cota).
  const ordem = [cfg.modelo, ...MODELOS_GRATUITOS.filter((m) => m !== cfg.modelo)];
  let r;
  let ultimo;
  for (const modelo of ordem) {
    // modelos "flash" 2.5 pensam antes de responder; sem isso a resposta sai em segundos
    const comPensamento = /^gemini-2\.5-flash/.test(modelo)
      ? { ...corpo, generationConfig: { ...corpo.generationConfig, thinkingConfig: { thinkingBudget: 0 } } }
      : corpo;
    try {
      r = await chamar(`models/${modelo}:generateContent`, { chave: cfg.chave, sinal, corpo: comPensamento });
      if (modelo !== cfg.modelo) salvarConfigIA({ provedor: 'gemini', modelo });
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
