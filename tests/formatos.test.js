import { describe, expect, it } from 'vitest';
import { normalizarTexto, parseData, parseValor, formatarData } from '../src/lib/formatos.js';

describe('parseData', () => {
  it.each([
    ['01/10/2026', '2026-10-01'],
    ['1/2/26', '2026-02-01'],
    ['2026-10-31', '2026-10-31'],
    ['31-12-2026', '2026-12-31'],
    ['05/10/2026 13:47', '2026-10-05'],
    [46296, '2026-10-01'], // serial do Excel
  ])('%s -> %s', (entrada, esperado) => expect(parseData(entrada)).toBe(esperado));

  it.each(['31/02/2026', '2026-13-01', 'ontem', '', null, '01/10/1999'])('rejeita %s', (v) =>
    expect(parseData(v)).toBeNull(),
  );
});

describe('parseValor', () => {
  it.each([
    ['-100,00', -100],
    ['1.250,50', 1250.5],
    ['-R$ 1.250,50', -1250.5],
    ['R$ -10,00', -10],
    ['45,41-', -45.41],
    ['(99,99)', -99.99],
    ['1,250.50', 1250.5],
    ['1.250.000', 1250000],
    ['2500', 2500],
    [-5.1, -5.1],
    [0.1 + 0.2, 0.3],
  ])('%s -> %s', (entrada, esperado) => expect(parseValor(entrada)).toBe(esperado));

  it.each(['abc', '1,2,3', '', null, '10 reais'])('rejeita %s', (v) => expect(parseValor(v)).toBeNull());
});

it('normalizarTexto', () => {
  expect(normalizarTexto('  Pix - Enviado  São  Paulo ')).toBe('PIX ENVIADO SAO PAULO');
});

it('formatarData', () => expect(formatarData('2026-10-05')).toBe('05/10/2026'));
