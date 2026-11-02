import { describe, expect, it } from 'vitest';
import { ehFixa, gerarAlertas, orcamento503020, separarGastos, seriePorMeio, simularMeta } from '../src/lib/analise.js';
import { montarPayloadIA, lerRespostaIA, verificarCota } from '../src/servicos/ia.js';

const cats = {
  alu: { nome: 'Moradia', subcategoria: 'Aluguel', fixa: true },
  res: { nome: 'Restaurantes', subcategoria: 'Delivery', fixa: false },
  mer: { nome: 'Mercado', subcategoria: 'Supermercado', fixa: false },
  transf: { nome: 'Transferências', fora_dos_gastos: true },
};
const porId = (id) => cats[id];
const l = (data, tipo, valor, categoria_id, extra = {}) => ({ data, tipo, valor, categoria_id, ...extra });
const fixa = (x) => ehFixa(x, porId);

describe('fixas x variáveis', () => {
  it('lançamento pode sobrescrever a categoria', () => {
    expect(ehFixa(l('2026-10-01', 'SAIDA', 1, 'alu'), porId)).toBe(true);
    expect(ehFixa(l('2026-10-01', 'SAIDA', 1, 'alu', { despesa_fixa: false }), porId)).toBe(false);
    expect(ehFixa(l('2026-10-01', 'SAIDA', 1, 'res', { despesa_fixa: true }), porId)).toBe(true);
    expect(ehFixa(l('2026-10-01', 'ENTRADA', 1, 'alu'), porId)).toBe(false);
  });

  it('separarGastos ignora transferências', () => {
    const r = separarGastos(
      [l('x', 'ENTRADA', 5000, null), l('x', 'SAIDA', 1800, 'alu'), l('x', 'SAIDA', 300.5, 'res'), l('x', 'SAIDA', 999, 'transf')],
      new Set(['transf']),
      fixa,
    );
    expect(r).toEqual({ entradas: 5000, fixos: 1800, variaveis: 300.5, saidas: 2100.5 });
  });
});

describe('seriePorMeio', () => {
  it('soma por meio e mês, sem fatura/transferência', () => {
    const r = seriePorMeio(
      [
        l('2026-09-03', 'SAIDA', 100, 'res', { forma_pagamento: 'Crédito' }),
        l('2026-10-03', 'SAIDA', 40, 'mer', { forma_pagamento: 'Pix' }),
        l('2026-10-04', 'SAIDA', 60, 'mer', { forma_pagamento: 'Crédito' }),
        l('2026-10-05', 'SAIDA', 500, 'transf', { forma_pagamento: 'Pix' }),
      ],
      ['2026-09', '2026-10'],
      new Set(['transf']),
    );
    expect(r.meios).toEqual(['Crédito', 'Pix']);
    expect(r.porMes[1]).toEqual({ mes: '2026-10', total: 100, valores: { Crédito: 60, Pix: 40 } });
  });
});

describe('gerarAlertas', () => {
  it('aponta a variável que fugiu da média e não confunde com o fixo', () => {
    const lanc = [];
    for (const m of ['2026-07', '2026-08', '2026-09']) {
      lanc.push(l(`${m}-05`, 'SAIDA', 1800, 'alu'), l(`${m}-10`, 'SAIDA', 200, 'res'), l(`${m}-02`, 'ENTRADA', 5000, null));
    }
    lanc.push(l('2026-10-05', 'SAIDA', 1800, 'alu'), l('2026-10-10', 'SAIDA', 420, 'res'), l('2026-10-02', 'ENTRADA', 5000, null));
    const alertas = gerarAlertas({ lancamentos: lanc, mes: '2026-10', ignorar: new Set(), categoriaPorId: porId, fixa });
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ tipo: 'variavel', nome: 'Restaurantes', atual: 420, media: 200, excesso: 220, nivel: 'alto' });
  });
});

describe('simularMeta', () => {
  it('meta viável com a sobra atual', () => {
    const r = simularMeta({ valorAlvo: 12000, guardado: 0, prazoMeses: 12, mediaEntradas: 5000, mediaSaidas: 3500 });
    expect(r).toMatchObject({ necessarioMes: 1000, capacidadeMes: 1500, viavel: true, taxaNecessaria: 20 });
  });

  it('sugere cortes nas variáveis maiores, até 30% de cada', () => {
    const r = simularMeta({
      valorAlvo: 10000, guardado: 1000, prazoMeses: 9, mediaEntradas: 5000, mediaSaidas: 4500,
      variaveis: [{ nome: 'Mercado', media: 1000 }, { nome: 'Restaurantes', media: 800 }],
    });
    expect(r.necessarioMes).toBe(1000);
    expect(r.cortes.map((c) => [c.nome, c.corte])).toEqual([['Mercado', 300], ['Restaurantes', 200]]);
    expect(r.viavelComCortes).toBe(true);
  });
});

it('orcamento503020', () => {
  expect(orcamento503020({ entradas: 5000, fixos: 2500, variaveis: 1500 })).toMatchObject({ necessidades: 50, desejos: 30, poupanca: 20 });
  expect(orcamento503020({ entradas: 0, fixos: 1, variaveis: 1 })).toBeNull();
});

describe('IA (Gemini)', () => {
  it('payload só leva agregados: sem descrições, contas ou nomes de metas', () => {
    const p = montarPayloadIA({
      mes: '2026-10',
      mesAtual: { entradas: 5000.4, fixos: 1800, variaveis: 620.6 },
      media3m: { entradas: 5000, fixos: 1800, variaveis: 400 },
      grupos: [{ nome: 'Restaurantes <script>', total: 1020, media: 170, fixa: false, meses: [200, 420] }],
      meios: { meios: ['Pix'], porMes: [{ mes: '2026-10', total: 420, valores: { Pix: 420 } }] },
      metas: [{ nome: 'Viagem com a Maria', valor_alvo: 8000, valor_guardado: 500, prazo_meses: 10 }],
      alertas: [],
    });
    const texto = JSON.stringify(p);
    expect(texto).not.toMatch(/Maria|[<>]/); // nomes de categoria vão, mas sem símbolos
    expect(p.mes.receitas).toBe(5000);
    expect(p.metas[0]).toEqual({ meta: 'Meta 1', valor_alvo: 8000, ja_guardado: 500, prazo_meses: 10 });
  });

  it('resposta é normalizada e limitada', () => {
    const r = lerRespostaIA(JSON.stringify({ resumo: 'ok', pontos_de_atencao: ['a', 3], estrategias: [{ titulo: 't', acao: 'x', economia_mensal_estimada: -5 }] }));
    expect(r.pontos_de_atencao).toEqual(['a']);
    expect(r.estrategias[0].economia).toBe(0);
    expect(() => lerRespostaIA('não é json')).toThrow();
  });

  it('cota por minuto e por dia', () => {
    const agora = 1_000_000_000;
    const mem = new Map();
    globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
    mem.set('cf.ia.uso', JSON.stringify([agora - 10_000, agora - 20_000]));
    expect(() => verificarCota({ porMinuto: 2, porDia: 100 }, agora)).toThrow(/Aguarde/);
    expect(() => verificarCota({ porMinuto: 5, porDia: 2 }, agora)).toThrow(/diário/);
    expect(verificarCota({ porMinuto: 5, porDia: 100 }, agora).hoje).toBe(2);
    delete globalThis.localStorage;
  });
});
