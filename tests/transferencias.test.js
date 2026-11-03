import { describe, expect, it } from 'vitest';
import { partesDoNome, mencionaTitular, encontrarPares } from '../src/importacao/transferencias.js';

const partes = partesDoNome('Rafael Augusto da Conceição Moreira');

describe('mencionaTitular', () => {
  it('separa o nome ignorando ligações e acentos', () => {
    expect(partes).toEqual(['RAFAEL', 'AUGUSTO', 'CONCEICAO', 'MOREIRA']);
  });

  it.each([
    '02/10 19:01 RAFAEL AUGUSTO CONCEICAO M',
    'PIX RECEBIDO RAFAEL A C MOREIRA',
    'TED ENVIADA RAFAEL AUGUSTO MOREIRA',
    'Pix enviado - Rafael A. Conceição',
  ])('reconhece o titular em "%s"', (d) => expect(mencionaTitular(d, partes)).toBe(true));

  it.each([
    'PIX ENVIADO RAFAEL SILVA',
    'PIX RECEBIDO MARIA A C MOREIRA',
    'PIX ENVIADO RAFAEL',
    'SUPERMERCADO MOREIRA',
  ])('não confunde com "%s"', (d) => expect(mencionaTitular(d, partes)).toBe(false));

  it('sem nome cadastrado não reconhece nada', () => {
    expect(mencionaTitular('PIX RAFAEL A C MOREIRA', [])).toBe(false);
  });
});

describe('encontrarPares', () => {
  const existentes = [
    { id: 'a', conta_id: 'bb', tipo: 'SAIDA', valor: '100.00', data: '2026-10-02', descricao: 'PIX ENVIADO' },
    { id: 'b', conta_id: 'bb', tipo: 'SAIDA', valor: '100.00', data: '2026-09-01', descricao: 'PIX ENVIADO' }, // longe
    { id: 'c', conta_id: 'mp', tipo: 'SAIDA', valor: '50.00', data: '2026-10-02', descricao: 'PIX' }, // mesma conta
    { id: 'd', conta_id: 'bb', tipo: 'SAIDA', valor: '80.00', data: '2026-10-03', descricao: 'COMPRA CARTAO' },
  ];
  const itens = [
    { tipo: 'ENTRADA', valor: 100, data: '2026-10-03', descricao: 'TRANSFERENCIA RECEBIDA', erros: [] },
    { tipo: 'ENTRADA', valor: 50, data: '2026-10-02', descricao: 'PIX RECEBIDO', erros: [] },
    { tipo: 'ENTRADA', valor: 80, data: '2026-10-03', descricao: 'ESTORNO LOJA', erros: [] }, // sem cara de transferência
  ];

  it('acha o espelho em outra conta: valor igual, tipo oposto, até 3 dias', () => {
    const pares = encontrarPares(itens, existentes, 'mp');
    expect([...pares].map(([i, ex]) => [i, ex.id])).toEqual([[0, 'a']]);
  });

  it('cada lançamento existente só forma um par', () => {
    const dois = [itens[0], { ...itens[0] }];
    expect(encontrarPares(dois, existentes, 'mp').size).toBe(1);
  });
});

import { lancamentosDaContaSalario } from '../src/importacao/transferencias.js';

describe('conta salário', () => {
  const contaSalario = { id: 'cs' };
  const contaDestino = { id: 'cc', nome: 'Banco Fictício' };
  const item = { data: '2026-11-03', valor: 4200 };

  it('cria o salário no mês de referência e a saída da transferência', () => {
    const r = lancamentosDaContaSalario(item, { contaSalario, contaDestino, dataSalario: '2026-10-31', existentes: [], catTransferencia: 't', catSalario: 's' });
    expect(r.map((l) => [l.tipo, l.data, l.valor, l.categoria_id, l.conta_id])).toEqual([
      ['ENTRADA', '2026-10-31', 4200, 's', 'cs'],
      ['SAIDA', '2026-11-03', 4200, 't', 'cs'],
    ]);
  });

  it('não repete salário já lançado no mês nem saída já existente', () => {
    const existentes = [
      { conta_id: 'cs', tipo: 'ENTRADA', status: 'REALIZADO', valor: 4200, data: '2026-10-05' },
      { conta_id: 'cs', tipo: 'SAIDA', status: 'REALIZADO', valor: 4200, data: '2026-11-02' },
    ];
    expect(lancamentosDaContaSalario(item, { contaSalario, contaDestino, dataSalario: '2026-10-31', existentes })).toEqual([]);
    // salário de outro mês não conta
    expect(lancamentosDaContaSalario(item, { contaSalario, contaDestino, dataSalario: '2026-09-30', existentes }).map((l) => l.tipo)).toEqual(['ENTRADA']);
  });
});
