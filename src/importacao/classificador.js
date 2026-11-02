// Classificação automática de lançamentos importados.
// Ordem de prioridade:
//   1. Categoria preenchida na planilha (pela IA ou pelo usuário), se existir
//   2. Regras do usuário (criadas manualmente ou aprendidas com correções)
//   3. Histórico: mesma descrição já classificada antes
//   4. Regras padrão por palavra-chave
//   5. Sem categoria ("A classificar")

import { normalizarTexto } from '../lib/formatos.js';

/** Remove números, datas e horas para agrupar descrições parecidas ("PIX ENVIADO 123" ~ "PIX ENVIADO 456"). */
export function chaveDescricao(descricao) {
  return normalizarTexto(descricao).replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
}

// [tipo, categoria, subcategoria, padrão sobre o texto normalizado]
// A ordem importa: a primeira regra que bater vence (específicas antes de genéricas).
const FATURA = /\b(PAGAMENTO|PAGTO|PGTO|PAG) (DE |DA )?FATURA\b|\bPAGAMENTO RECEBIDO\b|\bPAG(TO)? CARTAO\b/;
export const REGRAS_PADRAO = [
  ['SAIDA', 'Transferências', 'Pagamento de fatura', FATURA],
  ['ENTRADA', 'Transferências', 'Pagamento de fatura', FATURA],
  ['SAIDA', 'Transferências', 'Entre minhas contas', /\b(TRANSF(ERENCIA)? ENTRE CONTAS|MESMA TITULARIDADE|APLICACAO AUTOMATICA)\b/],
  ['SAIDA', 'Investimentos', 'Aplicação', /\b(APLICACAO|APLIC|CDB|TESOURO DIRETO|INVEST(IMENTO)?S?)\b/],
  ['ENTRADA', 'Investimentos', 'Resgate de investimento', /\b(RESGATE|RESG)\b/],
  ['SAIDA', 'Impostos e tarifas', 'IOF', /\bIOF\b/],
  ['SAIDA', 'Impostos e tarifas', 'Juros e multas', /\b(JUROS|ENCARGOS?|MULTA|MORA)\b/],
  ['SAIDA', 'Impostos e tarifas', 'Tarifas bancárias', /\b(TARIFA|ANUIDADE|CESTA DE SERVICOS|PACOTE DE SERVICOS)\b/],
  ['SAIDA', 'Transporte', 'Combustível', /\b(POSTO|AUTO POSTO|COMBUSTIVE(L|IS)|SHELL|IPIRANGA|PETROBRAS|BR MANIA)\b/],
  ['SAIDA', 'Transporte', 'Aplicativo e táxi', /\b(UBER|99 ?(APP|POP|TAXI)|CABIFY|INDRIVE|TAXI)\b/],
  ['SAIDA', 'Transporte', 'Estacionamento e pedágio', /\b(PEDAGIO|SEM PARAR|CONECTCAR|VELOE|ESTACIONAMENTO|ESTAPAR)\b/],
  ['SAIDA', 'Transporte', 'Transporte público', /\b(METRO|CPTM|BILHETE UNICO|SPTRANS|RECARGA TOP|ONIBUS)\b/],
  ['SAIDA', 'Restaurantes', 'Delivery', /\b(IFOOD|RAPPI|AIQFOME|ZE DELIVERY)\b/],
  ['SAIDA', 'Mercado', 'Padaria', /\b(PADARIA|PANIFICADORA|PANIFICACAO)\b/],
  ['SAIDA', 'Mercado', 'Hortifrúti e feira', /\b(HORTIFRUTI|SACOLAO|FEIRA|QUITANDA)\b/],
  ['SAIDA', 'Mercado', 'Açougue', /\b(ACOUGUE|CASA DE CARNES)\b/],
  ['SAIDA', 'Mercado', 'Supermercado', /\b(SUPERM\w*|MERCADO|MERCEARIA|ATACADAO|ASSAI|CARREFOUR|PAO DE ACUCAR|ATACAREJO|EMPORIO)\b/],
  ['SAIDA', 'Restaurantes', 'Lanches e café', /\b(LANCHONETE|BURGER|MC ?DONALDS|BK|SUBWAY|CAFE|CAFETERIA|STARBUCKS|PASTELARIA|SORVETERIA)\b/],
  ['SAIDA', 'Restaurantes', 'Bares', /\b(BAR|CHOPERIA|BOTECO|PUB)\b/],
  ['SAIDA', 'Restaurantes', 'Restaurante', /\b(RESTAURANTE|PIZZARIA|CHURRASCARIA|SUSHI|RESTAUR)\b/],
  ['SAIDA', 'Saúde', 'Farmácia', /\b(FARMACIA|DROGARIA|DROGA ?SIL|DROGA RAIA|RAIA|PAGUE MENOS|PANVEL|DROGAO)\b/],
  ['SAIDA', 'Saúde', 'Academia', /\b(ACADEMIA|SMART ?FIT|BLUEFIT|GYMPASS|WELLHUB|TOTALPASS)\b/],
  ['SAIDA', 'Saúde', 'Plano de saúde', /\b(UNIMED|AMIL|BRADESCO SAUDE|SULAMERICA|HAPVIDA|NOTREDAME|PLANO DE SAUDE)\b/],
  ['SAIDA', 'Assinaturas', 'Streaming', /\b(NETFLIX|SPOTIFY|DISNEY|PRIME VIDEO|AMAZON PRIME|HBO|GLOBOPLAY|YOUTUBE PREMIUM|DEEZER|PARAMOUNT|CRUNCHYROLL)\b/],
  ['SAIDA', 'Assinaturas', 'Apps e software', /\b(APPLE COM BILL|GOOGLE ?(PLAY|ONE|STORAGE)|MICROSOFT|ICLOUD|DROPBOX|CHATGPT|OPENAI|ADOBE|CANVA)\b/],
  ['SAIDA', 'Assinaturas', 'Celular', /\b(VIVO|CLARO|TIM|OI MOVEL|RECARGA CELULAR)\b/],
  ['SAIDA', 'Moradia', 'Energia elétrica', /\b(ENERGIA|ENEL|CEMIG|COPEL|LIGHT|CPFL|ELEKTRO|EQUATORIAL|NEOENERGIA|COELBA)\b/],
  ['SAIDA', 'Moradia', 'Água', /\b(SABESP|COPASA|SANEPAR|CEDAE|EMBASA|CAGECE|SANEAMENTO)\b/],
  ['SAIDA', 'Moradia', 'Gás', /\b(COMGAS|NATURGY|ULTRAGAZ|LIQUIGAS|SUPERGASBRAS)\b/],
  ['SAIDA', 'Moradia', 'Aluguel', /\bALUGUEL\b/],
  ['SAIDA', 'Moradia', 'Condomínio', /\bCONDOMINIO\b/],
  ['SAIDA', 'Moradia', 'Internet e TV', /\b(INTERNET|FIBRA|\w*FIBRA|NET VIRTUA|SKY|CLARO NET)\b/],
  ['SAIDA', 'Compras', 'Compras online', /\b(AMAZON|MERCADO ?LIVRE|MERCADOLIVRE|SHOPEE|SHEIN|ALIEXPRESS|MAGALU|MAGAZINE LUIZA|AMERICANAS)\b/],
  ['SAIDA', 'Compras', 'Roupas e calçados', /\b(RENNER|RIACHUELO|C ?A MODAS|ZARA|CENTAURO|NETSHOES|HERING|MARISA|CALCADOS)\b/],
  ['SAIDA', 'Pets', 'Pet shop', /\b(PET ?SHOP|PETZ|COBASI|PETLOVE)\b/],
  ['SAIDA', 'Cuidados pessoais', 'Cabeleireiro e barbearia', /\b(BARBEARIA|CABELEIREIRO|SALAO)\b/],
  ['SAIDA', 'Outros', 'Saques', /\b(SAQUE|SAQ)\b/],
  ['SAIDA', 'Outros', 'Pix e transferências a terceiros', /\bPIX (ENVIADO|TRANSF|TRANSFERENCIA)\b|\bTRANSFERENCIA ENVIADA\b|\bTED ENVIADA\b/],
  ['ENTRADA', 'Salário', 'Salário mensal', /\b(SALARIO|PAGTO SALARIO|FOLHA DE PAGAMENTO|PROVENTOS|CREDITO SALARIO)\b/],
  ['ENTRADA', 'Rendimentos', 'Dividendos', /\b(DIVIDENDOS?|JCP|JUROS S CAPITAL)\b/],
  ['ENTRADA', 'Rendimentos', 'Juros e rendimentos', /\b(RENDIMENTOS?|REMUNERACAO|RENDE FACIL)\b/],
  ['ENTRADA', 'Reembolsos e estornos', 'Cashback', /\bCASHBACK\b/],
  ['ENTRADA', 'Reembolsos e estornos', 'Estorno', /\b(ESTORNO|DEVOLUCAO|CANCELAMENTO)\b/],
  ['ENTRADA', 'Reembolsos e estornos', 'Reembolso', /\bREEMBOLSO\b/],
  ['ENTRADA', 'Benefícios', 'FGTS', /\bFGTS\b/],
  ['ENTRADA', 'Recebimentos', 'Pix recebido', /\bPIX RECEBIDO\b|\bTED RECEBIDA\b|\bTRANSFERENCIA RECEBIDA\b/],
];

/**
 * Prepara índices para classificar rápido.
 * @param {{id:string,tipo:string,nome:string,subcategoria:string,ativo?:boolean}[]} categorias
 * @param {{padrao:string,categoria_id:string,prioridade?:number}[]} regras
 * @param {{descricao:string,categoria_id:string,tipo:string}[]} historico lançamentos já classificados (mais recentes primeiro)
 */
export function criarClassificador({ categorias = [], regras = [], historico = [] }) {
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const porNome = new Map();
  for (const c of categorias) {
    if (c.ativo === false) continue;
    const kSub = `${c.tipo}|${normalizarTexto(c.nome)}|${normalizarTexto(c.subcategoria)}`;
    const kCat = `${c.tipo}|${normalizarTexto(c.nome)}|`;
    if (!porNome.has(kSub)) porNome.set(kSub, c);
    if (!porNome.has(kCat)) porNome.set(kCat, c); // categoria sem subcategoria -> primeira encontrada
  }

  const regrasOrdenadas = regras
    .map((r) => ({ ...r, padraoNorm: normalizarTexto(r.padrao) }))
    .filter((r) => r.padraoNorm.length >= 2 && porId.has(r.categoria_id))
    .sort((a, b) => (a.prioridade ?? 100) - (b.prioridade ?? 100) || b.padraoNorm.length - a.padraoNorm.length);

  const mapaHistorico = new Map();
  for (const h of historico) {
    if (!h.categoria_id || !porId.has(h.categoria_id)) continue;
    const k = `${h.tipo}|${chaveDescricao(h.descricao)}`;
    if (k.endsWith('|')) continue;
    if (!mapaHistorico.has(k)) mapaHistorico.set(k, h.categoria_id);
  }

  const buscar = (tipo, nome, sub) => porNome.get(`${tipo}|${normalizarTexto(nome)}|${normalizarTexto(sub)}`);

  /** @returns {{ categoria_id: string|null, origem: 'planilha'|'regra'|'historico'|'padrao'|null }} */
  return function classificar(item) {
    const tipo = item.tipo;
    const texto = normalizarTexto(item.descricao);
    const doTipo = (id) => id && porId.get(id)?.tipo === tipo;

    if (item.categoria) {
      const c = buscar(tipo, item.categoria, item.subcategoria) || buscar(tipo, item.categoria, '');
      if (c) return { categoria_id: c.id, origem: 'planilha' };
    }

    for (const r of regrasOrdenadas) {
      if (doTipo(r.categoria_id) && ` ${texto} `.includes(` ${r.padraoNorm} `)) {
        return { categoria_id: r.categoria_id, origem: 'regra' };
      }
    }

    const h = mapaHistorico.get(`${tipo}|${chaveDescricao(item.descricao)}`);
    if (h) return { categoria_id: h, origem: 'historico' };

    for (const [t, nome, sub, re] of REGRAS_PADRAO) {
      if (t === tipo && re.test(texto)) {
        const c = buscar(tipo, nome, sub) || buscar(tipo, nome, '');
        if (c) return { categoria_id: c.id, origem: 'padrao' };
      }
    }

    return { categoria_id: null, origem: null };
  };
}
