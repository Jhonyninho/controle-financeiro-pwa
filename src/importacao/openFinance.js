// Fila do Open Finance -> itens no mesmo formato do leitor de planilhas,
// para passarem pela mesma prévia (classificação, transferências, previstos).

const PREFIXO_HASH = 'pluggy|';

async function sha256(texto) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Linhas de `transacoes_pendentes` -> itens da prévia.
 * O hash vem do id da transação no banco: reimportar a mesma transação é ignorado
 * pelo índice único de hash_import, mesmo que a descrição mude.
 */
export async function pendentesParaItens(pendentes) {
  return Promise.all(
    pendentes.map(async (p, i) => ({
      linha: i + 1,
      data: p.data,
      tipo: p.tipo,
      valor: Number(p.valor),
      descricao: String(p.descricao || '').slice(0, 200),
      categoria: '',
      subcategoria: '',
      forma_pagamento: p.forma_pagamento || null,
      erros: [],
      hash: await sha256(PREFIXO_HASH + p.transacao_id),
      pendenteId: p.id,
    })),
  );
}

/** Nome da importação no histórico ("Desfazer" continua funcionando por ela). */
export function nomeImportacaoBanco(instituicao, contaExterna, hojeBR) {
  return `Open Finance · ${instituicao || 'Banco'} · ${contaExterna || 'Conta'} · ${hojeBR}`.slice(0, 200);
}

const ROTULOS_STATUS = {
  ATUALIZADO: 'Atualizado',
  ATUALIZANDO: 'Atualizando…',
  LOGIN_NECESSARIO: 'Precisa entrar de novo no banco',
  ERRO: 'Erro na última atualização',
};
export const rotuloStatus = (s) => ROTULOS_STATUS[s] || s;
