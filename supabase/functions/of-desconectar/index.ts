// Revoga uma conexão: apaga o item na Pluggy (encerra o consentimento) e a conexão
// aqui, com contas externas e fila em cascata. Lançamentos já importados ficam.
// Corpo: { conexaoId }.

import { clienteAdmin, conexaoDoUsuario, json, lerCorpo, servir, usuarioAutorizado } from '../_compartilhado/servidor.ts';
import { pluggy } from '../_compartilhado/pluggy.ts';

servir(async (req) => {
  const usuario = await usuarioAutorizado(req);
  const { conexaoId } = await lerCorpo(req);
  const admin = clienteAdmin();
  const conexao = await conexaoDoUsuario(admin, usuario.id, conexaoId);

  await pluggy('DELETE', `/items/${encodeURIComponent(conexao.item_id)}`); // 404 = já não existia
  const { error } = await admin.from('conexoes_bancarias').delete().eq('id', conexao.id).eq('user_id', usuario.id);
  if (error) throw error;
  return json(req, { ok: true });
});
