// Barra de período compartilhada (Resumo e Lançamentos):
// "Mês selecionado" (o do cabeçalho) ou "Personalizado" com De/Até.

import { html } from '../lib/html.js';
import { nomeMes } from '../lib/meses.js';
import { estado, definirPeriodoLivre, intervaloAtual, usarMesSelecionado } from '../estado.js';
import { $, avisar } from './componentes.js';

const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function barraPeriodo() {
  const livre = estado.periodo.livre;
  const { inicio, fim } = intervaloAtual();
  return html`<form class="periodo periodo-barra" data-periodo>
    <fieldset class="opcoes-pilula" aria-label="Período">
      <label><input type="radio" name="modo-periodo" value="mes" ${livre ? '' : 'checked'} /><span>${maiuscula(nomeMes(estado.mes))}</span></label>
      <label><input type="radio" name="modo-periodo" value="livre" ${livre ? 'checked' : ''} /><span>Personalizado</span></label>
    </fieldset>
    <div class="periodo-datas" ${livre ? '' : 'hidden'}>
      <label>De <input type="date" name="de" value="${inicio}" required min="2000-01-01" max="2100-12-31" /></label>
      <label>Até <input type="date" name="ate" value="${fim}" required min="2000-01-01" max="2100-12-31" /></label>
      <button type="submit" class="btn btn-secundario">Aplicar</button>
    </div>
  </form>`;
}

/** Liga os eventos da barra. Mudanças de período re-renderizam a tela via estado. */
export function ligarBarraPeriodo(el) {
  const form = $('[data-periodo]', el);
  if (!form) return;
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'modo-periodo') return;
    if (e.target.value === 'mes') {
      if (estado.periodo.livre) usarMesSelecionado();
      $('.periodo-datas', form).hidden = true;
    } else {
      $('.periodo-datas', form).hidden = false;
      $('[name=de]', form).focus();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const de = $('[name=de]', form).value;
    const ate = $('[name=ate]', form).value;
    if (!de || !ate) return avisar('Informe as duas datas.', 'erro');
    definirPeriodoLivre(de, ate);
  });
}
