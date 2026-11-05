// Página isolada do widget da Pluggy (conectar-banco.html).
//
// Fluxo: sessão do app (mesmo navegador) -> Edge Function of-token devolve um token
// temporário -> widget da Pluggy (iframe de connect.pluggy.ai) -> ao concluir, of-conexao
// confere na Pluggy que o item é deste usuário e traz as primeiras transações para a fila.
// Esta página não lê nem mostra dados financeiros.

import { PluggyConnect } from 'pluggy-connect-sdk';
import './conectar.css';
import { supabase } from './lib/supabase.js';
import { nivelDaSessao } from './servicos/seguranca.js';
import { registrarConexao, tokenDeConexao } from './servicos/openFinance.js';

if (import.meta.env.PROD && window.top !== window.self) {
  document.documentElement.hidden = true;
  throw new Error('Esta página não pode ser aberta dentro de outra página.');
}

const voltarAoApp = (aviso) => {
  const destino = new URL('./', window.location.href);
  destino.hash = aviso ? `#/importar?banco=${aviso}` : '#/importar';
  window.location.replace(destino.href);
};

function mostrar(texto, erro = false) {
  const el = document.getElementById('estado');
  el.textContent = texto;
  el.classList.toggle('erro', erro);
}

async function iniciar() {
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return mostrar('Entre no app primeiro e volte a tocar em "Conectar banco".', true);
  if ((await nivelDaSessao()).precisaCodigo) {
    return mostrar('Abra o app e confirme o código de verificação em duas etapas antes de conectar um banco.', true);
  }

  // reconectar uma conexão existente (login expirado no banco)
  const conexaoId = new URLSearchParams(window.location.search).get('reconectar');
  let itemId = null;
  if (conexaoId) {
    const r = await supabase.from('conexoes_bancarias').select('item_id').eq('id', conexaoId).maybeSingle();
    itemId = r.data?.item_id || null;
    if (!itemId) return mostrar('Conexão não encontrada.', true);
  }

  const token = await tokenDeConexao(conexaoId);
  let concluiu = false;
  const widget = new PluggyConnect({
    connectToken: token,
    includeSandbox: import.meta.env.VITE_PLUGGY_SANDBOX === '1',
    ...(itemId ? { updateItem: itemId } : {}),
    language: 'pt',
    theme: 'dark',
    countries: ['BR'],
    onSuccess: async ({ item }) => {
      concluiu = true;
      mostrar('Banco conectado. Buscando as transações…');
      try {
        const r = await registrarConexao(item.id);
        mostrar(r.novas ? `${r.novas} transação(ões) aguardando sua conferência.` : 'Banco conectado.');
        setTimeout(() => voltarAoApp('ok'), 1200);
      } catch (e) {
        mostrar(e.message, true);
      }
    },
    onError: ({ message }) => mostrar(message || 'A conexão com o banco não foi concluída.', true),
    onClose: () => {
      if (!concluiu) voltarAoApp();
    },
  });
  mostrar('Siga os passos na janela da Pluggy.');
  await widget.init();
}

iniciar().catch((e) => mostrar(e?.message || 'Não foi possível abrir a conexão bancária.', true));
