// Botão de microfone do topo: a pessoa fala "lançamentos futuros", "novo lançamento"…
// e o app abre a tela. Usa o reconhecimento de voz do próprio navegador (Web Speech API:
// Chrome/Edge no Android e computador, Safari no iPhone). Sem suporte, o botão não aparece.
// Nada é gravado pelo app: o áudio vai só para o serviço de voz do navegador.

import { comandoPorFala, EXEMPLOS_COMANDO } from '../lib/comandos.js';
import { avisar } from './componentes.js';

const Reconhecimento = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const comandoVozDisponivel = () => Boolean(Reconhecimento);

/**
 * @param {HTMLButtonElement} botao
 * @param {{ irPara:(rota:string) => void, novo:(status:'REALIZADO'|'PREVISTO') => void }} acoes
 */
export function ligarComandoVoz(botao, { irPara, novo }) {
  if (!botao || !Reconhecimento) return;
  botao.hidden = false;
  let rec = null;

  const parar = () => {
    botao.classList.remove('ouvindo');
    botao.setAttribute('aria-pressed', 'false');
    rec = null;
  };

  botao.addEventListener('click', () => {
    if (rec) return rec.abort();
    rec = new Reconhecimento();
    rec.lang = 'pt-BR';
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    let entendeu = false;

    rec.onresult = (e) => {
      entendeu = true;
      const alternativas = [...e.results[0]].map((a) => a.transcript);
      const comando = alternativas.map(comandoPorFala).find(Boolean);
      if (!comando) {
        avisar(`Não entendi "${alternativas[0]}". Diga, por exemplo: ${EXEMPLOS_COMANDO.slice(0, 3).join(', ')}.`, 'info');
        return;
      }
      if (comando.rota) irPara(comando.rota);
      else novo(comando.acao === 'novo-futuro' ? 'PREVISTO' : 'REALIZADO');
      avisar(`Abrindo ${comando.nome}.`, 'info');
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        avisar('Permita o uso do microfone para este site nas configurações do navegador.', 'erro');
      } else if (e.error === 'no-speech') {
        entendeu = true;
        avisar('Não ouvi nada. Toque no microfone e fale logo em seguida.', 'info');
      } else if (e.error !== 'aborted') {
        avisar('O reconhecimento de voz não está disponível agora.', 'erro');
      }
    };
    rec.onend = () => {
      if (!entendeu && rec) avisar(`Diga, por exemplo: ${EXEMPLOS_COMANDO.slice(0, 3).join(', ')}.`, 'info');
      parar();
    };

    try {
      rec.start();
      botao.classList.add('ouvindo');
      botao.setAttribute('aria-pressed', 'true');
    } catch {
      parar();
    }
  });
}

/** Destaca o microfone por alguns segundos (depois da saudação), convidando a falar um comando. */
export function convidarComandoVoz(botao, ms = 6000) {
  if (!botao || botao.hidden) return;
  botao.classList.add('convite');
  setTimeout(() => botao.classList.remove('convite'), ms);
}
