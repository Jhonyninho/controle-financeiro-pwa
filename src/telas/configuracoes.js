// Configurações: central de cadastros (contas, categorias e regras), perfil e foto,
// tema do app, IA (Groq/OpenRouter/Gemini), voz do assistente e informações da versão.

import * as api from '../servicos/api.js';
import { html, renderizar } from '../lib/html.js';
import { VERSAO } from '../lib/versao.js';
import { icone } from '../assets/icons/index.js';
import { aplicarTema, estado, TEMAS } from '../estado.js';
import { $, $$, abrirModal, avisar, avisarErro, comCarregando, confirmar } from '../ui/componentes.js';
import { PROVEDORES, configIA, esquecerChaveIA, iaConfigurada, salvarConfigIA, testarChave, usoIA } from '../servicos/ia.js';
import { CORES_HUD, FONTES, TONS_HUD, aplicarAparencia, corDoHud, lerAparencia, precarregarFontes, salvarAparencia } from '../lib/aparencia.js';
import { avisosDoDia, campanhaDoDia } from '../lib/campanhas.js';
import { hojeISO } from '../lib/meses.js';
import {
  MOTORES, NIVEIS_EFEITO, motorPronto, NOME_PADRAO, VOZES_GEMINI, configVoz, criarNarrador, nomeAssistenteValido, salvarConfigVoz,
  textoSaudacao, tocarSaudacao, vozesDoNavegador,
} from '../servicos/voz.js';
import {
  autenticadores, concluirCadastro, iniciarCadastro, removerAutenticadores, sairDeTodosOsAparelhos, trocarSenha,
} from '../servicos/seguranca.js';
import { SENHA_MIN, validarSenha } from './auth.js';
import { instalarApp, situacaoInstalacao } from '../ui/instalar.js';

let mfaAtivo = null; // null = ainda consultando

const LADO_FOTO = 192;
const MAX_FOTO_BYTES = 8 * 1024 * 1024;

function avatar(perfil, classe = 'avatar-grande') {
  if (perfil?.avatar) return html`<img class="${classe}" src="${perfil.avatar}" alt="Foto de perfil" />`;
  const inicial = (perfil?.nome || estado.usuario?.email || '?').trim().charAt(0).toUpperCase();
  return html`<span class="${classe} avatar-inicial" aria-hidden="true">${inicial}</span>`;
}

function cartaoAtalho({ rota, ico, titulo, texto, extra = '' }) {
  return html`<a class="cartao-config" href="#/${rota}">
    <span class="cartao-config-ico">${icone(ico)}</span>
    <span class="cartao-config-texto"><strong>${titulo}</strong><small>${texto}</small></span>
    ${extra}
    <span class="cartao-config-seta" aria-hidden="true">›</span>
  </a>`;
}

function cartaoAcao({ acao, ico, titulo, texto, extra = '' }) {
  return html`<button class="cartao-config" data-acao="${acao}">
    <span class="cartao-config-ico">${icone(ico)}</span>
    <span class="cartao-config-texto"><strong>${titulo}</strong><small>${texto}</small></span>
    ${extra}
    <span class="cartao-config-seta" aria-hidden="true">›</span>
  </button>`;
}

function desenhar(el) {
  const p = estado.perfil || {};
  const nContas = estado.contas.filter((c) => c.ativo).length;
  const nCats = estado.categorias.filter((c) => c.ativo).length;
  const tomHud = TONS_HUD.find((t) => t.id === lerAparencia().tomHud);
  const tema = tomHud ? { id: `hud-${tomHud.id}`, nome: `${tomHud.nome} (${corDoHud(lerAparencia().hud).nome})` } : TEMAS.find((t) => t.id === (p.tema || 'aurora')) || TEMAS[0];
  const ia = iaConfigurada();
  const ap = lerAparencia();
  const fonte = FONTES.find((f) => f.id === ap.fonte) || FONTES[0];
  const corHud = CORES_HUD.find((c) => c.id === ap.hud) || CORES_HUD[0];
  const campanha = campanhaDoDia(hojeISO());
  const voz = configVoz();
  const instalacao = situacaoInstalacao();

  renderizar(
    el,
    html`<section class="perfil-topo painel">
        <button class="perfil-foto" data-acao="foto" aria-label="Trocar foto de perfil">
          ${avatar(p)}
          <span class="perfil-foto-editar">Trocar</span>
        </button>
        <div class="perfil-dados">
          <strong>${p.nome || 'Sem nome'}</strong>
          <small>${estado.usuario?.email || ''}</small>
          ${p.nome_completo ? html`<small>Titular nos extratos: ${p.nome_completo}</small>` : ''}
        </div>
        <button class="btn btn-secundario btn-pequeno" data-acao="perfil">Editar perfil</button>
        <input type="file" id="arquivo-foto" accept="image/png,image/jpeg,image/webp" hidden />
      </section>

      <h2 class="titulo-secao">Cadastros</h2>
      <div class="grade-config">
        ${cartaoAtalho({ rota: 'contas', ico: 'conta-corrente', titulo: 'Contas bancárias', texto: `${nContas} conta(s) ativa(s), meios de pagamento, cartão e saldo inicial` })}
        ${cartaoAtalho({ rota: 'categorias', ico: 'cat-outros', titulo: 'Categorias e regras', texto: `${nCats} subcategorias, despesas fixas e classificação automática` })}
      </div>

      <h2 class="titulo-secao">Segurança e instalação</h2>
      <div class="grade-config">
        ${cartaoAcao({
          acao: 'mfa', ico: 'ui-escudo', titulo: 'Verificação em duas etapas',
          texto: mfaAtivo === null ? 'Consultando…'
            : mfaAtivo ? 'Ativa: além da senha, o login pede o código do app autenticador'
              : 'Recomendado: peça um código do celular além da senha',
          extra: html`<span class="selo ${mfaAtivo ? 'selo-ok' : 'selo-alerta'}">${mfaAtivo === null ? '…' : mfaAtivo ? 'ativa' : 'desligada'}</span>`,
        })}
        ${cartaoAcao({ acao: 'senha', ico: 'ui-chave', titulo: 'Trocar senha', texto: `Mínimo de ${SENHA_MIN} caracteres, com letras e números` })}
        ${cartaoAcao({ acao: 'sair-todos', ico: 'ui-aparelhos', titulo: 'Sair de todos os aparelhos', texto: 'Use se perdeu o celular ou entrou num computador de outra pessoa' })}
        ${cartaoAcao({
          acao: 'instalar', ico: 'ui-celular', titulo: 'Instalar o app',
          texto: instalacao === 'instalado' ? 'Você está usando o app instalado' : instalacao === 'ios' ? 'iPhone/iPad: Compartilhar > Adicionar à Tela de Início' : 'Ícone na tela inicial, abre em tela cheia',
          extra: html`<span class="selo ${instalacao === 'instalado' ? 'selo-ok' : ''}">${instalacao === 'instalado' ? 'instalado' : instalacao === 'pronto' ? 'disponível' : 'como instalar'}</span>`,
        })}
      </div>

      <h2 class="titulo-secao">Aparência e inteligência</h2>
      <div class="grade-config">
        ${cartaoAcao({
          acao: 'tema', ico: 'ui-tema', titulo: 'Tema do app', texto: tema.nome,
          extra: html`<span class="amostra-tema tema-${tema.id}" aria-hidden="true"></span>`,
        })}
        ${cartaoAcao({ acao: 'fonte', ico: 'ui-fonte', titulo: 'Fonte', texto: fonte.nome, extra: html`<span class="amostra-fonte fonte-${fonte.id}" aria-hidden="true">Aa</span>` })}
        ${cartaoAcao({
          acao: 'hud', ico: 'ui-hud', titulo: 'Cor da tela de entrada (HUD)',
          texto: corHud.id === 'auto' ? `Automática: ${campanha ? `${campanha.nome}` : 'ciano'}` : corHud.nome,
          extra: html`<span class="amostra-hud hud-${corDoHud(ap.hud).id}" aria-hidden="true"></span>`,
        })}
        ${cartaoAcao({
          acao: 'campanhas', ico: 'ui-sino', titulo: 'Avisos de campanhas e datas',
          texto: 'Outubro Rosa, Setembro Amarelo, feriados, 13º, Black Friday…',
          extra: html`<span class="selo ${ap.campanhas ? 'selo-ok' : ''}">${ap.campanhas ? 'ligados' : 'desligados'}</span>`,
        })}
        ${cartaoAcao({
          acao: 'voz', ico: 'ui-voz', titulo: voz.estilo === 'assistente' ? `Assistente ${voz.assistente}` : 'Assistente e voz',
          texto: voz.motor === 'navegador'
            ? 'Voz do navegador (grátis, sem efeitos)'
            : `Gemini ${voz.vozGemini}, timbre ${NIVEIS_EFEITO.find((n) => n.id === voz.efeito)?.nome.toLowerCase() || ''}${motorPronto(voz) ? '' : ' (falta a chave do Gemini)'}`,
          extra: html`<span class="selo ${voz.lerAuto ? 'selo-ok' : ''}">${voz.lerAuto ? 'lê sozinho' : 'ao tocar'}</span>`,
        })}
        ${cartaoAcao({
          acao: 'ia', ico: 'ui-ia', titulo: 'Diagnóstico com IA',
          texto: ia ? `${PROVEDORES[configIA().provedor].nome}, modelo ${configIA().modelo}` : 'Cadastre uma chave gratuita (Groq: rápida e sem cartão)',
          extra: html`<span class="selo ${ia ? 'selo-ok' : ''}">${ia ? 'ativo' : 'desligado'}</span>`,
        })}
      </div>

      <h2 class="titulo-secao">Sobre</h2>
      <div class="painel sobre-app">
        ${icone('ui-sobre')}
        <div>
          <strong>Controle Financeiro v${VERSAO}</strong>
          <small>Dados guardados no Supabase com acesso restrito à sua conta (RLS). A chave da IA fica só neste navegador.</small>
        </div>
      </div>`,
  );
}

// ---------------------------------------------------------------------
// Perfil e foto
// ---------------------------------------------------------------------
function abrirPerfil(el) {
  const p = estado.perfil || {};
  abrirModal({
    titulo: 'Editar perfil',
    corpo: html`<div class="grade-form">
      <label class="campo-largo">Como quer ser chamado <input name="nome" required maxlength="80" value="${p.nome || ''}" /></label>
      <label class="campo-largo">Nome completo (como aparece nos extratos)
        <input name="nome_completo" maxlength="120" value="${p.nome_completo || ''}" autocomplete="name" />
      </label>
      <p class="campo-largo dica">O nome completo identifica Pix e TED entre as suas próprias contas na importação.</p>
      ${p.avatar ? html`<label class="check campo-largo"><input type="checkbox" name="remover_foto" /> Remover a foto de perfil</label>` : ''}
    </div>`,
    async aoEnviar(f) {
      const campos = { nome: f.nome.trim(), nome_completo: f.nome_completo.trim() };
      if (f.remover_foto === 'on') campos.avatar = null;
      estado.perfil = await api.salvarPerfil(p.id, campos);
      avisar('Perfil atualizado.');
      desenhar(el);
      document.dispatchEvent(new CustomEvent('perfil-atualizado'));
    },
  });
}

/** Reduz a foto para 192x192 (recorte central) em WebP: fica pequena o bastante para o banco. */
async function prepararFoto(arquivo) {
  if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) throw new Error('Use uma imagem PNG, JPG ou WebP.');
  if (arquivo.size > MAX_FOTO_BYTES) throw new Error('Imagem muito grande (máximo 8 MB).');
  const bitmap = await createImageBitmap(arquivo);
  const lado = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = LADO_FOTO;
  canvas.height = LADO_FOTO;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado, 0, 0, LADO_FOTO, LADO_FOTO);
  bitmap.close?.();
  let url = canvas.toDataURL('image/webp', 0.85);
  if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.85); // Safari antigo
  if (url.length > 150000) throw new Error('Não foi possível reduzir a imagem. Tente outra foto.');
  return url;
}

// ---------------------------------------------------------------------
// Tema
// ---------------------------------------------------------------------
function abrirTema(el) {
  const tom = lerAparencia().tomHud;
  const atual = tom ? `hud:${tom}` : estado.perfil?.tema || 'aurora';
  const previa = (valor) => {
    if (valor.startsWith('hud:')) aplicarAparencia({ ...lerAparencia(), tomHud: valor.slice(4) });
    else {
      aplicarAparencia({ ...lerAparencia(), tomHud: null });
      aplicarTema(valor);
    }
  };
  abrirModal({
    titulo: 'Tema do app',
    textoOk: 'Aplicar tema',
    corpo: html`<fieldset class="lista-temas" aria-label="Temas">
      ${TEMAS.map((t) => html`<label class="opcao-tema">
        <input type="radio" name="tema" value="${t.id}" ${t.id === atual ? 'checked' : ''} />
        <span class="amostra-tema tema-${t.id}" aria-hidden="true"></span>
        <span><strong>${t.nome}</strong><small>${t.descricao}</small></span>
      </label>`)}
    </fieldset>
    <h3 class="titulo-lista-temas">Tons da cor do HUD (${corDoHud(lerAparencia().hud).nome})</h3>
    <fieldset class="lista-temas" aria-label="Tons do HUD">
      ${TONS_HUD.map((t) => html`<label class="opcao-tema">
        <input type="radio" name="tema" value="hud:${t.id}" ${`hud:${t.id}` === atual ? 'checked' : ''} />
        <span class="amostra-tema tema-hud-${t.id}" aria-hidden="true"></span>
        <span><strong>${t.nome}</strong><small>${t.descricao}</small></span>
      </label>`)}
    </fieldset>
    <p class="dica">Os tons do HUD acompanham a cor escolhida em "Cor da tela de entrada". Com a cor Automática, o app inteiro muda junto com a campanha do mês (rosa em outubro, azul em novembro). Valem para este aparelho.</p>`,
    aoMontar(form) {
      // pré-visualização ao vivo; volta ao salvo se cancelar
      form.addEventListener('change', (e) => e.target.name === 'tema' && previa(e.target.value));
      form.closest('dialog').addEventListener('close', () => {
        aplicarAparencia();
        aplicarTema(estado.perfil?.tema || 'aurora');
      });
    },
    async aoEnviar(f) {
      if (f.tema.startsWith('hud:')) {
        salvarAparencia({ tomHud: f.tema.slice(4) });
      } else {
        estado.perfil = await api.salvarPerfil(estado.perfil.id, { tema: f.tema });
        salvarAparencia({ tomHud: null });
        aplicarTema(f.tema);
      }
      avisar('Tema aplicado.');
      desenhar(el);
    },
  });
}

// ---------------------------------------------------------------------
// Fonte, HUD e campanhas (preferências deste aparelho)
// ---------------------------------------------------------------------
function abrirFonte(el) {
  const atual = lerAparencia().fonte;
  abrirModal({
    titulo: 'Fonte do app',
    textoOk: 'Aplicar fonte',
    corpo: html`<fieldset class="lista-temas" aria-label="Fontes">
      ${FONTES.map((f) => html`<label class="opcao-tema">
        <input type="radio" name="fonte" value="${f.id}" ${f.id === atual ? 'checked' : ''} />
        <span class="amostra-fonte fonte-${f.id}" aria-hidden="true">Aa</span>
        <span><strong class="fonte-${f.id}">${f.nome}</strong><small>${f.descricao}</small></span>
      </label>`)}
    </fieldset>
    <p class="dica">Vale para este aparelho. Os números ficam alinhados em todas as fontes.</p>`,
    aoMontar(form) {
      precarregarFontes(); // para cada nome aparecer na própria fonte
      form.addEventListener('change', (e) => e.target.name === 'fonte' && aplicarAparencia({ ...lerAparencia(), fonte: e.target.value }));
      form.closest('dialog').addEventListener('close', () => aplicarAparencia());
    },
    async aoEnviar(f) {
      salvarAparencia({ fonte: f.fonte });
      avisar('Fonte aplicada.');
      desenhar(el);
    },
  });
}

function abrirHud(el) {
  const atual = lerAparencia().hud;
  const campanha = campanhaDoDia(hojeISO());
  abrirModal({
    titulo: 'Cor da tela de entrada',
    textoOk: 'Salvar cor',
    corpo: html`<fieldset class="lista-temas lista-hud" aria-label="Cores do HUD">
      ${CORES_HUD.map((c) => html`<label class="opcao-tema">
        <input type="radio" name="hud" value="${c.id}" ${c.id === atual ? 'checked' : ''} />
        <span class="amostra-hud hud-${c.id === 'auto' ? corDoHud('auto').id : c.id}" aria-hidden="true"></span>
        <span><strong>${c.nome}</strong><small>${c.id === 'auto' ? `${c.descricao}. Agora: ${campanha?.nome || 'ciano'}` : 'cor fixa'}</small></span>
      </label>`)}
    </fieldset>
    <p class="dica">Muda o holograma da tela de login e o destaque do assistente de voz. Vale para este aparelho.</p>`,
    async aoEnviar(f) {
      salvarAparencia({ hud: f.hud });
      avisar(lerAparencia().tomHud ? 'Cor do HUD salva e aplicada ao app.' : 'Cor do HUD salva. Você verá na próxima entrada.');
      desenhar(el);
    },
  });
}

function abrirCampanhas(el) {
  const ap = lerAparencia();
  const avisos = avisosDoDia(hojeISO());
  abrirModal({
    titulo: 'Avisos de campanhas e datas',
    textoOk: 'Salvar',
    corpo: html`<div class="grade-form">
      <label class="check campo-largo"><input type="checkbox" name="campanhas" ${ap.campanhas ? 'checked' : ''} /> Mostrar avisos no Resumo</label>
      <p class="campo-largo dica">O app reconhece sozinho as campanhas de saúde do mês (Janeiro Branco, Setembro Amarelo, Outubro Rosa,
        Novembro Azul…), os feriados nacionais (inclusive Carnaval, Páscoa e Corpus Christi) e datas que pesam no bolso
        (IPVA, Imposto de Renda, Dia das Mães, Black Friday, 13º, Natal). Cada aviso aparece uma vez e some quando você fecha.</p>
      <div class="campo-largo">
        <strong>Valendo hoje</strong>
        ${avisos.length
          ? html`<ul class="lista-avisos">${avisos.map((a) => html`<li><b>${a.titulo}</b><small>${a.texto}</small></li>`)}</ul>`
          : html`<p class="dica">Nenhum aviso para hoje.</p>`}
      </div>
      <button type="button" class="btn btn-secundario campo-largo" data-reexibir>Mostrar de novo os avisos que fechei</button>
    </div>`,
    aoMontar(form) {
      $('[data-reexibir]', form).addEventListener('click', () => {
        try {
          localStorage.removeItem('cf.avisosFechados');
        } catch {
          /* sem storage */
        }
        avisar('Os avisos voltarão a aparecer no Resumo.');
      });
    },
    async aoEnviar(f) {
      salvarAparencia({ campanhas: f.campanhas === 'on' });
      avisar(f.campanhas === 'on' ? 'Avisos ligados.' : 'Avisos desligados.');
      desenhar(el);
    },
  });
}

// ---------------------------------------------------------------------
// Voz
// ---------------------------------------------------------------------
const TEXTO_TESTE = 'Quando você gerar o diagnóstico do mês, eu analiso os números e leio o resultado para você.';
const TEXTO_TESTE_ASSISTENTE = 'Análise de gastos, alertas e metas: tudo sob controle. Quando quiser, gere o diagnóstico do mês e eu explico os resultados.';
const textoTeste = (c) =>
  c.estilo === 'assistente'
    ? `${textoSaudacao(estado.perfil?.nome, { assistente: c.assistente, tratamento: c.tratamento })} ${TEXTO_TESTE_ASSISTENTE}`
    : `${textoSaudacao(estado.perfil?.nome)} ${TEXTO_TESTE}`;

async function abrirVoz(el) {
  const v = configVoz();
  const vozes = await vozesDoNavegador().catch(() => []);
  const primeiro = (estado.perfil?.nome || '').split(' ')[0] || 'você';
  let teste = null;
  abrirModal({
    titulo: 'Assistente e voz',
    textoOk: 'Salvar',
    corpo: html`<div class="grade-form">
      <h3 class="campo-largo titulo-lista-temas">Assistente</h3>
      <label>Nome do assistente
        <input name="assistente" maxlength="20" value="${v.assistente}" placeholder="${NOME_PADRAO}" autocomplete="off" spellcheck="false" />
      </label>
      <label>Estilo de fala
        <select name="estilo">
          <option value="assistente" ${v.estilo === 'assistente' ? 'selected' : ''}>Assistente de IA (formal, grave e pausado)</option>
          <option value="natural" ${v.estilo === 'natural' ? 'selected' : ''}>Natural (narrador neutro)</option>
        </select>
      </label>
      <label>Como ele trata você
        <select name="tratamento">
          <option value="nome" ${v.tratamento === 'nome' ? 'selected' : ''}>Pelo nome (${primeiro})</option>
          <option value="senhor" ${v.tratamento === 'senhor' ? 'selected' : ''}>Senhor</option>
          <option value="senhora" ${v.tratamento === 'senhora' ? 'selected' : ''}>Senhora</option>
        </select>
      </label>
      <p class="campo-largo dica">No estilo Assistente de IA, ${v.assistente} se apresenta pelo nome, fala de forma polida e cadenciada e o
        diagnóstico ganha essa personalidade. Siglas com pontos, como M.A.V.I.Z., são faladas como palavra ("Maviz").
        É uma personagem própria do app, não imita ninguém.</p>

      <h3 class="campo-largo titulo-lista-temas">Voz</h3>
      <fieldset class="campo-largo opcoes-pilula opcoes-coluna" aria-label="Motor de voz">
        ${MOTORES.map((m) => html`<label>
          <input type="radio" name="motor" value="${m.id}" ${v.motor === m.id ? 'checked' : ''} />
          <span><strong>${m.nome}</strong> <small>${m.descricao}</small></span>
        </label>`)}
      </fieldset>

      <div class="campo-largo grade-form" data-motor="gemini">
        <p class="campo-largo dica">Usa a chave do Gemini cadastrada em <strong>Diagnóstico com IA</strong> (mesmo que a análise use o Groq).
          A cota gratuita de voz do Google é pequena: dá para algumas leituras do diagnóstico por dia. Se acabar, o app usa a voz do navegador.</p>
        <label class="campo-largo">Voz do Gemini
          <select name="vozGemini">${VOZES_GEMINI.map((x) => html`<option value="${x.id}" ${x.id === v.vozGemini ? 'selected' : ''}>${x.id}, ${x.descricao}</option>`)}</select>
        </label>
      </div>

      <div class="campo-largo grade-form" data-motor="navegador">
        <p class="campo-largo dica">No Android, as vozes "Google português do Brasil" soam melhor; no iPhone, baixe vozes "Aprimoradas" em
          Ajustes → Acessibilidade → Conteúdo Falado → Vozes.</p>
        <label class="campo-largo">Voz do navegador
          <select name="vozNavegador">
            ${vozes.length
              ? vozes.map((x) => html`<option value="${x.name}" ${x.name === v.vozNavegador ? 'selected' : ''}>${x.name} (${x.lang})</option>`)
              : html`<option value="">Padrão do sistema</option>`}
          </select>
        </label>
      </div>

      <label data-so-neural>Timbre de IA (efeito)
        <select name="efeito">${NIVEIS_EFEITO.map((n) => html`<option value="${n.id}" ${n.id === v.efeito ? 'selected' : ''}>${n.nome}: ${n.descricao}</option>`)}</select>
      </label>
      <label>Velocidade
        <select name="velocidade">${[0.85, 1, 1.1, 1.25, 1.4].map((n) => html`<option value="${n}" ${n === v.velocidade ? 'selected' : ''}>${n === 1 ? 'normal' : `${n}x`}</option>`)}</select>
      </label>
      <span class="campo-acao campo-largo">
        <button type="button" class="btn btn-secundario" data-testar-voz>Testar voz</button>
        <button type="button" class="btn btn-secundario" data-ouvir-saudacao>Ouvir uma saudação</button>
      </span>
      <label class="check campo-largo"><input type="checkbox" name="lerAuto" ${v.lerAuto ? 'checked' : ''} /> Ler em voz alta assim que o diagnóstico ficar pronto</label>
      <label class="check campo-largo"><input type="checkbox" name="saudacao" ${v.saudacao ? 'checked' : ''} /> Saudação por voz ao entrar</label>
      <p class="campo-largo dica">No estilo Assistente de IA, a saudação é sorteada a cada entrada entre dezenas de falas formais (conforme o período do dia,
        o tratamento e datas como sexta-feira ou fim do mês), gravadas com voz neural: tocam na hora, em qualquer aparelho, sem gastar cota.
        Por serem gravadas, não dizem o seu nome.</p>
    </div>`,
    aoMontar(form) {
      const mostrarMotor = () => {
        const m = new FormData(form).get('motor');
        $$('[data-motor]', form).forEach((d) => (d.hidden = d.dataset.motor !== m));
        $('[data-so-neural]', form).hidden = m === 'navegador';
      };
      $$('[name=motor]', form).forEach((r) => r.addEventListener('change', mostrarMotor));
      mostrarMotor();

      const botao = $('[data-testar-voz]', form);
      botao.addEventListener('click', () => {
        teste?.parar();
        const anterior = configVoz();
        const d = dadosVoz(Object.fromEntries(new FormData(form)));
        salvarConfigVoz(d); // o narrador lê a configuração salva
        teste = criarNarrador(textoTeste(d), { aoAviso: (m) => avisar(m, 'erro') }, { vinheta: d.estilo === 'assistente' && d.motor !== 'navegador' });
        teste.iniciar().catch(avisarErro).finally(() => salvarConfigVoz(anterior));
      });
      $('[data-ouvir-saudacao]', form).addEventListener('click', () => {
        teste?.parar();
        const anterior = configVoz();
        salvarConfigVoz(dadosVoz(Object.fromEntries(new FormData(form))));
        tocarSaudacao(estado.perfil?.nome)
          .then((n) => (teste = n))
          .catch(avisarErro)
          .finally(() => salvarConfigVoz(anterior));
      });
      form.closest('dialog').addEventListener('close', () => teste?.parar());
    },
    async aoEnviar(f) {
      const d = dadosVoz(f);
      salvarConfigVoz({ ...d, lerAuto: f.lerAuto === 'on', saudacao: f.saudacao === 'on' });
      avisar('Assistente e voz salvos.');
      desenhar(el);
    },
  });
}

/** Campos do formulário de voz → configuração. */
function dadosVoz(f) {
  return {
    assistente: nomeAssistenteValido(f.assistente),
    estilo: f.estilo,
    tratamento: f.tratamento,
    efeito: f.efeito,
    motor: f.motor,
    vozNavegador: f.vozNavegador || '',
    vozGemini: f.vozGemini,
    velocidade: Number(f.velocidade),
  };
}

// ---------------------------------------------------------------------
// Diagnóstico com IA
// ---------------------------------------------------------------------
const PASSOS_CHAVE = {
  groq: 'Entre em console.groq.com (conta Google ou GitHub, sem cartão), abra "API Keys" e crie uma chave.',
  openrouter: 'Entre em openrouter.ai, abra "Keys" e crie uma chave (os modelos ":free" não cobram nada).',
  gemini: 'Entre em aistudio.google.com com sua conta Google e crie uma chave de API.',
};
const DICA_CHAVE = { groq: 'gsk_…', openrouter: 'sk-or-…', gemini: 'AIza…' };

function abrirIA(el) {
  const c = configIA();
  const u = usoIA();
  abrirModal({
    titulo: 'Diagnóstico com IA',
    corpo: html`<div class="grade-form">
      <fieldset class="campo-largo opcoes-pilula opcoes-coluna" aria-label="Provedor da IA">
        ${Object.entries(PROVEDORES).map(([id, p]) => html`<label>
          <input type="radio" name="provedor" value="${id}" ${id === c.provedor ? 'checked' : ''} />
          <span><strong>${p.nome}</strong> <small>${p.descricao}</small></span>
        </label>`)}
      </fieldset>
      <p class="campo-largo dica" data-passos></p>
      <label class="campo-largo">Chave da API
        <input name="chave" type="password" autocomplete="off" spellcheck="false" maxlength="200" />
      </label>
      <label>Modelo <input name="modelo" maxlength="80" pattern="[A-Za-z0-9._:/\\-]{3,80}" /></label>
      <span class="campo-acao"><button type="button" class="btn btn-secundario" data-testar>Testar chave</button></span>
      <label>Máximo por minuto <input name="porMinuto" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${c.limitesProprios ? c.porMinuto : ''}" placeholder="padrão" /></label>
      <label>Máximo por dia <input name="porDia" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="${c.limitesProprios ? c.porDia : ''}" placeholder="padrão" /></label>
      <p class="campo-largo dica">Usadas nas últimas 24 horas: ${u.hoje}. Os limites protegem a cota gratuita. Em branco, o app usa o limite
        recomendado de cada provedor. Cada provedor guarda a própria chave: dá para cadastrar os três e trocar quando um ficar sem cota.</p>
      <p class="campo-largo dica">As chaves ficam <strong>só neste aparelho</strong>, nunca no banco de dados. Para a análise, o app envia apenas
        totais por categoria, médias e metas, sem descrições de lançamentos, nomes de contas ou seu nome. Nas camadas gratuitas o
        provedor pode usar o conteúdo enviado para melhorar os serviços dele.</p>
      <label class="check campo-largo"><input type="checkbox" name="esquecer" /> Apagar a chave deste provedor deste aparelho</label>
    </div>`,
    aoMontar(form) {
      const campoChave = $('[name=chave]', form);
      const campoModelo = $('[name=modelo]', form);
      const passos = $('[data-passos]', form);
      const atual = () => new FormData(form).get('provedor');
      const mostrar = () => {
        const p = atual();
        const cfg = configIA();
        campoChave.value = cfg.chaves[p] || '';
        campoChave.placeholder = DICA_CHAVE[p];
        campoModelo.value = cfg.modelos[p] || PROVEDORES[p].modelos[0];
        passos.textContent = `1. ${PASSOS_CHAVE[p]} 2. Cole a chave aqui e toque em "Testar chave".`;
      };
      $$('[name=provedor]', form).forEach((r) => r.addEventListener('change', mostrar));
      mostrar();
      const botao = $('[data-testar]', form);
      botao.addEventListener('click', () =>
        comCarregando(botao, async () => {
          const chave = campoChave.value.trim();
          if (chave.length < 20) throw new Error('Cole a chave completa.');
          const { modelo } = await testarChave(chave, atual());
          campoModelo.value = modelo;
          avisar(`Chave válida. Modelo escolhido: ${modelo}.`);
        }),
      );
    },
    async aoEnviar(f) {
      if (f.esquecer === 'on') {
        esquecerChaveIA(f.provedor);
        avisar(`Chave do ${PROVEDORES[f.provedor].nome} apagada deste aparelho.`);
      } else {
        salvarConfigIA({
          provedor: f.provedor,
          chave: f.chave.trim(),
          modelo: f.modelo.trim(),
          porMinuto: Number(f.porMinuto) || undefined,
          porDia: Number(f.porDia) || undefined,
        });
        avisar(f.chave.trim() ? `IA configurada: ${PROVEDORES[f.provedor].nome}.` : 'Sem chave: o diagnóstico com IA fica desligado.');
      }
      desenhar(el);
    },
  });
}

// ---------------------------------------------------------------------
// Segurança da conta
// ---------------------------------------------------------------------
async function abrirMfa(el) {
  if (mfaAtivo) {
    abrirModal({
      titulo: 'Desligar a verificação em duas etapas',
      textoOk: 'Desligar',
      perigo: true,
      corpo: html`<div class="grade-form">
        <p class="campo-largo">Sem ela, quem descobrir sua senha consegue ver seus dados. Para confirmar, digite o código atual do app autenticador.</p>
        <label class="campo-largo">Código
          <input name="codigo" class="campo-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required />
        </label>
      </div>`,
      async aoEnviar(f) {
        await removerAutenticadores(f.codigo);
        mfaAtivo = false;
        avisar('Verificação em duas etapas desligada.');
        desenhar(el);
      },
    });
    return;
  }

  const cadastro = await iniciarCadastro();
  abrirModal({
    titulo: 'Ativar verificação em duas etapas',
    textoOk: 'Ativar',
    corpo: html`<div class="grade-form">
      <ol class="campo-largo passos-instalar">
        <li>Instale um app autenticador no celular: <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong> ou <strong>Authy</strong> (grátis).</li>
        <li>No app, toque em <strong>+</strong> e leia o QR code abaixo.</li>
        <li>Digite o código de 6 números que aparecer.</li>
      </ol>
      <div class="campo-largo qr-mfa"><img data-qr alt="QR code para o app autenticador" width="180" height="180" /></div>
      <p class="campo-largo dica">Sem câmera? Digite esta chave no app: <code class="segredo-mfa">${cadastro.segredo}</code></p>
      <label class="campo-largo">Código do app
        <input name="codigo" class="campo-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required />
      </label>
      <p class="campo-largo dica">Depois de ativar, cada novo login pede a senha e o código. Se trocar de celular, desligue aqui antes
        (ou peça ao dono do app para remover o autenticador pelo painel do Supabase).</p>
    </div>`,
    aoMontar(form) {
      // o QR vem do Supabase como SVG em data URL; só aceitamos esse formato
      if (/^data:image\/svg\+xml[;,]/.test(cadastro.qr)) $('[data-qr]', form).src = cadastro.qr;
    },
    async aoEnviar(f) {
      await concluirCadastro(cadastro.id, f.codigo);
      mfaAtivo = true;
      avisar('Verificação em duas etapas ativada.');
      desenhar(el);
    },
  });
}

function abrirSenha() {
  abrirModal({
    titulo: 'Trocar senha',
    textoOk: 'Trocar senha',
    corpo: html`<div class="grade-form">
      <label class="campo-largo">Nova senha <input type="password" name="senha" autocomplete="new-password" required minlength="${SENHA_MIN}" maxlength="128" /></label>
      <label class="campo-largo">Confirme a nova senha <input type="password" name="confirmacao" autocomplete="new-password" required maxlength="128" /></label>
      <p class="campo-largo dica">Mínimo de ${SENHA_MIN} caracteres, com letras e números. Use uma senha que você não usa em outro site.</p>
    </div>`,
    async aoEnviar(f) {
      const problema = validarSenha(f.senha, f.confirmacao);
      if (problema) throw new Error(problema);
      await trocarSenha(f.senha);
      avisar('Senha trocada.');
    },
  });
}

async function sairDeTodos() {
  const ok = await confirmar('Encerrar a sessão em todos os aparelhos, inclusive neste? Será preciso entrar de novo em cada um.', {
    titulo: 'Sair de todos os aparelhos', textoOk: 'Sair de todos',
  });
  if (ok) await sairDeTodosOsAparelhos();
}

export default {
  titulo: 'Configurações',
  usaMes: false,
  async montar(el) {
    desenhar(el);
    autenticadores()
      .then((lista) => (mfaAtivo = lista.length > 0))
      .catch(() => (mfaAtivo = false))
      .finally(() => el.isConnected && desenhar(el));
    const aoMudarInstalacao = () => (el.isConnected ? desenhar(el) : document.removeEventListener('instalacao-mudou', aoMudarInstalacao));
    document.addEventListener('instalacao-mudou', aoMudarInstalacao);

    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-acao]');
      if (!b) return;
      if (b.dataset.acao === 'mfa') abrirMfa(el).catch(avisarErro);
      if (b.dataset.acao === 'senha') abrirSenha();
      if (b.dataset.acao === 'sair-todos') sairDeTodos().catch(avisarErro);
      if (b.dataset.acao === 'instalar') instalarApp().catch(avisarErro);
      if (b.dataset.acao === 'perfil') abrirPerfil(el);
      if (b.dataset.acao === 'tema') abrirTema(el);
      if (b.dataset.acao === 'ia') abrirIA(el);
      if (b.dataset.acao === 'fonte') abrirFonte(el);
      if (b.dataset.acao === 'hud') abrirHud(el);
      if (b.dataset.acao === 'campanhas') abrirCampanhas(el);
      if (b.dataset.acao === 'voz') abrirVoz(el).catch(avisarErro);
      if (b.dataset.acao === 'foto') $('#arquivo-foto', el).click();
    });
    el.addEventListener('change', async (e) => {
      if (e.target.id !== 'arquivo-foto' || !e.target.files[0]) return;
      try {
        const url = await prepararFoto(e.target.files[0]);
        if (estado.perfil?.avatar && !(await confirmar('Trocar a foto de perfil atual?', { perigo: false, textoOk: 'Trocar' }))) return;
        estado.perfil = await api.salvarPerfil(estado.perfil.id, { avatar: url });
        avisar('Foto atualizada.');
        desenhar(el);
        document.dispatchEvent(new CustomEvent('perfil-atualizado'));
      } catch (err) {
        avisarErro(err);
      } finally {
        e.target.value = '';
      }
    });
  },
};
