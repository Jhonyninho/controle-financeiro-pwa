// "Sincronizar agora": busca na Pluggy as transações novas das conexões do usuário
// e coloca na fila (transacoes_pendentes). Corpo opcional: { conexaoId }.
// Limite: uma sincronização por conexão a cada 60 s.

import { clienteAdmin, conexaoDoUsuario, ErroHttp, json, lerCorpo, servir, usuarioAutorizado } from '../_compartilhado/servidor.ts';
import { pluggy, sincronizarConexao } from '../_compartilhado/pluggy.ts';

const INTERVALO_MIN_MS = 60_000;
const ultimas = new Map<string, number>(); // por instância; suficiente como freio contra cliques repetidos

servir(async (req) => {
  const usuario = await usuarioAutorizado(req);
  const { conexaoId, atualizarNoBanco } = await lerCorpo(req);
  const admin = clienteAdmin();

  let conexoes;
  if (conexaoId) conexoes = [await conexaoDoUsuario(admin, usuario.id, conexaoId)];
  else {
    const r = await admin.from('conexoes_bancarias').select('id, user_id, item_id, ultima_sincronizacao').eq('user_id', usuario.id);
    if (r.error) throw r.error;
    conexoes = r.data || [];
  }

  let novas = 0;
  for (const c of conexoes) {
    const ultima = ultimas.get(c.id) || 0;
    if (Date.now() - ultima < INTERVALO_MIN_MS) {
      if (conexaoId) throw new ErroHttp(429, 'Aguarde um minuto antes de sincronizar de novo.');
      continue;
    }
    ultimas.set(c.id, Date.now());
    // pede à Pluggy para consultar o banco de novo; o resultado chega depois pelo webhook
    if (atualizarNoBanco === true) await pluggy('PATCH', `/items/${encodeURIComponent(c.item_id)}`, {});
    novas += (await sincronizarConexao(admin, c)).novas;
  }
  return json(req, { novas });
});
