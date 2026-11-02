import { expect, it } from 'vitest';
import { html, escapar } from '../src/lib/html.js';

it('escapa valores interpolados e preserva html aninhado', () => {
  const desc = '<img src=x onerror="alert(1)">';
  const linha = html`<td>${desc}</td>`;
  const tabela = html`<tr>${linha}${[html`<td>${'a&b'}</td>`]}</tr>`;
  expect(String(tabela)).toBe('<tr><td>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</td><td>a&amp;b</td></tr>');
  expect(escapar("'`")).toBe('&#39;&#96;');
});
