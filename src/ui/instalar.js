// Instalação do app (PWA) no celular, tablet ou computador.
//
// - Android / Chrome / Edge / Samsung Internet: o navegador dispara
//   `beforeinstallprompt`; guardamos o evento e o botão "Instalar" abre a
//   janela nativa de instalação.
// - iPhone / iPad: o Safari não tem esse evento; mostramos o passo a passo
//   (Compartilhar > Adicionar à Tela de Início).
// - Demais navegadores: instrução genérica pelo menu do navegador.
//
// Só funciona em HTTPS (o GitHub Pages já é HTTPS) ou em localhost.

import { html } from '../lib/html.js';
// componentes.js é carregado sob demanda (puxa estado/Supabase)

let pedido = null; // evento beforeinstallprompt guardado

/** Chamar uma vez, o mais cedo possível (antes do login). */
export function prepararInstalacao() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // nós mostramos o convite no momento certo
    pedido = e;
    document.dispatchEvent(new CustomEvent('instalacao-mudou'));
  });
  window.addEventListener('appinstalled', () => {
    pedido = null;
    document.dispatchEvent(new CustomEvent('instalacao-mudou'));
  });
}

export function appInstalado() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function ehIOS(ua = navigator.userAgent, toques = navigator.maxTouchPoints || 0) {
  // iPadOS se apresenta como "Macintosh", mas tem tela de toque
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && toques > 1);
}

export function ehCelular(ua = navigator.userAgent, toques = navigator.maxTouchPoints || 0) {
  return ehIOS(ua, toques) || /Android|Mobi/i.test(ua);
}

/**
 * Situação da instalação neste aparelho:
 * 'instalado' | 'pronto' (há janela nativa) | 'ios' | 'manual'
 */
export function situacaoInstalacao() {
  if (appInstalado()) return 'instalado';
  if (pedido) return 'pronto';
  if (ehIOS()) return 'ios';
  return 'manual';
}

/** Vale sugerir a instalação na tela inicial? (celular, ainda não instalado) */
export function sugerirInstalacao() {
  return !appInstalado() && ehCelular() && (Boolean(pedido) || ehIOS() || /Android/i.test(navigator.userAgent));
}

function passoAPasso() {
  if (ehIOS()) {
    return html`<ol class="passos-instalar">
      <li>Abra este endereço no <strong>Safari</strong> (no Chrome do iPhone também funciona).</li>
      <li>Toque no botão <strong>Compartilhar</strong> (o quadrado com a seta para cima).</li>
      <li>Role e toque em <strong>Adicionar à Tela de Início</strong>, depois em <strong>Adicionar</strong>.</li>
    </ol>
    <p class="dica">O ícone "Financeiro" aparece na tela de início e o app abre em tela cheia, como um aplicativo.</p>`;
  }
  return html`<ol class="passos-instalar">
    <li>Abra o menu do navegador (os três pontinhos <strong>⋮</strong>).</li>
    <li>Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
    <li>Confirme em <strong>Instalar</strong>.</li>
  </ol>
  <p class="dica">No computador, use o ícone de instalação na barra de endereço do Chrome ou do Edge.</p>`;
}

/** Instala direto quando o navegador permite; senão mostra o passo a passo. */
export async function instalarApp() {
  if (appInstalado()) return 'instalado';
  if (pedido) {
    const e = pedido;
    pedido = null; // o evento só pode ser usado uma vez
    await e.prompt();
    const { outcome } = await e.userChoice;
    document.dispatchEvent(new CustomEvent('instalacao-mudou'));
    return outcome === 'accepted' ? 'instalado' : 'recusado';
  }
  const { abrirModal } = await import('./componentes.js');
  abrirModal({
    titulo: 'Instalar o app',
    textoOk: 'Entendi',
    corpo: passoAPasso(),
    aoEnviar: () => true,
  });
  return 'instrucoes';
}
