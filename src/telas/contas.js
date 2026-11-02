// Contas: cada conta reúne seus meios de pagamento (Débito, Crédito, Pix, TED).
// O cartão de crédito é configurado dentro da conta (fechamento, vencimento, limite).

import * as api from '../servicos/api.js';
import { html, renderizar } from '../lib/html.js';
import { formatarData, formatarMoeda, parseValor } from '../lib/formatos.js';
import { hojeISO } from '../lib/meses.js';
import { estado, recarregarContas } from '../estado.js';
import { $, abrirModal, avisar, avisarErro, confirmar, estadoVazio } from '../ui/componentes.js';

export const SKINS = {
  padrao: 'Neutro', bb: 'Banco do Brasil', santander: 'Santander', mercado: 'Mercado Pago', itau: 'Itaú',
  nubank: 'Nubank', bradesco: 'Bradesco', inter: 'Inter', btg: 'BTG', caixa: 'Caixa', c6: 'C6 Bank', picpay: 'PicPay',
};
export const TIPOS = {
  CORRENTE: 'Conta corrente',
  DIGITAL: 'Conta digital',
  POUPANCA: 'Poupança',
  CARTEIRA: 'Carteira (dinheiro)',
  INVESTIMENTO: 'Investimento',
};
const MEIOS = [
  ['tem_debito', 'Débito'],
  ['tem_credito', 'Crédito'],
  ['tem_pix', 'Pix'],
  ['tem_ted', 'TED'],
];
const BANDEIRAS = ['', 'Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard'];

function sugerirSkin(nome) {
  const n = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (n.includes('brasil') || /\bbb\b/.test(n)) return 'bb';
  if (n.includes('mercado')) return 'mercado';
  return Object.keys(SKINS).find((k) => k !== 'padrao' && n.replace(/\s/g, '').includes(k)) || 'padrao';
}

/** Campo numérico de digitação livre (sem setinhas), com teclado numérico no celular. */
function campoDia(nome, rotulo, valor) {
  return html`<label>${rotulo}
    <input name="${nome}" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" placeholder="1 a 31" value="${valor ?? ''}" />
  </label>`;
}

function lerDia(form, nome, rotulo) {
  const campo = $(`[name=${nome}]`, form);
  const n = Number(campo.value.trim());
  if (!Number.isInteger(n) || n < 1 || n > 31) {
    campo.setCustomValidity(`${rotulo}: informe um dia entre 1 e 31.`);
    campo.reportValidity();
    campo.setCustomValidity('');
    return null;
  }
  return n;
}

function abrirForm(conta, aoSalvar) {
  const c = conta || {
    tipo: 'CORRENTE', skin: 'padrao', ativo: true, mostrar_resumo: true,
    tem_debito: true, tem_credito: false, tem_pix: true, tem_ted: true,
  };

  abrirModal({
    titulo: conta ? `Editar ${conta.nome}` : 'Nova conta',
    corpo: html`<div class="grade-form">
      <label class="campo-largo">Nome da conta
        <input name="nome" required maxlength="60" value="${c.nome || ''}" placeholder="Banco do Brasil, Nubank, Carteira…" />
      </label>

      <fieldset class="campo-largo opcoes-pilula" aria-label="Tipo da conta">
        <legend>Tipo</legend>
        ${Object.entries(TIPOS).map(
          ([v, t]) => html`<label><input type="radio" name="tipo" value="${v}" ${v === c.tipo ? 'checked' : ''} /><span>${t}</span></label>`,
        )}
      </fieldset>

      <fieldset class="campo-largo opcoes-pilula area-meios" ${c.tipo === 'CARTEIRA' ? 'hidden' : ''} aria-label="Meios de pagamento">
        <legend>Meios de pagamento desta conta</legend>
        ${MEIOS.map(([campo, rotulo]) => html`<label><input type="checkbox" name="${campo}" ${c[campo] ? 'checked' : ''} /><span>${rotulo}</span></label>`)}
      </fieldset>

      <section class="campo-largo painel-credito grade-form" ${c.tem_credito && c.tipo !== 'CARTEIRA' ? '' : 'hidden'}>
        <h3 class="campo-largo">Cartão de crédito</h3>
        ${campoDia('dia_fechamento', 'Fecha no dia', c.dia_fechamento)}
        ${campoDia('dia_vencimento', 'Vence no dia', c.dia_vencimento)}
        <label>Limite (opcional)
          <input name="limite_credito" inputmode="decimal" maxlength="16" placeholder="0,00"
            value="${c.limite_credito ? String(c.limite_credito).replace('.', ',') : ''}" />
        </label>
        <label>Bandeira
          <select name="bandeira">${BANDEIRAS.map((b) => html`<option value="${b}" ${b === (c.bandeira || '') ? 'selected' : ''}>${b || 'Não informar'}</option>`)}</select>
        </label>
        <p class="campo-largo dica">Compras feitas depois do dia de fechamento entram na fatura seguinte.</p>
      </section>

      <fieldset class="campo-largo grade-form painel-saldo">
        <legend class="campo-largo">Saldo inicial</legend>
        <label>Saldo em conta (R$)
          <input name="saldo_inicial" inputmode="decimal" maxlength="18" placeholder="0,00"
            value="${c.saldo_inicial ? String(c.saldo_inicial).replace('.', ',') : ''}" />
        </label>
        <label>No fim do dia
          <input type="date" name="saldo_inicial_data" value="${c.saldo_inicial_data || ''}" max="2100-12-31" />
        </label>
        <p class="campo-largo dica">Use o "saldo anterior" do primeiro extrato que você importou. O saldo atual é calculado a partir dele com os lançamentos seguintes. Pode ser negativo (ex.: -150,00).</p>
      </fieldset>

      <label>Cor do cartão
        <select name="skin">${Object.entries(SKINS).map(([v, t]) => html`<option value="${v}" ${v === c.skin ? 'selected' : ''}>${t}</option>`)}</select>
      </label>
      <div class="pilha">
        <label class="check"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''} /> Conta ativa</label>
        <label class="check"><input type="checkbox" name="mostrar_resumo" ${c.mostrar_resumo ? 'checked' : ''} /> Mostrar no resumo</label>
      </div>
    </div>`,
    aoMontar(form) {
      const nome = $('[name=nome]', form);
      const skin = $('[name=skin]', form);
      let skinManual = Boolean(conta);
      skin.addEventListener('change', () => (skinManual = true));
      nome.addEventListener('input', () => !skinManual && (skin.value = sugerirSkin(nome.value)));

      const atualizar = () => {
        const tipo = $('[name=tipo]:checked', form)?.value;
        const carteira = tipo === 'CARTEIRA';
        $('.area-meios', form).hidden = carteira;
        $('.painel-credito', form).hidden = carteira || !$('[name=tem_credito]', form).checked;
      };
      form.addEventListener('change', (e) => {
        if (['tipo', 'tem_credito'].includes(e.target.name)) atualizar();
      });
    },
    async aoEnviar(f, form) {
      const carteira = f.tipo === 'CARTEIRA';
      const credito = !carteira && f.tem_credito === 'on';
      const meios = Object.fromEntries(MEIOS.map(([campo]) => [campo, !carteira && f[campo] === 'on']));

      if (!carteira && !Object.values(meios).some(Boolean)) {
        avisar('Marque pelo menos um meio de pagamento.', 'erro');
        return false;
      }

      let fechamento = null;
      let vencimento = null;
      let limite = null;
      if (credito) {
        fechamento = lerDia(form, 'dia_fechamento', 'Fechamento');
        if (fechamento === null) return false;
        vencimento = lerDia(form, 'dia_vencimento', 'Vencimento');
        if (vencimento === null) return false;
        if (f.limite_credito.trim()) {
          limite = parseValor(f.limite_credito);
          if (limite === null || limite < 0) {
            avisar('Limite inválido. Exemplo: 5.000,00', 'erro');
            return false;
          }
        }
      }

      let saldoInicial = 0;
      if (f.saldo_inicial.trim()) {
        saldoInicial = parseValor(f.saldo_inicial);
        if (saldoInicial === null) {
          avisar('Saldo inicial inválido. Exemplo: 1.250,00 ou -150,00', 'erro');
          return false;
        }
      }

      await api.salvarConta({
        saldo_inicial: saldoInicial,
        saldo_inicial_data: f.saldo_inicial_data || null,
        id: conta?.id,
        nome: f.nome.trim(),
        tipo: f.tipo,
        skin: f.skin,
        ...meios,
        bandeira: credito ? f.bandeira || null : null,
        dia_fechamento: fechamento,
        dia_vencimento: vencimento,
        limite_credito: limite,
        ordem: conta?.ordem ?? (estado.contas.length + 1) * 10,
        ativo: f.ativo === 'on',
        mostrar_resumo: f.mostrar_resumo === 'on',
      });
      avisar(conta ? 'Conta atualizada.' : 'Conta criada.');
      await aoSalvar();
    },
  });
}

export function cartaoConta(c, conteudo) {
  return html`<article class="cartao skin-${c.skin || 'padrao'} ${c.ativo ? '' : 'inativo'}">
    <div class="cartao-brilho" aria-hidden="true"></div>
    <header class="cartao-topo">
      <span class="cartao-nome">${c.nome}</span>
      ${c.tem_credito ? html`<span class="cartao-chip" aria-hidden="true"></span>` : ''}
    </header>
    ${conteudo}
  </article>`;
}

let saldos = new Map();

function desenhar(el) {
  renderizar(
    $('#area-contas', el),
    estado.contas.length
      ? html`<div class="grade-cartoes">${estado.contas.map((c) =>
          cartaoConta(
            c,
            html`<p class="cartao-tipo">${TIPOS[c.tipo] || c.tipo}${c.ativo ? '' : ' (inativa)'}</p>
              <div class="cartao-saldo"><span>Saldo atual</span><strong class="${(saldos.get(c.id) ?? 0) < 0 ? 'negativo' : ''}">${formatarMoeda(saldos.get(c.id) ?? 0)}</strong>
                ${c.saldo_inicial_data ? '' : html`<small class="alerta">Informe o saldo inicial para o valor bater com o banco</small>`}</div>
              <ul class="meios">${(c.tipo === 'CARTEIRA' ? ['Dinheiro'] : MEIOS.filter(([k]) => c[k]).map(([, r]) => r)).map(
                (m) => html`<li>${m}</li>`,
              )}</ul>
              <footer class="cartao-rodape">
                <span>${c.tem_credito && c.dia_fechamento
                  ? html`Fecha dia ${c.dia_fechamento}, vence dia ${c.dia_vencimento}${c.limite_credito ? html`<br />Limite ${formatarMoeda(c.limite_credito)}` : ''}`
                  : ''}</span>
                <span class="cartao-acoes">
                  <button class="btn-icone" data-acao="editar" data-id="${c.id}" aria-label="Editar ${c.nome}">✎</button>
                  <button class="btn-icone" data-acao="excluir" data-id="${c.id}" aria-label="Excluir ${c.nome}">✕</button>
                </span>
              </footer>`,
          ),
        )}</div>`
      : estadoVazio(
          'Cadastre seus bancos e a carteira. Em cada conta você marca os meios que usa: débito, crédito, Pix e TED.',
          html`<button class="btn btn-primario" data-acao="nova">Cadastrar primeira conta</button>`,
        ),
  );
}

export default {
  titulo: 'Contas',
  grupo: 'configuracoes',
  usaMes: false,
  async montar(el) {
    renderizar(
      el,
      html`<div class="tela-topo"><h2>Suas contas</h2><button class="btn btn-primario" data-acao="nova">Nova conta</button></div>
        <div id="area-contas"></div>`,
    );
    const recarregar = async () => {
      const [, s] = await Promise.all([recarregarContas(), api.saldoContasEm(hojeISO())]);
      saldos = s;
      desenhar(el);
    };

    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-acao]');
      if (!b) return;
      if (b.dataset.acao === 'nova') return abrirForm(null, recarregar);
      const c = estado.contas.find((x) => x.id === b.dataset.id);
      if (!c) return;
      if (b.dataset.acao === 'editar') abrirForm(c, recarregar);
      if (b.dataset.acao === 'excluir' && (await confirmar(`Excluir a conta ${c.nome}?`, { textoOk: 'Excluir conta' }))) {
        try {
          await api.excluirConta(c.id);
          avisar('Conta excluída.');
          await recarregar();
        } catch (err) {
          avisarErro(
            err.message.includes('em uso')
              ? new Error('Esta conta tem lançamentos. Para escondê-la, edite e desmarque "Conta ativa".')
              : err,
          );
        }
      }
    });

    await recarregar();
  },
};
