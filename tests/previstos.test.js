import { describe, expect, it } from 'vitest';
import { conciliarPrevistos, descricaoSemParcela, extrairParcela, gerarParcelas, planejarFixas, proximosParecidos } from '../src/importacao/previstos.js';

const prev = (id, data, valor, descricao, extra = {}) => ({ id, data, valor, descricao, tipo: 'SAIDA', conta_id: 'bb', status: 'PREVISTO', ...extra });
const item = (data, valor, descricao, extra = {}) => ({ data, valor, descricao, tipo: 'SAIDA', erros: [], ...extra });

describe('parcelas', () => {
  it.each([
    ['LOJA X PARC 03/10', { atual: 3, total: 10 }],
    ['Geladeira (2/12)', { atual: 2, total: 12 }],
    ['parcela 4 de 6 curso', { atual: 4, total: 6 }],
    ['PIX 25/10 MERCADO', null], // data, não parcela
    ['Compra 11/10', null], // 11 > 10: não é parcela
    ['Mercado', null],
  ])('%s', (desc, esperado) => expect(extrairParcela(desc)).toEqual(esperado));

  it('descricaoSemParcela tira a marcação', () => {
    expect(descricaoSemParcela('LOJA X PARC 03/10')).toBe('LOJA X');
    expect(descricaoSemParcela('Geladeira (2/12)')).toBe('Geladeira');
  });

  it('gerarParcelas cria da próxima até a última, mês a mês, na mesma série', () => {
    const base = { tipo: 'SAIDA', conta_id: 'nu', categoria_id: 'c', forma_pagamento: 'Crédito', descricao: 'LOJA X PARC 03/05' };
    const r = gerarParcelas(base, { atual: 3, total: 5, valor: 99.9, primeiraData: '2026-11-30', serieId: 's1' });
    expect(r.map((x) => [x.data, x.descricao, x.parcela_atual])).toEqual([
      ['2026-11-30', 'LOJA X (4/5)', 4],
      ['2026-12-30', 'LOJA X (5/5)', 5],
    ]);
    expect(r.every((x) => x.status === 'PREVISTO' && x.serie_id === 's1' && x.serie_tipo === 'PARCELA')).toBe(true);
  });
});

describe('conciliarPrevistos (anti-duplicidade)', () => {
  it('valor igual, data próxima e descrição parecida substitui o previsto', () => {
    const r = conciliarPrevistos([item('2026-11-06', 120, 'PAG LOJA X PARC 04/10')], [prev('p1', '2026-11-05', 120, 'LOJA X (4/10)')], 'bb');
    expect(r.get(0)?.id).toBe('p1');
  });

  it('conta de consumo com valor diferente (até 15%) e mesma descrição', () => {
    const r = conciliarPrevistos([item('2026-11-09', 205.4, 'ENEL DISTRIBUICAO')], [prev('p1', '2026-11-08', 189.77, 'ENEL DISTRIBUICAO')], 'bb');
    expect(r.get(0)?.id).toBe('p1');
  });

  it('não concilia outra conta, outro tipo, longe na data ou descrição diferente com valor diferente', () => {
    const previstos = [
      prev('a', '2026-11-05', 50, 'NETFLIX', { conta_id: 'nu' }),
      prev('b', '2026-11-05', 50, 'NETFLIX', { tipo: 'ENTRADA' }),
      prev('c', '2026-10-20', 50, 'NETFLIX'),
      prev('d', '2026-11-05', 80, 'SPOTIFY'),
    ];
    expect(conciliarPrevistos([item('2026-11-05', 55.9, 'NETFLIX.COM')], previstos, 'bb').size).toBe(0);
  });

  it('cada previsto é usado uma vez só e duplicados/erros são ignorados', () => {
    const previstos = [prev('p1', '2026-11-05', 30, 'UBER')];
    const r = conciliarPrevistos(
      [item('2026-11-05', 30, 'UBER *TRIP', { duplicado: true }), item('2026-11-05', 30, 'UBER *TRIP'), item('2026-11-06', 30, 'UBER *TRIP')],
      previstos,
      'bb',
    );
    expect([...r.keys()]).toEqual([1]);
  });
});

describe('planejarFixas', () => {
  const fixa = (l) => l.categoria_id === 'aluguel';
  const real = (data, valor, descricao, categoria_id) => ({ data, valor, descricao, categoria_id, tipo: 'SAIDA', conta_id: 'bb', status: 'REALIZADO' });

  it('projeta o último valor pago para os próximos meses, sem passado nem meses já previstos', () => {
    const realizados = [
      real('2026-09-05', 1700, 'ALUGUEL APTO', 'aluguel'),
      real('2026-10-05', 1800, 'ALUGUEL APTO', 'aluguel'),
      real('2026-10-07', 90, 'PADARIA', 'padaria'),
    ];
    const previstos = [prev('x', '2026-12-05', 1800, 'ALUGUEL APTO')];
    const r = planejarFixas(realizados, previstos, fixa, '2026-11-01', 3);
    expect(r.map((p) => [p.data, p.valor])).toEqual([
      ['2026-11-05', 1800],
      ['2027-01-05', 1800],
    ]);
    expect(r.every((p) => p.serie_tipo === 'FIXA' && p.status === 'PREVISTO')).toBe(true);
  });

  it('com nome da categoria: a previsão leva a categoria, não a descrição do mês anterior', () => {
    const nome = (id) => ({ aluguel: 'Moradia › Aluguel' })[id];
    const realizados = [real('2026-10-05', 1800, 'PIX JOAO SILVA ALUGUEL OUT', 'aluguel')];
    // previsão criada antes com o nome da categoria ocupa dezembro
    const previstos = [prev('x', '2026-12-05', 1800, 'Moradia › Aluguel', { categoria_id: 'aluguel' })];
    const r = planejarFixas(realizados, previstos, fixa, '2026-11-01', 3, nome);
    expect(r.map((p) => [p.data, p.descricao])).toEqual([
      ['2026-11-05', 'Moradia › Aluguel'],
      ['2027-01-05', 'Moradia › Aluguel'],
    ]);
    expect(r[0].origem.descricao).toBe('PIX JOAO SILVA ALUGUEL OUT');
  });
});

describe('conciliarPrevistos com previsão pelo nome da categoria', () => {
  it('conta de valor variável substitui a previsão da mesma categoria', () => {
    const previstos = [prev('p1', '2026-11-08', 189.77, 'Moradia › Energia', { categoria_id: 'luz' })];
    const itens = [item('2026-11-09', 205.4, 'ENEL DISTRIBUICAO')];
    expect(conciliarPrevistos(itens, previstos, 'bb').size).toBe(0); // sem saber a categoria, não arrisca
    const r = conciliarPrevistos(itens, previstos, 'bb', 7, () => 'luz');
    expect(r.get(0)?.id).toBe('p1');
  });
});

describe('proximosParecidos (replicar novo valor)', () => {
  const editado = { id: 'e', data: '2026-11-05', valor: 1900, descricao: 'Moradia › Aluguel', categoria_id: 'aluguel', tipo: 'SAIDA', conta_id: 'bb' };

  it('pega só os próximos da mesma série, categoria ou descrição', () => {
    const previstos = [
      prev('antes', '2026-10-05', 1800, 'Moradia › Aluguel', { categoria_id: 'aluguel' }),
      prev('e', '2026-11-05', 1800, 'Moradia › Aluguel', { categoria_id: 'aluguel' }),
      prev('cat', '2027-01-05', 1800, 'ALUGUEL APTO', { categoria_id: 'aluguel' }),
      prev('serie', '2026-12-05', 1800, 'outro nome', { serie_id: 's1', conta_id: 'nu' }),
      prev('desc', '2027-02-05', 1800, 'Moradia › Aluguel'),
      prev('outraConta', '2026-12-05', 1800, 'Moradia › Aluguel', { categoria_id: 'aluguel', conta_id: 'nu' }),
      prev('parcela', '2026-12-05', 300, 'LOJA (2/5)', { categoria_id: 'aluguel', serie_tipo: 'PARCELA', serie_id: 's9' }),
      prev('luz', '2026-12-08', 190, 'Moradia › Energia', { categoria_id: 'luz' }),
    ];
    expect(proximosParecidos(editado, 's1', previstos).map((p) => p.id)).toEqual(['serie', 'cat', 'desc']);
  });
});

import { alteracoesParaProximos, comDiaDoMes } from '../src/importacao/previstos.js';

describe('alteracoesParaProximos (valor e dia)', () => {
  it('leva o novo dia para cada mês (limitado ao fim do mês) e o novo valor', () => {
    const original = { data: '2026-11-05', valor: 1800 };
    const editado = { data: '2026-11-30', valor: 1900 };
    const proximos = [prev('a', '2026-12-05', 1800, 'X'), prev('b', '2027-02-05', 1800, 'X')];
    expect(alteracoesParaProximos(original, editado, proximos).map((a) => [a.p.id, a.data, a.valor])).toEqual([
      ['a', '2026-12-30', 1900],
      ['b', '2027-02-28', 1900],
    ]);
  });

  it('só o dia mudou: valor de cada um fica; quem já está certo some da lista', () => {
    const r = alteracoesParaProximos({ data: '2026-11-05', valor: 50 }, { data: '2026-11-10', valor: 50 }, [
      prev('a', '2026-12-05', 55, 'X'),
      prev('b', '2027-01-10', 50, 'X'),
    ]);
    expect(r.map((a) => [a.p.id, a.data, a.valor])).toEqual([['a', '2026-12-10', 55]]);
    expect(comDiaDoMes('2027-02-01', 31)).toBe('2027-02-28');
  });
});
