// Comandos por voz: transforma o que a pessoa falou em uma ação do app
// ("lançamentos futuros" -> abre Futuros, "novo lançamento" -> abre o formulário).
// Função pura, testada em tests/comandos.test.js.

/** Texto sem acento, minúsculo e sem pontuação, para comparar falas. */
export function normalizarFala(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Ordem importa: os mais específicos primeiro ("lançamentos futuros" antes de "lançamentos").
const COMANDOS = [
  { acao: 'novo-futuro', nome: 'novo lançamento futuro', termos: ['novo lancamento futuro', 'nova conta a pagar', 'agendar conta', 'agendar pagamento'] },
  { acao: 'novo', nome: 'novo lançamento', termos: ['novo lancamento', 'nova despesa', 'novo gasto', 'nova receita', 'lancar', 'adicionar lancamento', 'registrar gasto'] },
  { rota: 'futuros', nome: 'Lançamentos futuros', termos: ['lancamentos futuros', 'lancamento futuro', 'futuros', 'futuro', 'contas a pagar', 'a pagar', 'a receber', 'vencimentos', 'agenda', 'parcelas', 'despesas fixas'] },
  { rota: 'importar', nome: 'Importar extrato', termos: ['importar', 'importacao', 'extrato', 'subir extrato'] },
  { rota: 'analise', nome: 'Análise e metas', termos: ['analise', 'diagnostico', 'metas', 'meta', 'alertas', 'inteligencia artificial', 'orcamento'] },
  { rota: 'relatorios', nome: 'Relatórios', termos: ['relatorios', 'relatorio', 'graficos', 'grafico', 'transferencias'] },
  { rota: 'lancamentos', nome: 'Lançamentos', termos: ['lancamentos', 'lancamento', 'movimentacoes', 'gastos', 'despesas', 'receitas', 'historico'] },
  { rota: 'contas', nome: 'Contas', termos: ['minhas contas', 'contas bancarias', 'contas', 'bancos', 'cartoes', 'cartao'] },
  { rota: 'categorias', nome: 'Categorias', termos: ['categorias', 'categoria'] },
  { rota: 'configuracoes', nome: 'Configurações', termos: ['configuracoes', 'configuracao', 'ajustes', 'preferencias', 'perfil'] },
  { rota: 'resumo', nome: 'Resumo', termos: ['resumo', 'inicio', 'tela inicial', 'pagina inicial', 'home', 'patrimonio', 'saldo'] },
];

const termoNaFala = (fala, termo) => ` ${fala} `.includes(` ${termo} `);

/**
 * @param {string} texto o que o reconhecimento de voz entendeu
 * @returns {{rota?:string, acao?:string, nome:string}|null}
 */
export function comandoPorFala(texto) {
  const fala = normalizarFala(texto);
  if (!fala) return null;
  for (const c of COMANDOS) {
    if (c.termos.some((t) => termoNaFala(fala, t))) {
      const { termos, ...comando } = c;
      return comando;
    }
  }
  return null;
}

/** Exemplos para a dica "diga, por exemplo...". */
export const EXEMPLOS_COMANDO = ['lançamentos futuros', 'novo lançamento', 'importar extrato', 'relatórios', 'resumo'];
