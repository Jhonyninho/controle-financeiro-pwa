// Modais de seleção de lançamentos (lista com marcar/desmarcar todos):
//  - abrirReplicarCategoria: aplicar a categoria escolhida aos lançamentos iguais
//  - abrirSelecaoLancamentos: genérico (usado também na pergunta "é salário?")

import { html } from '../lib/html.js';
import { formatarData, formatarMoeda } from '../lib/formatos.js';
import { chaveDescricao } from '../importacao/classificador.js';
import { categoriaPorId, contaPorId } from '../estado.js';
import { $, $$, abrirModal, chipCategoria } from './componentes.js';

/** Mesma "chave" de descrição e mesmo tipo = lançamento igual. */
export function saoIguais(a, b) {
  const ka = chaveDescricao(a.descricao);
  return a.tipo === b.tipo && ka.length >= 3 && ka === chaveDescricao(b.descricao);
}

/**
 * @param {object} p
 * @param {string} p.titulo
 * @param {*} p.intro conteúdo html acima da lista
 * @param {{chave:any, data:string, descricao:string, valor:number, tipo:string, nota?:string, conta_id?:string}[]} p.itens
 * @param {boolean} [p.marcados] todos marcados ao abrir
 * @param {(n:number) => string} p.textoOk
 * @param {{rotulo:string, padrao:string, marcada?:boolean}|null} [p.regra] opção de criar regra
 * @param {(chaves:any[], regra:string|null) => Promise<void>|void} p.aoConfirmar
 * @param {() => void} [p.aoCancelar]
 */
export function abrirSelecaoLancamentos({ titulo, intro, itens, marcados = true, textoOk, regra = null, aoConfirmar, aoCancelar }) {
  let confirmou = false;
  const linha = (c, i) => html`<li>
    <label class="replicar-item">
      <input type="checkbox" name="sel" value="${i}" ${marcados ? 'checked' : ''} />
      <span class="replicar-data">${formatarData(c.data).slice(0, 5)}</span>
      <span class="replicar-desc">${c.descricao}
        <small>${[c.conta_id ? contaPorId(c.conta_id)?.nome : '', c.nota].filter(Boolean).join(', ')}</small>
      </span>
      <strong class="${c.tipo === 'ENTRADA' ? 'positivo' : 'negativo'}">${formatarMoeda(c.valor)}</strong>
    </label>
  </li>`;

  const { dlg } = abrirModal({
    titulo,
    textoOk: textoOk(marcados ? itens.length : 0),
    corpo: html`
      ${intro}
      <div class="replicar-barra">
        <span class="replicar-contagem" aria-live="polite"></span>
        <span>
          <button type="button" class="btn-link" data-marcar="1">Marcar todos</button>
          <button type="button" class="btn-link" data-marcar="0">Desmarcar todos</button>
        </span>
      </div>
      <ul class="replicar-lista">${itens.map(linha)}</ul>
      ${regra
        ? html`<div class="caixa-regra">
            <label class="check"><input type="checkbox" name="criar_regra" ${regra.marcada === false ? '' : 'checked'} /> ${regra.rotulo}</label>
            <label>Quando a descrição contiver <input name="padrao" maxlength="100" minlength="3" value="${regra.padrao}" /></label>
          </div>`
        : ''}`,
    aoMontar(form) {
      const botaoOk = $('button[type=submit]', form);
      const atualizar = () => {
        const n = $$('[name=sel]:checked', form).length;
        $('.replicar-contagem', form).textContent = `${n} de ${itens.length} selecionado(s)`;
        botaoOk.textContent = textoOk(n);
      };
      form.addEventListener('change', atualizar);
      form.addEventListener('click', (e) => {
        const b = e.target.closest('[data-marcar]');
        if (!b) return;
        $$('[name=sel]', form).forEach((cb) => (cb.checked = b.dataset.marcar === '1'));
        atualizar();
      });
      atualizar();
    },
    async aoEnviar(_, form) {
      const escolhidos = $$('[name=sel]:checked', form).map((cb) => itens[Number(cb.value)].chave);
      const criar = regra && $('[name=criar_regra]', form).checked;
      const texto = regra ? $('[name=padrao]', form).value.trim() : '';
      confirmou = true;
      await aoConfirmar(escolhidos, criar && texto.length >= 3 ? texto : null);
    },
  });
  dlg.addEventListener('close', () => !confirmou && aoCancelar?.());
}

/**
 * Depois de escolher a categoria de um lançamento, oferece aplicá-la aos iguais.
 * @param {{origem:{descricao:string,tipo:string}, categoriaId:string, candidatos:object[], aoConfirmar:Function}} p
 */
export function abrirReplicarCategoria({ origem, categoriaId, candidatos, aoConfirmar }) {
  const categoria = categoriaPorId(categoriaId);
  abrirSelecaoLancamentos({
    titulo: 'Aplicar aos lançamentos iguais?',
    intro: html`<p class="replicar-intro">
        Encontramos ${candidatos.length === 1 ? 'outro lançamento' : `${candidatos.length} outros lançamentos`} com a mesma descrição.
        Marque os que também devem ficar em
      </p>
      <div class="replicar-destino">${chipCategoria(categoria)}</div>`,
    itens: candidatos.map((c) => ({
      ...c,
      tipo: origem.tipo,
      nota: c.categoria_id ? `hoje em ${categoriaPorId(c.categoria_id)?.nome || 'outra categoria'}` : 'sem categoria',
    })),
    textoOk: (n) => (n ? `Aplicar a ${n}` : 'Só criar a regra'),
    regra: { rotulo: 'Classificar automaticamente nas próximas importações', padrao: chaveDescricao(origem.descricao).slice(0, 100) },
    aoConfirmar,
  });
}
