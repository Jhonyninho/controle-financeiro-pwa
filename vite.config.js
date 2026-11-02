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
    // IA e voz com a chave do próprio usuário (só são chamados se ele cadastrar a chave):
    // Gemini, Groq, OpenRouter (diagnóstico); Azure Speech e ElevenLabs (voz)
    `connect-src 'self' ${origem} ${ws} https://generativelanguage.googleapis.com https://api.groq.com https://openrouter.ai ` +
      'https://*.tts.speech.microsoft.com https://api.elevenlabs.io',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
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
            return html.replace(
              '<!--CSP-->',
              `<meta http-equiv="Content-Security-Policy" content="${csp(supabaseUrl)}">`,
            );
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
    },
    test: {
      environment: 'node',
    },
  };
});
