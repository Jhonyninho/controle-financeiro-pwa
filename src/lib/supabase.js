import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_KEY;

if (!url || !chave) {
  throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_KEY no arquivo .env.local');
}
if (/service_role|sb_secret_/.test(chave)) {
  // Proteção contra o erro mais grave possível: publicar a chave administrativa.
  throw new Error('A chave configurada é a chave SECRETA do Supabase. Use a chave pública (publishable/anon).');
}

export const supabase = createClient(url, chave, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Os links de convite/redefinição são tratados manualmente em validarLinkDoEmail(),
    // para limpar a URL e saber se é preciso mostrar a tela "definir senha".
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

const TIPOS = ['invite', 'recovery'];
const MSG_EXPIRADO = 'Link inválido ou expirado. Peça um novo convite ou uma nova redefinição de senha.';

/**
 * Se a URL atual veio de um e-mail do Supabase (convite ou redefinição de senha),
 * cria a sessão, limpa a URL e devolve 'invite' | 'recovery'. Senão devolve null.
 *
 * Aceita os três formatos possíveis, para funcionar com ou sem modelos de e-mail personalizados:
 *   1. ?token_hash=...&type=invite|recovery          (modelo personalizado)
 *   2. #access_token=...&refresh_token=...&type=invite (modelo PADRÃO do convite)
 *   3. ?code=...                                      (modelo PADRÃO da redefinição, fluxo PKCE)
 */
export async function validarLinkDoEmail() {
  const atual = new URL(window.location.href);
  const q = atual.searchParams;
  const h = new URLSearchParams(atual.hash.replace(/^#\/?/, ''));

  const temLink = q.has('token_hash') || q.has('code') || h.has('access_token') || h.has('error') || q.has('error');
  if (!temLink) return null;

  // tira os tokens da barra de endereço/histórico antes de qualquer outra coisa
  window.history.replaceState(null, '', atual.pathname);

  if (q.has('error') || h.has('error')) throw new Error(MSG_EXPIRADO);

  // 1. modelo personalizado
  if (q.has('token_hash') && TIPOS.includes(q.get('type'))) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: q.get('token_hash'), type: q.get('type') });
    if (error) throw new Error(MSG_EXPIRADO);
    return q.get('type');
  }

  // 2. convite com modelo padrão
  if (h.has('access_token') && h.has('refresh_token')) {
    const { error } = await supabase.auth.setSession({
      access_token: h.get('access_token'),
      refresh_token: h.get('refresh_token'),
    });
    if (error) throw new Error(MSG_EXPIRADO);
    return TIPOS.includes(h.get('type')) ? h.get('type') : null;
  }

  // 3. redefinição de senha com modelo padrão
  if (q.has('code')) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(q.get('code'));
    if (error) {
      throw new Error('Link inválido ou expirado. Abra o link no MESMO navegador em que você pediu a redefinição, ou peça um novo.');
    }
    return data?.redirectType === 'recovery' ? 'recovery' : null;
  }

  return null;
}

/** Endereço do app para onde os links de e-mail devem voltar. */
export const URL_DO_APP = `${window.location.origin}${import.meta.env.BASE_URL}`;
