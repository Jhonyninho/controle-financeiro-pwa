// Login, "esqueci minha senha" e definição de senha (convite/redefinição).
// Não existe cadastro: só entra quem foi convidado pelo dono do app.

import { supabase, URL_DO_APP } from '../lib/supabase.js';
import { html, renderizar } from '../lib/html.js';
import { $, comCarregando } from '../ui/componentes.js';
import { iniciarHud, marcacaoHud } from './hud.js';
import { nivelDaSessao, verificarCodigo } from '../servicos/seguranca.js';

export const SENHA_MIN = 10;

let hud = null;

/** Desliga o HUD e limpa a tela de entrada (chamado ao entrar no app). */
export function fecharTelaEntrada() {
  hud?.destruir();
  hud = null;
  const raiz = $('#tela-auth');
  renderizar(raiz, html``);
  raiz.hidden = true;
}

function exibir(conteudo) {
  const raiz = $('#tela-auth');
  if (!$('.hud-painel', raiz)) {
    renderizar(raiz, marcacaoHud());
    hud = iniciarHud(raiz);
  }
  renderizar($('#auth-caixa', raiz), conteudo);
  raiz.hidden = false;
  $('#app').hidden = true;
  return raiz;
}

/** Sequência "acesso autorizado" antes de abrir o app. */
async function liberarAcesso(nome) {
  if (hud) await hud.liberar(nome);
}

function mensagem(el, texto, tipo = 'erro') {
  const p = $('.auth-msg', el);
  p.textContent = texto || '';
  p.className = `auth-msg auth-msg-${tipo}`;
  p.hidden = !texto;
}

export function mostrarLogin({ erro = null, aviso = null, aoEntrar } = {}) {
  const el = exibir(html`
    <h2 class="auth-titulo">Identificação</h2>
    <form id="form-login" class="auth-form">
      <label>E-mail <input type="email" name="email" autocomplete="username" required maxlength="254" /></label>
      <label>Senha <input type="password" name="senha" autocomplete="current-password" required maxlength="128" /></label>
      <button type="submit" class="btn btn-primario">Acessar painel</button>
      <button type="button" class="btn-link" id="btn-esqueci">Esqueci minha senha</button>
      <p class="auth-msg" hidden></p>
    </form>`);

  if (erro) mensagem(el, erro);
  else if (aviso) mensagem(el, aviso, 'info');

  $('#form-login', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await comCarregando($('button[type=submit]', el), async () => {
      const { data, error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.senha });
      if (error) {
        // mensagem genérica: não revela se o e-mail existe
        mensagem(el, error.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos.' : 'E-mail ou senha inválidos.');
        return;
      }
      // conta com verificação em duas etapas: o banco só libera os dados depois do código
      if ((await nivelDaSessao()).precisaCodigo) {
        mostrarCodigo({ aoConfirmar: () => entrarLiberado(data.user, aoEntrar) });
        return;
      }
      await entrarLiberado(data.user, aoEntrar);
    });
  });

  $('#btn-esqueci', el).addEventListener('click', () => mostrarEsqueci({ aoEntrar }));
}

async function entrarLiberado(usuario, aoEntrar) {
  const { data: perfil } = await supabase.from('perfis').select('nome').maybeSingle();
  await liberarAcesso(perfil?.nome?.split(' ')[0]);
  await aoEntrar(usuario);
}

/**
 * Segunda etapa: código de 6 dígitos do app autenticador.
 * Usada após o login e quando uma sessão salva ainda não passou pelo código.
 */
export function mostrarCodigo({ aoConfirmar, erro = null }) {
  const el = exibir(html`
    <h2 class="auth-titulo">Verificação em duas etapas</h2>
    <p class="auth-sub">Abra o app autenticador do seu celular e digite o código de 6 números.</p>
    <form id="form-codigo" class="auth-form">
      <label>Código
        <input name="codigo" class="campo-codigo" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required />
      </label>
      <button type="submit" class="btn btn-primario">Confirmar</button>
      <button type="button" class="btn-link" id="btn-sair-codigo">Usar outra conta</button>
      <p class="auth-msg" hidden></p>
    </form>`);
  if (erro) mensagem(el, erro);
  $('[name=codigo]', el).focus();

  $('#btn-sair-codigo', el).addEventListener('click', () => supabase.auth.signOut());
  $('#form-codigo', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = new FormData(e.target).get('codigo');
    await comCarregando($('button[type=submit]', el), async () => {
      try {
        await verificarCodigo(codigo);
      } catch (err) {
        mensagem(el, err.message);
        $('[name=codigo]', el).select();
        return;
      }
      await aoConfirmar();
    });
  });
}

function mostrarEsqueci({ aoEntrar }) {
  const el = exibir(html`
    <h2 class="auth-titulo">Redefinir senha</h2>
    <p class="auth-sub">Enviaremos um link para o seu e-mail.</p>
    <form id="form-esqueci" class="auth-form">
      <label>E-mail <input type="email" name="email" autocomplete="username" required maxlength="254" /></label>
      <button type="submit" class="btn btn-primario">Enviar link</button>
      <button type="button" class="btn-link" id="btn-voltar">Voltar ao login</button>
      <p class="auth-msg" hidden></p>
    </form>`);

  $('#btn-voltar', el).addEventListener('click', () => mostrarLogin({ aoEntrar }));
  $('#form-esqueci', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = new FormData(e.target).get('email').trim();
    await comCarregando($('button[type=submit]', el), async () => {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: URL_DO_APP });
      // resposta igual exista ou não o e-mail
      mensagem(el, 'Se este e-mail tiver acesso, você receberá o link em instantes.', 'info');
    });
  });
}

export function validarSenha(senha, confirmacao) {
  if (senha.length < SENHA_MIN) return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return 'A senha precisa ter letras e números.';
  if (senha !== confirmacao) return 'As senhas não conferem.';
  return null;
}

export function mostrarDefinirSenha({ tipo, aoConcluir }) {
  const convite = tipo === 'invite';
  const el = exibir(html`
    <h2 class="auth-titulo">${convite ? 'Primeiro acesso' : 'Nova senha'}</h2>
    <p class="auth-sub">${convite ? 'Você foi convidado. Configure seu acesso em menos de um minuto.' : 'Defina sua nova senha.'}</p>
    <form id="form-senha" class="auth-form">
      ${convite
        ? html`<label>Como quer ser chamado <input name="nome" required maxlength="80" autocomplete="given-name" /></label>
            <label>Nome completo, como aparece no banco
              <input name="nome_completo" maxlength="120" autocomplete="name" placeholder="Usado para reconhecer Pix entre suas contas" />
            </label>`
        : ''}
      <label>Nova senha <input type="password" name="senha" autocomplete="new-password" required minlength="${SENHA_MIN}" maxlength="128" /></label>
      <label>Confirme a senha <input type="password" name="confirmacao" autocomplete="new-password" required maxlength="128" /></label>
      <small class="dica">Mínimo de ${SENHA_MIN} caracteres, com letras e números.</small>
      <button type="submit" class="btn btn-primario">Salvar e entrar</button>
      <p class="auth-msg" hidden></p>
    </form>`);

  $('#form-senha', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const problema = validarSenha(f.senha, f.confirmacao);
    if (problema) return mensagem(el, problema);

    await comCarregando($('button[type=submit]', el), async () => {
      const { data, error } = await supabase.auth.updateUser({ password: f.senha });
      if (error) {
        mensagem(el, error.code === 'weak_password' ? 'Senha fraca. Escolha uma senha mais forte.' : 'Não foi possível salvar a senha.');
        return;
      }
      if (convite && f.nome) {
        await supabase.from('perfis').update({ nome: f.nome.trim(), nome_completo: (f.nome_completo || '').trim() }).eq('id', data.user.id);
      }
      await liberarAcesso(convite ? f.nome.trim().split(' ')[0] : null);
      await aoConcluir();
    });
  });
}
