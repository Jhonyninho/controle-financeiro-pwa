import { expect, it } from 'vitest';
import { deslocarMes, limitesMes, nomeMes, somarMesesData, hojeISO } from '../src/lib/meses.js';

it('deslocarMes atravessa anos', () => {
  expect(deslocarMes('2026-12', 1)).toBe('2027-01');
  expect(deslocarMes('2026-01', -1)).toBe('2025-12');
  expect(deslocarMes('2026-05', 14)).toBe('2027-07');
});

it('limitesMes considera ano bissexto', () => {
  expect(limitesMes('2028-02')).toEqual({ inicio: '2028-02-01', fim: '2028-02-29' });
  expect(limitesMes('2026-02').fim).toBe('2026-02-28');
});

it('somarMesesData ajusta fim de mês', () => {
  expect(somarMesesData('2026-01-31', 1)).toBe('2026-02-28');
  expect(somarMesesData('2026-10-15', 3)).toBe('2027-01-15');
});

it('nomes e hoje', () => {
  expect(nomeMes('2026-10')).toBe('outubro de 2026');
  expect(nomeMes('2026-03', true)).toBe('mar/26');
  expect(hojeISO(new Date(2026, 0, 5))).toBe('2026-01-05');
});
