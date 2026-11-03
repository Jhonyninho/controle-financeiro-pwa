import '@fontsource-variable/sora';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import './estilo.css';
import './hud.css';
import './componentes.css';
import './v1.css';
import './v11.css';
import { supabase, validarLinkDoEmail } from './lib/supabase.js';
import { html, renderizar } from './lib/html.js';
import { formatarData } from './lib/formatos.js';
import { deslocarMes, nomeMes } from './lib/meses.js';
import { estado, aoMudar, aplicarTema, definirMes, carregarReferencias, limparEstado, mesFoiEscolhido } from './estado.js';
import { ultimoMesComDados } from './servicos/api.js';
import { aplicarAparencia, lerAparencia, salvarAparencia } from './lib/aparencia.js';
import { falarSaudacao, limparVozLocalAntiga } from './servicos/voz.js';
import { convidarComandoVoz, ligarComandoVoz } from './ui/comandoVoz.js';
import { $, $$, avisarErro } from './ui/componentes.js';
import { mostrarLogin, mostrarDefinirSenha, mostrarCodigo, fecharTelaEntrada } from './telas/auth.js';
import { nivelDaSessao } from './servicos/seguranca.js';
import { prepararInstalacao } from './ui/instalar.js';
import { abrirFormLancamento } from './telas/formLancamento.js';

import resumo from './telas/resumo.js';
import lancamentos from './telas/lancamentos.js';
import futuros from './telas/futuros.js';
import importar from './telas/importar.js';
import relatorios from './telas/relatorios.js';
import contas from './telas/contas.js';
import categorias from './telas/categorias.js';
import analise from './telas/analise.js';
import configuracoes from './telas/configuracoes.js';

const ROTAS = { resumo, lancamentos, futuros, importar, relatorios, analise, configuracoes, contas, categorias };
const ROTA_PADRAO = 'resumo';
const MINUTOS_INATIVIDADE = 30;

let rotaAtual = null;

// ---------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------
function rotaDaUrl() {
  const nome = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROTAS[nome] ? nome : ROTA_PADRAO;
}

async function renderizarRota() {
  const nome = rotaDaUrl();
  const tela = ROTAS[nome];
  rotaAtual = nome;

  // Contas e Categorias ficam dentro de Configurações
  const ativa = tela.grupo || nome;
  $$('[data-rota]').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === ativa));
  $('#titulo-tela').textContent = tela.titulo;
  $('#seletor-mes').hidden = !tela.usaMes;
  document.title = `${tela.titulo} | Controle Financeiro`;
  fecharMenu();

  // Contêiner novo a cada navegação: os ouvintes de eventos da tela anterior morrem junto.
  const conteudo = $('#conteudo');
  const el = document.createElement('section');
  el.className = `tela tela-${nome}`;
  renderizar(el, html`<div class="carregando-tela" aria-busy="true">Carregando…</div>`);
  conteudo.replaceChildren(el);
  const versao = (renderizarRota.versao = (renderizarRota.versao || 0) + 1);
  try {
    await tela.montar(el);
  } catch (e) {
    if (versao !== renderizarRota.versao) return; // usuário já navegou para outra tela
    avisarErro(e);
    renderizar(el, html`<div class="vazio"><p>Não foi possível carregar esta tela.</p></div>`);
  }
  conteudo.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------
// Menu e seletor de mês
// ---------------------------------------------------------------------
function abrirMenu() {
  $('#menu').classList.add('aberto');
  $('#menu-fundo').hidden = false;
  $('#btn-menu').setAttribute('aria-expanded', 'true');
}
function fecharMenu() {
  $('#menu').classList.remove('aberto');
  $('#menu-fundo').hidden = true;
  $('#btn-menu').setAttribute('aria-expanded', 'false');
}

function atualizarCabecalho() {
  const p = estado.periodo;
  $('#mes-atual').textContent = p.livre ? `${formatarData(p.de)} a ${formatarData(p.ate)}` : nomeMes(estado.mes);
  $('#topo-usuario').textContent = estado.perfil?.nome || estado.usuario?.email || '';
  const foto = $('#topo-avatar');
  foto.hidden = !estado.perfil?.avatar;
  if (estado.perfil?.avatar) foto.src = estado.perfil.avatar;
  else foto.removeAttribute('src');
}

function ligarCasca() {
  $('#btn-menu').addEventListener('click', () => ($('#menu').classList.contains('aberto') ? fecharMenu() : abrirMenu()));
  $('#menu-fundo').addEventListener('click', fecharMenu);
  $('#btn-sair').addEventListener('click', () => supabase.auth.signOut());
  $('#btn-recolher').addEventListener('click', () => {
    const recolher = !lerAparencia().menuRecolhido;
    salvarAparencia({ menuRecolhido: recolher });
    $('#btn-recolher').setAttribute('aria-label', recolher ? 'Abrir menu' : 'Recolher menu');
    $('#btn-recolher').title = recolher ? 'Abrir menu' : 'Recolher menu';
  });
  ligarComandoVoz($('#btn-voz'), {
    irPara: (rota) => {
      window.location.hash = `#/${rota}`;
    },
    novo: (status) => abrirFormLancamento({ status, aoSalvar: () => renderizarRota() }),
  });
  $('#btn-novo').addEventListener('click', () =>
    abrirFormLancamento({
      status: rotaAtual === 'futuros' ? 'PREVISTO' : 'REALIZADO',
      aoSalvar: () => renderizarRota(),
    }),
  );
  $$('#seletor-mes [data-mes]').forEach((b) =>
    b.addEventListener('click', () => definirMes(deslocarMes(estado.mes, Number(b.dataset.mes)))),
  );
  window.addEventListener('hashchange', renderizarRota);
  document.addEventListener('perfil-atualizado', atualizarCabecalho);
  aoMudar(() => {
    atualizarCabecalho();
    if (ROTAS[rotaAtual]?.usaMes) renderizarRota();
  });
}

// ---------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------
let timerInatividade;
function reiniciarInatividade() {
  clearTimeout(timerInatividade);
  timerInatividade = setTimeout(() => {
    try {
      sessionStorage.setItem('cf.motivoSaida', 'inatividade');
    } catch {
      /* sem storage */
    }
    supabase.auth.signOut();
  }, MINUTOS_INATIVIDADE * 60 * 1000);
}
['pointerdown', 'keydown', 'visibilitychange'].forEach((ev) =>
  document.addEventListener(ev, () => estado.usuario && reiniciarInatividade(), { passive: true }),
);

async function entrarNoApp(usuario) {
  estado.usuario = usuario;
  await carregarReferencias();
  aplicarTema(estado.perfil?.tema);
  // abre no último mês com dados quando o mês atual ainda está vazio
  if (!mesFoiEscolhido()) {
    const ultimo = await ultimoMesComDados().catch(() => null);
    if (ultimo && ultimo < estado.mes) estado.mes = ultimo;
  }
  fecharTelaEntrada();
  $('#app').hidden = false;
  atualizarCabecalho();
  reiniciarInatividade();
  if (!estado.contas.length && !window.location.hash) window.location.hash = '#/contas';
  falarSaudacao(estado.perfil?.nome);
  convidarComandoVoz($('#btn-voz'));
  limparVozLocalAntiga();
  await renderizarRota();
}

function sair() {
  clearTimeout(timerInatividade);
  try {
    sessionStorage.removeItem('cf.saudou'); // saúda de novo no próximo login
  } catch {
    /* sem storage */
  }
  limparEstado();
  $('#app').hidden = true;
  renderizar($('#conteudo'), html``);
  let motivo = null;
  try {
    motivo = sessionStorage.getItem('cf.motivoSaida');
    sessionStorage.removeItem('cf.motivoSaida');
  } catch {
    /* sem storage */
  }
  mostrarLogin({ aviso: motivo === 'inatividade' ? 'Sessão encerrada por inatividade.' : null, aoEntrar: entrarNoApp });
}

async function iniciar() {
  aplicarAparencia(); // fonte, cor do HUD e menu antes da tela de entrada
  ligarCasca();

  supabase.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') setTimeout(sair, 0);
  });

  let tipoLink = null;
  try {
    tipoLink = await validarLinkDoEmail();
  } catch (e) {
    mostrarLogin({ erro: e.message, aoEntrar: entrarNoApp });
    return;
  }

  // getUser() valida a sessão no servidor (getSession só lê o armazenamento local)
  const { data } = await supabase.auth.getUser();
  const usuario = data?.user;
  if (!usuario) {
    mostrarLogin({ aoEntrar: entrarNoApp });
    return;
  }
  const continuar = tipoLink
    ? () => mostrarDefinirSenha({ tipo: tipoLink, aoConcluir: () => entrarNoApp(usuario) })
    : () => entrarNoApp(usuario);
  // sessão salva (ou link de e-mail) de uma conta com verificação em duas etapas:
  // pede o código antes de abrir o app (o banco também bloqueia sem ele)
  if ((await nivelDaSessao()).precisaCodigo) mostrarCodigo({ aoConfirmar: continuar });
  else await continuar();
}

// ---------------------------------------------------------------------
// PWA e proteção contra clickjacking
// ---------------------------------------------------------------------
// O GitHub Pages não permite cabeçalhos HTTP (frame-ancestors / X-Frame-Options),
// então o app se recusa a rodar dentro de um iframe de outro site.
if (import.meta.env.PROD && window.top !== window.self) {
  document.documentElement.hidden = true;
  throw new Error('O app não pode ser aberto dentro de outra página.');
}

prepararInstalacao();
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`));
}

iniciar();
