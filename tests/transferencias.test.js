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
