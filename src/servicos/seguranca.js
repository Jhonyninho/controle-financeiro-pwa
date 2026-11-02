// Proteção da conta: verificação em duas etapas (TOTP, app autenticador),
// troca de senha e encerramento das sessões em todos os aparelhos.
//
// A verificação em duas etapas também é exigida pelo BANCO (migration 0009):
// quem cadastrou um autenticador só lê/grava dados com sessão "aal2", ou seja,
// mesmo que alguém descubra a senha, sem o código do celular não vê nada.

import { supabase } from '../lib/supabase.js';

const MSG_CODIGO = 'Código inválido ou expirado. Confira o horário do celular e tente o código atual.';

/** Fatores TOTP verificados (cadastro concluído). */
export async function autenticadores() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error('Não foi possível consultar a verificação em duas etapas.');
  return (data?.totp || []).filter((f) => f.status === 'verified');
}

/**
 * Nível da sessão atual.
 * precisaCodigo = a conta tem autenticador, mas esta sessão ainda não passou por ele.
 */
export async function nivelDaSessao() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return { atual: null, proximo: null, precisaCodigo: false };
  return { atual: data.currentLevel, proximo: data.nextLevel, precisaCodigo: data.nextLevel === 'aal2' && data.currentLevel !== 'aal2' };
}

/** Confere o código de 6 dígitos e eleva a sessão para aal2. */
export async function verificarCodigo(codigo) {
  const limpo = String(codigo || '').replace(/\D/g, '');
  if (limpo.length !== 6) throw new Error('Digite os 6 números do app autenticador.');
  const [fator] = await autenticadores();
  if (!fator) throw new Error('Nenhum autenticador cadastrado nesta conta.');
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: limpo });
  if (error) throw new Error(MSG_CODIGO);
}

/** Começa o cadastro: devolve o QR code (SVG em data URL) e o segredo para digitar à mão. */
export async function iniciarCadastro() {
  // cadastros abandonados ficam "unverified" e bloqueiam um novo com o mesmo nome
  const { data: lista } = await supabase.auth.mfa.listFactors();
  for (const f of lista?.all || []) {
    if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Celular ${new Date().toISOString().slice(0, 10)}` });
  if (error) throw new Error('Não foi possível iniciar o cadastro do autenticador. Verifique se o MFA (TOTP) está ativo no Supabase.');
  return { id: data.id, qr: data.totp.qr_code, segredo: data.totp.secret };
}

/** Conclui o cadastro com o primeiro código gerado pelo app. */
export async function concluirCadastro(idFator, codigo) {
  const limpo = String(codigo || '').replace(/\D/g, '');
  if (limpo.length !== 6) throw new Error('Digite os 6 números do app autenticador.');
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: idFator, code: limpo });
  if (error) throw new Error(MSG_CODIGO);
}

/** Remove a verificação em duas etapas (exige sessão aal2: pede o código antes). */
export async function removerAutenticadores(codigo) {
  await verificarCodigo(codigo);
  for (const f of await autenticadores()) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) throw new Error('Não foi possível desligar a verificação em duas etapas.');
  }
}

export async function trocarSenha(nova) {
  const { error } = await supabase.auth.updateUser({ password: nova });
  if (!error) return;
  if (error.code === 'same_password') throw new Error('A nova senha precisa ser diferente da atual.');
  if (error.code === 'weak_password') throw new Error('Senha fraca. Escolha uma senha mais forte.');
  if (error.code === 'reauthentication_needed') throw new Error('Por segurança, saia e entre de novo antes de trocar a senha.');
  throw new Error('Não foi possível trocar a senha.');
}

/** Encerra a sessão em TODOS os aparelhos (inclusive este). */
export async function sairDeTodosOsAparelhos() {
  await supabase.auth.signOut({ scope: 'global' });
}
