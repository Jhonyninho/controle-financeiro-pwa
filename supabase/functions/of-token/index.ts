// Gera o connect token de curta duração para o widget da Pluggy abrir no app.
// O app nunca recebe CLIENT_SECRET nem a API key: só este token temporário.
// Corpo opcional: { conexaoId } para reconectar (login expirado) uma conexão existente.

import { clienteAdmin, conexaoDoUsuario, json, lerCorpo, servir, usuarioAutorizado } from '../_compartilhado/servidor.ts';
import { pluggy } from '../_compartilhado/pluggy.ts';

servir(async (req) => {
  const usuario = await usuarioAutorizado(req);
  const { conexaoId } = await lerCorpo(req);

  const corpo: Record<string, unknown> = { options: { clientUserId: usuario.id, avoidDuplicates: true } };
  if (conexaoId) {
    const conexao = await conexaoDoUsuario(clienteAdmin(), usuario.id, conexaoId);
    corpo.itemId = conexao.item_id;
  }
  const r = await pluggy('POST', '/connect_token', corpo);
  return json(req, { token: r?.accessToken });
});
