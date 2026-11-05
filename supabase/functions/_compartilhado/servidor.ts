// Base das Edge Functions do Open Finance: CORS, autenticação do usuário,
// cliente administrativo e respostas padronizadas.
//
// Variáveis de ambiente (supabase secrets set ...):
//   PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET  credenciais da Pluggy (só aqui, nunca no app)
//   PLUGGY_WEBHOOK_SECRET                   segredo exigido no webhook
//   APP_ORIGENS                             origens permitidas, separadas por vírgula
//                                           (ex.: https://usuario.github.io,http://localhost:5173)
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já vêm do próprio Supabase.

import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export class ErroHttp extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

const origens = () =>
  (Deno.env.get('APP_ORIGENS') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

export function cabecalhosCors(req: Request): Record<string, string> {
  const origem = req.headers.get('origin') || '';
  const permitida = origens().includes(origem);
  return {
    ...(permitida ? { 'Access-Control-Allow-Origin': origem } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export function json(req: Request, corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Cliente com a chave de serviço: só no servidor e sempre filtrando pelo user_id já validado. */
export function clienteAdmin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Valida a sessão do app e as regras de acesso:
 *  - JWT válido (conferido no Auth do Supabase);
 *  - 2FA cumprido: a leitura do próprio perfil passa pela política restritiva de MFA;
 *  - usuário liberado para o Open Finance (privado.open_finance_liberado).
 */
export async function usuarioAutorizado(req: Request): Promise<User> {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new ErroHttp(401, 'Sessão inválida. Entre novamente.');

  const cliente = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await cliente.auth.getUser(auth.slice(7));
  if (error || !data?.user) throw new ErroHttp(401, 'Sessão inválida. Entre novamente.');

  const perfil = await cliente.from('perfis').select('id').eq('id', data.user.id).maybeSingle();
  if (perfil.error || !perfil.data) throw new ErroHttp(403, 'Confirme o código de verificação em duas etapas.');

  const liberado = await cliente.rpc('open_finance_liberado');
  if (liberado.error || liberado.data !== true) throw new ErroHttp(403, 'A conexão com bancos não está liberada para esta conta.');

  return data.user;
}

/** Envolve o handler: OPTIONS, só POST, origem permitida e erros sem vazar detalhes. */
export function servir(handler: (req: Request) => Promise<Response>, { exigirOrigem = true } = {}) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabecalhosCors(req) });
    if (req.method !== 'POST') return json(req, { erro: 'Método não permitido.' }, 405);
    if (exigirOrigem && !origens().includes(req.headers.get('origin') || '')) {
      return json(req, { erro: 'Origem não permitida.' }, 403);
    }
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof ErroHttp) return json(req, { erro: e.message }, e.status);
      console.error('falha interna:', e instanceof Error ? e.name + ': ' + e.message : 'desconhecida');
      return json(req, { erro: 'Não foi possível concluir agora. Tente de novo em instantes.' }, 500);
    }
  });
}

/** Lê o corpo JSON com limite de tamanho. */
export async function lerCorpo(req: Request, limite = 16_384): Promise<Record<string, unknown>> {
  const texto = await req.text();
  if (texto.length > limite) throw new ErroHttp(413, 'Requisição grande demais.');
  if (!texto) return {};
  try {
    const obj = JSON.parse(texto);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    throw new ErroHttp(400, 'Requisição inválida.');
  }
}

/** Busca uma conexão garantindo que pertence ao usuário. */
export async function conexaoDoUsuario(admin: SupabaseClient, userId: string, conexaoId: unknown) {
  if (typeof conexaoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(conexaoId)) throw new ErroHttp(400, 'Conexão inválida.');
  const { data, error } = await admin
    .from('conexoes_bancarias')
    .select('id, user_id, item_id, ultima_sincronizacao')
    .eq('id', conexaoId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroHttp(404, 'Conexão não encontrada.');
  return data;
}
