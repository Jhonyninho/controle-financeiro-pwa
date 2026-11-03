import { describe, expect, it } from 'vitest';
import {
  totais, resumoPorConta, porCategoria, serieMensal, variacao, mesDaFatura, agruparPorCategoriaMae,
} from '../src/lib/calculos.js';

const l = (conta_id, tipo, valor, data, extra = {}) => ({ conta_id, tipo, valor, data, ...extra });

describe('mesDaFatura (mesma regra do SQL)', () => {
  it.each([
    // [data, fechamento, vencimento, esperado]
    ['2026-10-20', 25, 5, '2026-11'], // fecha 25/10, vence 05/11
    ['2026-10-26', 25, 5, '2026-12'], // passou do fechamento: fecha 25/11, vence 05/12
    ['2026-10-02', 3, 10, '2026-10'], // fecha 03/10, vence 10/10
    ['2026-10-05', 3, 10, '2026-11'], // fecha 03/11, vence 10/11
    ['2026-12-28', 25, 5, '2027-02'], // vira o ano
    ['2026-10-05', null, null, '2026-10'],
  ])('%s fecha %s vence %s -> %s', (data, f, v, esperado) => expect(mesDaFatura(data, f, v)).toBe(esperado));
});

describe('calculos', () => {
  it('totais somam em centavos e ignoram categorias fora dos gastos', () => {
    const r = totais([
      l('a', 'SAIDA', 0.1, '2026-10-01'),
      l('a', 'SAIDA', 0.2, '2026-10-01'),
      l('a', 'ENTRADA', 1, '2026-10-02'),
      l('a', 'SAIDA', 500, '2026-10-02', { categoria_id: 'transf' }),
    ], new Set(['transf']));
    expect(r).toEqual({ entradas: 1, saidas: 0.3, saldo: 0.7 });
  });

  it('resumoPorConta separa movimento da conta e fatura do cartão', () => {
    const contas = [{ id: 'bb', tem_credito: true, limite_credito: '1000' }, { id: 'carteira', tem_credito: false }];
    const lanc = [
      l('bb', 'SAIDA', 100, '2026-10-05', { forma_pagamento: 'Débito' }),
      l('bb', 'SAIDA', 999, '2026-09-30', { forma_pagamento: 'Pix' }), // outro mês
      l('bb', 'SAIDA', 50, '2026-09-28', { forma_pagamento: 'Crédito', fatura_mes: '2026-10-01' }),
      l('bb', 'SAIDA', 70, '2026-10-29', { forma_pagamento: 'Crédito', fatura_mes: '2026-11-01' }), // próxima fatura
      l('bb', 'ENTRADA', 10, '2026-10-02', { forma_pagamento: 'Crédito', fatura_mes: '2026-10-01' }), // estorno
      l('carteira', 'SAIDA', 20, '2026-10-03', { forma_pagamento: 'Dinheiro' }),
    ];
    const [bb, carteira] = resumoPorConta(contas, lanc, '2026-10');
    expect(bb.saidas).toBe(100); // compras no crédito não mexem no saldo
    expect(bb.fatura).toEqual({ valor: 40, limite: 1000, uso: 4 });
    expect(carteira.fatura).toBeNull();
    expect(carteira.saidas).toBe(20);
  });

  it('resumoPorConta aceita intervalo De/Até: soma movimento do intervalo e faturas que vencem nele', () => {
    const contas = [{ id: 'bb', tem_credito: true }];
    const lanc = [
      l('bb', 'SAIDA', 100, '2026-09-15', { forma_pagamento: 'Pix' }),
      l('bb', 'SAIDA', 50, '2026-10-20', { forma_pagamento: 'Pix' }),
      l('bb', 'SAIDA', 70, '2026-11-02', { forma_pagamento: 'Pix' }), // fora
      l('bb', 'SAIDA', 30, '2026-08-28', { forma_pagamento: 'Crédito', fatura_mes: '2026-09-01' }),
      l('bb', 'SAIDA', 40, '2026-09-28', { forma_pagamento: 'Crédito', fatura_mes: '2026-10-01' }),
      l('bb', 'SAIDA', 60, '2026-10-28', { forma_pagamento: 'Crédito', fatura_mes: '2026-11-01' }), // vence depois
    ];
    const [bb] = resumoPorConta(contas, lanc, { inicio: '2026-09-10', fim: '2026-10-31' });
    expect(bb.saidas).toBe(150);
    expect(bb.fatura.valor).toBe(70);
  });

  it('porCategoria agrupa, ordena, ignora transferências e mantém sem categoria', () => {
    const r = porCategoria([
      l('a', 'SAIDA', 30, 'x', { categoria_id: 'm' }),
      l('a', 'SAIDA', 10, 'x', { categoria_id: null }),
      l('a', 'SAIDA', 60, 'x', { categoria_id: 'm' }),
      l('a', 'SAIDA', 900, 'x', { categoria_id: 't' }),
      l('a', 'ENTRADA', 500, 'x', { categoria_id: 's' }),
    ], 'SAIDA', new Set(['t']));
    expect(r).toEqual([
      { categoria_id: 'm', valor: 90, percentual: 90 },
      { categoria_id: null, valor: 10, percentual: 10 },
    ]);
  });

  it('agruparPorCategoriaMae soma subcategorias', () => {
    const cats = { s: { nome: 'Mercado' }, p: { nome: 'Mercado' }, r: { nome: 'Restaurantes' } };
    const r = agruparPorCategoriaMae(
      [{ categoria_id: 's', valor: 30 }, { categoria_id: 'r', valor: 50 }, { categoria_id: 'p', valor: 20 }],
      (id) => cats[id],
    );
    expect(r.map((g) => [g.nome, g.valor, g.percentual])).toEqual([['Mercado', 50, 50], ['Restaurantes', 50, 50]]);
  });

  it('serieMensal acumula saldo', () => {
    const r = serieMensal([l('a', 'ENTRADA', 100, '2026-09-10'), l('a', 'SAIDA', 30, '2026-10-01')], ['2026-09', '2026-10']);
    expect(r.map((m) => m.acumulado)).toEqual([100, 70]);
  });

  it('variacao', () => {
    expect(variacao(150, 100)).toBe(50);
    expect(variacao(10, 0)).toBeNull();
  });
});

import { saldoPrevisto } from '../src/lib/calculos.js';

describe('saldoPrevisto', () => {
  it('contas + a receber − a pagar até o fim do mês, com vencidos e crédito pela fatura', () => {
    const p = (data, valor, tipo, extra = {}) => ({ data, valor, tipo, status: 'PREVISTO', ...extra });
    const previstos = [
      p('2026-10-28', 100, 'SAIDA'), // vencido e não pago: ainda sai
      p('2026-11-10', 1800, 'SAIDA'),
      p('2026-11-20', 3000, 'ENTRADA'),
      p('2026-12-05', 1800, 'SAIDA'), // mês seguinte: fora
      p('2026-11-15', 300, 'SAIDA', { forma_pagamento: 'Crédito', fatura_mes: '2026-12-01' }), // fatura de dezembro: fora
      p('2026-10-20', 200, 'SAIDA', { forma_pagamento: 'Crédito', fatura_mes: '2026-11-01' }),
    ];
    expect(saldoPrevisto(1000.5, previstos, '2026-11-30')).toEqual({ saldo: 1900.5, entradas: 3000, saidas: 2100 });
  });
});
