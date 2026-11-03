// Narração do diagnóstico em voz alta, com legenda acompanhando a fala.
//
// Motores:
//  - "navegador": Web Speech API (vozes do sistema; grátis, sem cota, instantâneo);
//  - "gemini": voz neural do Gemini (TTS) com a chave já cadastrada para o diagnóstico.
//    A cota gratuita de voz é pequena, então cada leitura usa no máximo 2 pedidos.
// A saudação ao entrar NÃO gasta cota: são falas gravadas uma vez com a voz do Gemini
// (public/falas, src/lib/saudacoes.js) e sorteadas a cada entrada.
// O áudio neural toca pelo Web Audio (sem <audio>/blob), o que permite o timbre de IA
// (equalização, eco metálico) e um analisador para animar a interface.

import { ErroCota, ErroIA, chamar, configIA, registrarUso, verificarCota } from './ia.js';
import { sortearSaudacao } from '../lib/saudacoes.js';

const CHAVE = 'cf.voz';

export const MOTORES = [
  { id: 'navegador', nome: 'Voz do navegador', descricao: 'grátis, sem limite e instantânea; sem os efeitos de IA' },
  { id: 'gemini', nome: 'Voz neural do Gemini', descricao: 'voz de assistente com a sua chave do Gemini; poucas leituras por dia na cota grátis' },
];
const NEURAIS = new Set(['gemini']);

export const VOZES_GEMINI = [
  { id: 'Charon', descricao: 'grave e informativa (masculina)' },
  { id: 'Orus', descricao: 'firme (masculina)' },
  { id: 'Iapetus', descricao: 'clara (masculina)' },
  { id: 'Algenib', descricao: 'rouca (masculina)' },
  { id: 'Fenrir', descricao: 'animada (masculina)' },
  { id: 'Kore', descricao: 'firme (feminina)' },
  { id: 'Sulafat', descricao: 'calorosa (feminina)' },
  { id: 'Aoede', descricao: 'leve (feminina)' },
];

export const NOME_PADRAO = 'M.A.V.I.Z.';
const NOMES_ANTIGOS = new Set(['Vega']); // padrão de versões anteriores vira o novo padrão

/** Como o nome é pronunciado: siglas com pontos ("M.A.V.I.Z.") viram palavra ("Maviz"). */
export function nomeFalado(nome) {
  const n = String(nome || '').trim();
  if (/^(\p{L}\.){2,}\p{L}?\.?$/u.test(n)) {
    const junto = n.replace(/\./g, '');
    return junto.charAt(0).toUpperCase() + junto.slice(1).toLowerCase();
  }
  return n;
}

/** Quanto do "timbre de IA" aplicar sobre a voz neural. */
export const NIVEIS_EFEITO = [
  { id: 'assistente', nome: 'Assistente de IA', descricao: 'timbre metálico, leve modulação digital e ambiência de cabine' },
  { id: 'sutil', nome: 'Sutil', descricao: 'só equalização e um eco curto' },
  { id: 'desligado', nome: 'Desligado', descricao: 'voz neural pura' },
];

/** Instrução de interpretação enviada junto com o texto (o Gemini TTS segue o "jeito de falar"). */
export function instrucaoDeFala(estilo, nome) {
  if (estilo === 'natural') return 'Leia em português do Brasil, com voz calma, confiante e clara:';
  return `Você é ${nomeFalado(nome)}, um assistente virtual de inteligência artificial de altíssima tecnologia. ` +
    'Leia o texto abaixo em português do Brasil com voz grave de barítono leve, serena e segura, dicção impecável, ' +
    'consoantes bem pronunciadas, ritmo cadenciado e pausado, num tom formal, polido e elegante, com um leve humor seco. ' +
    'Não acrescente nem omita nada do texto:';
}

export const MODELOS_TTS = ['gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-tts', 'gemini-2.5-pro-preview-tts'];

export function configVoz() {
  let c = {};
  try {
    c = JSON.parse(localStorage.getItem(CHAVE) || '{}') || {};
  } catch {
    /* sem storage */
  }
  return {
    // motores removidos (azure, eleven, propria) voltam para a voz do navegador
    motor: MOTORES.some((m) => m.id === c.motor) ? c.motor : 'navegador',
    tratamento: ['senhor', 'senhora'].includes(c.tratamento) ? c.tratamento : 'nome',
    vozGemini: VOZES_GEMINI.some((v) => v.id === c.vozGemini) ? c.vozGemini : 'Charon',
    vozNavegador: typeof c.vozNavegador === 'string' ? c.vozNavegador : '',
    velocidade: Number(c.velocidade) >= 0.7 && Number(c.velocidade) <= 1.5 ? Number(c.velocidade) : 1,
    // efeitoHud (versões antigas) vira o nível "assistente"/"desligado"
    efeito: NIVEIS_EFEITO.some((n) => n.id === c.efeito) ? c.efeito : c.efeitoHud === false ? 'desligado' : 'assistente',
    estilo: c.estilo === 'natural' ? 'natural' : 'assistente',
    assistente: nomeAssistenteValido(c.assistente),
    lerAuto: c.lerAuto === true,
    saudacao: c.saudacao !== false,
  };
}

/** Nome do assistente: só letras, ponto, espaço e hífen, até 20 caracteres (vai para a fala e o prompt). */
export function nomeAssistenteValido(n) {
  const limpo = String(n || '').replace(/[^\p{L}. -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return limpo && !NOMES_ANTIGOS.has(limpo) ? limpo : NOME_PADRAO;
}

/** O motor escolhido está configurado? */
export function motorPronto(cfg = configVoz()) {
  if (cfg.motor === 'gemini') return configIA().chaves.gemini.length >= 20;
  return true;
}

export function salvarConfigVoz(m) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ ...configVoz(), ...m }));
  } catch {
    /* sem storage */
  }
}

export const vozDisponivel = () => typeof window !== 'undefined' && ('speechSynthesis' in window || 'AudioContext' in window);

/** Vozes pt do sistema (a lista carrega de forma assíncrona em alguns navegadores). */
export function vozesDoNavegador() {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  const filtrar = () => speechSynthesis.getVoices().filter((v) => /^pt(-|_|$)/i.test(v.lang));
  const ja = filtrar();
  if (ja.length) return Promise.resolve(ordenarVozes(ja));
  return new Promise((ok) => {
    const t = setTimeout(() => ok(ordenarVozes(filtrar())), 1500);
    speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); ok(ordenarVozes(filtrar())); }, { once: true });
  });
}
// vozes neurais ("Natural"/"Online"/Google) primeiro, pt-BR antes de pt-PT
function ordenarVozes(vozes) {
  const nota = (v) => (/natural|online|neural/i.test(v.name) ? 0 : /google/i.test(v.name) ? 1 : 2) + (/BR/i.test(v.lang) ? 0 : 5);
  return [...vozes].sort((a, b) => nota(a) - nota(b));
}

/**
 * Frase pronta para ler em voz alta: maiúscula no início e pontuação no fim. Sem o ponto
 * final, a voz emenda um item no outro e a divisão em frases não acontece.
 */
export function pontuar(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim().replace(/[\s,;:–—-]+$/u, '');
  if (!t) return '';
  const cap = t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1);
  return /[.!?…]["”)]?$/u.test(cap) ? cap : `${cap}.`;
}

const FRASE_MAX = 200; // a voz do navegador corta falas muito longas (Chrome: cerca de 15 s)

/** Frase longa demais é quebrada na vírgula (ou ponto e vírgula) mais perto do meio. */
function quebrarLonga(f) {
  if (f.length <= FRASE_MAX) return [f];
  const cortes = [...f.matchAll(/[,;]\s/g)].map((m) => m.index + 1).filter((i) => i > 40 && f.length - i > 40);
  if (!cortes.length) return [f];
  const meio = f.length / 2;
  const i = cortes.reduce((a, b) => (Math.abs(b - meio) < Math.abs(a - meio) ? b : a));
  return [...quebrarLonga(f.slice(0, i).trim()), ...quebrarLonga(f.slice(i).trim())];
}

/** Quebra o texto em frases para narrar e destacar uma de cada vez. */
export function dividirFrases(texto) {
  return String(texto || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…;:])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9"“(])|(?<=[.!?…])\s+(?=[a-záéíóúâêôãõç])/u)
    .map((f) => f.trim())
    .filter(Boolean)
    .flatMap(quebrarLonga);
}

/** Texto falado a partir do diagnóstico (mesma ordem da tela). */
export function roteiroDoDiagnostico(d) {
  const partes = [];
  const itens = (l) => l.map(pontuar).filter(Boolean).join(' ');
  if (d.resumo) partes.push(pontuar(d.resumo));
  if (d.pontos_fortes?.length) partes.push(`Pontos fortes. ${itens(d.pontos_fortes)}`);
  if (d.pontos_de_atencao?.length) partes.push(`Pontos de atenção. ${itens(d.pontos_de_atencao)}`);
  for (const e of d.estrategias || []) {
    const eco = e.economia ? ` Economia estimada de ${Math.round(e.economia)} reais por mês.` : '';
    partes.push(`${itens([e.titulo, e.acao])}${eco}`);
  }
  if (d.metas?.length) partes.push(`Sobre as metas. ${itens(d.metas)}`);
  // falas mais naturais: "R$ 1.234,56" → "1.234,56 reais"
  return partes.join(' ').replace(/R\$\s?([\d.]+(?:,\d{2})?)/g, '$1 reais');
}

// ---------------------------------------------------------------------
// Gemini TTS
// ---------------------------------------------------------------------
const cacheAudio = new Map(); // chave → { pcm: Float32Array, taxa }

/** PCM 16 bits little-endian (base64) → Float32. */
export function pcmParaFloat(base64) {
  const bin = atob(base64);
  const n = bin.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    out[i] = v / 0x8000;
  }
  return out;
}

async function sintetizarGemini(texto, voz, sinal, { contarUso = true, instrucao = instrucaoDeFala('natural') } = {}) {
  const chaveCache = `${voz}|${instrucao}|${texto}`;
  if (cacheAudio.has(chaveCache)) return cacheAudio.get(chaveCache);
  const cfg = configIA();
  const chaveGemini = cfg.chaves.gemini;
  if (!chaveGemini) throw new ErroIA('Cadastre a chave do Gemini em Configurações → Diagnóstico com IA para usar esta voz.');
  // a voz conta no limite do app só quando o Gemini também é o provedor do diagnóstico
  if (contarUso && cfg.provedor === 'gemini') {
    verificarCota(cfg);
    registrarUso();
  }
  const corpo = {
    contents: [{ parts: [{ text: `${instrucao}\n\n${texto}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } },
    },
  };
  let ultimo;
  for (const modelo of MODELOS_TTS) {
    try {
      const r = await chamar(`models/${modelo}:generateContent`, { chave: chaveGemini, corpo, sinal });
      const parte = r?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!parte) throw new ErroIA('A voz do Gemini não devolveu áudio.');
      const audio = { pcm: pcmParaFloat(parte.inlineData.data), taxa: 24000 };
      cacheAudio.set(chaveCache, audio);
      return audio;
    } catch (e) {
      if (e?.name === 'AbortError' || sinal?.aborted) throw e;
      if (!(e instanceof ErroCota) && !/Modelo indisponível/.test(e.message)) throw e;
      ultimo = e;
    }
  }
  throw new ErroCota(`Sem cota para a voz do Gemini agora (${ultimo?.message || 'limite do dia'}).`);
}

// ---------------------------------------------------------------------
// Falas gravadas (saudação)
// ---------------------------------------------------------------------
const base = () => (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
let indiceFalas = null; // Promise<{ v, ids: Set }>

/** Índice das falas gravadas (public/falas/indice.json); vazio se ainda não foram geradas. */
export function carregarIndiceFalas() {
  indiceFalas ||= fetch(`${base()}falas/indice.json`, { credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : { ids: [] }))
    .then((j) => ({ v: Number(j.v) || 1, ids: new Set(Array.isArray(j.ids) ? j.ids : []) }))
    .catch(() => ({ v: 1, ids: new Set() }));
  return indiceFalas;
}

async function baixarFala(id, v, ctx, sinal) {
  const r = await fetch(`${base()}falas/${encodeURIComponent(id)}.mp3?v=${v}`, { signal: sinal, credentials: 'omit' });
  if (!r.ok) throw new ErroIA('Fala gravada não encontrada.');
  const buf = await ctx.decodeAudioData(await r.arrayBuffer());
  return { pcm: buf.getChannelData(0).slice(), taxa: buf.sampleRate };
}

/**
 * Agrupa as frases em blocos para a voz neural: o primeiro é curto (começa a falar em
 * poucos segundos) e os seguintes são maiores, no máximo 4 blocos (cada um é uma chamada).
 */
export function blocosDeFala(frases, { primeiro = 170, demais = 700, maxBlocos = 4 } = {}) {
  if (!frases.length) return [];
  const total = frases.reduce((s, f) => s + f.length + 1, 0);
  const blocos = [];
  let atual = [];
  let tam = 0;
  let limite = primeiro;
  for (let i = 0; i < frases.length; i++) {
    const f = frases[i];
    if (atual.length && tam + f.length > limite) {
      blocos.push(atual);
      atual = [];
      tam = 0;
      // o que sobra é dividido igualmente entre os blocos restantes
      const restante = total - blocos.flat().reduce((s, k) => s + frases[k].length + 1, 0);
      limite = Math.max(demais, Math.ceil(restante / Math.max(1, maxBlocos - blocos.length)));
    }
    atual.push(i);
    tam += f.length + 1;
  }
  if (atual.length) blocos.push(atual);
  return blocos;
}

// ---------------------------------------------------------------------
// Narrador
// ---------------------------------------------------------------------
/** Espera o primeiro toque/tecla (navegadores só liberam áudio após uma interação). */
function aposInteracao() {
  return new Promise((ok) => {
    const vai = () => {
      ['pointerdown', 'keydown'].forEach((ev) => document.removeEventListener(ev, vai, true));
      ok();
    };
    ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, vai, true));
  });
}

/**
 * Narra o texto e avisa qual frase está sendo falada.
 * eventos: { aoFrase(i), aoNivel(0..1), aoFim(), aoMotor(nome), aoAviso(msg) }
 * opcoes: { clipes: { ids, v } } toca falas gravadas (public/falas) em vez de sintetizar;
 *         { vinheta } toca o som de "sistema iniciando" antes da fala.
 */
export function criarNarrador(texto, eventos = {}, opcoes = {}) {
  const frases = dividirFrases(texto);
  const cfg = configVoz();
  // "M.A.V.I.Z." aparece escrito assim, mas é falado "Maviz"
  const falado = nomeFalado(cfg.assistente);
  const falavel = (t) => (falado !== cfg.assistente ? String(t).split(cfg.assistente).join(falado) : t);
  let parado = false;
  let pausado = false;
  let ctx = null;
  const fontes = [];
  let raf = 0;
  const abortar = new AbortController();

  const fim = () => {
    cancelAnimationFrame(raf);
    clearTimeout(raf);
    eventos.aoNivel?.(0);
    if (!parado) eventos.aoFim?.();
    parado = true;
  };

  async function viaNavegador() {
    eventos.aoMotor?.('navegador');
    if (!('speechSynthesis' in window)) throw new ErroIA('Este navegador não tem leitura em voz alta.');
    speechSynthesis.cancel();
    const vozes = await vozesDoNavegador();
    const voz = vozes.find((v) => v.name === cfg.vozNavegador) || vozes[0] || null;
    let i = 0;
    let bloqueado = false;
    const proxima = () => {
      if (parado) return;
      if (i >= frases.length) return fim();
      const u = new SpeechSynthesisUtterance(falavel(frases[i]));
      u.lang = voz?.lang || 'pt-BR';
      if (voz) u.voice = voz;
      // estilo assistente: um pouco mais grave e pausado
      u.rate = cfg.velocidade * (cfg.estilo === 'assistente' ? 0.95 : 1);
      u.pitch = cfg.estilo === 'assistente' ? 0.9 : 1;
      u.onstart = () => eventos.aoFrase?.(i);
      u.onend = () => { i += 1; proxima(); };
      u.onerror = (ev) => {
        // sem interação ainda (ex.: sessão restaurada): tenta de novo no primeiro toque
        if (ev.error === 'not-allowed' && !bloqueado) {
          bloqueado = true;
          aposInteracao().then(proxima);
          return;
        }
        i += 1;
        proxima();
      };
      speechSynthesis.speak(u);
    };
    // "pulsação" simulada para animar a interface (a Web Speech não expõe o áudio)
    const pulsar = () => {
      if (parado) return;
      eventos.aoNivel?.(pausado || !speechSynthesis.speaking ? 0 : 0.35 + Math.random() * 0.5);
      raf = setTimeout(pulsar, 110);
    };
    pulsar();
    proxima();
  }

  /**
   * Timbre de "IA": corta graves embolados, encorpa o médio-grave, realça presença e brilho,
   * soma um eco metálico curto (filtro de pente), uma modulação digital bem leve (anel) e uma
   * ambiência curta de "cabine". Tudo no Web Audio, sem bibliotecas.
   */
  function cadeiaAssistente(entrada, analisador) {
    const passaAlta = ctx.createBiquadFilter();
    passaAlta.type = 'highpass';
    passaAlta.frequency.value = 110;
    const corpo = ctx.createBiquadFilter();
    corpo.type = 'lowshelf';
    corpo.frequency.value = 220;
    corpo.gain.value = 3;
    const presenca = ctx.createBiquadFilter();
    presenca.type = 'peaking';
    presenca.frequency.value = 3200;
    presenca.Q.value = 0.8;
    presenca.gain.value = 4.5;
    const brilho = ctx.createBiquadFilter();
    brilho.type = 'highshelf';
    brilho.frequency.value = 8500;
    brilho.gain.value = 3;
    entrada.connect(passaAlta).connect(corpo).connect(presenca).connect(brilho);

    const mix = ctx.createGain();
    // seco
    brilho.connect(mix);
    // eco metálico (pente): atraso curtíssimo com realimentação
    const pente = ctx.createDelay(0.05);
    pente.delayTime.value = 0.0085;
    const realim = ctx.createGain();
    realim.gain.value = 0.38;
    const penteMolhado = ctx.createGain();
    penteMolhado.gain.value = 0.22;
    brilho.connect(pente).connect(realim).connect(pente);
    pente.connect(penteMolhado).connect(mix);
    // modulação digital leve (anel a 48 Hz, bem baixa)
    const anel = ctx.createGain();
    anel.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.frequency.value = 48;
    const prof = ctx.createGain();
    prof.gain.value = 0.07;
    osc.connect(prof).connect(anel.gain);
    osc.start();
    brilho.connect(anel).connect(mix);
    // ambiência curta de cabine (impulso gerado na hora, ~0,35 s)
    const sala = ctx.createConvolver();
    const n = Math.floor(ctx.sampleRate * 0.35);
    const ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
    }
    sala.buffer = ir;
    const salaMolhada = ctx.createGain();
    salaMolhada.gain.value = 0.11;
    brilho.connect(sala).connect(salaMolhada).connect(mix);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.ratio.value = 3;
    const volume = ctx.createGain();
    volume.gain.value = 0.95;
    mix.connect(compressor).connect(volume).connect(analisador).connect(ctx.destination);
    return { entrada, analisador };
  }

  /** Vinheta curta de "sistema iniciando" (sintetizada, ~0,7 s). Devolve a duração. */
  function tocarVinheta(destino, inicio) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, inicio);
    g.gain.linearRampToValueAtTime(0.16, inicio + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0008, inicio + 0.7);
    g.connect(destino);
    for (const [f0, f1, atraso] of [[520, 1040, 0], [780, 1560, 0.09]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, inicio + atraso);
      o.frequency.exponentialRampToValueAtTime(f1, inicio + atraso + 0.22);
      o.connect(g);
      o.start(inicio + atraso);
      o.stop(inicio + 0.72);
    }
    return 0.75;
  }

  function montarCadeia() {
    const analisador = ctx.createAnalyser();
    analisador.fftSize = 256;
    const entrada = ctx.createGain();
    let saida = entrada;
    if (cfg.efeito === 'assistente') return cadeiaAssistente(entrada, analisador);
    if (cfg.efeito === 'sutil') {
      // voz de "assistente": corta graves, realça presença e adiciona um eco curto metálico
      const passaAlta = ctx.createBiquadFilter();
      passaAlta.type = 'highpass';
      passaAlta.frequency.value = 140;
      const presenca = ctx.createBiquadFilter();
      presenca.type = 'peaking';
      presenca.frequency.value = 3000;
      presenca.gain.value = 4;
      presenca.Q.value = 0.9;
      const atraso = ctx.createDelay(0.1);
      atraso.delayTime.value = 0.014;
      const retorno = ctx.createGain();
      retorno.gain.value = 0.28;
      const molhado = ctx.createGain();
      molhado.gain.value = 0.32;
      const compressor = ctx.createDynamicsCompressor();
      entrada.connect(passaAlta).connect(presenca);
      presenca.connect(compressor);
      presenca.connect(atraso).connect(retorno).connect(atraso);
      atraso.connect(molhado).connect(compressor);
      saida = compressor;
    }
    saida.connect(analisador).connect(ctx.destination);
    return { entrada, analisador };
  }

  /**
   * Toca uma fila de blocos de áudio em sequência, sem pausas: enquanto um bloco toca, os
   * próximos já estão sendo gerados. `obter(n)` devolve Promise<{ pcm, taxa }>.
   */
  async function reproduzirFila(blocos, obter, { ritmo = 1, adiante = 2 } = {}) {
    if (!blocos.length) return fim();
    const pedidos = [];
    const pedir = (n) => {
      if (n >= blocos.length || pedidos[n]) return;
      pedidos[n] = obter(n);
      pedidos[n].catch(() => {});
    };
    for (let k = 0; k < adiante; k++) pedir(k);
    const primeiro = await pedidos[0]; // erro aqui cai para a voz do navegador
    if (parado) return;
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
      if (ctx.state === 'suspended') await aposInteracao().then(() => ctx.resume());
    }
    const { entrada, analisador } = montarCadeia();
    const linha = []; // { ini, dur, idx } no relógio do AudioContext
    let proximoInicio = ctx.currentTime + 0.05;
    if (opcoes.vinheta) proximoInicio += tocarVinheta(ctx.destination, proximoInicio);
    const terminar = () => { ctx.close().catch(() => {}); fim(); };

    const agendar = ({ pcm, taxa }, bloco) => {
      if (!pcm.length) return null;
      const buf = ctx.createBuffer(1, pcm.length, taxa);
      buf.copyToChannel(pcm, 0);
      const f = ctx.createBufferSource();
      f.buffer = buf;
      f.playbackRate.value = ritmo;
      f.connect(entrada);
      const ini = Math.max(proximoInicio, ctx.currentTime + 0.03);
      f.start(ini);
      const dur = buf.duration / ritmo;
      linha.push({ ini, dur, idx: bloco.idx });
      proximoInicio = ini + dur + 0.06; // respiro curto entre blocos
      fontes.push(f);
      return f;
    };

    const encadear = async (n, audio) => {
      if (parado) return;
      const f = agendar(audio, blocos[n]);
      pedir(n + adiante);
      if (n === blocos.length - 1) {
        if (f) f.onended = terminar;
        else terminar();
        return;
      }
      let prox;
      try {
        prox = await pedidos[n + 1];
      } catch (e) {
        if (!parado) eventos.aoAviso?.(`A voz parou no meio: ${e.message}`);
        if (f) f.onended = terminar;
        return;
      }
      encadear(n + 1, prox);
    };
    encadear(0, primeiro);

    // destaque da frase: dentro de cada bloco, proporcional ao tamanho das frases
    const dados = new Uint8Array(analisador.frequencyBinCount);
    let atual = -1;
    const tique = () => {
      if (parado) return;
      const t = ctx.currentTime;
      const seg = linha.findLast((s) => s.ini <= t);
      if (seg) {
        const prog = Math.min(1, (t - seg.ini) / seg.dur);
        const tam = seg.idx.map((i) => frases[i].length);
        const total = tam.reduce((s, v) => s + v, 0) || 1;
        let acc = 0;
        let i = seg.idx[0];
        for (let k = 0; k < seg.idx.length; k++) {
          if (acc / total <= prog) i = seg.idx[k];
          acc += tam[k];
        }
        if (i !== atual) { atual = i; eventos.aoFrase?.(i); }
      }
      analisador.getByteFrequencyData(dados);
      eventos.aoNivel?.(Math.min(1, dados.reduce((s, v) => s + v, 0) / dados.length / 90));
      raf = requestAnimationFrame(tique);
    };
    tique();
  }

  async function viaNeural() {
    eventos.aoMotor?.(cfg.motor);
    // no máximo 2 pedidos por leitura (a cota grátis de voz do Gemini é pequena):
    // um bloco curto para começar a falar logo e o resto, gerado enquanto o primeiro toca
    const blocos = blocosDeFala(frases, { primeiro: 170, demais: 700, maxBlocos: 2 })
      .map((idx) => ({ idx, texto: falavel(idx.map((i) => frases[i]).join(' ')) }));
    const sinal = abortar.signal;
    const instrucao = instrucaoDeFala(cfg.estilo, cfg.assistente);
    const ritmo = cfg.velocidade * (cfg.efeito === 'assistente' ? 0.97 : 1);
    await reproduzirFila(
      blocos,
      (n) => sintetizarGemini(blocos[n].texto, cfg.vozGemini, sinal, { contarUso: n === 0, instrucao }),
      { ritmo, adiante: 2 },
    );
  }

  /** Falas já gravadas (saudação): uma por bloco, baixadas e tocadas em sequência. */
  async function viaClipes() {
    const { ids, textos, v } = opcoes.clipes;
    let ini = 0;
    const blocos = textos.map((t) => {
      const n = dividirFrases(t).length || 1;
      const idx = Array.from({ length: n }, (_, k) => Math.min(ini + k, frases.length - 1));
      ini += n;
      return { idx };
    });
    await reproduzirFila(blocos, (n) => baixarFala(ids[n], v, ctx, abortar.signal), { ritmo: 1, adiante: 2 });
  }

  const iniciar = async () => {
    if (opcoes.clipes?.ids?.length && 'AudioContext' in window) {
      ctx = new AudioContext();
      try {
        await viaClipes();
        return;
      } catch {
        // sem as falas gravadas (offline, arquivo ausente): lê o mesmo texto com a voz do navegador
        ctx?.close().catch(() => {});
        ctx = null;
        if (parado) return;
      }
    } else if (NEURAIS.has(cfg.motor) && 'AudioContext' in window) {
      // criado já no toque do usuário, para o navegador liberar o som
      ctx = new AudioContext();
      try {
        await viaNeural();
        return;
      } catch (e) {
        ctx?.close().catch(() => {});
        ctx = null;
        if (parado) return;
        eventos.aoAviso?.(`${e.message} Usando a voz do navegador.`);
      }
    }
    await viaNavegador();
  };

  return {
    frases,
    iniciar,
    pausar() {
      pausado = true;
      if (ctx) ctx.suspend();
      else speechSynthesis.pause();
    },
    continuar() {
      pausado = false;
      if (ctx) ctx.resume();
      else speechSynthesis.resume();
    },
    parar() {
      parado = true;
      abortar.abort();
      cancelAnimationFrame(raf);
      clearTimeout(raf);
      for (const f of fontes) {
        try { f.stop(); } catch { /* já parou */ }
      }
      ctx?.close().catch(() => {});
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      eventos.aoNivel?.(0);
    },
    get pausado() { return pausado; },
  };
}

// ---------------------------------------------------------------------
// Saudação ao entrar no app
// ---------------------------------------------------------------------
const FRASES_SAUDACAO = [
  'Bora cuidar da vida financeira?',
  'Vamos ver como estão as suas finanças hoje?',
  'Pronto para deixar o mês no azul?',
  'Que tal dar uma olhada nos seus números?',
];

export function periodoDoDia(hora = new Date().getHours()) {
  return hora >= 5 && hora < 12 ? 'Bom dia' : hora >= 12 && hora < 18 ? 'Boa tarde' : 'Boa noite';
}

// Abertura do assistente: varia pouco para o áudio neural poder ficar guardado no aparelho.
const ABERTURAS_ASSISTENTE = ['sistemas financeiros online.', 'tudo pronto por aqui.', 'seus números já estão carregados.', 'painel financeiro ativo.'];

/**
 * Texto da saudação, fixo por período do dia + nome (o áudio neural fica guardado).
 * Com `assistente` (nome), vem na voz da personagem: "Boa noite, Rafael. Aqui é Vega, ...".
 */
export function textoSaudacao(nome, { hora = new Date().getHours(), dia = new Date().getDate(), assistente = null, tratamento = 'nome' } = {}) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0];
  const frase = FRASES_SAUDACAO[dia % FRASES_SAUDACAO.length];
  if (assistente) {
    const abertura = ABERTURAS_ASSISTENTE[dia % ABERTURAS_ASSISTENTE.length];
    const pronome = tratamento === 'senhor' || tratamento === 'senhora' ? tratamento : '';
    const quem = [pronome, primeiro].filter(Boolean).join(' ');
    return `${periodoDoDia(hora)}${quem ? `, ${quem}` : ''}. Aqui é ${assistente}, ${abertura} ${frase}`;
  }
  return `${periodoDoDia(hora)}${primeiro ? `, ${primeiro}` : ''}! ${frase}`;
}

const CHAVE_RECENTES = 'cf.saudacoesRecentes';
function lerRecentes() {
  try {
    const r = JSON.parse(localStorage.getItem(CHAVE_RECENTES) || '[]');
    return Array.isArray(r) ? r.filter((x) => typeof x === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}
function lembrarRecentes(ids) {
  try {
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify([...ids, ...lerRecentes()].slice(0, 8)));
  } catch {
    /* sem storage */
  }
}

const hojeLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Fala a saudação uma vez por sessão (se ligada em Configurações → Assistente e voz).
 * No estilo assistente, sorteia uma das falas gravadas (sem gastar cota); se ainda não houver
 * gravações, lê o mesmo texto sorteado com a voz do navegador.
 */
export function falarSaudacao(nome) {
  const cfg = configVoz();
  if (!cfg.saudacao || !vozDisponivel()) return null;
  try {
    if (sessionStorage.getItem('cf.saudou')) return null;
    sessionStorage.setItem('cf.saudou', '1');
  } catch {
    /* sem storage: fala mesmo assim */
  }
  tocarSaudacao(nome).catch(() => {});
  return true;
}

/** Sorteia e toca uma saudação agora (também usado pelo botão "Ouvir uma saudação"). Devolve o narrador. */
export async function tocarSaudacao(nome) {
  const cfg = configVoz();
  if (cfg.estilo !== 'assistente') {
    // estilo natural: saudação simples com o nome, na voz do navegador (sem gastar cota)
    const n = criarNarrador(textoSaudacao(nome), {});
    n.iniciar().catch(() => {});
    return n;
  }
  const { ids, v } = await carregarIndiceFalas();
  const agora = new Date();
  const comNome = cfg.assistente === NOME_PADRAO; // as gravações dizem "Maviz"
  const sorteio = (disponiveis) => sortearSaudacao({
    hora: agora.getHours(), data: hojeLocal(agora), tratamento: cfg.tratamento, comNome, recentes: lerRecentes(), disponiveis,
  });
  const gravadas = ids.size ? sorteio(ids) : [];
  const falas = gravadas.length ? gravadas : sorteio(null);
  if (!falas.length) return null;
  lembrarRecentes(falas.map((x) => x.id));
  const textos = falas.map((x) => x.texto);
  const clipes = gravadas.length ? { ids: falas.map((x) => x.id), textos, v } : null;
  const n = criarNarrador(textos.join(' '), {}, { clipes, vinheta: Boolean(clipes) });
  n.iniciar().catch(() => {});
  return n;
}

/**
 * Limpa o que versões anteriores deixaram no aparelho: a voz local Piper (~96 MB), as saudações
 * neurais guardadas (substituídas pelas falas gravadas) e chaves de vozes removidas (Azure, ElevenLabs).
 */
export function limparVozLocalAntiga() {
  try {
    if (typeof caches !== 'undefined') caches.delete('cf-voz-local-v1').catch(() => {});
  } catch {
    /* sem Cache Storage */
  }
  try {
    if (typeof indexedDB !== 'undefined') ['cf-voz', 'cf-voz-2'].forEach((b) => indexedDB.deleteDatabase(b));
  } catch {
    /* sem IndexedDB */
  }
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (c && (c.azure || c.eleven || c.propria)) {
      delete c.azure;
      delete c.eleven;
      delete c.propria;
      localStorage.setItem(CHAVE, JSON.stringify(c));
    }
  } catch {
    /* sem storage */
  }
}
