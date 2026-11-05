// Chamadas às Edge Functions do Open Finance (supabase/functions/of-*).
// O SDK do Supabase envia o JWT da sessão; as credenciais da Pluggy ficam só no servidor.
// Fica separado de api.js porque a página isolada do widget (conectar-banco.html)
// também usa estas chamadas e não deve carregar o restante do app.

import { supabase } from '../lib/supabase.js';

export class ErroOpenFinance extends Error {}

async function chamar(funcao, corpo = {}) {
  const { data, error } = await supabase.functions.invoke(funcao, { body: corpo });
  if (error) {
    let mensagem = 'Não foi possível falar com o serviço de conexão bancária agora.';
    try {
      const det = await error.context?.json?.();
      if (det?.erro) mensagem = det.erro;
      if (det?.detalhe) mensagem += ` (detalhe: ${det.detalhe})`;
    } catch {
      /* resposta sem JSON */
    }
    throw new ErroOpenFinance(mensagem);
  }
  return data;
}

/** Token temporário para abrir o widget (conexaoId para reconectar uma existente). */
export const tokenDeConexao = (conexaoId) => chamar('of-token', conexaoId ? { conexaoId } : {}).then((r) => r.token);
export const registrarConexao = (itemId) => chamar('of-conexao', { itemId });
export const sincronizarBancos = (conexaoId, atualizarNoBanco = false) =>
  chamar('of-sincronizar', { ...(conexaoId ? { conexaoId } : {}), atualizarNoBanco });
export const desconectarBanco = (conexaoId) => chamar('of-desconectar', { conexaoId });
