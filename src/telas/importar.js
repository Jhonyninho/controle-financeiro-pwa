// Importação de extrato via planilha modelo (.xlsx/.xls/.csv).

import * as api from '../servicos/api.js';
import { html, renderizar } from '../lib/html.js';
import { formatarData, formatarMoeda, normalizarTexto } from '../lib/formatos.js';
import { abrirReplicarCategoria, abrirSelecaoLancamentos, saoIguais } from '../ui/replicar.js';
import { campoCategoria } from '../ui/combo.js';
import { conciliarTransferencias, encontrarPares, lancamentosDaContaSalario, mencionaTitular, partesDoNome } from '../importacao/transferencias.js';
import { deslocarMes, limitesMes, nomeMes, somarDias } from '../lib/meses.js';
import { gerarModelo, promptIA } from '../importacao/modelo.js';
import { lerPlanilha, ErroImportacao } from '../importacao/leitor.js';
import { conciliarPrevistos } from '../importacao/previstos.js';
import { criarClassificador, chaveDescricao } from '../importacao/classificador.js';
import { estado, categoriaPorId, contaPorId, contasAtivas, contasSalarioDe, definirMes } from '../estado.js';
import {
  $, $$, abrirModal, avisar, avisarErro, baixarArquivo, comCarregando, confirmar, estadoVazio, opcoesCategorias, opcoesContas,
} from '../ui/componentes.js';

const POR_PAGINA = 100;
const ORIGENS = { contaSalario: 'salário vindo da conta salário', previsto: 'do lançamento previsto', transferencia: 'transferência entre suas contas', manual: 'escolhida por você', planilha: 'sugerida pela IA', regra: 'pela sua regra', historico: 'pelo seu histórico', padrao: 'por palavra-chave' };

let previa = null; // { contaId, arquivo, itens[] }
let pagina = 0;

// SheetJS é grande: só carrega quando o usuário usa a importação
const carregarXLSX = () => import('xlsx');

// ---------------------------------------------------------------------
// Prévia
// ---------------------------------------------------------------------
function resumoPrevia() {
  const itens = previa.itens;
  return {
    total: itens.length,
    incluidos: itens.filter((i) => i.incluir).length,
    erros: itens.filter((i) => i.erros.length).length,
    duplicados: itens.filter((i) => i.duplicado).length,
    semCategoria: itens.filter((i) => i.incluir && !i.categoria_id).length,
    previstos: itens.filter((i) => i.incluir && i.previsto).length,
  };
}

function linhaPrevia(it, idx) {
  const bloqueado = it.erros.length > 0;
  return html`<tr class="${bloqueado ? 'com-erro' : it.duplicado ? 'duplicado' : ''}">
    <td><input type="checkbox" data-idx="${idx}" data-campo="incluir" ${it.incluir ? 'checked' : ''} ${bloqueado ? 'disabled' : ''}
      aria-label="Importar linha ${it.linha}" /></td>
    <td data-rotulo="Linha" class="num">${it.linha}</td>
    <td data-rotulo="Data">${it.data ? formatarData(it.data) : '—'}</td>
    <td data-rotulo="Descrição" class="col-desc">${it.descricao}
      ${it.erros.length ? html`<div class="erro-linha">${it.erros.join(' · ')}</div>` : ''}
      ${it.duplicado ? html`<div class="aviso-linha">Já importado antes</div>` : ''}
      ${it.previsto && !it.duplicado ? html`<div class="nota-linha nota-previsto">Substitui o previsto "${it.previsto.descricao}" de ${formatarData(it.previsto.data).slice(0, 5)}</div>` : ''}
      ${it.par ? html`<div class="nota-linha">Par em ${contaPorId(it.par.conta_id)?.nome || 'outra conta'} no dia ${formatarData(it.par.data).slice(0, 5)}</div>` : ''}
    </td>
    <td data-rotulo="Valor" class="num ${it.tipo === 'ENTRADA' ? 'positivo' : 'negativo'}">
      ${it.valor === null ? '—' : html`${it.tipo === 'SAIDA' ? '−' : '+'} ${formatarMoeda(it.valor)}`}
    </td>
    <td data-rotulo="Categoria">
      ${bloqueado
        ? '—'
        : html`${campoCategoria({ nome: `cat-${idx}`, tipo: it.tipo, valor: it.categoria_id, rotuloVazio: 'A classificar', dados: { idx, campo: 'categoria_id' } })}
          ${it.origem && it.categoria_id === it.sugerida ? html`<small class="origem">${ORIGENS[it.origem]}</small>` : ''}`}
    </td>
  </tr>`;
}

function desenharPrevia(el) {
  const area = $('#area-previa', el);
  if (!previa) return renderizar(area, html``);

  const r = resumoPrevia();
  const paginas = Math.ceil(previa.itens.length / POR_PAGINA);
  pagina = Math.min(pagina, paginas - 1);
  const inicio = pagina * POR_PAGINA;
  const visiveis = previa.itens.slice(inicio, inicio + POR_PAGINA);

  renderizar(
    area,
    html`<section class="bloco">
      <header class="bloco-topo">
        <h3>3. Confira antes de importar</h3>
        <span>${previa.ehFatura ? 'Fatura do cartão' : 'Extrato'} de <strong>${contaPorId(previa.contaId)?.nome}</strong></span>
      </header>
      <div class="totais">
        <span>Linhas <strong>${r.total}</strong></span>
        <span>Serão importadas <strong class="positivo">${r.incluidos}</strong></span>
        ${r.duplicados ? html`<span>Já importadas <strong>${r.duplicados}</strong></span>` : ''}
        ${r.erros ? html`<span>Com erro <strong class="negativo">${r.erros}</strong></span>` : ''}
        ${r.semCategoria ? html`<span>A classificar <strong class="alerta">${r.semCategoria}</strong></span>` : ''}
        ${r.previstos ? html`<span>Substituem previstos <strong>${r.previstos}</strong></span>` : ''}
      </div>

      <div class="tabela-rolagem"><table class="tabela tabela-responsiva tabela-previa">
        <thead><tr><th></th><th class="num">Linha</th><th>Data</th><th>Descrição</th><th class="num">Valor</th><th>Categoria</th></tr></thead>
        <tbody>${visiveis.map((it, i) => linhaPrevia(it, inicio + i))}</tbody>
      </table></div>

      ${paginas > 1
        ? html`<nav class="paginacao">
            <button class="btn btn-secundario btn-pequeno" data-acao="pagina" data-delta="-1" ${pagina === 0 ? 'disabled' : ''}>‹ Anterior</button>
            <span>Página ${pagina + 1} de ${paginas}</span>
            <button class="btn btn-secundario btn-pequeno" data-acao="pagina" data-delta="1" ${pagina >= paginas - 1 ? 'disabled' : ''}>Próxima ›</button>
          </nav>`
        : ''}

      <div class="rodape-acoes">
        <label class="check"><input type="checkbox" id="aprender" checked /> Lembrar minhas correções de categoria nas próximas importações</label>
        <div>
          <button class="btn btn-secundario" data-acao="cancelar">Cancelar</button>
          <button class="btn btn-primario" data-acao="importar" ${r.incluidos ? '' : 'disabled'}>Importar ${r.incluidos} lançamento(s)</button>
        </div>
      </div>
    </section>`,
  );
}

function categoriaSalario() {
  const doTipo = estado.categorias.filter((c) => c.tipo === 'ENTRADA' && c.nome === 'Salário');
  return doTipo.find((c) => c.subcategoria === 'Salário mensal') || doTipo[0] || null;
}

/** Grupos que a detecção pelo nome pode sobrescrever (nunca troca salário ou escolhas específicas). */
const GRUPOS_GENERICOS = new Set(['Recebimentos', 'Outros', 'Outras receitas']);

/**
 * Entradas com o nome do titular e sem saída correspondente em outra conta cadastrada
 * podem ser salário vindo de uma conta-salário. Pergunta ao usuário.
 */
function perguntarSalario({ itens, aoConfirmar, aoCancelar }) {
  const salario = categoriaSalario();
  if (!salario || !itens.length) return aoCancelar?.();
  abrirSelecaoLancamentos({
    titulo: 'Alguma destas entradas é seu salário?',
    intro: html`<p class="replicar-intro">
      Estas entradas vieram de você mesmo, mas não encontramos a saída correspondente em nenhuma conta cadastrada.
      Se alguma for o salário transferido da sua conta-salário, marque para contar como <strong>receita</strong>.
      As não marcadas continuam como transferência entre suas contas.
    </p>`,
    itens,
    marcados: false,
    textoOk: (n) => (n ? `Marcar ${n} como salário` : 'Nenhuma é salário'),
    regra: {
      rotulo: 'Lembrar: nas próximas importações, entradas com esta descrição são salário',
      padrao: chaveDescricao(itens[0].descricao).slice(0, 100),
    },
    async aoConfirmar(chaves, regra) {
      await aoConfirmar(chaves, salario);
      if (chaves.length && regra) {
        await api.salvarRegra({ padrao: normalizarTexto(regra), categoria_id: salario.id, origem: 'MANUAL' });
      }
      if (chaves.length) avisar(`${chaves.length} entrada(s) marcada(s) como salário.${regra ? ' As próximas importações já virão assim.' : ''}`);
    },
    aoCancelar,
  });
}

/**
 * Conta salário vinculada: a entrada de você mesmo sem par veio da conta salário? E de que mês
 * é esse salário? A entrada vira transferência entre contas (não soma como receita de novo) e,
 * ao importar, a conta salário recebe o salário no mês de referência e a saída da transferência.
 * @param {{itens:{chave:number,data:string,descricao:string,valor:number}[], contaSalario:object,
 *   aoConfirmar:(escolhas:{chave:number,dataSalario:string}[]) => void}} p
 */
function perguntarContaSalario({ itens, contaSalario, aoConfirmar }) {
  const opcoesMes = (data) => {
    const mes = data.slice(0, 7);
    return [0, -1, -2, -3].map((d) => deslocarMes(mes, d)).map(
      (m, i) => html`<option value="${m}" ${i === 1 ? 'selected' : ''}>${nomeMes(m)}</option>`,
    );
  };
  abrirModal({
    titulo: 'Salário vindo da conta salário?',
    textoOk: 'Confirmar',
    corpo: html`<p class="replicar-intro">
        Estas entradas vieram de você mesmo e não têm saída correspondente em outra conta. Marque as que são o salário
        transferido de <strong>${contaSalario.nome}</strong> e escolha a que mês o salário se refere: ele conta como receita
        daquele mês, e esta transferência não soma de novo.
      </p>
      <ul class="replicar-lista lista-salario">${itens.map(
        (it, k) => html`<li>
          <label class="replicar-item">
            <input type="checkbox" name="sel" value="${k}" checked />
            <span class="replicar-data">${formatarData(it.data).slice(0, 5)}</span>
            <span class="replicar-desc">${it.descricao}</span>
            <strong class="positivo">${formatarMoeda(it.valor)}</strong>
          </label>
          <label class="salario-mes">Salário de <select name="mes-${k}">${opcoesMes(it.data)}</select></label>
        </li>`,
      )}</ul>`,
    async aoEnviar(_, form) {
      const escolhas = $$('[name=sel]:checked', form).map((cb) => {
        const it = itens[Number(cb.value)];
        const mes = $(`[name="mes-${cb.value}"]`, form).value;
        // mesmo mês da transferência: o salário entrou na data dela; mês anterior: último dia daquele mês
        return { chave: it.chave, dataSalario: mes === it.data.slice(0, 7) ? it.data : limitesMes(mes).fim };
      });
      aoConfirmar(escolhas);
    },
  });
}

/** Grava na conta salário o salário (mês de referência) e a saída da transferência dos itens importados. */
async function registrarNaContaSalario(itens, contaDestino) {
  const comSalario = itens.filter((i) => i.contaSalario);
  if (!comSalario.length) return 0;
  const datas = comSalario.flatMap((i) => [i.data, i.contaSalario.dataSalario]).sort();
  const vizinhos = await api.lancamentosEntreDatas(`${datas[0].slice(0, 7)}-01`, somarDias(datas.at(-1), 3));
  const novos = [];
  for (const i of comSalario) {
    const contaSalario = contaPorId(i.contaSalario.id);
    if (!contaSalario) continue;
    novos.push(
      ...lancamentosDaContaSalario(i, {
        contaSalario,
        contaDestino,
        dataSalario: i.contaSalario.dataSalario,
        existentes: [...vizinhos, ...novos],
        catTransferencia: categoriaTransferencia('SAIDA')?.id || null,
        catSalario: categoriaSalario()?.id || null,
      }),
    );
  }
  if (novos.length) await api.criarLancamentos(novos);
  return novos.length;
}

/** Revisão dos lançamentos já importados: entradas de você mesmo sem par em outra conta. */
export async function revisarSalarioImportado(aoConcluir) {
  const ids = estado.categorias.filter((c) => c.nome === 'Transferências' && c.subcategoria === 'Entre minhas contas').map((c) => c.id);
  const transf = await api.lancamentosDasCategorias(ids);
  const { semPar } = conciliarTransferencias(transf);
  const candidatos = semPar.filter((l) => l.tipo === 'ENTRADA');
  if (!candidatos.length) {
    avisar('Nenhuma entrada sem par encontrada. Suas transferências estão conciliadas.', 'info');
    return;
  }
  perguntarSalario({
    itens: candidatos.map((l) => ({ ...l, chave: l.id, valor: Number(l.valor), nota: 'sem saída correspondente' })),
    async aoConfirmar(chaves, salario) {
      if (chaves.length) await api.atualizarCategoria(chaves, salario.id);
      aoConcluir?.();
    },
  });
}

function categoriaTransferencia(tipo) {
  return estado.categorias.find((c) => c.tipo === tipo && c.nome === 'Transferências' && c.subcategoria === 'Entre minhas contas');
}

async function processarArquivo(el, arquivo, contaId, ehFatura) {
  const XLSX = await carregarXLSX();
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const { itens, ignoradas } = await lerPlanilha(XLSX, bytes, arquivo.name);

  const [regras, historico, futuros] = await Promise.all([api.listarRegras(), api.historicoClassificacao(), api.listarFuturos()]);
  const classificar = criarClassificador({ categorias: estado.categorias, regras, historico });
  const existentes = await api.hashesExistentes(contaId, itens.filter((i) => i.hash).map((i) => i.hash));

  // transferências entre as próprias contas: pelo nome do titular e pelo par na outra conta
  const partes = partesDoNome(estado.perfil?.nome_completo || '');
  const validos = itens.filter((i) => !i.erros.length);
  let pares = new Map();
  if (validos.length && estado.contas.length > 1) {
    const datas = validos.map((i) => i.data).sort();
    const vizinhos = await api.lancamentosEntreDatas(somarDias(datas[0], -3), somarDias(datas.at(-1), 3));
    pares = encontrarPares(itens, vizinhos, contaId);
  }

  // anti-duplicidade: linhas do extrato que realizam um lançamento previsto (parcela, fixa, conta a pagar)
  itens.forEach((it) => {
    it.duplicado = Boolean(it.hash && existentes.has(it.hash));
  });
  const previstosAchados = conciliarPrevistos(itens, futuros, contaId, 7, (it) => (it.erros.length ? null : classificar(it).categoria_id));

  itens.forEach((it, idx) => {
    if (ehFatura) it.forma_pagamento = 'Crédito';
    let { categoria_id, origem } = it.erros.length ? { categoria_id: null, origem: null } : classificar(it);
    const par = pares.get(idx) || null;
    if (!it.erros.length && origem !== 'planilha' && origem !== 'regra' && (par || mencionaTitular(it.descricao, partes))) {
      const transf = categoriaTransferencia(it.tipo);
      if (transf) ({ categoria_id, origem } = { categoria_id: transf.id, origem: 'transferencia' });
    }
    const previsto = previstosAchados.get(idx) || null;
    if (previsto?.categoria_id && !it.erros.length && (!categoria_id || origem === 'padrao' || origem === 'historico')) {
      ({ categoria_id, origem } = { categoria_id: previsto.categoria_id, origem: 'previsto' });
    }
    Object.assign(it, {
      categoria_id,
      origem,
      par,
      previsto,
      sugerida: categoria_id,
      duplicado: Boolean(it.hash && existentes.has(it.hash)),
    });
    it.incluir = !it.erros.length && !it.duplicado;
  });

  previa = { contaId, arquivo: arquivo.name, itens, ehFatura };
  pagina = 0;
  desenharPrevia(el);
  if (ignoradas) avisar(`${ignoradas} linha(s) de saldo/total foram ignoradas.`, 'info');

  const salarioCat = categoriaSalario();
  const contaSalario = contasSalarioDe(contaId)[0] || null;
  const daProprioTitular = itens
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.tipo === 'ENTRADA' && !it.par && it.incluir && (it.origem === 'transferencia'
      // com conta salário, a regra "isto é salário" de antes também passa pela pergunta
      || (contaSalario && salarioCat && it.categoria_id === salarioCat.id && mencionaTitular(it.descricao, partes))));
  if (daProprioTitular.length && contaSalario) {
    perguntarContaSalario({
      contaSalario,
      itens: daProprioTitular.map(({ it, i }) => ({ chave: i, data: it.data, descricao: it.descricao, valor: it.valor })),
      aoConfirmar(escolhas) {
        const transf = categoriaTransferencia('ENTRADA');
        for (const { chave, dataSalario } of escolhas) {
          Object.assign(previa.itens[chave], {
            categoria_id: transf?.id || null,
            origem: 'contaSalario',
            sugerida: transf?.id || null,
            contaSalario: { id: contaSalario.id, dataSalario },
          });
        }
        desenharPrevia(el);
      },
    });
  } else if (daProprioTitular.length) {
    perguntarSalario({
      itens: daProprioTitular.map(({ it, i }) => ({ chave: i, data: it.data, descricao: it.descricao, valor: it.valor, tipo: it.tipo, nota: 'sem saída correspondente' })),
      aoConfirmar(indices, salario) {
        for (const i of indices) Object.assign(previa.itens[i], { categoria_id: salario.id, origem: 'manual', sugerida: salario.id });
        desenharPrevia(el);
      },
    });
  }
  $('#area-previa', el).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function confirmarImportacao(el, botao) {
  const selecionados = previa.itens.filter((i) => i.incluir);
  const semCat = selecionados.filter((i) => !i.categoria_id).length;
  if (semCat && !(await confirmar(`${semCat} lançamento(s) ficarão "A classificar". Você poderá classificá-los depois na tela de Lançamentos. Continuar?`, { perigo: false, textoOk: 'Importar assim mesmo' }))) {
    return;
  }

  await comCarregando(botao, async () => {
    const itens = selecionados.map((i) => ({
      data: i.data,
      tipo: i.tipo,
      valor: i.valor,
      descricao: i.descricao,
      descricao_original: i.descricao,
      categoria_id: i.categoria_id,
      forma_pagamento: i.forma_pagamento,
      hash: i.hash,
    }));
    const r = await api.importarLancamentos(previa.contaId, previa.arquivo, itens);

    // o realizado entra no lugar do previsto: apaga os previstos conciliados
    const substituidos = selecionados.filter((i) => i.previsto).map((i) => i.previsto.id);
    if (substituidos.length) await api.excluirPrevistos(substituidos);

    // o lado espelho (na outra conta) também vira transferência entre contas
    const espelhos = { ENTRADA: [], SAIDA: [] };
    for (const i of selecionados) {
      if (i.par && i.origem === 'transferencia') {
        const alvo = categoriaTransferencia(i.par.tipo);
        if (alvo && i.par.categoria_id !== alvo.id) espelhos[i.par.tipo].push(i.par.id);
      }
    }
    for (const tipo of ['ENTRADA', 'SAIDA']) {
      if (espelhos[tipo].length) await api.atualizarCategoria(espelhos[tipo], categoriaTransferencia(tipo).id);
    }

    // salário vindo da conta salário: salário no mês de referência + saída da transferência lá
    const naContaSalario = await registrarNaContaSalario(
      selecionados.filter((i) => i.categoria_id && i.origem === 'contaSalario'),
      contaPorId(previa.contaId),
    );
    if (naContaSalario) avisar(`Conta salário atualizada: ${naContaSalario} lançamento(s) criado(s).`, 'info');

    // mostra o mês importado no Resumo/Lançamentos
    const ultimaData = selecionados.map((i) => i.data).sort().at(-1);
    if (ultimaData) definirMes(ultimaData.slice(0, 7));

    // Aprendizado: correções do usuário viram regras
    if ($('#aprender', el)?.checked) {
      const regras = new Map();
      for (const i of selecionados) {
        const padrao = chaveDescricao(i.descricao).slice(0, 100);
        if (i.categoria_id && i.categoria_id !== i.sugerida && padrao.length >= 3) {
          regras.set(padrao, { padrao, categoria_id: i.categoria_id });
        }
      }
      if (regras.size) await api.salvarRegras([...regras.values()]);
    }

    avisar(
      `${r.importados} lançamento(s) importado(s)` +
        (r.duplicados ? `, ${r.duplicados} já existiam e foram ignorados.` : '.') +
        (substituidos.length ? ` ${substituidos.length} previsto(s) substituído(s) pelo lançamento real.` : '') +
        (ultimaData ? ` Resumo ajustado para ${nomeMes(ultimaData.slice(0, 7))}.` : ''),
    );
    previa = null;
    desenharPrevia(el);
    $('#form-importar', el).reset();
    $('.area-origem', el).hidden = !contaPorId($('[name=conta]', el).value)?.tem_credito;
    await desenharHistorico(el);
  });
}

/** Depois de escolher a categoria de uma linha, oferece aplicar às linhas iguais. */
function oferecerReplicar(el, idx) {
  const alvo = previa.itens[idx];
  const candidatos = previa.itens
    .map((it, i) => ({ it, i }))
    .filter(({ it, i }) => i !== idx && !it.erros.length && it.categoria_id !== alvo.categoria_id && saoIguais(it, alvo))
    .map(({ it, i }) => ({ chave: i, data: it.data, descricao: it.descricao, valor: it.valor, categoria_id: it.categoria_id }));
  if (!candidatos.length) return;

  abrirReplicarCategoria({
    origem: alvo,
    categoriaId: alvo.categoria_id,
    candidatos,
    async aoConfirmar(indices, regra) {
      for (const i of indices) {
        Object.assign(previa.itens[i], { categoria_id: alvo.categoria_id, origem: 'manual' });
      }
      if (regra) {
        await api.salvarRegra({ padrao: normalizarTexto(regra), categoria_id: alvo.categoria_id, origem: 'APRENDIDA' });
      }
      desenharPrevia(el);
      avisar(
        (indices.length ? `Categoria aplicada a mais ${indices.length} lançamento(s).` : 'Nenhum outro lançamento alterado.') +
          (regra ? ' As próximas importações já virão classificadas.' : ''),
      );
    },
  });
}

// ---------------------------------------------------------------------
// Nome do titular (reconhece Pix/TED entre as próprias contas)
// ---------------------------------------------------------------------
/** Aplica a detecção pelo nome aos lançamentos que já estão no banco. */
async function reclassificarTransferencias() {
  const partes = partesDoNome(estado.perfil?.nome_completo || '');
  if (partes.length < 2) return 0;
  let total = 0;
  for (const tipo of ['ENTRADA', 'SAIDA']) {
    const alvo = categoriaTransferencia(tipo);
    if (!alvo) continue;
    const lista = await api.buscarPorTermo(tipo, partes[0]);
    const ids = lista
      .filter((l) => {
        if (l.categoria_id === alvo.id || !mencionaTitular(l.descricao, partes)) return false;
        const atual = l.categoria_id ? categoriaPorId(l.categoria_id) : null;
        return !atual || GRUPOS_GENERICOS.has(atual.nome);
      })
      .map((l) => l.id);
    if (ids.length) await api.atualizarCategoria(ids, alvo.id);
    total += ids.length;
  }
  return total;
}

function desenharTitular(el, editando = false) {
  const area = $('#area-titular', el);
  const nome = estado.perfil?.nome_completo || '';
  if (nome && !editando) {
    renderizar(area, html`<div class="titular-ok">
      <p><strong>Transferências entre suas contas</strong><br />
      <small>Pix e TED com o nome <strong>${nome}</strong> são classificados como "Entre minhas contas" e não contam como gasto nem como receita.</small></p>
      <span class="botoes">
        <button class="btn btn-secundario btn-pequeno" data-acao="revisar-salario">Revisar entradas de você mesmo</button>
        <button class="btn btn-secundario btn-pequeno" data-acao="editar-titular">Alterar nome</button>
      </span>
    </div>`);
    return;
  }
  renderizar(area, html`<form class="grade-form" id="form-titular">
    <p class="campo-largo"><strong>Seu nome nos extratos</strong><br />
      <small>Informe seu nome completo como aparece no banco. Assim o app reconhece sozinho os Pix e TED entre as suas próprias contas, mesmo abreviados (ex.: "RAFAEL A C MOREIRA").</small></p>
    <label class="campo-largo">Nome completo <input name="nome_completo" required minlength="5" maxlength="120" value="${nome}" autocomplete="name" placeholder="Nome e sobrenomes" /></label>
    <div class="campo-largo botoes"><button type="submit" class="btn btn-primario">Salvar nome</button></div>
  </form>`);
  $('#form-titular', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const valor = new FormData(e.target).get('nome_completo').trim();
    await comCarregando($('button[type=submit]', e.target), async () => {
      estado.perfil = await api.salvarPerfil(estado.perfil.id, { nome_completo: valor });
      const n = await reclassificarTransferencias();
      avisar(n ? `Nome salvo. ${n} lançamento(s) já importado(s) reconhecido(s) como transferência entre suas contas.` : 'Nome salvo. As próximas importações já reconhecem suas transferências.');
      desenharTitular(el);
    });
  });
}

// ---------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------
async function desenharHistorico(el) {
  const lista = await api.listarImportacoes();
  renderizar(
    $('#area-historico', el),
    lista.length
      ? html`<div class="tabela-rolagem"><table class="tabela tabela-responsiva">
          <thead><tr><th>Quando</th><th>Arquivo</th><th>Conta</th><th>Período</th><th class="num">Importados</th><th></th></tr></thead>
          <tbody>${lista.map(
            (i) => html`<tr>
              <td data-rotulo="Quando">${new Date(i.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td data-rotulo="Arquivo" class="col-desc">${i.arquivo_nome}</td>
              <td data-rotulo="Conta">${contaPorId(i.conta_id)?.nome || '—'}</td>
              <td data-rotulo="Período">${formatarData(i.periodo_inicio)} a ${formatarData(i.periodo_fim)}</td>
              <td data-rotulo="Importados" class="num">${i.qtd_importados}</td>
              <td class="acoes"><button class="btn btn-pequeno btn-secundario" data-acao="desfazer" data-id="${i.id}" data-qtd="${i.qtd_importados}">Desfazer</button></td>
            </tr>`,
          )}</tbody>
        </table></div>`
      : estadoVazio('Nenhuma importação ainda.'),
  );
}

// ---------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------
export default {
  titulo: 'Importar extrato',
  usaMes: false,
  async montar(el) {
    previa = null;
    if (!contasAtivas().length) {
      renderizar(el, estadoVazio('Cadastre uma conta antes de importar.', html`<a class="btn btn-primario" href="#/contas">Cadastrar conta</a>`));
      return;
    }

    renderizar(
      el,
      html`
        <div class="tela-topo"><h2>Importar extrato</h2></div>

        <section class="bloco passos">
          <h3>1. Prepare a planilha</h3>
          <ol>
            <li>Baixe o extrato no app/site do seu banco (PDF, imagem ou planilha).</li>
            <li>Baixe o <strong>modelo de importação</strong> abaixo — ele já vem com as suas categorias.</li>
            <li>Envie o extrato e o modelo para uma IA (ChatGPT, Claude, Gemini…) junto com o texto de instruções.</li>
            <li>Confira o arquivo devolvido pela IA e importe aqui.</li>
          </ol>
          <div class="botoes">
            <button class="btn btn-primario" data-acao="modelo">Baixar modelo (.xlsx)</button>
            <button class="btn btn-secundario" data-acao="copiar-prompt">📋 Copiar instruções para a IA</button>
          </div>
        </section>

        <section class="bloco">
          <h3>2. Envie o arquivo preenchido</h3>
          <form id="form-importar" class="grade-form">
            <label>Conta <select name="conta" required>${opcoesContas(null)}</select></label>
            <fieldset class="opcoes-pilula area-origem" aria-label="Tipo do arquivo" hidden>
              <legend>O arquivo é</legend>
              <label><input type="radio" name="origem" value="extrato" checked /><span>Extrato da conta</span></label>
              <label><input type="radio" name="origem" value="fatura" /><span>Fatura do cartão</span></label>
            </fieldset>
            <label>Arquivo (.xlsx, .xls ou .csv — até 5 MB)
              <input type="file" name="arquivo" required accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" />
            </label>
            <button type="submit" class="btn btn-primario campo-largo">Ler planilha</button>
          </form>
        </section>

        <section class="bloco" id="area-titular"></section>

        <div id="area-previa"></div>

        <section class="bloco">
          <h3>Importações anteriores</h3>
          <p class="dica">Desfazer apaga todos os lançamentos que vieram daquele arquivo.</p>
          <div id="area-historico"></div>
        </section>`,
    );

    $('#form-importar', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const arquivo = f.get('arquivo');
      if (!arquivo?.size) return avisar('Escolha um arquivo.', 'erro');
      await comCarregando($('button[type=submit]', e.target), async () => {
        try {
          const conta = contaPorId(f.get('conta'));
          await processarArquivo(el, arquivo, conta.id, Boolean(conta.tem_credito) && f.get('origem') === 'fatura');
        } catch (err) {
          if (err instanceof ErroImportacao) avisar(err.message, 'erro');
          else throw err;
        }
      });
    });

    const mostrarOrigem = () => {
      const conta = contaPorId($('[name=conta]', el).value);
      $('.area-origem', el).hidden = !conta?.tem_credito;
    };
    mostrarOrigem();

    el.addEventListener('change', (e) => {
      if (e.target.name === 'conta') return mostrarOrigem();
      const idx = e.target.dataset.idx;
      if (idx === undefined || !previa) return;
      const it = previa.itens[Number(idx)];
      if (e.target.dataset.campo === 'incluir') it.incluir = e.target.checked;
      if (e.target.dataset.campo === 'categoria_id') {
        it.categoria_id = e.target.value || null;
        it.origem = it.categoria_id ? 'manual' : null;
        if (it.categoria_id) oferecerReplicar(el, Number(idx));
      }
      desenharPrevia(el);
    });

    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-acao]');
      if (!b) return;
      switch (b.dataset.acao) {
        case 'modelo': {
          const XLSX = await carregarXLSX();
          baixarArquivo(gerarModelo(XLSX, estado.categorias.filter((c) => c.ativo)), 'modelo-importacao.xlsx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          break;
        }
        case 'copiar-prompt':
          try {
            await navigator.clipboard.writeText(promptIA());
            avisar('Instruções copiadas. Cole na conversa com a IA.');
          } catch {
            avisar('Não foi possível copiar. As instruções também estão na aba "Instruções" do modelo.', 'erro');
          }
          break;
        case 'revisar-salario':
          try {
            await revisarSalarioImportado();
          } catch (err) {
            avisarErro(err);
          }
          break;
        case 'editar-titular':
          desenharTitular(el, true);
          break;
        case 'pagina':
          pagina += Number(b.dataset.delta);
          desenharPrevia(el);
          break;
        case 'cancelar':
          previa = null;
          desenharPrevia(el);
          break;
        case 'importar':
          await confirmarImportacao(el, b);
          break;
        case 'desfazer':
          if (await confirmar(`Desfazer esta importação apaga ${b.dataset.qtd} lançamento(s). Continuar?`, { textoOk: 'Desfazer' })) {
            try {
              await api.desfazerImportacao(b.dataset.id);
              avisar('Importação desfeita.');
              await desenharHistorico(el);
            } catch (err) {
              avisarErro(err);
            }
          }
          break;
      }
    });

    desenharTitular(el);
    await desenharHistorico(el);
  },
};
