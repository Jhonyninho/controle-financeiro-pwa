import { describe, expect, it } from 'vitest';
import { avisosDoDia, campanhaDoDia, datasDoAno, pascoa } from '../src/lib/campanhas.js';
import { corDoHud } from '../src/lib/aparencia.js';
import { dividirFrases, roteiroDoDiagnostico } from '../src/servicos/voz.js';

describe('campanhas e datas', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
  ])('Páscoa de %i', (ano, data) => expect(pascoa(ano)).toBe(data));

  it('campanha do mês', () => {
    expect(campanhaDoDia('2026-10-15').nome).toBe('Outubro Rosa');
    expect(campanhaDoDia('2026-09-01').texto).toMatch(/188/);
    expect(campanhaDoDia('2026-11-01').chave).toBe('novembro-azul-2026');
  });

  it('datas móveis: Carnaval, Corpus Christi e Black Friday', () => {
    const d = Object.fromEntries(datasDoAno(2026).map((x) => [x.id, x.data]));
    expect(d.carnaval).toBe('2026-02-17');
    expect(d['corpus-christi']).toBe('2026-06-04');
    expect(d['black-friday']).toBe('2026-11-27');
    expect(d.maes).toBe('2026-05-10');
    expect(d.pais).toBe('2026-08-09');
  });

  it('avisos do dia respeitam a janela antes/depois', () => {
    const titulos = (dia) => avisosDoDia(dia).map((a) => a.titulo);
    expect(titulos('2026-11-01')).toEqual(['Novembro Azul', 'Finados amanhã']);
    expect(titulos('2026-11-25')).toContain('Black Friday em 2 dias');
    expect(titulos('2026-12-31')).toContain('Ano Novo amanhã'); // olha o ano seguinte
    expect(titulos('2026-07-20')).toEqual(['Julho Amarelo']);
  });

  it('cor automática do HUD segue a campanha', () => {
    expect(corDoHud('auto', '2026-10-10').id).toBe('rosa');
    expect(corDoHud('auto', '2026-11-10').id).toBe('azul');
    expect(corDoHud('verde', '2026-10-10').id).toBe('verde');
  });
});

describe('roteiro da voz', () => {
  it('divide em frases sem quebrar números', () => {
    expect(dividirFrases('Você gastou R$ 1.234,56 no mês. Isso é 12,5% a mais! Atenção: mercado subiu.')).toEqual([
      'Você gastou R$ 1.234,56 no mês.',
      'Isso é 12,5% a mais!',
      'Atenção: mercado subiu.',
    ]);
  });

  it('monta o roteiro na ordem da tela e fala valores em reais', () => {
    const t = roteiroDoDiagnostico({
      resumo: 'Mês equilibrado.',
      pontos_fortes: ['Sobrou R$ 500,00.'],
      pontos_de_atencao: [],
      estrategias: [{ titulo: 'Delivery', acao: 'Defina um teto semanal.', economia: 120 }],
      metas: [],
    });
    expect(t).toBe('Mês equilibrado. Pontos fortes. Sobrou 500,00 reais. Delivery. Defina um teto semanal. Economia estimada de 120 reais por mês.');
  });
});

import { blocosDeFala, periodoDoDia, textoSaudacao } from '../src/servicos/voz.js';

describe('voz: blocos e saudação', () => {
  it('primeiro bloco curto, no máximo 4 blocos, todas as frases na ordem', () => {
    const frases = Array.from({ length: 30 }, (_, i) => `Frase número ${i + 1} com algum conteúdo para ocupar espaço.`);
    const b = blocosDeFala(frases);
    expect(b.length).toBeLessThanOrEqual(4);
    expect(b[0].map((i) => frases[i]).join(' ').length).toBeLessThanOrEqual(170);
    expect(b.flat()).toEqual(frases.map((_, i) => i));
  });

  it('texto curto vira um bloco só', () => {
    expect(blocosDeFala(['Olá.'])).toEqual([[0]]);
    expect(blocosDeFala([])).toEqual([]);
  });

  it('saudação por período do dia, com o primeiro nome', () => {
    expect(periodoDoDia(8)).toBe('Bom dia');
    expect(periodoDoDia(14)).toBe('Boa tarde');
    expect(periodoDoDia(21)).toBe('Boa noite');
    expect(periodoDoDia(2)).toBe('Boa noite');
    expect(textoSaudacao('Rafael Augusto', { hora: 9, dia: 4 })).toBe('Bom dia, Rafael! Bora cuidar da vida financeira?');
    expect(textoSaudacao('', { hora: 19, dia: 1 })).toBe('Boa noite! Vamos ver como estão as suas finanças hoje?');
  });
});

import { NOME_PADRAO, configVoz, instrucaoDeFala, nomeAssistenteValido, nomeFalado } from '../src/servicos/voz.js';
import { PROMPT_SISTEMA, promptSistema } from '../src/servicos/ia.js';

describe('assistente próprio', () => {
  it('nome do assistente só com letras e pontos (vai para a fala e para o prompt)', () => {
    expect(nomeAssistenteValido('  Órion  ')).toBe('Órion');
    expect(nomeAssistenteValido('M.A.V.I.Z.')).toBe('M.A.V.I.Z.');
    expect(nomeAssistenteValido('Vega')).toBe(NOME_PADRAO); // antigo padrão migra para M.A.V.I.Z.
    expect(nomeAssistenteValido('Órion-7 <script>')).toBe('Órion- script');
    expect(nomeAssistenteValido('')).toBe(NOME_PADRAO);
    expect(nomeAssistenteValido('x'.repeat(40))).toHaveLength(20);
  });

  it('sigla com pontos é falada como palavra', () => {
    expect(NOME_PADRAO).toBe('M.A.V.I.Z.');
    expect(nomeFalado('M.A.V.I.Z.')).toBe('Maviz');
    expect(nomeFalado('M.A.V.I.Z')).toBe('Maviz');
    expect(nomeFalado('Órion')).toBe('Órion');
  });

  it('saudação com tratamento formal', () => {
    expect(textoSaudacao('Rafael Augusto', { hora: 9, dia: 4, assistente: 'M.A.V.I.Z.', tratamento: 'senhor' })).toBe(
      'Bom dia, senhor Rafael. Aqui é M.A.V.I.Z., sistemas financeiros online. Bora cuidar da vida financeira?',
    );
  });

  it('saudação na voz da personagem', () => {
    expect(textoSaudacao('Rafael Augusto', { hora: 20, dia: 4, assistente: 'Vega' })).toBe(
      'Boa noite, Rafael. Aqui é Vega, sistemas financeiros online. Bora cuidar da vida financeira?',
    );
  });

  it('instrução de fala descreve um estilo, sem imitar pessoas reais', () => {
    const t = instrucaoDeFala('assistente', 'M.A.V.I.Z.');
    expect(t).toMatch(/Maviz/);
    expect(t).toMatch(/dicção/);
    expect(t).not.toMatch(/jarvis|bettany|tony|stark|marvel/i);
  });

  it('motores removidos (Azure, ElevenLabs, servidor próprio) voltam para a voz do navegador', () => {
    const mem = {};
    globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
    for (const motor of ['azure', 'eleven', 'propria']) {
      mem['cf.voz'] = JSON.stringify({ motor, azure: { chave: 'x'.repeat(32) } });
      const c = configVoz();
      expect(c.motor).toBe('navegador');
      expect(c).not.toHaveProperty('azure');
    }
    mem['cf.voz'] = JSON.stringify({ motor: 'gemini', vozGemini: 'Orus' });
    expect(configVoz()).toMatchObject({ motor: 'gemini', vozGemini: 'Orus' });
    delete globalThis.localStorage;
  });

  it('personalidade entra no prompt só com o nome do assistente', () => {
    expect(promptSistema(null)).toBe(PROMPT_SISTEMA);
    expect(promptSistema('Vega')).toMatch(/você é Vega/);
    // humor reativo: leve com finanças saudáveis, firme com desperdício
    expect(promptSistema('M.A.V.I.Z.', { tratamento: 'senhor' })).toMatch(/Com todo o respeito, senhor/);
    expect(promptSistema('M.A.V.I.Z.')).toMatch(/severo/);
  });
});

import { pontuar } from '../src/servicos/voz.js';

describe('pontuação da fala', () => {
  it('itens sem ponto final ganham ponto e maiúscula', () => {
    expect(pontuar('gastos com delivery subiram')).toBe('Gastos com delivery subiram.');
    expect(pontuar('Tudo certo?')).toBe('Tudo certo?');
    expect(pontuar('lista termina em vírgula,')).toBe('Lista termina em vírgula.');
    const t = roteiroDoDiagnostico({ resumo: 'mês apertado', pontos_fortes: ['reserva mantida', 'sem juros'], estrategias: [] });
    expect(dividirFrases(t)).toEqual(['Mês apertado.', 'Pontos fortes.', 'Reserva mantida.', 'Sem juros.']);
  });

  it('frase longa demais é dividida na vírgula mais perto do meio', () => {
    const longa = `${'a'.repeat(120)}, ${'b'.repeat(120)}.`;
    expect(dividirFrases(longa)).toEqual([`${'a'.repeat(120)},`, `${'b'.repeat(120)}.`]);
  });
});
