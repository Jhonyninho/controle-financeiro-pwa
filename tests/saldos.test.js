import { describe, expect, it } from 'vitest';
import { saldosMensais } from '../src/lib/calculos.js';
import { conciliarTransferencias } from '../src/importacao/transferencias.js';

const l = (id, conta_id, tipo, valor, data, forma_pagamento = 'Pix') => ({ id, conta_id, tipo, valor, data, forma_pagamento });

describe('saldosMensais', () => {
  const contas = [{ id: 'bb' }, { id: 'mp' }];
  const saldoAntes = new Map([['bb', 1000], ['mp', 50]]);
  const lanc = [
    l('1', 'bb', 'ENTRADA', 5000, '2026-09-05', 'TED'), // salário
    l('2', 'bb', 'SAIDA', 300, '2026-09-10'), // transferência BB -> MP
    l('3', 'mp', 'ENTRADA', 300, '2026-09-10'),
    l('4', 'bb', 'SAIDA', 900, '2026-09-20', 'Crédito'), // compra no cartão: não mexe no saldo
    l('5', 'bb', 'SAIDA', 1450, '2026-10-05', 'Débito'), // pagamento da fatura
    l('6', 'mp', 'SAIDA', 20.1, '2026-10-02'),
  ];
  const r = saldosMensais(contas, saldoAntes, lanc, ['2026-09', '2026-10']);

  it('transporta o saldo final de um mês como inicial do seguinte', () => {
    const bb = r.porConta[0].meses;
    expect(bb[0]).toEqual({ mes: '2026-09', inicial: 1000, entradas: 5000, saidas: 300, final: 5700 });
    expect(bb[1]).toEqual({ mes: '2026-10', inicial: 5700, entradas: 0, saidas: 1450, final: 4250 });
    expect(r.porConta[1].saldoFinal).toBe(329.9);
  });

  it('transferência entre contas não muda o consolidado', () => {
    expect(r.consolidado[0]).toEqual({ mes: '2026-09', inicial: 1050, entradas: 5300, saidas: 300, final: 6050 });
    expect(r.consolidado[1].final).toBe(4579.9);
  });
});

describe('conciliarTransferencias', () => {
  it('casa saída e entrada de mesmo valor em contas diferentes e lista o que ficou sem par', () => {
    const { pares, semPar } = conciliarTransferencias([
      l('a', 'bb', 'SAIDA', '300.00', '2026-09-10'),
      l('b', 'mp', 'ENTRADA', '300.00', '2026-09-11'),
      l('c', 'bb', 'ENTRADA', '4200.00', '2026-09-05'), // veio da conta-salário, que não está cadastrada
    ]);
    expect(pares.map(([s, e]) => [s.id, e.id])).toEqual([['a', 'b']]);
    expect(semPar.map((x) => x.id)).toEqual(['c']);
  });
});
