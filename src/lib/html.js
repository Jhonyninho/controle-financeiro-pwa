// Montagem de HTML segura por padrão.
// Todo valor interpolado em html`...` é escapado, então descrições vindas de
// planilhas/extratos (ex.: "<img onerror=...>") nunca viram código na página.
// Para inserir HTML já confiável (outro html`...`), basta interpolá-lo.

const SEGURO = Symbol('htmlSeguro');

const MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function escapar(v) {
  return String(v ?? '').replace(/[&<>"'`]/g, (c) => MAPA[c]);
}

function serializar(v) {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(serializar).join('');
  if (v && v[SEGURO]) return v.valor;
  return escapar(v);
}

export function html(partes, ...valores) {
  let out = partes[0];
  for (let i = 0; i < valores.length; i++) out += serializar(valores[i]) + partes[i + 1];
  return { [SEGURO]: true, valor: out, toString: () => out };
}

/** Único ponto do app que escreve innerHTML — e só aceita html`...`. */
export function renderizar(elemento, conteudo) {
  if (!conteudo || !conteudo[SEGURO]) throw new TypeError('renderizar() só aceita html`...`');
  elemento.innerHTML = conteudo.valor;
}
