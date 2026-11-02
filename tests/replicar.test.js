import { expect, it, vi } from 'vitest';

// replicar.js importa o estado/componentes, que dependem do navegador; aqui só testamos a regra pura
vi.mock('../src/estado.js', () => ({ categoriaPorId: () => null, contaPorId: () => null }));
vi.mock('../src/ui/componentes.js', () => ({}));
const { saoIguais } = await import('../src/ui/replicar.js');

it('lançamentos iguais: mesma descrição sem datas/números e mesmo tipo', () => {
  const a = { tipo: 'SAIDA', descricao: '02/10 18:47 N-MULTIFIBRA 100201' };
  expect(saoIguais(a, { tipo: 'SAIDA', descricao: '02/11 09:00 N-MULTIFIBRA 100999' })).toBe(true);
  expect(saoIguais(a, { tipo: 'ENTRADA', descricao: '02/11 N-MULTIFIBRA' })).toBe(false);
  expect(saoIguais({ tipo: 'SAIDA', descricao: 'PIX ENVIADO JOAO' }, { tipo: 'SAIDA', descricao: 'PIX ENVIADO MARIA' })).toBe(false);
  // descrições curtas demais não são agrupadas
  expect(saoIguais({ tipo: 'SAIDA', descricao: '12 AB' }, { tipo: 'SAIDA', descricao: '13 AB' })).toBe(false);
});
