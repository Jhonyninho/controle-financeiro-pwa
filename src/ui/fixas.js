// Replicação das despesas fixas: projeta o último valor pago de cada despesa fixa
// para os próximos meses, como lançamentos futuros (o usuário confirma na lista).

import * as api from '../servicos/api.js';
import { html } from '../lib/html.js';
import { hojeISO, somarDias } from '../lib/meses.js';
import { ehFixa } from '../lib/analise.js';
import { planejarFixas } from '../importacao/previstos.js';
import { categoriaPorId, nomeCategoria } from '../estado.js';
import { avisar } from './componentes.js';
import { abrirSelecaoLancamentos } from './replicar.js';

export const MESES_A_PREVER = 3;

/** Lista de previsões que faltam (não grava nada). */
export async function planoDeFixas(previstos) {
  const hoje = hojeISO();
  const [realizados, futuros] = await Promise.all([
    api.lancamentosEntreDatas(somarDias(hoje, -75), hoje),
    previstos ? Promise.resolve(previstos) : api.listarFuturos(),
  ]);
  return planejarFixas(realizados, futuros, (l) => ehFixa(l, categoriaPorId), hoje, MESES_A_PREVER);
}

export function oferecerFixas(plano, aoConcluir) {
  abrirSelecaoLancamentos({
    titulo: 'Prever despesas fixas',
    intro: html`<p>Estas despesas fixas foram pagas recentemente e ainda não têm previsão para os próximos ${MESES_A_PREVER} meses.
      O valor usado é o do último pagamento. Quando o extrato chegar, a importação troca cada previsão pelo lançamento real.</p>`,
    itens: plano.map((p, i) => ({ ...p, chave: i, nota: nomeCategoria(p.categoria_id) })),
    textoOk: (n) => (n ? `Criar ${n} previsão(ões)` : 'Nada selecionado'),
    async aoConfirmar(indices) {
      if (!indices.length) return;
      const series = new Map();
      const lista = indices.map((i) => {
        const { origem, ...p } = plano[i];
        const k = `${p.conta_id}|${p.descricao}`;
        if (!series.has(k)) series.set(k, origem.serie_id || crypto.randomUUID());
        return { ...p, serie_id: series.get(k) };
      });
      await api.criarLancamentos(lista);
      avisar(`${lista.length} despesa(s) fixa(s) prevista(s) em Futuros.`);
      aoConcluir?.();
    },
  });
}
