import { describe, expect, it } from 'vitest';
import { contextosDoDia, periodoDaHora, sortearSaudacao, todasAsFalas } from '../src/lib/saudacoes.js';
import { codificarMp3, dividirPorSilencio, TAXA } from '../scripts/audio-falas.mjs';

// gerador previsível para os sorteios
const sequencia = (...v) => { let i = 0; return () => v[i++ % v.length]; };

describe('saudações gravadas', () => {
  const falas = todasAsFalas();

  it('ids únicos, textos limpos e nenhum nome de usuário', () => {
    const ids = falas.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z0-9-]+$/i.test(id))).toBe(true); // vira nome de arquivo
    expect(falas.length).toBeGreaterThan(50);
    for (const f of falas) {
      expect(f.texto).toMatch(/[.?!]$/);
      expect(f.texto).not.toMatch(/undefined|null|\s,|\s{2}/);
      expect(f.texto).not.toMatch(/M\.A\.V/); // a sigla vai falada ("Maviz")
    }
  });

  it('concordância por tratamento', () => {
    const t = (id) => falas.find((f) => f.id === id).texto;
    expect(t('a-tarde-senhor-t3')).toBe('Boa tarde, senhor. Que bom tê-lo de volta ao painel.');
    expect(t('a-tarde-senhora-t3')).toBe('Boa tarde, senhora. Que bom tê-la de volta ao painel.');
    expect(t('a-madrugada-senhora-z1')).toMatch(/^Ainda acordada, senhora\?/);
    expect(t('a-manha-neutro-m2')).toBe('Bom dia. Os sistemas financeiros já estão operacionais.');
  });

  it('período do dia e contextos do calendário', () => {
    expect([periodoDaHora(6), periodoDaHora(13), periodoDaHora(20), periodoDaHora(0), periodoDaHora(3)]).toEqual(['manha', 'tarde', 'noite', 'noite', 'madrugada']);
    expect(contextosDoDia('2026-11-02')).toEqual(['segunda', 'inicioDoMes']); // segunda-feira
    expect(contextosDoDia('2026-11-06')).toEqual(['sexta']);
    expect(contextosDoDia('2026-11-28')).toEqual(['fimDeSemana', 'fimDoMes']); // sábado
    expect(contextosDoDia('2026-02-24')).toEqual(['fimDoMes']); // fevereiro tem 28 dias
  });

  it('sorteio: abertura do período e tratamento certos, às vezes com comentário', () => {
    const so = sortearSaudacao({ hora: 9, data: '2026-11-10', tratamento: 'senhor', aleatorio: sequencia(0, 0.1) });
    expect(so).toHaveLength(1);
    expect(so[0].id).toMatch(/^a-manha-senhor-/);
    const duas = sortearSaudacao({ hora: 21, data: '2026-11-10', tratamento: 'senhora', aleatorio: sequencia(0.5, 0.9, 0.3) });
    expect(duas.map((f) => f.id.split('-')[0])).toEqual(['a', 'c']);
    expect(duas[0].id).toMatch(/^a-noite-senhora-/);
  });

  it('em datas especiais o comentário pode ser do dia; tratamento "nome" usa a versão neutra', () => {
    const r = sortearSaudacao({ hora: 18, data: '2026-11-06', tratamento: 'nome', aleatorio: sequencia(0, 0.9, 0.1, 0) });
    expect(r[0].id).toMatch(/^a-noite-neutro-/);
    expect(r[1].id).toMatch(/^c-sexta-/);
  });

  it('não repete as falas recentes e respeita as gravações disponíveis', () => {
    const recentes = ['a-tarde-senhor-t1', 'a-tarde-senhor-t2', 'a-tarde-senhor-t3'];
    const r = sortearSaudacao({ hora: 14, data: '2026-11-10', tratamento: 'senhor', recentes, aleatorio: () => 0 });
    expect(r[0].id).toBe('a-tarde-senhor-t4');
    const so1 = sortearSaudacao({ hora: 14, data: '2026-11-10', tratamento: 'senhor', disponiveis: new Set(['a-tarde-senhor-t2']), aleatorio: () => 0.9 });
    expect(so1).toEqual([expect.objectContaining({ id: 'a-tarde-senhor-t2' })]); // sem comentário gravado
    expect(sortearSaudacao({ hora: 14, data: '2026-11-10', disponiveis: new Set() })).toEqual([]);
  });

  it('assistente com outro nome: só falas que não dizem "Maviz"', () => {
    for (let k = 0; k < 30; k++) {
      const [a] = sortearSaudacao({ hora: 8, data: '2026-11-10', tratamento: 'senhor', comNome: false });
      expect(a.texto).not.toMatch(/Maviz/);
    }
  });
});

describe('gerador de falas (áudio)', () => {
  const tom = (seg) => Float32Array.from({ length: Math.round(seg * TAXA) }, (_, i) => 0.4 * Math.sin(i / 6));
  const silencio = (seg) => new Float32Array(Math.round(seg * TAXA));
  const juntar = (...partes) => {
    const out = new Float32Array(partes.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of partes) { out.set(p, o); o += p.length; }
    return out;
  };

  it('corta nos silêncios longos e confere a duração com o texto', () => {
    const textos = ['Bom dia, senhor. Tudo certo.', 'Vamos verificar como estão as finanças hoje?', 'Disciplina hoje.'];
    const pcm = juntar(silencio(0.3), tom(2.0), silencio(1.5), tom(3.2), silencio(1.6), tom(1.1), silencio(0.5));
    const cortes = dividirPorSilencio(pcm, textos);
    expect(cortes).toHaveLength(3);
    const dur = cortes.map((c) => c.length / TAXA);
    expect(dur[0]).toBeGreaterThan(1.9);
    expect(dur[0]).toBeLessThan(2.4);
    expect(dur[1]).toBeGreaterThan(3.1);
    expect(Math.max(...cortes[1].map(Math.abs))).toBeCloseTo(0.89, 1); // volume normalizado
  });

  it('desiste (null) quando o número de trechos não bate', () => {
    const pcm = juntar(tom(2), silencio(1.5), tom(2));
    expect(dividirPorSilencio(pcm, ['Uma frase qualquer aqui.', 'Outra frase.', 'Mais uma.'])).toBeNull();
  });

  it('gera MP3 válido', () => {
    const mp3 = codificarMp3(tom(1));
    expect(mp3.length).toBeGreaterThan(3000);
    expect(mp3[0]).toBe(0xff); // cabeçalho de quadro MP3
  });
});
