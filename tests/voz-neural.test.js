// Narrador: voz do Gemini (diagnóstico) e falas gravadas (saudação).
// Navegador, Web Audio e rede são simulados; nenhum áudio real é gerado.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
const no = () => {
  const n = { connect: (d) => d || n, gain: param(), frequency: param(), Q: param() };
  return n;
};

function ambiente(responder) {
  const mem = {};
  const pedidos = [];
  const falas = [];
  globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
  globalThis.sessionStorage = { getItem: () => null, setItem() {} };
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  class FakeCtx {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 48000; this.destination = no(); }
    createGain() { return no(); }
    createAnalyser() { return { ...no(), frequencyBinCount: 8, getByteFrequencyData() {} }; }
    createBiquadFilter() { return no(); }
    createDynamicsCompressor() { return no(); }
    createOscillator() { return { ...no(), start() {}, stop() {} }; }
    createBuffer(c, n, taxa) { return { duration: n / taxa, copyToChannel() {} }; }
    createBufferSource() {
      const f = { ...no(), playbackRate: { value: 1 }, start: () => setTimeout(() => f.onended?.(), 0), stop() {} };
      return f;
    }
    async decodeAudioData() { return { sampleRate: 24000, getChannelData: () => new Float32Array(2400) }; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  globalThis.window = { AudioContext: FakeCtx, speechSynthesis: {} };
  globalThis.AudioContext = FakeCtx;
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  globalThis.speechSynthesis = {
    cancel() {}, speaking: false, getVoices: () => [{ name: 'Voz pt', lang: 'pt-BR' }], addEventListener() {},
    speak(u) { falas.push(u.text); setTimeout(() => { u.onstart?.(); u.onend?.(); }, 0); },
  };
  globalThis.fetch = vi.fn(async (url, op = {}) => {
    pedidos.push({ url: String(url), corpo: op.body ? JSON.parse(op.body) : null, op });
    return responder(String(url), op);
  });
  return { mem, pedidos, falas };
}

const audioGemini = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: btoa('\0\0'.repeat(1200)) } }] } }] }), { status: 200 });
const chaveGemini = (mem) => { mem['cf.ia'] = JSON.stringify({ provedor: 'groq', chaves: { gemini: 'AIza' + 'k'.repeat(35), groq: 'gsk_' + 'k'.repeat(40) } }); };

const LIMPAR = ['localStorage', 'sessionStorage', 'document', 'window', 'AudioContext', 'SpeechSynthesisUtterance', 'speechSynthesis', 'requestAnimationFrame', 'cancelAnimationFrame'];

describe('narrador', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { for (const k of LIMPAR) delete globalThis[k]; vi.restoreAllMocks(); });

  it('Gemini: diagnóstico longo em no máximo 2 pedidos, com a instrução de assistente e a voz escolhida', async () => {
    const amb = ambiente(audioGemini);
    chaveGemini(amb.mem);
    const voz = await import('../src/servicos/voz.js');
    voz.salvarConfigVoz({ motor: 'gemini', vozGemini: 'Orus', efeito: 'desligado' });
    const texto = Array.from({ length: 20 }, (_, i) => `Esta é a frase número ${i + 1} do diagnóstico do mês, com bastante conteúdo.`).join(' ');
    const avisos = [];
    await new Promise((fim, erro) => voz.criarNarrador(texto, { aoFim: fim, aoAviso: (m) => avisos.push(m) }).iniciar().catch(erro));
    expect(avisos).toEqual([]);
    expect(amb.falas).toEqual([]);
    expect(amb.pedidos).toHaveLength(2);
    const [p] = amb.pedidos;
    expect(p.url).toMatch(/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.5-flash-preview-tts:generateContent/);
    expect(p.op.headers['x-goog-api-key']).toMatch(/^AIza/);
    expect(p.corpo.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Orus');
    expect(p.corpo.contents[0].parts[0].text).toMatch(/assistente virtual/);
    // o texto todo foi enviado, sem repetir nem perder frases
    const enviado = amb.pedidos.map((x) => x.corpo.contents[0].parts[0].text.split('\n\n').pop()).join(' ');
    expect(enviado).toBe(texto);
  });

  it('Gemini sem cota: avisa e lê com a voz do navegador', async () => {
    const amb = ambiente(() => new Response('{"error":{"message":"quota"}}', { status: 429 }));
    chaveGemini(amb.mem);
    const voz = await import('../src/servicos/voz.js');
    voz.salvarConfigVoz({ motor: 'gemini', efeito: 'desligado' });
    const avisos = [];
    await new Promise((fim) => voz.criarNarrador('Teste curto.', { aoFim: fim, aoAviso: (m) => avisos.push(m) }).iniciar());
    expect(avisos[0]).toMatch(/voz do navegador/);
    expect(amb.falas).toEqual(['Teste curto.']);
  });

  it('saudação: sorteia falas gravadas e toca os MP3, sem chamar o Gemini', async () => {
    const amb = ambiente((url) => {
      if (url.endsWith('falas/indice.json')) {
        return new Response(JSON.stringify({ v: 3, voz: 'Charon', ids: ['a-tarde-senhor-t1', 'a-tarde-senhor-t2', 'a-noite-senhor-n1', 'a-noite-senhor-n2', 'a-manha-senhor-m1', 'a-madrugada-senhor-z2', 'c-geral-g1'] }));
      }
      return new Response(new Uint8Array(64), { status: 200 });
    });
    const voz = await import('../src/servicos/voz.js');
    voz.salvarConfigVoz({ motor: 'gemini', tratamento: 'senhor', efeito: 'desligado' });
    const n = await voz.tocarSaudacao('Rafael Augusto');
    expect(n).toBeTruthy();
    await new Promise((ok) => setTimeout(ok, 30));
    const mp3 = amb.pedidos.filter((p) => p.url.includes('.mp3'));
    expect(mp3.length).toBeGreaterThan(0);
    expect(mp3[0].url).toMatch(/falas\/a-[a-z]+-senhor-[a-z0-9]+\.mp3\?v=3$/);
    expect(amb.pedidos.some((p) => p.url.includes('generativelanguage'))).toBe(false);
    expect(amb.falas).toEqual([]);
    expect(JSON.parse(amb.mem['cf.saudacoesRecentes'])[0]).toMatch(/^a-/);
  });

  it('saudação sem gravações ainda: lê uma fala sorteada com a voz do navegador', async () => {
    const amb = ambiente(() => new Response('', { status: 404 }));
    const voz = await import('../src/servicos/voz.js');
    voz.salvarConfigVoz({ tratamento: 'senhora' });
    await voz.tocarSaudacao('Rafael Augusto');
    await new Promise((ok) => setTimeout(ok, 30));
    expect(amb.falas.join(' ')).toMatch(/senhora/);
    expect(amb.falas.join(' ')).not.toMatch(/Rafael/);
  });
});
