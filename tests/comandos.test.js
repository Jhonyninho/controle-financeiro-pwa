import { describe, expect, it } from 'vitest';
import { comandoPorFala } from '../src/lib/comandos.js';

describe('comandos por voz', () => {
  it.each([
    ['Lançamentos futuros', 'futuros'],
    ['abrir os lançamentos futuros', 'futuros'],
    ['contas a pagar', 'futuros'],
    ['Lançamentos', 'lancamentos'],
    ['quero importar o extrato', 'importar'],
    ['Relatórios', 'relatorios'],
    ['mostrar o diagnóstico', 'analise'],
    ['voltar pro início', 'resumo'],
    ['Configurações', 'configuracoes'],
    ['minhas contas', 'contas'],
  ])('"%s" abre %s', (fala, rota) => expect(comandoPorFala(fala)?.rota).toBe(rota));

  it('ações: novo lançamento e novo futuro', () => {
    expect(comandoPorFala('Novo lançamento')?.acao).toBe('novo');
    expect(comandoPorFala('novo lançamento futuro')?.acao).toBe('novo-futuro');
  });

  it('não reconhece fala sem comando nem pedaço de palavra', () => {
    expect(comandoPorFala('bom dia, tudo bem?')).toBeNull();
    expect(comandoPorFala('')).toBeNull();
    expect(comandoPorFala('futurologia')).toBeNull();
  });
});
