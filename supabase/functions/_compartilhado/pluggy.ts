// Cliente mínimo da API da Pluggy (https://docs.pluggy.ai). Roda só no servidor:
// CLIENT_ID/SECRET e a API key nunca saem daqui e nunca vão para logs.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { mapearTransacao, statusDaConexao, tipoDaConta } from './mapear.js';

const BASE = 'https://api.pluggy.ai';
const TEMPO_LIMITE_MS = 15_000;
const MAX_PAGINAS = 20;
const DIAS_INICIAIS = 90; // primeira sincronização traz 3 meses
const DIAS_SOBREPOSICAO = 7; // ressincroniza a última semana (lançamentos que o banco posta atrasado)

let apiKey: { valor: string; expira: number } | null = null;

async function obterApiKey(): Promise<string> {
  if (apiKey && apiKey.expira > Date.now()) return apiKey.valor;
  const res = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: Deno.env.get('PLUGGY_CLIENT_ID'), clientSecret: Deno.env.get('PLUGGY_CLIENT_SECRET') }),
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  if (!res.ok) throw new Error(`Pluggy auth ${res.status}`);
  const { apiKey: valor } = await res.json();
  apiKey = { valor, expira: Date.now() + 100 * 60 * 1000 }; // válida por 2h; renova antes
  return valor;
}

export async function pluggy(metodo: string, caminho: string, corpo?: unknown) {
  const res = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { 'X-API-KEY': await obterApiKey(), 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Pluggy ${metodo} ${caminho.split('?')[0]} ${res.status}`);
  return res.status === 204 ? {} : res.json();
}

const diasAtras = (base: Date, dias: number) => new Date(base.getTime() - dias * 86_400_000).toISOString().slice(0, 10);

type Conexao = { id: string; user_id: string; item_id: string; ultima_sincronizacao: string | null };

/**
 * Atualiza status, contas e fila de transações de uma conexão.
 * `admin` usa a chave de serviço; toda escrita leva o user_id da própria conexão.
 */
export async function sincronizarConexao(admin: SupabaseClient, conexao: Conexao) {
  const item = await pluggy('GET', `/items/${encodeURIComponent(conexao.item_id)}`);
  if (!item) {
    // o item foi apagado na Pluggy: a conexão deixa de existir aqui também
    await admin.from('conexoes_bancarias').delete().eq('id', conexao.id).eq('user_id', conexao.user_id);
    return { novas: 0, removida: true };
  }
  const status = statusDaConexao(item);
  await admin
    .from('conexoes_bancarias')
    .update({ status, instituicao: String(item.connector?.name || '').slice(0, 100) })
    .eq('id', conexao.id)
    .eq('user_id', conexao.user_id);

  const contas = (await pluggy('GET', `/accounts?itemId=${encodeURIComponent(conexao.item_id)}`))?.results || [];
  const linhasContas = contas
    .filter((c: { type: string }) => tipoDaConta(c))
    .map((c: { id: string; name?: string; marketingName?: string; number?: string; type: string; balance?: number }) => ({
      user_id: conexao.user_id,
      conexao_id: conexao.id,
      account_id: String(c.id).slice(0, 100),
      nome: String(c.marketingName || c.name || c.number || 'Conta').slice(0, 120),
      tipo: tipoDaConta(c),
      saldo: Number.isFinite(Number(c.balance)) ? Math.round(Number(c.balance) * 100) / 100 : null,
    }));
  if (!linhasContas.length) return { novas: 0 };

  // upsert sem mexer em conta_id (escolha do usuário)
  const { data: externas, error } = await admin
    .from('contas_externas')
    .upsert(linhasContas, { onConflict: 'conexao_id,account_id' })
    .select('id, account_id, tipo');
  if (error) throw error;

  const agora = new Date();
  const desde = conexao.ultima_sincronizacao
    ? diasAtras(new Date(conexao.ultima_sincronizacao), DIAS_SOBREPOSICAO)
    : diasAtras(agora, DIAS_INICIAIS);

  let novas = 0;
  for (const ext of externas || []) {
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const r = await pluggy(
        'GET',
        `/transactions?accountId=${encodeURIComponent(ext.account_id)}&from=${desde}&pageSize=500&page=${pagina}`,
      );
      const linhas = (r?.results || [])
        .map((tx: unknown) => mapearTransacao(tx, ext.tipo))
        .filter(Boolean)
        .map((t: Record<string, unknown>) => ({ ...t, user_id: conexao.user_id, conta_externa_id: ext.id }));
      if (linhas.length) {
        const ins = await admin
          .from('transacoes_pendentes')
          .upsert(linhas, { onConflict: 'user_id,transacao_id', ignoreDuplicates: true })
          .select('id');
        if (ins.error) throw ins.error;
        novas += ins.data?.length || 0;
      }
      if (!r || pagina >= (r.totalPages || 1)) break;
    }
  }

  if (status === 'ATUALIZADO') {
    await admin
      .from('conexoes_bancarias')
      .update({ ultima_sincronizacao: agora.toISOString() })
      .eq('id', conexao.id)
      .eq('user_id', conexao.user_id);
  }
  return { novas };
}
