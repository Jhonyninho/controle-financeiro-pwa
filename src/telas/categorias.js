// Categorias (com ícone, cor e "fora dos gastos") e regras de classificação automática.

import * as api from '../servicos/api.js';
import { html, renderizar } from '../lib/html.js';
import { normalizarTexto } from '../lib/formatos.js';
import { estado, nomeCategoria, categoriaPorId, recarregarCategorias } from '../estado.js';
import { ICONES_CATEGORIA, icone } from '../assets/icons/index.js';
import { $, abrirModal, avisar, avisarErro, chipCategoria, confirmar, estadoVazio, opcoesCategorias } from '../ui/componentes.js';

export const CORES = ['violeta', 'azul', 'ciano', 'teal', 'verde', 'lima', 'amarelo', 'laranja', 'vermelho', 'rosa', 'magenta', 'cinza'];
let regras = [];
let abaTipo = 'SAIDA';

function seletorCor(atual) {
  return html`<fieldset class="campo-largo paleta" aria-label="Cor">
    <legend>Cor</legend>
    ${CORES.map((c) => html`<label class="amostra cor-${c}" title="${c}">
      <input type="radio" name="cor" value="${c}" ${c === atual ? 'checked' : ''} aria-label="${c}" />
    </label>`)}
  </fieldset>`;
}

function grupos(tipo) {
  const mapa = new Map();
  for (const c of estado.categorias.filter((x) => x.tipo === tipo)) {
    if (!mapa.has(c.nome)) mapa.set(c.nome, []);
    mapa.get(c.nome).push(c);
  }
  return [...mapa];
}

function abrirFormCategoria(cat, aoSalvar, nomeGrupo = '') {
  const base = cat || estado.categorias.find((x) => x.tipo === abaTipo && x.nome === nomeGrupo);
  const c = cat || { tipo: abaTipo, nome: nomeGrupo, subcategoria: '', ativo: true, icone: base?.icone || '🏷️', cor: base?.cor || 'violeta' };
  const nomes = [...new Set(estado.categorias.filter((x) => x.tipo === c.tipo).map((x) => x.nome))].sort();
  abrirModal({
    titulo: cat ? 'Editar subcategoria' : 'Nova categoria',
    corpo: html`<div class="grade-form">
      <fieldset class="campo-largo opcoes-pilula" aria-label="Tipo">
        <legend>Tipo</legend>
        <label><input type="radio" name="tipo" value="SAIDA" ${c.tipo === 'SAIDA' ? 'checked' : ''} /><span>Saída</span></label>
        <label><input type="radio" name="tipo" value="ENTRADA" ${c.tipo === 'ENTRADA' ? 'checked' : ''} /><span>Entrada</span></label>
      </fieldset>
      <label>Categoria <input name="nome" required maxlength="60" list="lista-nomes-cat" value="${c.nome}" placeholder="Ex.: Mercado" /></label>
      <datalist id="lista-nomes-cat">${nomes.map((n) => html`<option value="${n}"></option>`)}</datalist>
      <label>Subcategoria <input name="subcategoria" maxlength="60" value="${c.subcategoria}" placeholder="Ex.: Supermercado" /></label>
      <label>Ícone (emoji) <input name="icone" maxlength="8" value="${String(c.icone).startsWith('svg:') ? '' : c.icone}" placeholder="${String(c.icone).startsWith('svg:') ? 'ícone vetorial do grupo' : ''}" /></label>
      <label class="check"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''} /> Ativa</label>
      <label class="check campo-largo campo-fixa"><input type="checkbox" name="fixa" ${c.fixa ? 'checked' : ''} /> Despesa fixa (aluguel, internet, assinaturas…): o app prevê os próximos meses e separa dos gastos variáveis nas análises</label>
      ${seletorCor(c.cor)}
      <p class="campo-largo dica">Ícone e cor valem para todas as subcategorias da mesma categoria.</p>
    </div>`,
    aoMontar(form) {
      const campoFixa = $('.campo-fixa', form);
      const tipoAtual = () => $('[name=tipo]:checked', form).value;
      campoFixa.hidden = tipoAtual() !== 'SAIDA';
      form.addEventListener('change', (e) => {
        if (e.target.name === 'tipo') campoFixa.hidden = tipoAtual() !== 'SAIDA';
      });
      // ao digitar uma categoria existente, herda o visual dela
      $('[name=nome]', form).addEventListener('change', (e) => {
        const tipo = $('[name=tipo]:checked', form).value;
        const existente = estado.categorias.find((x) => x.tipo === tipo && x.nome === e.target.value.trim());
        if (existente) {
          $('[name=icone]', form).value = String(existente.icone).startsWith('svg:') ? '' : existente.icone;
          const r = $(`[name=cor][value=${existente.cor}]`, form);
          if (r) r.checked = true;
        }
      });
    },
    async aoEnviar(f) {
      const dados = {
        id: cat?.id, tipo: f.tipo, nome: f.nome.trim(), subcategoria: f.subcategoria.trim(),
        ativo: f.ativo === 'on', icone: f.icone.trim() || (String(c.icone).startsWith('svg:') ? c.icone : '🏷️'), cor: f.cor || 'cinza',
        fixa: f.tipo === 'SAIDA' && f.fixa === 'on',
      };
      const grupo = estado.categorias.find((x) => x.tipo === dados.tipo && x.nome === dados.nome && x.id !== cat?.id);
      dados.fora_dos_gastos = grupo ? grupo.fora_dos_gastos : false;
      await api.salvarCategoria(dados);
      await api.atualizarGrupoCategoria(dados.tipo, dados.nome, { icone: dados.icone, cor: dados.cor });
      avisar('Categoria salva.');
      await aoSalvar();
    },
  });
}

function abrirFormGrupo(tipo, nome, aoSalvar) {
  const c = estado.categorias.find((x) => x.tipo === tipo && x.nome === nome);
  abrirModal({
    titulo: `Visual de ${nome}`,
    corpo: html`<div class="grade-form">
      <label>Ícone (emoji) <input name="icone" maxlength="8" value="${String(c.icone).startsWith('svg:') ? '' : c.icone}" placeholder="ou escolha abaixo" /></label>
      <fieldset class="campo-largo paleta-icones" aria-label="Ícones vetoriais">
        <legend>Ícones do app</legend>
        <label class="amostra-icone"><input type="radio" name="icone_svg" value="" ${String(c.icone).startsWith('svg:') ? '' : 'checked'} /><span>Emoji</span></label>
        ${ICONES_CATEGORIA.map(([id, rotulo]) => html`<label class="amostra-icone cor-${c.cor || 'cinza'}" title="${rotulo}">
          <input type="radio" name="icone_svg" value="${id}" ${c.icone === `svg:${id}` ? 'checked' : ''} aria-label="${rotulo}" />${icone(id)}
        </label>`)}
      </fieldset>
      <label class="check"><input type="checkbox" name="fora_dos_gastos" ${c.fora_dos_gastos ? 'checked' : ''} /> Não contar como ${tipo === 'SAIDA' ? 'gasto' : 'receita'}</label>
      ${seletorCor(c.cor)}
      <p class="campo-largo dica">Use "não contar" para transferências entre suas contas, pagamento de fatura e aplicações, que movimentam dinheiro sem ser gasto de verdade.</p>
    </div>`,
    async aoEnviar(f) {
      const iconeFinal = f.icone_svg ? `svg:${f.icone_svg}` : f.icone.trim() || '🏷️';
      await api.atualizarGrupoCategoria(tipo, nome, { icone: iconeFinal, cor: f.cor || 'cinza', fora_dos_gastos: f.fora_dos_gastos === 'on' });
      avisar('Categoria atualizada.');
      await aoSalvar();
    },
  });
}

function abrirFormRegra(aoSalvar) {
  abrirModal({
    titulo: 'Nova regra',
    corpo: html`<div class="grade-form">
      <p class="campo-largo dica">Lançamentos importados cuja descrição contiver este texto recebem a categoria escolhida.</p>
      <label class="campo-largo">Texto na descrição <input name="padrao" required minlength="2" maxlength="100" placeholder="Ex.: SUPER COTIA" /></label>
      <label>Tipo <select name="tipo"><option value="SAIDA">Saída</option><option value="ENTRADA">Entrada</option></select></label>
      <label>Categoria <select name="categoria_id" required>${opcoesCategorias('SAIDA', null, { rotuloVazio: 'Escolha…' })}</select></label>
    </div>`,
    aoMontar(form) {
      $('[name=tipo]', form).addEventListener('change', (e) =>
        renderizar($('[name=categoria_id]', form), opcoesCategorias(e.target.value, null, { rotuloVazio: 'Escolha…' })),
      );
    },
    async aoEnviar(f) {
      const padrao = normalizarTexto(f.padrao);
      if (padrao.length < 2) throw new Error('Texto muito curto.');
      await api.salvarRegra({ padrao, categoria_id: f.categoria_id, origem: 'MANUAL' });
      const n = await api.classificarPendentes(padrao, f.tipo, f.categoria_id);
      avisar(n ? `Regra criada e aplicada a ${n} lançamento(s) sem categoria.` : 'Regra criada.');
      await aoSalvar();
    },
  });
}

function desenhar(el) {
  renderizar(
    $('#area-categorias', el),
    html`<div class="abas" role="tablist">
        <button role="tab" class="${abaTipo === 'SAIDA' ? 'ativa' : ''}" aria-selected="${abaTipo === 'SAIDA'}" data-acao="aba" data-tipo="SAIDA">Saídas</button>
        <button role="tab" class="${abaTipo === 'ENTRADA' ? 'ativa' : ''}" aria-selected="${abaTipo === 'ENTRADA'}" data-acao="aba" data-tipo="ENTRADA">Entradas</button>
      </div>
      <div class="grade-grupos">${grupos(abaTipo).map(
        ([nome, itens]) => html`<section class="grupo cor-borda-${itens[0].cor}">
          <header class="grupo-topo">
            ${chipCategoria(itens[0], { completo: false })}
            <button class="btn-icone" data-acao="grupo" data-nome="${nome}" aria-label="Editar visual de ${nome}">✎</button>
          </header>
          ${itens[0].fora_dos_gastos ? html`<p class="grupo-nota">Não conta como ${abaTipo === 'SAIDA' ? 'gasto' : 'receita'}</p>` : ''}
          <ul>${itens.map(
            (c) => html`<li class="${c.ativo ? '' : 'inativo'}">
              <span>${c.subcategoria || 'Geral'}</span>
              <span class="acoes">
                ${abaTipo === 'SAIDA'
                  ? html`<button class="selo-fixa ${c.fixa ? 'ligado' : ''}" data-acao="alternar-fixa" data-id="${c.id}" aria-pressed="${c.fixa}"
                      title="${c.fixa ? 'Despesa fixa. Toque para marcar como variável' : 'Despesa variável. Toque para marcar como fixa'}">${c.fixa ? 'fixa' : 'variável'}</button>`
                  : ''}
                <button class="btn-icone" data-acao="editar-cat" data-id="${c.id}" aria-label="Editar ${c.subcategoria || nome}">✎</button>
                <button class="btn-icone" data-acao="excluir-cat" data-id="${c.id}" aria-label="Excluir ${c.subcategoria || nome}">✕</button>
              </span>
            </li>`,
          )}</ul>
          <button class="btn-link" data-acao="nova-sub" data-nome="${nome}">Adicionar subcategoria</button>
        </section>`,
      )}</div>`,
  );

  renderizar(
    $('#area-regras', el),
    regras.length
      ? html`<div class="tabela-rolagem"><table class="tabela tabela-responsiva">
          <thead><tr><th>Se a descrição contém</th><th>Categoria</th><th>Origem</th><th></th></tr></thead>
          <tbody>${regras.map(
            (r) => html`<tr>
              <td data-rotulo="Texto"><code>${r.padrao}</code></td>
              <td data-rotulo="Categoria">${chipCategoria(categoriaPorId(r.categoria_id))}</td>
              <td data-rotulo="Origem">${r.origem === 'APRENDIDA' ? 'Aprendida' : 'Manual'}</td>
              <td class="acoes"><button class="btn-icone" data-acao="excluir-regra" data-id="${r.id}" aria-label="Excluir regra">✕</button></td>
            </tr>`,
          )}</tbody>
        </table></div>`
      : estadoVazio('Nenhuma regra ainda. Elas surgem quando você corrige categorias na importação, ou você pode criar uma agora.'),
  );
}

export default {
  titulo: 'Categorias e regras',
  grupo: 'configuracoes',
  usaMes: false,
  async montar(el) {
    renderizar(
      el,
      html`<div class="tela-topo"><h2>Categorias</h2><button class="btn btn-primario" data-acao="nova-cat">Nova categoria</button></div>
        <div id="area-categorias"></div>
        <div class="tela-topo"><h2>Regras de classificação</h2><button class="btn btn-secundario" data-acao="nova-regra">Nova regra</button></div>
        <div id="area-regras"></div>`,
    );

    const recarregar = async () => {
      const [, r] = await Promise.all([recarregarCategorias(), api.listarRegras()]);
      regras = r;
      desenhar(el);
    };

    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-acao]');
      if (!b) return;
      const id = b.dataset.id;
      try {
        switch (b.dataset.acao) {
          case 'aba':
            abaTipo = b.dataset.tipo;
            return desenhar(el);
          case 'nova-cat':
            return abrirFormCategoria(null, recarregar);
          case 'nova-sub':
            return abrirFormCategoria(null, recarregar, b.dataset.nome);
          case 'grupo':
            return abrirFormGrupo(abaTipo, b.dataset.nome, recarregar);
          case 'nova-regra':
            return abrirFormRegra(recarregar);
          case 'editar-cat':
            return abrirFormCategoria(categoriaPorId(id), recarregar);
          case 'excluir-cat':
            if (await confirmar(`Excluir ${nomeCategoria(id)}? Os lançamentos dela ficarão sem categoria e as regras ligadas a ela serão removidas.`, { textoOk: 'Excluir' })) {
              await api.excluirCategoria(id);
              avisar('Categoria excluída.');
              await recarregar();
            }
            return;
          case 'alternar-fixa': {
            const c = categoriaPorId(id);
            await api.salvarCategoria({ ...c, fixa: !c.fixa });
            avisar(c.fixa ? `${c.subcategoria || c.nome} agora é despesa variável.` : `${c.subcategoria || c.nome} agora é despesa fixa.`);
            return await recarregar();
          }
          case 'excluir-regra':
            await api.excluirRegra(id);
            avisar('Regra excluída.');
            await recarregar();
        }
      } catch (err) {
        avisarErro(err);
      }
    });

    await recarregar();
  },
};
