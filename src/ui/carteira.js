// Pilha de cartões no estilo "Carteira" do celular: recolhida, cada conta mostra só a faixa
// de cima e a escolhida aparece inteira na frente. Arrastar para baixo (ou tocar na alça)
// abre a pilha; tocar numa faixa traz aquela conta para a frente.
// Posições via CSSOM (style.transform), permitido pela CSP.

const FAIXA = 62; // altura visível de cada cartão atrás
const VAO = 14; // espaço entre cartões com a pilha aberta
const LIMIAR = 0.35; // fração do arraste para abrir

export function ligarCarteira(raiz) {
  const pilha = raiz.querySelector('[data-carteira]');
  if (!pilha) return;
  const cartoes = [...pilha.querySelectorAll('.cartao')];
  const alca = raiz.querySelector('[data-carteira-alca]');
  if (cartoes.length < 2) {
    pilha.classList.add('carteira-unica');
    if (alca) alca.hidden = true;
    return;
  }

  let ordem = cartoes.map((_, i) => i); // a última posição é o cartão da frente
  let aberta = false;
  let alturaCartao = 0;

  const medir = () => {
    pilha.style.height = '';
    cartoes.forEach((c) => (c.style.minHeight = ''));
    alturaCartao = Math.max(...cartoes.map((c) => c.offsetHeight));
    cartoes.forEach((c) => (c.style.minHeight = `${alturaCartao}px`));
  };

  const posicionar = (abertura = aberta ? 1 : 0) => {
    const passo = FAIXA + (alturaCartao + VAO - FAIXA) * abertura;
    ordem.forEach((idx, pos) => {
      const c = cartoes[idx];
      c.style.transform = `translateY(${pos * passo}px)`;
      c.style.zIndex = String(pos + 1);
      c.classList.toggle('na-frente', pos === ordem.length - 1);
    });
    pilha.style.height = `${(ordem.length - 1) * passo + alturaCartao}px`;
    pilha.classList.toggle('aberta', abertura >= 1);
    if (alca) {
      alca.setAttribute('aria-expanded', String(abertura >= 1));
      alca.querySelector('span').textContent = abertura >= 1 ? 'Recolher cartões' : `Ver os ${cartoes.length} cartões`;
    }
  };

  const definir = (abrir) => {
    aberta = abrir;
    pilha.classList.remove('arrastando');
    posicionar();
  };

  const trazerParaFrente = (idx) => {
    ordem = [...ordem.filter((i) => i !== idx), idx];
    definir(false);
  };

  // arrastar para baixo abre, para cima fecha
  let inicioY = null;
  let movido = false;
  pilha.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    inicioY = e.clientY;
    movido = false;
  });
  pilha.addEventListener('pointermove', (e) => {
    if (inicioY === null) return;
    const dy = e.clientY - inicioY;
    if (Math.abs(dy) < 6) return;
    if (!movido) {
      movido = true;
      pilha.setPointerCapture?.(e.pointerId);
      pilha.classList.add('arrastando');
    }
    const curso = alturaCartao * 0.9;
    const abertura = aberta ? 1 + Math.min(0, dy) / curso : Math.max(0, dy) / curso;
    posicionar(Math.max(0, Math.min(1, abertura)));
  });
  const soltar = (e) => {
    if (inicioY === null) return;
    const dy = e.clientY - inicioY;
    inicioY = null;
    if (!movido) return; // foi um toque: o click cuida
    const curso = alturaCartao * 0.9;
    if (aberta) definir(!(dy < -curso * LIMIAR));
    else definir(dy > curso * LIMIAR);
  };
  pilha.addEventListener('pointerup', soltar);
  pilha.addEventListener('pointercancel', () => {
    inicioY = null;
    definir(aberta);
  });

  pilha.addEventListener('click', (e) => {
    if (movido) {
      movido = false;
      e.preventDefault();
      return;
    }
    const c = e.target.closest('.cartao');
    if (!c || e.target.closest('a, button')) return;
    const idx = cartoes.indexOf(c);
    if (aberta) trazerParaFrente(idx);
    else if (!c.classList.contains('na-frente')) trazerParaFrente(idx);
  });

  // teclado: cada cartão é focável; Enter traz para a frente
  cartoes.forEach((c, idx) => {
    c.tabIndex = 0;
    c.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trazerParaFrente(idx);
      }
    });
  });

  alca?.addEventListener('click', () => definir(!aberta));

  medir();
  posicionar();
  pilha.classList.add('pronta');
  const aoRedimensionar = () => {
    if (!pilha.isConnected) return window.removeEventListener('resize', aoRedimensionar);
    medir();
    posicionar();
  };
  window.addEventListener('resize', aoRedimensionar);
}
