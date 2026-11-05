import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Content-Security-Policy: o navegador só executa scripts do próprio site e
// só conversa com o projeto Supabase configurado. Isso bloqueia a maior parte
// dos ataques de XSS e exfiltração de dados/sessão.
function csp(supabaseUrl) {
  const origem = new URL(supabaseUrl).origin;
  const ws = origem.replace(/^http/, 'ws');
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // IA com a chave do próprio usuário: Gemini (diagnóstico e voz), Groq e OpenRouter (diagnóstico)
    `connect-src 'self' ${origem} ${ws} https://generativelanguage.googleapis.com https://api.groq.com https://openrouter.ai`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    // o app nunca embute outras páginas
    "frame-src 'none'",
  ].join('; ');
}

// CSP da página isolada do widget da Pluggy (conectar-banco.html). O widget (zoid)
// injeta <style> inline e abre um iframe de connect.pluggy.ai; a exceção de estilo
// vale só aqui, numa página que não mostra dados financeiros nem textos de extratos.
function cspConectar(supabaseUrl) {
  const origem = new URL(supabaseUrl).origin;
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.pluggy.ai",
    "font-src 'self'",
    `connect-src 'self' ${origem} https://api.pluggy.ai`,
    "frame-src https://connect.pluggy.ai",
    "child-src https://connect.pluggy.ai",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const supabaseUrl = env.VITE_SUPABASE_URL || 'https://exemplo.supabase.co';

  return {
    // GitHub Pages publica em /<nome-do-repositorio>/
    base: env.VITE_BASE_PATH || '/',
    plugins: [
      {
        name: 'injetar-csp',
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            // Em dev o Vite injeta scripts inline (HMR), então a CSP só vale no build.
            if (mode !== 'production') return html;
            return html
              .replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${csp(supabaseUrl)}">`)
              .replace('<!--CSP-CONECTAR-->', `<meta http-equiv="Content-Security-Policy" content="${cspConectar(supabaseUrl)}">`);
          },
        },
      },
    ],
    define: {
      __VERSAO__: JSON.stringify(version),
    },
    build: {
      sourcemap: false,
      // o sprite de ícones é usado por <use href>, que não aceita data: URL
      assetsInlineLimit: (arquivo) => (arquivo.endsWith('.svg') ? false : undefined),
      target: 'es2022',
      rollupOptions: {
        // segunda página: só o widget de conexão bancária, com CSP própria
        input: { main: 'index.html', conectar: 'conectar-banco.html' },
      },
    },
    test: {
      environment: 'node',
    },
  };
});
