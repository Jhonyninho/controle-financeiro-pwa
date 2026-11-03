// Modal de criar/editar lançamento (realizado ou previsto).

import * as api from '../servicos/api.js';
import { html, renderizar } from '../lib/html.js';
import { parseValor, formatarData, formatarMoeda, normalizarTexto } from '../lib/formatos.js';
import { hojeISO, nomeMes, somarMesesData } from '../lib/meses.js';
import { mesDaFatura } from '../lib/calculos.js';
import { extrairParcela, gerarParcelas, proximosParecidos } from '../importacao/previstos.js';
import { chaveDescricao } from '../importacao/classificador.js';
import { categoriaPorId, contaPorId, contasAtivas, meiosDaConta } from '../estado.js';
import { $, abrirModal, avisar, opcoesContas, opcoesFormaPagamento } from '../ui/componentes.js';
import { abrirReplicarCategoria, abrirSelecaoLancamentos, saoIguais } from '../ui/replicar.js';
import { campoCategoria, trocarTipoCombo } from '../ui/combo.js';

const MAX_REPETICOES = 60;

/**
 * @param {object} p
 * @param {object} [p.lancamento] existente (edição) — sem ele, cria novo
 * @param {'REALIZADO'|'PREVISTO'} [p.status]
 * @param {() => void} p.aoSalvar
 */
export function abrirFormLancamento({ lancamento = null, status = 'REALIZADO', aoSalvar }) {
  if (!contasAtivas().length) {
    avisar('Cadastre uma conta antes de lançar.', 'erro');
    window.location.hash = '#/contas';
    return;
  }

  const contaInicial = contasAtivas()[0];
  const l = lancamento || {
    tipo: 'SAIDA', data: hojeISO(), status, conta_id: contaInicial.id, forma_pagamento: meiosDaConta(contaInicial)[0],
  };
  const edicao = Boolean(lancamento);
  const previsto = l.status === 'PREVISTO';
  const categoriaOriginal = l.categoria_id || '';

  const corpo = html`
    <div class="grade-form">
      <fieldset class="seg-tipo campo-largo">
        <label><input type="radio" name="tipo" value="SAIDA" ${l.tipo === 'SAIDA' ? 'checked' : ''} /> Saída</label>
        <label><input type="radio" name="tipo" value="ENTRADA" ${l.tipo === 'ENTRADA' ? 'checked' : ''} /> Entrada</label>
      </fieldset>
      <label>Data <input type="date" name="data" value="${l.data}" required min="2000-01-01" max="2100-12-31" /></label>
      <label>Valor (R$)
        <input name="valor" inputmode="decimal" required maxlength="20" placeholder="0,00"
          value="${l.valor ? String(l.valor).replace('.', ',') : ''}" />
      </label>
      <label class="campo-largo">Descrição <input name="descricao" required maxlength="200" value="${l.descricao || ''}" /></label>
      <label>Conta <select name="conta_id" required>${opcoesContas(l.conta_id)}</select></label>
      <label>Forma de pagamento <select name="forma_pagamento">${opcoesFormaPagamento(l.forma_pagamento, meiosDaConta(contaPorId(l.conta_id)))}</select></label>
      <p class="campo-largo dica aviso-fatura" hidden></p>
      <div class="campo-largo campo-combo"><span class="rotulo">Categoria</span><div class="area-categoria">${campoCategoria({ tipo: l.tipo, valor: l.categoria_id })}</div></div>
      <label class="campo-natureza" ${l.tipo === 'SAIDA' ? '' : 'hidden'}>Tipo de despesa
        <select name="despesa_fixa">
          <option value="" ${l.despesa_fixa == null ? 'selected' : ''}>Conforme a categoria</option>
          <option value="sim" ${l.despesa_fixa === true ? 'selected' : ''}>Fixa (repete todo mês)</option>
          <option value="nao" ${l.despesa_fixa === false ? 'selected' : ''}>Variável</option>
        </select>
      </label>
      <p class="dica dica-natureza" ${l.tipo === 'SAIDA' ? '' : 'hidden'}></p>
      ${edicao && l.status === 'REALIZADO' && l.tipo === 'SAIDA'
        ? html`<div class="campo-largo faixa-acao">
            <span>${l.parcela_total ? `Parcela ${l.parcela_atual} de ${l.parcela_total}.` : 'Compra parcelada?'} Gere as próximas parcelas como lançamentos futuros.</span>
            <button type="button" class="btn btn-secundario btn-pequeno" data-gerar-parcelas>Gerar parcelas futuras</button>
          </div>`
        : ''}


      ${!edicao && previsto
        ? html`<label>Repetir por quantos meses <input name="repeticoes" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="1" /></label>
            <label class="check"><input type="checkbox" name="parcelado" /> Dividir o valor entre as parcelas</label>`
        : ''}
    </div>`;

  abrirModal({
    titulo: edicao ? 'Editar lançamento' : previsto ? 'Novo lançamento futuro' : 'Novo lançamento',
    corpo,
    aoMontar(form) {
      const selForma = $('[name=forma_pagamento]', form);
      const avisoFatura = $('.aviso-fatura', form);
      const atualizarFatura = () => {
        const conta = contaPorId($('[name=conta_id]', form).value);
        const data = $('[name=data]', form).value;
        const credito = selForma.value === 'Crédito' && conta?.tem_credito && data;
        avisoFatura.hidden = !credito;
        if (credito) avisoFatura.textContent = `Entra na fatura de ${nomeMes(mesDaFatura(data, conta.dia_fechamento, conta.dia_vencimento))}.`;
      };
      const natureza = $('.campo-natureza', form);
      const dicaNatureza = $('.dica-natureza', form);
      const atualizarNatureza = () => {
        const saida = $('[name=tipo]:checked', form).value === 'SAIDA';
        natureza.hidden = !saida;
        const cat = categoriaPorId($('[name=categoria_id]', form)?.value);
        dicaNatureza.hidden = !saida || !cat;
        dicaNatureza.textContent = cat ? `${cat.subcategoria || cat.nome} é despesa ${cat.fixa ? 'fixa' : 'variável'} por padrão.` : '';
      };
      atualizarNatureza();
      $('[data-gerar-parcelas]', form)?.addEventListener('click', () => {
        form.closest('dialog').querySelector('[data-fechar]').click();
        abrirGerarParcelas(l, aoSalvar);
      });
      form.addEventListener('change', (e) => {
        if (e.target.name === 'tipo') trocarTipoCombo($('.area-categoria', form), e.target.value);
        if (e.target.name === 'tipo' || e.target.name === 'categoria_id') atualizarNatureza();
        if (e.target.name === 'conta_id') {
          const meios = meiosDaConta(contaPorId(e.target.value));
          renderizar(selForma, opcoesFormaPagamento(meios.includes(selForma.value) ? selForma.value : meios[0], meios));
        }
        if (['conta_id', 'forma_pagamento', 'data'].includes(e.target.name)) atualizarFatura();
      });
      atualizarFatura();
    },
    async aoEnviar(f, form) {
      const valor = parseValor(f.valor);
      if (valor === null || valor <= 0) {
        $('[name=valor]', form).setCustomValidity('Informe um valor maior que zero, ex.: 125,90');
        form.reportValidity();
        $('[name=valor]', form).setCustomValidity('');
        return false;
      }

      const base = {
        tipo: f.tipo,
        data: f.data,
        valor: Math.abs(valor),
        descricao: f.descricao.trim(),
        conta_id: f.conta_id,
        categoria_id: f.categoria_id || null,
        forma_pagamento: f.forma_pagamento || null,
        status: l.status || status,
        despesa_fixa: f.tipo === 'SAIDA' && f.despesa_fixa ? f.despesa_fixa === 'sim' : null,
      };

      if (edicao) {
        await api.salvarLancamento({ ...base, id: l.id });
      } else if (base.status === 'PREVISTO' && Number(f.repeticoes) > 1) {
        const n = Math.min(Number(f.repeticoes), MAX_REPETICOES);
        const parcela = f.parcelado ? Math.floor((base.valor / n) * 100) / 100 : base.valor;
        const resto = f.parcelado ? Math.round((base.valor - parcela * n) * 100) / 100 : 0;
        const serie = crypto.randomUUID();
        const lista = Array.from({ length: n }, (_, i) => ({
          ...base,
          serie_id: serie,
          serie_tipo: f.parcelado ? 'PARCELA' : base.tipo === 'SAIDA' ? 'FIXA' : null,
          parcela_atual: f.parcelado ? i + 1 : null,
          parcela_total: f.parcelado ? n : null,
          data: somarMesesData(base.data, i),
          valor: i === 0 ? Math.round((parcela + resto) * 100) / 100 : parcela,
          descricao: f.parcelado ? `${base.descricao} (${i + 1}/${n})`.slice(0, 200) : base.descricao,
        }));
        await api.criarLancamentos(lista);
        avisar(`${n} lançamentos criados (${formatarMoeda(lista[1].valor)} cada).`);
      } else {
        await api.salvarLancamento(base);
      }

      if (!(base.status === 'PREVISTO' && Number(f.repeticoes) > 1)) avisar('Lançamento salvo.');
      aoSalvar?.();

      // categoria escolhida/alterada: oferece aplicar aos lançamentos iguais (depois que este modal fechar)
      const categoriaMudou = base.categoria_id && base.categoria_id !== categoriaOriginal;
      const replicarCategoria = () => categoriaMudou && oferecerReplicar({ ...base, id: l.id }, aoSalvar);
      // previsto com valor novo: oferece levar o valor para os próximos meses da mesma despesa
      if (edicao && previsto && Math.round(base.valor * 100) !== Math.round(Number(l.valor) * 100)) {
        setTimeout(() => oferecerNovoValor({ ...base, id: l.id }, l, aoSalvar, replicarCategoria), 0);
      } else if (categoriaMudou) {
        setTimeout(replicarCategoria, 0);
      }
    },
  });
}

/** Previsto editado: oferece aplicar o novo valor aos próximos lançamentos futuros da mesma despesa. */
async function oferecerNovoValor(editado, original, aoSalvar, depois) {
  try {
    const proximos = proximosParecidos(editado, original.serie_id || null, await api.listarFuturos()).filter(
      (p) => Math.round(Number(p.valor) * 100) !== Math.round(editado.valor * 100),
    );
    if (!proximos.length) return depois();
    abrirSelecaoLancamentos({
      titulo: 'Aplicar o novo valor aos próximos?',
      intro: html`<p class="replicar-intro">
        ${proximos.length === 1 ? 'Há mais 1 lançamento futuro' : `Há mais ${proximos.length} lançamentos futuros`} desta despesa.
        Marque os que também devem passar para <strong>${formatarMoeda(editado.valor)}</strong>.
      </p>`,
      itens: proximos.map((p) => ({ ...p, chave: p.id, nota: `hoje ${formatarMoeda(p.valor)}` })),
      textoOk: (n) => (n ? `Aplicar a ${n}` : 'Nada selecionado'),
      async aoConfirmar(ids) {
        if (ids.length) {
          await api.atualizarValorPrevistos(ids, editado.valor);
          avisar(`Novo valor aplicado a mais ${ids.length} lançamento(s) futuro(s).`);
          aoSalvar?.();
        }
        setTimeout(depois, 0);
      },
      aoCancelar: () => setTimeout(depois, 0),
    });
  } catch (e) {
    console.error(e);
    depois();
  }
}

/** Busca no banco lançamentos com a mesma descrição e oferece aplicar a categoria. */
async function oferecerReplicar(lanc, aoSalvar) {
  const termo = chaveDescricao(lanc.descricao).split(' ').sort((a, b) => b.length - a.length)[0] || '';
  if (termo.length < 3) return;
  try {
    const candidatos = (await api.buscarPorTermo(lanc.tipo, termo, lanc.id))
      .filter((x) => x.categoria_id !== lanc.categoria_id && saoIguais(x, lanc))
      .map((x) => ({ ...x, chave: x.id }));
    if (!candidatos.length) return;
    abrirReplicarCategoria({
      origem: lanc,
      categoriaId: lanc.categoria_id,
      candidatos,
      async aoConfirmar(ids, regra) {
        if (ids.length) await api.atualizarCategoria(ids, lanc.categoria_id);
        if (regra) await api.salvarRegra({ padrao: normalizarTexto(regra), categoria_id: lanc.categoria_id, origem: 'APRENDIDA' });
        avisar(
          (ids.length ? `Categoria aplicada a mais ${ids.length} lançamento(s).` : 'Nenhum outro lançamento alterado.') +
            (regra ? ' As próximas importações já virão classificadas.' : ''),
        );
        aoSalvar?.();
      },
    });
  } catch (e) {
    console.error(e);
  }
}

/**
 * A partir de uma parcela já paga (ex.: "LOJA X 03/10"), cria as parcelas seguintes
 * como lançamentos futuros. Quando o extrato real for importado, cada parcela prevista
 * é substituída pelo lançamento real (conciliação na importação).
 */
export function abrirGerarParcelas(l, aoSalvar) {
  const lida = l.parcela_total ? { atual: l.parcela_atual, total: l.parcela_total } : extrairParcela(l.descricao);
  const conta = contaPorId(l.conta_id);
  abrirModal({
    titulo: 'Gerar parcelas futuras',
    textoOk: 'Gerar parcelas',
    corpo: html`<div class="grade-form">
      <p class="campo-largo"><strong>${l.descricao}</strong><br /><small>${conta?.nome || ''}${l.forma_pagamento ? `, ${l.forma_pagamento}` : ''}</small></p>
      <label>Esta é a parcela nº <input name="atual" inputmode="numeric" pattern="[0-9]*" maxlength="3" required value="${lida?.atual || 1}" /></label>
      <label>De um total de <input name="total" inputmode="numeric" pattern="[0-9]*" maxlength="3" required value="${lida?.total || ''}" placeholder="Ex.: 10" /></label>
      <label>Valor de cada parcela (R$) <input name="valor" inputmode="decimal" required maxlength="20" value="${String(l.valor).replace('.', ',')}" /></label>
      <label>Data da próxima parcela <input type="date" name="data" required value="${somarMesesData(l.data, 1)}" min="2000-01-01" max="2100-12-31" /></label>
      <p class="campo-largo dica resumo-parcelas"></p>
    </div>`,
    aoMontar(form) {
      const resumo = $('.resumo-parcelas', form);
      const atualizar = () => {
        const a = Number($('[name=atual]', form).value);
        const t = Number($('[name=total]', form).value);
        const v = parseValor($('[name=valor]', form).value);
        resumo.textContent = t > a && a >= 1 && v
          ? `Serão criadas ${t - a} parcela(s) futuras de ${formatarMoeda(v)}, da ${a + 1}ª à ${t}ª, total de ${formatarMoeda(v * (t - a))}.`
          : 'Informe a parcela atual e o total (o total precisa ser maior).';
      };
      form.addEventListener('input', atualizar);
      atualizar();
    },
    async aoEnviar(f) {
      const atual = Number(f.atual);
      const total = Number(f.total);
      const valor = parseValor(f.valor);
      if (!(atual >= 1 && total > atual && total <= 420) || !valor || valor <= 0) {
        avisar('Confira os números: o total precisa ser maior que a parcela atual.', 'erro');
        return false;
      }
      const serieId = l.serie_id || crypto.randomUUID();
      const lista = gerarParcelas(l, { atual, total, valor: Math.abs(valor), primeiraData: f.data, serieId });
      await api.marcarSerie(l.id, { serie_id: serieId, serie_tipo: 'PARCELA', parcela_atual: atual, parcela_total: total });
      await api.criarLancamentos(lista);
      avisar(`${lista.length} parcela(s) criadas em Futuros, a última em ${formatarData(lista.at(-1).data)}.`);
      aoSalvar?.();
    },
  });
}
