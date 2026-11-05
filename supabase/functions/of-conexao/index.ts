// Registra a conexão criada pelo widget. Corpo: { itemId }.
// Segurança: o item é buscado na própria Pluggy e só é aceito se o clientUserId
// (gravado no connect token por of-token) for o usuário desta sessão. Assim
// ninguém registra o item de outra pessoa adivinhando ou copiando um itemId.

import { clienteAdmin, ErroHttp, json, lerCorpo, servir, usuarioAutorizado } from '../_compartilhado/servidor.ts';
import { pluggy, sincronizarConexao } from '../_compartilhado/pluggy.ts';

servir(async (req) => {
  const usuario = await usuarioAutorizado(req);
  const { itemId } = await lerCorpo(req);
  if (typeof itemId !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(itemId)) throw new ErroHttp(400, 'Conexão inválida.');

  const item = await pluggy('GET', `/items/${encodeURIComponent(itemId)}`);
  if (!item || item.clientUserId !== usuario.id) throw new ErroHttp(403, 'Esta conexão não pertence à sua conta.');

  const admin = clienteAdmin();
  const existente = await admin.from('conexoes_bancarias').select('id, user_id, item_id, ultima_sincronizacao').eq('item_id', itemId).maybeSingle();
  if (existente.error) throw existente.error;
  if (existente.data && existente.data.user_id !== usuario.id) throw new ErroHttp(403, 'Esta conexão não pertence à sua conta.');

  let conexao = existente.data;
  if (!conexao) {
    const ins = await admin
      .from('conexoes_bancarias')
      .insert({ user_id: usuario.id, item_id: itemId, instituicao: String(item.connector?.name || '').slice(0, 100) })
      .select('id, user_id, item_id, ultima_sincronizacao')
      .single();
    if (ins.error) throw ins.error;
    conexao = ins.data;
  }

  const r = await sincronizarConexao(admin, conexao);
  return json(req, { conexaoId: conexao.id, novas: r.novas });
});
