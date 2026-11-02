import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { lerPlanilha, interpretarLinhas, ErroImportacao } from '../src/importacao/leitor.js';
import { gerarModelo } from '../src/importacao/modelo.js';

const CATEGORIAS = [{ tipo: 'SAIDA', nome: 'Transporte', subcategoria: 'Combustível' }];

function xlsxDeLinhas(linhas, aba = 'Lançamentos') {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), aba);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

describe('modelo', () => {
  it('modelo gerado é lido de volta sem erros depois de preenchido', async () => {
    const wb = XLSX.read(new Uint8Array(gerarModelo(XLSX, CATEGORIAS)), { type: 'array' });
    expect(wb.SheetNames).toEqual(['Lançamentos', 'Categorias', 'Instruções']);
    XLSX.utils.sheet_add_aoa(
      wb.Sheets['Lançamentos'],
      [['01/10/2026', 'AUTO POSTO', '-100,00', 'Transporte', 'Combustível', 'Débito']],
      { origin: -1 },
    );
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    const { itens } = await lerPlanilha(XLSX, bytes, 'preenchido.xlsx');
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({
      data: '2026-10-01', tipo: 'SAIDA', valor: 100, categoria: 'Transporte', forma_pagamento: 'Débito', erros: [],
    });
  });
});

describe('lerPlanilha', () => {
  it('lê xlsx com cabeçalho fora da primeira linha, números e datas reais', async () => {
    const bytes = xlsxDeLinhas([
      ['Extrato gerado pela IA'],
      [],
      ['Data', 'Descrição', 'Valor'],
      [new Date(2026, 9, 1), 'SUPERMERCADO X', -5.1],
      ['02/10/2026', 'PIX RECEBIDO FULANO', '250,00'],
      ['02/10/2026', 'Saldo do dia', '1.000,00'],
    ]);
    const { itens, ignoradas } = await lerPlanilha(XLSX, bytes, 'a.xlsx');
    expect(ignoradas).toBe(1);
    expect(itens.map((i) => [i.data, i.tipo, i.valor])).toEqual([
      ['2026-10-01', 'SAIDA', 5.1],
      ['2026-10-02', 'ENTRADA', 250],
    ]);
    expect(itens[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('lê CSV com ponto e vírgula em Windows-1252', async () => {
    const csv = 'Data;Descrição;Valor\r\n05/10/2026;FARMÁCIA SÃO JOÃO;-41,60\r\n';
    const bytes = new Uint8Array([...csv].map((c) => c.charCodeAt(0))); // latin1 == cp1252 para estes caracteres
    const { itens } = await lerPlanilha(XLSX, bytes, 'extrato.csv');
    expect(itens[0]).toMatchObject({ descricao: 'FARMÁCIA SÃO JOÃO', valor: 41.6, tipo: 'SAIDA' });
  });

  it('lê CSV UTF-8 com vírgula', async () => {
    const bytes = new TextEncoder().encode('Data,Descrição,Valor\n2026-10-05,Padaria,"-12,50"\n');
    const { itens } = await lerPlanilha(XLSX, bytes, 'extrato.csv');
    expect(itens[0]).toMatchObject({ data: '2026-10-05', descricao: 'Padaria', valor: 12.5 });
  });

  it('lançamentos idênticos no mesmo arquivo recebem hashes diferentes, e são estáveis entre arquivos', async () => {
    const linhas = [['Data', 'Descrição', 'Valor'], ['01/10/2026', 'CAFE', '-5,00'], ['01/10/2026', 'CAFE', '-5,00']];
    const a = await lerPlanilha(XLSX, xlsxDeLinhas(linhas), 'a.xlsx');
    const b = await lerPlanilha(XLSX, xlsxDeLinhas(linhas), 'b.xlsx');
    expect(a.itens[0].hash).not.toBe(a.itens[1].hash);
    expect(a.itens.map((i) => i.hash)).toEqual(b.itens.map((i) => i.hash));
  });

  it('marca erros por linha sem derrubar a importação', () => {
    const { itens } = interpretarLinhas([
      ['Data', 'Descrição', 'Valor'],
      ['32/10/2026', 'X', 'abc'],
      ['01/10/2026', '', '0'],
    ]);
    expect(itens[0].erros).toEqual(['Data inválida', 'Valor inválido']);
    expect(itens[1].erros).toEqual(['Valor zerado', 'Descrição vazia']);
  });

  it('recusa arquivo sem cabeçalho, extensão errada ou grande demais', async () => {
    await expect(lerPlanilha(XLSX, xlsxDeLinhas([['a', 'b'], [1, 2]]), 'x.xlsx')).rejects.toThrow(ErroImportacao);
    await expect(lerPlanilha(XLSX, new Uint8Array(10), 'x.pdf')).rejects.toThrow(/Formato/);
    await expect(lerPlanilha(XLSX, new Uint8Array(6 * 1024 * 1024), 'x.csv')).rejects.toThrow(/grande/);
  });
});
