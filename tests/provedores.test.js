import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configIA, lerRespostaIA, promptSistema, salvarConfigIA } from '../src/servicos/ia.js';

describe('provedores de IA', () => {
  let mem;
  beforeEach(() => {
    mem = new Map();
    globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  });
  afterEach(() => delete globalThis.localStorage);

  it('sem configuração, o padrão é o Groq', () => {
    const c = configIA();
    expect(c.provedor).toBe('groq');
    expect(c.modelo).toBe('llama-3.3-70b-versatile');
    expect(c.chave).toBe('');
  });

  it('migra a chave antiga do Gemini sem perder nada', () => {
    mem.set('cf.ia', JSON.stringify({ chave: 'AIza' + 'x'.repeat(30), modelo: 'gemini-2.0-flash' }));
    const c = configIA();
    expect(c.provedor).toBe('gemini');
    expect(c.chave).toMatch(/^AIza/);
    expect(c.modelo).toBe('gemini-2.0-flash');
  });

  it('cada provedor guarda a própria chave e o próprio modelo', () => {
    salvarConfigIA({ provedor: 'gemini', chave: 'AIza' + 'g'.repeat(30) });
    salvarConfigIA({ provedor: 'groq', chave: 'gsk_' + 'q'.repeat(40), modelo: 'openai/gpt-oss-120b' });
    const c = configIA();
    expect(c.provedor).toBe('groq');
    expect(c.chave).toMatch(/^gsk_/);
    expect(c.modelo).toBe('openai/gpt-oss-120b');
    expect(c.chaves.gemini).toMatch(/^AIza/);
  });

  it('aceita JSON embrulhado em markdown (modelos gratuitos)', () => {
    const r = lerRespostaIA('Aqui está:\n```json\n{"resumo":"ok","pontos_de_atencao":[],"estrategias":[]}\n```');
    expect(r.resumo).toBe('ok');
  });

  it('persona do assistente usa só o tratamento, nunca o nome do usuário', () => {
    const p = promptSistema('M.A.V.I.Z.', { tratamento: 'senhor' });
    expect(p).toContain('M.A.V.I.Z.');
    expect(p).toContain('"senhor"');
    expect(p).not.toMatch(/jarvis|stark|marvel/i);
  });
});
