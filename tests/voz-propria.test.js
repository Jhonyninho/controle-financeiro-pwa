// Voz própria: o narrador chama o servidor do usuário (Colab) e toca o WAV pelo Web Audio.
// Navegador, Web Audio e servidor são simulados; nenhum áudio real é gerado.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const no = () => {
  const n = { connect: (d) => d || n, gain: { value: 0 }, frequency: { value: 0 }, Q: { value: 0 } };
  return n;
};

function ambiente({ resposta }) {
  const mem = {};
  const pedidos = [];
  const falas = [];
  globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  class FakeCtx {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 48000; this.destination = no(); }
    createGain() { return no(); }
    createAnalyser() { return { ...no(), frequencyBinCount: 8, getByteFrequencyData() {} }; }
    createBiquadFilter() { return no(); }
    createDynamicsCompressor() { return no(); }
    createBuffer(c, n, taxa) { return { duration: n / taxa, copyToChannel() {} }; }
    createBufferSource() {
      const f = { ...no(), playbackRate: { value: 1 }, start: () => setTimeout(() => f.onended?.(), 0), stop() {} };
      return f;
    }
    async decodeAudioData(bytes) {
      if (bytes.byteLength < 4) throw new Error('inválido');
      return { sampleRate: 24000, getChannelData: () => new Float32Array(2400) };
    }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  class FakeFala { constructor(t) { this.text = t; } }
  globalThis.window = { AudioContext: FakeCtx, speechSynthesis: {} };
  globalThis.AudioContext = FakeCtx;
  globalThis.SpeechSynthesisUtterance = FakeFala;
  globalThis.speechSynthesis = {
    cancel() {}, speaking: false, getVoices: () => [{ name: 'Voz pt', lang: 'pt-BR' }],
    addEventListener() {},
    speak(u) { falas.push(u.text); setTimeout(() => { u.onstart?.(); u.onend?.(); }, 0); },
  };
  globalThis.fetch = vi.fn(async (url, op) => {
    pedidos.push({ url, op, texto: op.body.get('texto') });
    return resposta();
  });
  return { mem, pedidos, falas };
}

const wav = () => new Response(new Uint8Array(64), { status: 200, headers: { 'content-type': 'audio/wav' } });

describe('voz própria (servidor do Colab)', () => {
  let voz;
  beforeEach(async () => {
    vi.resetModules();
  });
  afterEach(() => {
    for (const k of ['localStorage', 'document', 'window', 'AudioContext', 'SpeechSynthesisUtterance', 'speechSynthesis', 'requestAnimationFrame', 'cancelAnimationFrame']) delete globalThis[k];
    vi.restoreAllMocks();
  });

  it('manda o texto em form para /sintetizar, com token e sem cookies, e toca o WAV', async () => {
    const amb = ambiente({ resposta: wav });
    voz = await import('../src/servicos/voz.js');
    voz.salvarConfigVoz({ motor: 'propria', efeito: 'desligado', propria: { url: 'https://abc.ngrok-free.app/', token: 'segredo123' } });
    const avisos = [];
    let motor = '';
    await new Promise((fim, erro) => {
      const n = voz.criarNarrador('Boa noite. Aqui é M.A.V.I.Z., tudo pronto.', { aoFim: fim, aoAviso: (m) => avisos.push(m), aoMotor: (m) => (motor = m) });
      n.iniciar().catch(erro);
    });
    expect(motor).toBe('propria');
    expect(avisos).toEqual([]);
    expect(amb.falas).toEqual([]); // não caiu na voz do navegador
    expect(amb.pedidos.length).toBeGreaterThan(0);
    const p = amb.pedidos[0];
    expect(p.url).toBe('https://abc.ngrok-free.app/sintetizar');
    expect(p.op.method).toBe('POST');
    expect(p.op.credentials).toBe('omit');
    expect(p.op.headers['X-Token-Voz']).toBe('segredo123');
    expect(p.op.headers['ngrok-skip-browser-warning']).toBeTruthy();
    expect(amb.pedidos.map((x) => x.texto).join(' ')).toMatch(/Aqui é Maviz/); // nome falado
  });

  it('com o Colab desligado, avisa e usa a voz do navegador', async () => {
    const amb = ambiente({ resposta: () => { throw new TypeError('Failed to fetch'); } });
    voz = await import('../src/servicos/voz.js');
    voz.salvarConfigVoz({ motor: 'propria', efeito: 'desligado', propria: { url: 'https://abc.ngrok-free.app' } });
    const avisos = [];
    await new Promise((fim, erro) => {
      voz.criarNarrador('Teste curto.', { aoFim: fim, aoAviso: (m) => avisos.push(m) }).iniciar().catch(erro);
    });
    expect(avisos[0]).toMatch(/servidor de voz.*voz do navegador/s);
    expect(amb.falas).toEqual(['Teste curto.']);
  });

  it('token errado vira mensagem clara', async () => {
    ambiente({ resposta: () => new Response('nao', { status: 401 }) });
    voz = await import('../src/servicos/voz.js');
    voz.salvarConfigVoz({ motor: 'propria', efeito: 'desligado', propria: { url: 'https://abc.ngrok-free.app' } });
    const avisos = [];
    await new Promise((fim) => voz.criarNarrador('Oi.', { aoFim: fim, aoAviso: (m) => avisos.push(m) }).iniciar());
    expect(avisos[0]).toMatch(/recusou o token/);
  });
});
