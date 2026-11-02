import { describe, expect, it } from 'vitest';
import { criarClassificador, chaveDescricao } from '../src/importacao/classificador.js';

const cat = (id, tipo, nome, subcategoria) => ({ id, tipo, nome, subcategoria });
const CATEGORIAS = [
  cat('comb', 'SAIDA', 'Transporte', 'Combustível'),
  cat('merc', 'SAIDA', 'Mercado', 'Supermercado'),
  cat('rest', 'SAIDA', 'Restaurantes', 'Restaurante'),
  cat('net', 'SAIDA', 'Moradia', 'Internet e TV'),
  cat('pixr', 'ENTRADA', 'Recebimentos', 'Pix recebido'),
  cat('agua', 'SAIDA', 'Moradia', 'Água'),
  cat('fat-s', 'SAIDA', 'Transferências', 'Pagamento de fatura'),
  cat('fat-e', 'ENTRADA', 'Transferências', 'Pagamento de fatura'),
];

describe('classificador', () => {
  it('usa a categoria da planilha quando ela existe e é do mesmo tipo', () => {
    const c = criarClassificador({ categorias: CATEGORIAS });
    expect(c({ tipo: 'SAIDA', descricao: 'X', categoria: 'restaurantes', subcategoria: 'restaurante' })).toEqual({
      categoria_id: 'rest',
      origem: 'planilha',
    });
    // categoria de ENTRADA num lançamento de SAÍDA é ignorada
    expect(c({ tipo: 'SAIDA', descricao: 'X', categoria: 'Recebimentos', subcategoria: 'Pix recebido' }).origem).toBeNull();
  });

  it('regra do usuário vence histórico e regras padrão', () => {
    const c = criarClassificador({
      categorias: CATEGORIAS,
      regras: [{ padrao: 'jk comercio de agua', categoria_id: 'agua' }],
      historico: [{ tipo: 'SAIDA', descricao: '05/10 13:47 JK COMERCIO DE AGUA', categoria_id: 'merc' }],
    });
    expect(c({ tipo: 'SAIDA', descricao: '06/10 10:00 JK COMERCIO DE AGUA' })).toEqual({ categoria_id: 'agua', origem: 'regra' });
  });

  it('aprende pelo histórico ignorando datas e números', () => {
    const c = criarClassificador({
      categorias: CATEGORIAS,
      historico: [{ tipo: 'SAIDA', descricao: '02/10 18:47 N-MULTI LTDA 100201', categoria_id: 'net' }],
    });
    expect(c({ tipo: 'SAIDA', descricao: '02/11 09:00 N-MULTI LTDA 100999' })).toEqual({ categoria_id: 'net', origem: 'historico' });
    expect(chaveDescricao('01/10 08:54 AUTO POSTO COTIA')).toBe('AUTO POSTO COTIA');
  });

  it('regras padrão por palavra-chave', () => {
    const c = criarClassificador({ categorias: CATEGORIAS });
    expect(c({ tipo: 'SAIDA', descricao: '01/10 08:54 AUTO POSTO COTIA' }).categoria_id).toBe('comb');
    expect(c({ tipo: 'SAIDA', descricao: 'SUPERM.  SUPER COTIA' }).categoria_id).toBe('merc');
    expect(c({ tipo: 'SAIDA', descricao: 'N-MULTIFIBRA' }).categoria_id).toBe('net');
    expect(c({ tipo: 'ENTRADA', descricao: 'PIX RECEBIDO FULANO' }).categoria_id).toBe('pixr');
    expect(c({ tipo: 'SAIDA', descricao: 'Pagamento de Fatura' }).categoria_id).toBe('fat-s');
    expect(c({ tipo: 'ENTRADA', descricao: 'PAGAMENTO RECEBIDO - OBRIGADO' }).categoria_id).toBe('fat-e');
    expect(c({ tipo: 'SAIDA', descricao: 'COMPRA QUALQUER COISA' })).toEqual({ categoria_id: null, origem: null });
  });
});
