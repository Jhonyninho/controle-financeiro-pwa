import { describe, expect, it } from 'vitest';
import {
  dataLocal, formaPagamento, iguaisTempoConstante, limparDescricao, mapearTransacao, statusDaConexao, tipoDaConta,
} from '../supabase/functions/_compartilhado/mapear.js';
import { nomeImportacaoBanco, pendentesParaItens } from '../src/importacao/openFinance.js';

// Transações sintéticas no formato da API da Pluggy (dados fictícios)
const tx = (extra) => ({
  id: 'tx-0001',
  description: 'PIX ENVIADO MERCADO BOM PRECO',
  amount: -87.5,
  date: '2026-10-15T03:00:00.000Z',
  type: 'DEBIT',
  status: 'POSTED',
  ...extra,
});

describe('dataLocal', () => {
  it('converte para o dia no horário de Brasília', () => {
    expect(dataLocal('2026-10-15T03:00:00.000Z')).toBe('2026-10-15');
    expect(dataLocal('2026-10-16T01:30:00.000Z')).toBe('2026-10-15'); // 22h30 do dia 15 em Brasília
  });
  it('rejeita datas inválidas', () => {
    expect(dataLocal('ontem')).toBeNull();
  });
});

describe('mapearTransacao', () => {
  it('saída de conta corrente com Pix', () => {
    expect(mapearTransacao(tx({ paymentData: { paymentMethod: 'PIX' } }), 'BANK')).toEqual({
      transacao_id: 'tx-0001',
      data: '2026-10-15',
      valor: 87.5,
      tipo: 'SAIDA',
      descricao: 'PIX ENVIADO MERCADO BOM PRECO',
      forma_pagamento: 'Pix',
    });
  });

  it('entrada (CREDIT) com valor positivo', () => {
    const r = mapearTransacao(tx({ type: 'CREDIT', amount: 5200, description: 'TED SALARIO EMPRESA ALFA' }), 'BANK');
    expect(r.tipo).toBe('ENTRADA');
    expect(r.valor).toBe(5200);
    expect(r.forma_pagamento).toBe('TED');
  });

  it('compra no cartão vira Crédito e estorno no cartão vira entrada', () => {
    expect(mapearTransacao(tx({ amount: 120.9, type: 'DEBIT' }), 'CREDIT')).toMatchObject({ tipo: 'SAIDA', forma_pagamento: 'Crédito' });
    expect(mapearTransacao(tx({ amount: -120.9, type: 'CREDIT', description: 'ESTORNO LOJA' }), 'CREDIT')).toMatchObject({
      tipo: 'ENTRADA',
      valor: 120.9,
    });
  });

  it('sem type usa o sinal do valor', () => {
    expect(mapearTransacao(tx({ type: undefined, amount: 10 }), 'BANK').tipo).toBe('ENTRADA');
    expect(mapearTransacao(tx({ type: undefined, amount: -10 }), 'BANK').tipo).toBe('SAIDA');
  });

  it('ignora pendentes no banco, valor zerado e data inválida', () => {
    expect(mapearTransacao(tx({ status: 'PENDING' }), 'BANK')).toBeNull();
    expect(mapearTransacao(tx({ amount: 0 }), 'BANK')).toBeNull();
    expect(mapearTransacao(tx({ date: 'x' }), 'BANK')).toBeNull();
    expect(mapearTransacao({ amount: 1 }, 'BANK')).toBeNull();
  });

  it('arredonda centavos e limpa a descrição', () => {
    const r = mapearTransacao(tx({ amount: -10.005, description: '  COMPRA\n\tLOJA   <b>X</b>  ' }), 'BANK');
    expect(r.valor).toBe(10.01);
    expect(r.descricao).toBe('COMPRA LOJA <b>X</b>'); // escapado só na exibição (html``)
  });

  it('descrição vazia recebe texto padrão', () => {
    expect(mapearTransacao(tx({ description: '', descriptionRaw: null }), 'BANK').descricao).toBe('Sem descrição');
  });
});

describe('formaPagamento e tipos', () => {
  it('deduz pela descrição quando não há metadados', () => {
    expect(formaPagamento({ description: 'BOLETO CONDOMINIO' }, 'BANK')).toBe('Boleto');
    expect(formaPagamento({ description: 'DOC RECEBIDO' }, 'BANK')).toBe('TED');
    expect(formaPagamento({ description: 'TARIFA MENSAL' }, 'BANK')).toBeNull();
  });
  it('tipos de conta aceitos', () => {
    expect(tipoDaConta({ type: 'BANK' })).toBe('BANK');
    expect(tipoDaConta({ type: 'CREDIT' })).toBe('CREDIT');
    expect(tipoDaConta({ type: 'INVESTMENT' })).toBeNull();
  });
  it('status da conexão', () => {
    expect(statusDaConexao({ status: 'UPDATED' })).toBe('ATUALIZADO');
    expect(statusDaConexao({ status: 'LOGIN_ERROR' })).toBe('LOGIN_NECESSARIO');
    expect(statusDaConexao({ status: 'OUTDATED', executionStatus: 'USER_AUTHORIZATION_REVOKED' })).toBe('LOGIN_NECESSARIO');
    expect(statusDaConexao({ status: 'OUTDATED' })).toBe('ERRO');
  });
  it('limparDescricao respeita o limite', () => {
    expect(limparDescricao('a'.repeat(300))).toHaveLength(200);
  });
});

describe('iguaisTempoConstante', () => {
  it('compara segredos', () => {
    expect(iguaisTempoConstante('segredo-123', 'segredo-123')).toBe(true);
    expect(iguaisTempoConstante('segredo-124', 'segredo-123')).toBe(false);
    expect(iguaisTempoConstante('segredo', 'segredo-123')).toBe(false);
    expect(iguaisTempoConstante('', '')).toBe(false); // segredo vazio nunca libera
  });
});

describe('pendentesParaItens', () => {
  const pendente = { id: 'p1', transacao_id: 'tx-0001', data: '2026-10-15', valor: '87.50', tipo: 'SAIDA', descricao: 'MERCADO', forma_pagamento: 'Pix' };

  it('gera itens no formato do leitor, com hash estável pelo id da transação', async () => {
    const [a] = await pendentesParaItens([pendente]);
    const [b] = await pendentesParaItens([{ ...pendente, descricao: 'MERCADO (descrição alterada)' }]);
    expect(a).toMatchObject({ linha: 1, data: '2026-10-15', valor: 87.5, tipo: 'SAIDA', erros: [], pendenteId: 'p1', forma_pagamento: 'Pix' });
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(b.hash).toBe(a.hash);
    const [c] = await pendentesParaItens([{ ...pendente, transacao_id: 'tx-0002' }]);
    expect(c.hash).not.toBe(a.hash);
  });

  it('nome da importação cabe na coluna', () => {
    expect(nomeImportacaoBanco('Banco Horizonte', 'Conta corrente', '05/11/2026')).toBe('Open Finance · Banco Horizonte · Conta corrente · 05/11/2026');
    expect(nomeImportacaoBanco('x'.repeat(300), 'c', 'd').length).toBeLessThanOrEqual(200);
  });
});
