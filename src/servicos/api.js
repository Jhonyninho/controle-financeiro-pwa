// Acesso a dados. Todas as consultas ao Supabase passam por aqui.
// user_id nunca é enviado pelo cliente: o banco preenche com auth.uid()
// e o RLS garante que cada usuário só lê/escreve as próprias linhas.

import { supabase } from '../lib/supabase.js';
import { limitesMes } from '../lib/meses.js';

const PAGINA = 1000; // limite de linhas por requisição do Supabase

const CAMPOS_LANCAMENTO =
  'id, conta_id, categoria_id, importacao_id, data, tipo, valor, descricao, descricao_original, forma_pagamento, status, fatura_mes, ' +
  'despesa_fixa, serie_id, serie_tipo, parcela_atual, parcela_total';

export class ErroApi extends Error {}

function traduzirErro(error) {
  console.error('[api]', error);
  const codigo = error?.code;
  const msg = {
    23505: 'Já existe um registro com esses dados.',
    23503: 'Este registro está em uso ou referencia algo inexistente.',
    23514: 'Algum valor está fora do permitido.',
    42501: 'Sem permissão para esta operação.',
    PGRST301: 'Sua sessão expirou. Entre novamente.',
    PGRST116: 'Registro não encontrado.',
  }[codigo];
  if (msg) return new ErroApi(msg);
  if (codigo === 'P0001' && error.message) return new ErroApi(error.message); // raise exception das funções
  return new ErroApi('Não foi possível concluir a operação. Tente novamente.');
}

function ok({ data, error }) {
  if (error) throw traduzirErro(error);
  return data;
}

/** Busca paginada (o Supabase devolve no máximo 1000 linhas por vez). */
async function todos(montar, maximo = 20000) {
  const saida = [];
  for (let de = 0; de < maximo; de += PAGINA) {
    const lote = ok(await montar().range(de, de + PAGINA - 1));
    saida.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return saida;
}

function escaparLike(s) {
  return String(s).replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Mantém só as colunas permitidas (evita enviar id/user_id/campos calculados). */
function apenas(obj, campos) {
  return Object.fromEntries(campos.filter((c) => obj[c] !== undefined).map((c) => [c, obj[c]]));
}

// ---------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------
const CAMPOS_PERFIL_LER = 'id, nome, nome_completo, tema, avatar';

export async function buscarPerfil() {
  return ok(await supabase.from('perfis').select(CAMPOS_PERFIL_LER).maybeSingle());
}

export async function salvarPerfil(id, campos) {
  return ok(await supabase.from('perfis').update(apenas(campos, ['nome', 'nome_completo', 'tema', 'avatar'])).eq('id', id).select(CAMPOS_PERFIL_LER).single());
}

/** 'AAAA-MM' do lançamento realizado mais recente (ou null). */
export async function ultimoMesComDados() {
  const r = ok(await supabase.from('lancamentos').select('data').eq('status', 'REALIZADO').order('data', { ascending: false }).limit(1).maybeSingle());
  return r?.data ? r.data.slice(0, 7) : null;
}

/** Realizados num intervalo de datas (usado para achar pares de transferência). */
export async function lancamentosEntreDatas(inicio, fim) {
  return todos(() =>
    supabase.from('lancamentos').select(CAMPOS_LANCAMENTO).eq('status', 'REALIZADO').gte('data', inicio).lte('data', fim)
      .order('data', { ascending: false }).order('criado_em', { ascending: false }),
  );
}

export async function salvarNomePerfil(id, nome) {
  ok(await supabase.from('perfis').update({ nome }).eq('id', id));
}

// ---------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------
const CAMPOS_CONTA = [
  'nome', 'tipo', 'bandeira', 'skin', 'dia_fechamento', 'dia_vencimento', 'limite_credito', 'ativo', 'mostrar_resumo', 'ordem',
  'tem_debito', 'tem_credito', 'tem_pix', 'tem_ted', 'saldo_inicial', 'saldo_inicial_data',
];

export async function listarContas() {
  return ok(await supabase.from('contas').select('id, ' + CAMPOS_CONTA.join(', ')).order('ordem').order('nome'));
}

export async function salvarConta(conta) {
  const dados = apenas(conta, CAMPOS_CONTA);
  if (conta.id) return ok(await supabase.from('contas').update(dados).eq('id', conta.id).select().single());
  return ok(await supabase.from('contas').insert(dados).select().single());
}

/** Saldo de cada conta no fim do dia informado: Map conta_id -> número. */
export async function saldoContasEm(dataISO) {
  const linhas = ok(await supabase.rpc('saldo_contas_em', { p_data: dataISO }));
  return new Map(linhas.map((l) => [l.conta_id, Number(l.saldo)]));
}

export async function excluirConta(id) {
  ok(await supabase.from('contas').delete().eq('id', id));
}

// ---------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------
const CAMPOS_CATEGORIA = ['tipo', 'nome', 'subcategoria', 'ativo', 'icone', 'cor', 'fora_dos_gastos', 'fixa'];

export async function listarCategorias() {
  return ok(await supabase.from('categorias').select('id, ' + CAMPOS_CATEGORIA.join(', ')).order('tipo').order('nome').order('subcategoria'));
}

export async function salvarCategoria(cat) {
  const dados = apenas(cat, CAMPOS_CATEGORIA);
  if (cat.id) return ok(await supabase.from('categorias').update(dados).eq('id', cat.id).select().single());
  return ok(await supabase.from('categorias').insert(dados).select().single());
}

/** Atualiza ícone/cor/fora dos gastos de todas as subcategorias de uma categoria. */
export async function atualizarGrupoCategoria(tipo, nome, campos) {
  ok(await supabase.from('categorias').update(apenas(campos, ['icone', 'cor', 'fora_dos_gastos'])).eq('tipo', tipo).eq('nome', nome));
}

export async function excluirCategoria(id) {
  ok(await supabase.from('categorias').delete().eq('id', id));
}

// ---------------------------------------------------------------------
// Lançamentos
// ---------------------------------------------------------------------
const CAMPOS_SALVAR_LANCAMENTO = [
  'conta_id', 'categoria_id', 'data', 'tipo', 'valor', 'descricao', 'forma_pagamento', 'status',
  'despesa_fixa', 'serie_id', 'serie_tipo', 'parcela_atual', 'parcela_total',
];

/** Realizados do mês (por data) + compras de cartão que caem na fatura do mês. */
export async function lancamentosDoMes(mes) {
  const { inicio, fim } = limitesMes(mes);
  return todos(() =>
    supabase
      .from('lancamentos')
      .select(CAMPOS_LANCAMENTO)
      .eq('status', 'REALIZADO')
      .or(`and(data.gte.${inicio},data.lte.${fim}),fatura_mes.eq.${inicio}`)
      .order('data', { ascending: false })
      .order('criado_em', { ascending: false }),
  );
}

/** Realizados num intervalo de meses (relatórios). */
export async function lancamentosPeriodo(mesInicio, mesFim) {
  return todos(() =>
    supabase
      .from('lancamentos')
      .select(CAMPOS_LANCAMENTO)
      .eq('status', 'REALIZADO')
      .gte('data', limitesMes(mesInicio).inicio)
      .lte('data', limitesMes(mesFim).fim)
      .order('data'),
  );
}

export async function listarFuturos() {
  return todos(() => supabase.from('lancamentos').select(CAMPOS_LANCAMENTO).eq('status', 'PREVISTO').order('data'));
}

export async function salvarLancamento(l) {
  const dados = apenas(l, CAMPOS_SALVAR_LANCAMENTO);
  if (l.id) return ok(await supabase.from('lancamentos').update(dados).eq('id', l.id).select(CAMPOS_LANCAMENTO).single());
  return ok(await supabase.from('lancamentos').insert(dados).select(CAMPOS_LANCAMENTO).single());
}

export async function criarLancamentos(lista) {
  return ok(await supabase.from('lancamentos').insert(lista.map((l) => apenas(l, CAMPOS_SALVAR_LANCAMENTO))).select('id'));
}

export async function excluirLancamento(id) {
  ok(await supabase.from('lancamentos').delete().eq('id', id));
}

/** Remove previstos (substituídos pelo realizado importado). Só apaga quem ainda é PREVISTO. */
export async function excluirPrevistos(ids) {
  for (let i = 0; i < ids.length; i += 100) {
    ok(await supabase.from('lancamentos').delete().eq('status', 'PREVISTO').in('id', ids.slice(i, i + 100)));
  }
}

/** Atualiza só os campos de série/parcela/fixa de um lançamento. */
export async function marcarSerie(id, campos) {
  ok(await supabase.from('lancamentos').update(apenas(campos, ['serie_id', 'serie_tipo', 'parcela_atual', 'parcela_total', 'despesa_fixa'])).eq('id', id));
}

export async function confirmarFuturo(id, data) {
  ok(await supabase.from('lancamentos').update({ status: 'REALIZADO', data }).eq('id', id).eq('status', 'PREVISTO'));
}

/** Aplica uma categoria a lançamentos ainda sem categoria cuja descrição contém o padrão. */
export async function classificarPendentes(padrao, tipo, categoriaId) {
  const r = ok(
    await supabase
      .from('lancamentos')
      .update({ categoria_id: categoriaId })
      .is('categoria_id', null)
      .eq('tipo', tipo)
      .ilike('descricao', `%${escaparLike(padrao)}%`)
      .select('id'),
  );
  return r.length;
}

/**
 * Lançamentos do mesmo tipo cuja descrição contém o termo (pré-filtro no banco;
 * a comparação exata da descrição é feita no app).
 */
export async function buscarPorTermo(tipo, termo, excetoId) {
  let q = () =>
    supabase
      .from('lancamentos')
      .select(CAMPOS_LANCAMENTO)
      .eq('tipo', tipo)
      .ilike('descricao', `%${escaparLike(termo)}%`)
      .order('data', { ascending: false });
  const lista = await todos(q, 3000);
  return excetoId ? lista.filter((l) => l.id !== excetoId) : lista;
}

/** Lançamentos realizados de determinadas categorias. */
export async function lancamentosDasCategorias(ids) {
  if (!ids.length) return [];
  return todos(() => supabase.from('lancamentos').select(CAMPOS_LANCAMENTO).eq('status', 'REALIZADO').in('categoria_id', ids).order('data'));
}

export async function atualizarCategoria(ids, categoriaId) {
  for (let i = 0; i < ids.length; i += 100) {
    ok(await supabase.from('lancamentos').update({ categoria_id: categoriaId }).in('id', ids.slice(i, i + 100)));
  }
}

// ---------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------
/** Descrições já classificadas, mais recentes primeiro (base do "aprendizado"). */
export async function historicoClassificacao() {
  return todos(
    () =>
      supabase
        .from('lancamentos')
        .select('descricao, tipo, categoria_id')
        .not('categoria_id', 'is', null)
        .order('data', { ascending: false }),
    5000,
  );
}

/** Quais destes hashes já existem nesta conta (para marcar duplicados na prévia). */
export async function hashesExistentes(contaId, hashes) {
  const existentes = new Set();
  for (let i = 0; i < hashes.length; i += 100) {
    const lote = hashes.slice(i, i + 100);
    const r = ok(await supabase.from('lancamentos').select('hash_import').eq('conta_id', contaId).in('hash_import', lote));
    r.forEach((x) => existentes.add(x.hash_import));
  }
  return existentes;
}

export async function importarLancamentos(contaId, arquivo, itens) {
  return ok(await supabase.rpc('importar_lancamentos', { p_conta_id: contaId, p_arquivo: arquivo, p_itens: itens }));
}

export async function listarImportacoes() {
  return ok(
    await supabase
      .from('importacoes')
      .select('id, conta_id, arquivo_nome, qtd_importados, qtd_ignorados, periodo_inicio, periodo_fim, criado_em')
      .order('criado_em', { ascending: false })
      .limit(50),
  );
}

export async function desfazerImportacao(id) {
  ok(await supabase.from('importacoes').delete().eq('id', id));
}

// ---------------------------------------------------------------------
// Regras de classificação
// ---------------------------------------------------------------------
export async function listarRegras() {
  return ok(await supabase.from('regras_classificacao').select('id, padrao, categoria_id, origem, prioridade').order('padrao'));
}

export async function salvarRegra({ padrao, categoria_id, origem = 'MANUAL' }) {
  return ok(
    await supabase
      .from('regras_classificacao')
      .upsert({ padrao, categoria_id, origem }, { onConflict: 'user_id,padrao' })
      .select()
      .single(),
  );
}

/** Várias regras de uma vez (aprendizado após importação). */
export async function salvarRegras(regras) {
  if (!regras.length) return [];
  return ok(
    await supabase
      .from('regras_classificacao')
      .upsert(regras.map(({ padrao, categoria_id, origem = 'APRENDIDA' }) => ({ padrao, categoria_id, origem })), {
        onConflict: 'user_id,padrao',
      })
      .select('id'),
  );
}

export async function excluirRegra(id) {
  ok(await supabase.from('regras_classificacao').delete().eq('id', id));
}

// ---------------------------------------------------------------------
// Metas de economia
// ---------------------------------------------------------------------
const CAMPOS_META = ['nome', 'valor_alvo', 'valor_guardado', 'prazo_meses', 'inicio'];

export async function listarMetas() {
  return ok(await supabase.from('metas').select('id, ' + CAMPOS_META.join(', ')).order('criado_em'));
}

export async function salvarMeta(meta) {
  const dados = apenas(meta, CAMPOS_META);
  if (meta.id) return ok(await supabase.from('metas').update(dados).eq('id', meta.id).select().single());
  return ok(await supabase.from('metas').insert(dados).select().single());
}

export async function excluirMeta(id) {
  ok(await supabase.from('metas').delete().eq('id', id));
}
