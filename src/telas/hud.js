// Tela de entrada em estilo HUD holográfico: reator central com anéis girando,
// grade hexagonal, varredura de radar, leituras ao vivo (relógio/data) e uma
// saudação que se digita sozinha. Tudo vetorial (SVG + CSS), nítido em qualquer
// resolução e sem dependências.

import { html } from '../lib/html.js';
import { $ } from '../ui/componentes.js';
import { VERSAO_CURTA } from '../lib/versao.js';

const R = (a, r) => [Math.cos(((a - 90) * Math.PI) / 180) * r, Math.sin(((a - 90) * Math.PI) / 180) * r];

function marcas(qtd, rFora, rDentro, rLonga, cada) {
  return Array.from({ length: qtd }, (_, i) => {
    const a = (360 / qtd) * i;
    const [x1, y1] = R(a, rFora);
    const [x2, y2] = R(a, i % cada === 0 ? rLonga : rDentro);
    return html`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" class="${i % cada === 0 ? 'marca-longa' : ''}" />`;
  });
}

function arco(r, de, ate) {
  const [x1, y1] = R(de, r);
  const [x2, y2] = R(ate, r);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${ate - de > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function segmentosReator() {
  return Array.from({ length: 12 }, (_, i) => html`<rect x="-9" y="-122" width="18" height="30" rx="2" transform="rotate(${i * 30})" />`);
}

export function marcacaoHud() {
  return html`
    <svg class="hud-fundo" aria-hidden="true">
      <defs>
        <pattern id="hex" width="56" height="97" patternUnits="userSpaceOnUse" patternTransform="scale(0.6)">
          <path d="M28 0 L56 16 L56 48.5 L28 64.5 L0 48.5 L0 16 Z M28 64.5 L28 97" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hex)" />
    </svg>
    <div class="hud-varredura" aria-hidden="true"></div>

    <header class="hud-barra">
      <span class="hud-sistema"><i class="hud-ponto"></i>Controle Financeiro <b>v${VERSAO_CURTA}</b></span>
      <span class="hud-relogio"><b id="hud-hora">--:--:--</b><span id="hud-data"></span></span>
    </header>

    <div class="hud-reator-area" aria-hidden="true">
      <svg class="hud-reator" viewBox="-300 -300 600 600">
        <defs>
          <radialGradient id="nucleo-grad">
            <stop offset="0%" stop-color="#ffffff" />
            <stop offset="35%" stop-color="#bff6ff" />
            <stop offset="70%" class="stop-holo" stop-opacity="0.55" />
            <stop offset="100%" class="stop-holo" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="radar-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" class="stop-holo" stop-opacity="0" />
            <stop offset="100%" class="stop-holo" stop-opacity="0.45" />
          </linearGradient>
          <path id="caminho-texto" d="${arco(206, 0, 359.9)}" />
        </defs>

        <g class="anel a1"><circle r="288" /></g>
        <g class="anel a2 gira-lento">${marcas(180, 278, 271, 263, 10)}</g>
        <g class="anel a3 gira-reverso"><circle r="250" /></g>
        <g class="anel a4 gira">
          <path d="${arco(228, 10, 80)}" /><path d="${arco(228, 130, 200)}" /><path d="${arco(228, 250, 320)}" />
        </g>
        <g class="anel a5 gira-reverso-lento">
          <text><textPath href="#caminho-texto">SALDO ◦ RECEITAS ◦ DESPESAS ◦ CARTÕES ◦ FATURAS ◦ METAS ◦ TRANSFERÊNCIAS ◦ INVESTIMENTOS ◦ </textPath></text>
        </g>
        <g class="anel a6 gira-rapido"><circle r="180" /></g>
        <g class="anel a7 gira-reverso-rapido"><circle r="156" class="arco-1" /><circle r="156" class="arco-2" /></g>
        <g class="radar"><path d="M 0 0 L 0 -140 A 140 140 0 0 1 ${R(42, 140)[0].toFixed(2)} ${R(42, 140)[1].toFixed(2)} Z" /></g>
        <g class="anel a8"><circle r="128" /></g>
        <g class="reator-segmentos gira-reverso">${segmentosReator()}</g>
        <g class="anel a9"><circle r="80" /></g>
        <circle class="nucleo" r="66" />
        <text class="nucleo-simbolo" y="14">R$</text>
      </svg>

      <ul class="hud-leituras">
        <li class="l1"><span>Conexão</span><b>Protegida</b></li>
        <li class="l2"><span>Acesso</span><b>Por convite</b></li>
        <li class="l3"><span>Seus dados</span><b>Isolados por usuário</b></li>
      </ul>
    </div>

    <section class="hud-lado">
      <p class="hud-saudacao"><span id="hud-digitado"></span><i class="hud-cursor" aria-hidden="true"></i></p>
      <div class="hud-painel">
        <i class="canto c1"></i><i class="canto c2"></i><i class="canto c3"></i><i class="canto c4"></i>
        <div id="auth-caixa"></div>
      </div>
    </section>

    <div class="hud-liberado" id="hud-liberado" hidden>
      <p class="hud-liberado-titulo">Acesso autorizado</p>
      <p class="hud-liberado-nome" id="hud-liberado-nome"></p>
    </div>

    <footer class="hud-rodape" aria-hidden="true">
      <span><i class="hud-ponto"></i>Sistema online</span>
      <span><i class="hud-ponto ambar"></i>Aguardando identificação</span>
    </footer>`;
}

function saudacao() {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? 'Bom dia.' : h >= 12 && h < 18 ? 'Boa tarde.' : 'Boa noite.';
}

/** Liga relógio e digitação. Devolve { liberar(nome), destruir() }. */
export function iniciarHud(raiz) {
  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timers = [];

  const relogio = () => {
    const agora = new Date();
    const hora = $('#hud-hora', raiz);
    const data = $('#hud-data', raiz);
    if (!hora) return;
    hora.textContent = agora.toLocaleTimeString('pt-BR');
    data.textContent = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  };
  relogio();
  timers.push(setInterval(relogio, 1000));

  const texto = `${saudacao()} Identifique-se para acessar seu painel financeiro.`;
  const alvo = $('#hud-digitado', raiz);
  if (reduzir) alvo.textContent = texto;
  else {
    let i = 0;
    const digitar = setInterval(() => {
      i++;
      alvo.textContent = texto.slice(0, i);
      if (i >= texto.length) clearInterval(digitar);
    }, 34);
    timers.push(digitar);
  }

  requestAnimationFrame(() => raiz.classList.add('hud-ligado'));

  return {
    liberar(nome) {
      return new Promise((resolve) => {
        const caixa = $('#hud-liberado', raiz);
        $('#hud-liberado-nome', raiz).textContent = nome ? `Bem-vindo, ${nome}.` : 'Bem-vindo.';
        caixa.hidden = false;
        raiz.classList.add('hud-autorizado');
        setTimeout(resolve, reduzir ? 300 : 1500);
      });
    },
    destruir() {
      timers.forEach(clearInterval);
      raiz.classList.remove('hud-ligado', 'hud-autorizado');
    },
  };
}
