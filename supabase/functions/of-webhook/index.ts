// Webhook da Pluggy (sem JWT: configure verify_jwt = false em supabase/config.toml).
//
// Segurança:
//  - exige o segredo PLUGGY_WEBHOOK_SECRET no cabeçalho "x-webhook-secret"
//    (ou no parâmetro ?chave= da URL, se o painel não permitir cabeçalhos),
//    comparado em tempo constante;
//  - nunca confia no corpo: usa só o itemId para buscar tudo de novo na API da Pluggy,
//    e só para itens que já existem em conexoes_bancarias;
//  - responde rápido e sincroniza em segundo plano.

import { clienteAdmin } from '../_compartilhado/servidor.ts';
import { iguaisTempoConstante } from '../_compartilhado/mapear.js';
import { sincronizarConexao } from '../_compartilhado/pluggy.ts';

const resposta = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
const recentes = new Map<string, number>(); // freio por item: no máximo uma sincronização a cada 20 s

Deno.serve(async (req) => {
  if (req.method !== 'POST') return resposta(405);

  const segredo = Deno.env.get('PLUGGY_WEBHOOK_SECRET') || '';
  const recebido = req.headers.get('x-webhook-secret') || new URL(req.url).searchParams.get('chave') || '';
  if (!segredo || !iguaisTempoConstante(recebido, segredo)) return resposta(401);

  const texto = await req.text();
  if (texto.length > 16_384) return resposta(413);
  let evento: { event?: string; itemId?: string };
  try {
    evento = JSON.parse(texto);
  } catch {
    return resposta(400);
  }
  const itemId = typeof evento.itemId === 'string' && /^[A-Za-z0-9-]{1,100}$/.test(evento.itemId) ? evento.itemId : null;
  if (!itemId) return resposta(202);

  const agora = Date.now();
  if (agora - (recentes.get(itemId) || 0) < 20_000) return resposta(202);
  recentes.set(itemId, agora);

  const tarefa = (async () => {
    const admin = clienteAdmin();
    const { data: conexao } = await admin
      .from('conexoes_bancarias')
      .select('id, user_id, item_id, ultima_sincronizacao')
      .eq('item_id', itemId)
      .maybeSingle();
    if (!conexao) return; // item desconhecido: ignora
    await sincronizarConexao(admin, conexao); // item apagado na Pluggy também é tratado aqui
  })().catch((e) => console.error('webhook:', e instanceof Error ? e.message : 'falha'));

  // @ts-ignore EdgeRuntime existe no runtime do Supabase
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(tarefa);
  else await tarefa;
  return resposta(202);
});
