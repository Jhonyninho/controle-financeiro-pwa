// Modelo oficial de importação (Excel/CSV).
// O usuário baixa este modelo, pede para uma IA preencher a partir do extrato
// do banco e importa o arquivo de volta no app.

export const FORMAS_PAGAMENTO = ['Pix', 'Débito', 'Crédito', 'Dinheiro', 'TED', 'Boleto', 'Outro'];

export const ABA_LANCAMENTOS = 'Lançamentos';

/** Colunas do modelo. `aliases` são comparados já normalizados (sem acento, maiúsculo). */
export const COLUNAS = [
  { chave: 'data', titulo: 'Data', obrigatoria: true, aliases: ['DATA', 'DATE', 'DT', 'DATA LANCAMENTO'] },
  { chave: 'descricao', titulo: 'Descrição', obrigatoria: true, aliases: ['DESCRICAO', 'HISTORICO', 'LANCAMENTO', 'DETALHES', 'DESCRIPTION'] },
  { chave: 'valor', titulo: 'Valor', obrigatoria: true, aliases: ['VALOR', 'VALOR R', 'VALUE', 'AMOUNT', 'QUANTIA'] },
  { chave: 'categoria', titulo: 'Categoria', obrigatoria: false, aliases: ['CATEGORIA', 'CATEGORY'] },
  { chave: 'subcategoria', titulo: 'Subcategoria', obrigatoria: false, aliases: ['SUBCATEGORIA', 'SUB CATEGORIA', 'SUBCATEGORY'] },
  { chave: 'forma_pagamento', titulo: 'Forma de pagamento', obrigatoria: false, aliases: ['FORMA DE PAGAMENTO', 'FORMA PAGAMENTO', 'PAGAMENTO', 'MEIO DE PAGAMENTO'] },
];

export function promptIA() {
  return [
    'Vou te enviar o extrato do meu banco e uma planilha modelo. Preencha a aba "Lançamentos" da planilha seguindo EXATAMENTE estas regras:',
    '',
    '1. Uma linha por transação. NÃO inclua linhas de saldo (saldo anterior, saldo do dia, saldo final), totais ou resumos.',
    '2. Coluna "Data": formato DD/MM/AAAA. Se o extrato mostrar só dia/mês, use o ano do extrato.',
    '3. Coluna "Descrição": o texto da transação como aparece no extrato (ex.: "AUTO POSTO COTIA", "PIX RECEBIDO FULANO").',
    '4. Coluna "Valor": número com vírgula decimal, sem "R$" e sem separador de milhar. NEGATIVO para saídas/débitos (ex.: -100,00) e POSITIVO para entradas/créditos (ex.: 2500,00).',
    '   Em fatura de cartão de crédito: compras são NEGATIVAS; pagamentos da fatura e estornos são POSITIVOS.',
    '5. Colunas "Categoria" e "Subcategoria": use SOMENTE uma combinação que exista na aba "Categorias" e que seja do mesmo tipo (ENTRADA para valores positivos, SAIDA para negativos). Se não tiver certeza, deixe as duas em branco.',
    `6. Coluna "Forma de pagamento": uma destas opções — ${FORMAS_PAGAMENTO.join(', ')} — ou em branco. Se o arquivo for FATURA DE CARTÃO DE CRÉDITO, use "Crédito" em todas as linhas.`,
    '7. Não altere, renomeie nem reordene os cabeçalhos. Não crie abas novas.',
    '8. Devolva o arquivo .xlsx preenchido (ou, se não conseguir gerar arquivo, um CSV com os mesmos cabeçalhos, separado por ponto e vírgula).',
  ].join('\n');
}

/**
 * Gera o arquivo modelo (.xlsx) com as categorias do usuário.
 * @param {typeof import('xlsx')} XLSX
 * @param {{tipo:string, nome:string, subcategoria:string}[]} categorias
 * @returns {ArrayBuffer}
 */
export function gerarModelo(XLSX, categorias = []) {
  const wb = XLSX.utils.book_new();

  const wsLanc = XLSX.utils.aoa_to_sheet([COLUNAS.map((c) => c.titulo)]);
  wsLanc['!cols'] = [{ wch: 12 }, { wch: 45 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsLanc, ABA_LANCAMENTOS);

  const linhasCat = [...categorias]
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome) || a.subcategoria.localeCompare(b.subcategoria))
    .map((c) => [c.tipo, c.nome, c.subcategoria]);
  const wsCat = XLSX.utils.aoa_to_sheet([['Tipo', 'Categoria', 'Subcategoria'], ...linhasCat]);
  wsCat['!cols'] = [{ wch: 10 }, { wch: 24 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsCat, 'Categorias');

  const instrucoes = [
    ['COMO USAR ESTE MODELO'],
    [''],
    ['1. Baixe o extrato do seu banco (PDF, imagem ou planilha).'],
    ['2. Envie o extrato + este arquivo para uma IA (ChatGPT, Claude, Gemini...) junto com o texto abaixo.'],
    ['3. Confira o arquivo devolvido e importe no app em "Importar extrato", escolhendo a conta.'],
    ['   Lançamentos repetidos (já importados antes) são ignorados automaticamente.'],
    [''],
    ['EXEMPLO DE LINHAS PREENCHIDAS (não copie para a aba Lançamentos):'],
    COLUNAS.map((c) => c.titulo),
    ['01/10/2026', 'AUTO POSTO COTIA', '-100,00', 'Transporte', 'Combustível', 'Débito'],
    ['05/10/2026', 'PIX RECEBIDO FULANO DE TAL', '250,00', '', '', 'Pix'],
    [''],
    ['TEXTO PARA COPIAR E COLAR NA IA:'],
    ...promptIA().split('\n').map((l) => [l]),
  ];
  const wsInst = XLSX.utils.aoa_to_sheet(instrucoes);
  wsInst['!cols'] = [{ wch: 130 }];
  XLSX.utils.book_append_sheet(wb, wsInst, 'Instruções');

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
