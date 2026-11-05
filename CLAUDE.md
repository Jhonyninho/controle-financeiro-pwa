# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal finance PWA ("Controle Financeiro"), pt-BR. Code identifiers, UI text, SQL names and commit messages are in Portuguese — keep it that way. Always reply to the user in Brazilian Portuguese.

Stack: **Supabase (Postgres + Auth + RLS) + Vite vanilla JS**, hosted on GitHub Pages. The old Google Sheets + Apps Script version lives in `legacy/` (reference only, do not extend). Access is **invite-only** (signups disabled in Supabase; owner invites via dashboard).

**Version:** the whole project is **1.0.0** until several active users give feedback; do not bump the version or label work as "v1.x" before that. Single source is `package.json` → `__VERSAO__` (vite define) → `src/lib/versao.js`; the cache name in `public/sw.js` must match.

## Commands

```bash
npm run dev                         # Vite dev server (needs .env.local, see .env.example)
npm run build                       # production build to dist/ (CSP injected only here)
npm run preview                     # serve the production build
npm test                            # Vitest, all tests
npx vitest run tests/leitor.test.js # single file
npx vitest run -t "parseValor"      # tests matching a name
GEMINI_API_KEY=… npm run gerar-falas  # record greetings (env: VOZ, FORCAR=1, TRATAMENTOS)
```

Database changes: add a new file in `supabase/migrations/` (never edit an applied one). Demo user with fictitious data: `supabase/demo/semear_demo.sql` (owner runs it in the SQL Editor; it wipes and reseeds only the e-mail set inside). Product presentation: `docs/apresentacao/apresentacao.html` (print to PDF with headless Edge/Chrome; PDFs are gitignored). Owner setup steps: `docs/SETUP-SUPABASE.md`; deploy/install: `docs/PUBLICAR.md`.

## Security model

- **No custom backend** (the only exception is the Open Finance Edge Functions; see that section). The browser talks to Supabase directly with the public (publishable/anon) key. Security relies entirely on Postgres RLS: every table has `user_id default auth.uid()` and policies `(select auth.uid()) = user_id`; `anon` has no grants. Cross-user references are blocked by **composite foreign keys `(x_id, user_id)`** — any new table referencing another must follow that pattern. Never use the service_role/secret key in `src/` (`src/lib/supabase.js` refuses it).
- **2FA (TOTP):** `src/servicos/seguranca.js` wraps `supabase.auth.mfa`. After password login, or at startup with a saved session, `nivelDaSessao().precisaCodigo` routes to `mostrarCodigo()` (`telas/auth.js`) before `entrarNoApp`. Enforced server-side: migration 0009 adds a RESTRICTIVE `*_exige_mfa` policy on every table using `privado.sessao_mfa_ok()` (aal2 only for users with a verified factor). **New tables need the RLS policies, the composite FKs and this restrictive policy.** Configurações also has Trocar senha and Sair de todos os aparelhos (`signOut({ scope: 'global' })`).
- **Auth links** (invite, password reset) arrive as `?token_hash=…&type=invite|recovery` (custom email templates) and are handled by `validarLinkDoEmail()`; `detectSessionInUrl` is off on purpose.
- **XSS:** never assign `innerHTML` directly. Build markup with the `html` tagged template and write it with `renderizar()` (`src/lib/html.js`), which escapes every interpolated value. Imported statement descriptions are untrusted input.
- **CSP** (production builds only, `vite.config.js`): no inline scripts/styles/event-handler attributes; `connect-src` limited to the Supabase origin, `generativelanguage.googleapis.com`, `api.groq.com` and `openrouter.ai`; no external fonts.
- **Clickjacking:** Pages can't send `frame-ancestors`, so `main.js` refuses to run inside any iframe in production.
- **Public repo:** never commit real names, statements or keys. `extratos/`, `Dados para ajustes/` and all `*.xlsx/*.csv/*.pdf` are real bank data and are gitignored. Test fixtures must be synthetic and built inside `tests/` (fictitious owner "Rafael Augusto da Conceição Moreira").

## Data model (`supabase/migrations/`)

Tables: `contas`, `categorias`, `lancamentos`, `importacoes`, `regras_classificacao`, `perfis`, `metas`, plus the Open Finance tables `conexoes_bancarias`, `contas_externas` and `transacoes_pendentes`.

- **conta** (tipo CORRENTE/DIGITAL/POUPANCA/CARTEIRA/INVESTIMENTO/SALARIO) owns its payment methods (`tem_debito/tem_credito/tem_pix/tem_ted`). The credit card is NOT a separate account — `dia_fechamento/dia_vencimento/limite_credito` live on the account. Allowed `forma_pagamento` per account: `meiosDaConta()` in `src/estado.js`.
- **Conta salário** (tipo SALARIO, migration 0010): `conta_vinculada_id` (composite FK, set null) points to the account it transfers to. The salary is an ENTRADA in the conta salário in its reference month; the later transfer is "Entre minhas contas" on both sides. In Resumo it is a line inside the linked card (`contasSalarioDe`), not its own card. `listarContas` falls back without the column if the migration is missing.
- **Encerrar conta** (migration 0011): `contas.encerrada_em` + `ativo = false`; a trigger rejects lancamentos dated after it. Closed accounts leave forms/import (`contasAtivas`) but stay in filters and history; `opcoesContas` always lists the edited entry's own account.
- **lancamentos:** realized and future in one table (`status` REALIZADO/PREVISTO); `data` is `date`; `valor` is positive `numeric`, sign carried by `tipo` ENTRADA/SAIDA. A DB trigger sets `fatura_mes` (1st day of the **due-date** month) when `forma_pagamento = 'Crédito'`; mirrored in JS as `mesDaFatura()` (`src/lib/calculos.js`) — keep both in sync with SQL `calcular_fatura_mes` (migration 0005). Credit purchases don't move the account balance; they sum into the bill.
- **categorias:** flat categoria+subcategoria with `icone`, `cor` (palette key, see `CORES`/`.cor-*` CSS), `fora_dos_gastos` (transfers, bill payment, investments — excluded from income/expense totals via `categoriasForaDosGastos()`) and `fixa`. Defaults come from SQL `semear_categorias()`; keyword rules in `REGRAS_PADRAO` reference those names.
- **Fixa x variável:** `categorias.fixa` is the default per subcategory (seeded by `eh_fixa_padrao()` + insert trigger); `lancamentos.despesa_fixa` overrides it (null = follow category). Always decide through `ehFixa()` (`src/lib/analise.js`).
- **Series:** `serie_id/serie_tipo` (PARCELA | FIXA) + `parcela_atual/parcela_total` link generated PREVISTO rows. Installments: `gerarParcelas` / `abrirGerarParcelas`; fixed-expense projection: `planejarFixas` (`src/importacao/previstos.js`), offered in Futuros via `src/ui/fixas.js` (the user confirms; nothing is generated silently).
- **perfis:** `nome_completo` (used for transfer detection), `avatar` (192px WebP data URL, CHECK-limited), `tema` (applied as `html[data-tema]`).

## Balances and totals

- `contas.saldo_inicial` is the balance at the END of `saldo_inicial_data`. SQL `saldo_contas_em(date)` (migration 0007) = saldo_inicial + realized movements after that date, excluding `forma_pagamento = 'Crédito'` (card purchases hit the bill; the bill payment is what leaves the account).
- Monthly roll-forward per account and consolidated: `saldosMensais()` in `calculos.js` (opening balance from the RPC at the day before the period). Pure aggregations sum in integer cents; credit-card accounts are summarized by `fatura_mes`, others by `data`.
- Own-account transfers count in account balances but are excluded from income/expense totals.
- **Dates/money in JS:** dates are `'AAAA-MM-DD'` strings end to end (no `Date` objects, avoids UTC shifts); parse/format only through `src/lib/formatos.js`.

## Statement import (core feature)

Only `.xlsx/.xls/.csv` in the app's own template — bank-specific formats are intentionally not supported. The user downloads the template (generated with their categories + an AI prompt, `src/importacao/modelo.js`), has an external AI fill it from their bank statement, and imports it. Pipeline, all client-side:

1. `leitor.js` — read file (SheetJS; CSV with UTF-8→Windows-1252 fallback and delimiter detection), locate header by column aliases, validate per row (errors don't abort the file), skip balance lines, compute a SHA-256 dedup hash (`data|valor|tipo|descrição normalizada|occurrence n`).
2. `classificador.js` — category priority: sheet value → user rules → history (same description without numbers) → `REGRAS_PADRAO` keywords → unclassified.
3. Choosing a category in the preview, or editing a saved entry's category, opens `abrirReplicarCategoria` (`src/ui/replicar.js`): lists entries with the same `chaveDescricao` + `tipo` for bulk apply, and can save a rule.
4. Transfers between own accounts (`src/importacao/transferencias.js`): `mencionaTitular()` matches `perfis.nome_completo` in the description (abbreviations allowed); `encontrarPares()` matches same value / opposite type / ≤3 days in another account; both sides get "Transferências › Entre minhas contas". Outranks keyword/history suggestions, not sheet/user rules.
5. Salary routed from a conta-salário arrives as a transfer from the user's own name with no counterpart; the preview (and Relatórios → Transferências) asks via `perguntarSalario` and can save a rule — rules outrank transfer detection.
   With a linked conta salário, the preview asks instead which month the salary refers to (`perguntarContaSalario`); after the RPC `registrarNaContaSalario` creates the salary (reference month) and the transfer SAIDA there via `lancamentosDaContaSalario` (skips what already exists).
6. **Previsto→realizado:** `conciliarPrevistos()` matches each row to a PREVISTO of the same account/type (date ±7 days; equal value + a shared word, or ±15% value + same description); after the RPC the matched PREVISTO rows are deleted (`excluirPrevistos`, guarded by `status = PREVISTO`).
7. RPC `importar_lancamentos(conta, arquivo, itens jsonb)` inserts in one transaction (SECURITY INVOKER, so RLS applies) and silently skips duplicates via the partial unique index on `hash_import`. Deleting an `importacoes` row cascades to its lançamentos ("undo import").

SheetJS is installed from `cdn.sheetjs.com` (the npm registry version is outdated and vulnerable) — don't replace it with `npm i xlsx`.

### Open Finance (Pluggy, migration 0012, per-user opt-in)

The only server code in the project: Supabase Edge Functions in `supabase/functions/` (Deno). Owner setup: `docs/SETUP-SUPABASE.md` §9.

- **Secrets:** `PLUGGY_CLIENT_ID/SECRET`, `PLUGGY_WEBHOOK_SECRET` and `APP_ORIGENS` exist only as function secrets. The browser gets only the short-lived connect token.
- **Functions:**
  - `of-token`: connect token with `clientUserId = auth.uid()`.
  - `of-conexao`: accepts an item only if Pluggy reports the same `clientUserId`.
  - `of-sincronizar`.
  - `of-desconectar`: deletes the item at Pluggy.
  - `of-webhook`: deployed with `--no-verify-jwt`; constant-time secret check; never trusts the body and re-fetches by `itemId`.
- **Shared function code:** `_compartilhado/servidor.ts`, `_compartilhado/pluggy.ts` and `_compartilhado/mapear.js` (pure, tested from Vitest).
- **Authorization:** `usuarioAutorizado()` checks the JWT. It checks MFA by reading `perfis` through the restrictive policy, and checks `public.open_finance_liberado()` (backed by `privado.open_finance_liberado`, which the owner fills by SQL).
- **service_role** is used only inside functions, always filtered by the validated `user_id`.
- **Tables:** `conexoes_bancarias`, `contas_externas` (Pluggy account → app `conta_id`, chosen by the user) and `transacoes_pendentes` (the queue).
  - The client may only select, delete, update `contas_externas.conta_id` and update `transacoes_pendentes.situacao`.
  - Inserts are server-only.
- **Queue → lançamentos:** pending rows go through `pendentesParaItens` (`src/importacao/openFinance.js`). The hash is SHA-256 of `pluggy|<transaction id>`, so the existing `hash_import` dedup applies. They then go through the same `montarPrevia` as spreadsheets (`telas/importar.js`). After the RPC, rows are marked IMPORTADA or IGNORADA.
- **Widget page:** the Pluggy widget (zoid) injects inline `<style>`. It therefore runs on a separate page, `conectar-banco.html` + `src/conectarBanco.js`, with its own CSP (`cspConectar` in `vite.config.js`: `style-src 'unsafe-inline'`, `frame-src https://connect.pluggy.ai`). That page never renders financial data.
  - The main app CSP stays strict and has `frame-src 'none'`.
  - The SW caches only the app page on navigation.
- **Function calls from the client** live in `src/servicos/openFinance.js`, not `api.js`. The widget page must not load the rest of the app.

## Frontend structure

- `src/main.js` — auth bootstrap, hash router (`#/<rota>`), month selector, 30-min idle logout. Each route is a module in `src/telas/` exporting `{ titulo, usaMes, montar(el) }`. The router creates a **fresh container element per navigation**, so screens attach listeners to `el` (event delegation via `data-acao`) and never to `#conteudo`/`document`. To reload the current screen, re-fetch and re-render a sub-area, or dispatch `hashchange` — never call `montar(el)` again on the same element (duplicates listeners).
- `src/servicos/api.js` — the only place that calls Supabase; whitelists writable columns (`apenas()`), paginates past the 1000-row limit (`todos()`), maps Postgres errors to pt-BR messages (`ErroApi`).
- `src/estado.js` — reference data loaded once after login (perfil, contas, categorias, selected month) plus lookup helpers.
- `src/ui/combo.js` — searchable category combobox (`campoCategoria`); value lives in a hidden input that fires a bubbling `change`, so it drops in where a `<select>` was. Use it instead of long category `<select>`s.
- `src/ui/comandoVoz.js` — header mic (Web Speech recognition, pt-BR); phrases map to routes/actions in `comandoPorFala` (`src/lib/comandos.js`, pure, tested). Hidden when the browser has no SpeechRecognition.
- `src/ui/componentes.js` — `<dialog>` modals (`abrirModal`, `confirmar`), toasts, `<select>` option builders.

### Screens

- **Resumo is the home** (layout "C" from `Modelos Visuais Gerados/`, prototypes only, not app code): greeting + clock, day notices, orbit with two views (Fluxo = entradas x saídas; Patrimônio = sum of real account balances, segmented ring, minus card bills still to come) beside full-color account cards (`.cartao` tinted by `--banco` from the account `skin`), shortcuts with live counts, top spending and upcoming bills with "Paguei" (`confirmarPagamento` exported from `futuros.js`). Styles in `src/v11.css`. Desktop is 3 columns (orbit | wallet | shortcuts) at ≥1360px. Account cards are a **wallet stack** (`src/ui/carteira.js`: collapsed strips, drag down / handle to open, tap brings a card to the front; positions via `style.transform`).
- **Futuros, Relatórios and Análise** use folder tabs (`.abas-pasta` / `.guias-pasta` in `v11.css`) with optional counters (`contador`, `alerta` on each guia). Category rows in Resumo/Relatórios/Análise open `abrirDetalheCategoria` (drill-down).
- **Análise e metas** (`src/telas/analise.js`, pure logic in `src/lib/analise.js`): month-over-month by category and payment method, alerts that evaluate variable categories vs the 3-month average separately from fixed costs, goal simulator (`metas`), 50/30/20.
- **Configurações** (`src/telas/configuracoes.js`) is the hub for Contas and Categorias (routes with `grupo: 'configuracoes'`), profile photo, theme, AI keys, voice, security and the install card.
- **Day notices** (`src/lib/campanhas.js`, pure, tested): monthly awareness campaigns, national holidays incl. Easter-based ones, money dates (IPVA, IR, 13º, Black Friday). `avisosDoDia(hoje)` feeds the Resumo banners; dismissed keys in `cf.avisosFechados`.
- **Install (PWA):** `src/ui/instalar.js` keeps the `beforeinstallprompt` event (Android/Chromium) for an "Instalar" button; iOS gets step-by-step instructions. Offered as a dismissible home notice (key `instalar-app`) on phones and as a card in Configurações. Manifest has any + maskable icons and shortcuts; iOS uses the `apple-*` metas and `apple-touch-icon.png`.

## AI diagnosis and voice

- **Providers** (`PROVEDORES` in `src/servicos/ia.js`): `groq` (default, OpenAI-compatible, `response_format: json_object`), `openrouter` (`:free` models, JSON asked in the prompt and extracted leniently by `lerRespostaIA`) and `gemini` (native schema, `thinkingBudget: 0` on 2.5 flash). `configIA()` keeps one key/model per provider (`chaves`, `modelos`) and migrates the old `{ chave, modelo }` Gemini config. On 429/unknown model each provider falls through its model list.
- **Privacy:** the user's own API keys live only in localStorage (never in the DB); client-side rate limit (per minute/day, sliding window); the payload from `montarPayloadIA()` is aggregates + sanitized category names only — never descriptions, account names or person names. Response is forced to JSON and rendered escaped.
- **Persona:** default name `M.A.V.I.Z.` (old default `Vega` migrates), `configVoz().assistente/estilo/efeito/tratamento`. Original character, never an imitation of a real person or film character. `estilo: 'assistente'` adds `promptSistema(nome)` personality (light and witty when the month is healthy, firm/sarcastic but never insulting on waste); assistant name only, the user's name is never sent to the AI. `tratamento` (nome | senhor | senhora) is used in the greeting and in `promptSistema`. `nomeFalado()` turns dotted acronyms into a spoken word ("Maviz") for every engine.
- **Voice** (`src/servicos/voz.js`): narrates the diagnosis with a live caption. Engines (`MOTORES`): `navegador` and `gemini` (Gemini TTS with `configIA().chaves.gemini`, even when the diagnosis uses Groq; at most 2 requests per reading via `blocosDeFala(..., { maxBlocos: 2 })`; counts toward the app rate limit only when Gemini is the diagnosis provider). `configVoz()` maps unknown motors to `navegador`; `limparVozLocalAntiga()` deletes leftover keys and old IndexedDB caches from removed engines. Any error falls back to the browser voice. Neural audio plays through Web Audio (no `media-src`/blob needed); chunks are scheduled back to back on one AudioContext. `efeito`: `assistente` (`cadeiaAssistente`: EQ, comb echo, light ring modulation, short generated room reverb), `sutil`, `desligado`; boot chime `vinheta` is synthesized. No cloning of real people's or characters' voices.
- **Recorded greetings:** `src/lib/saudacoes.js` (pure, tested) holds ~60 formal lines (opening by period × tratamento, plus comments by calendar context) and `sortearSaudacao()` avoids the last 8 (`cf.saudacoesRecentes`). `npm run gerar-falas` (`scripts/gerar-falas.mjs` + `scripts/audio-falas.mjs`: batches of 8 lines per Gemini request split on silence, MP3 via `@breezystack/lamejs`, resumable) writes `public/falas/*.mp3` + `indice.json` (version `v` used as `?v=` cache-buster, cached by the SW). `falarSaudacao()`/`tocarSaudacao()` greet once per session after login through `criarNarrador(..., { clipes })`; without recordings the drawn text is read by the browser voice. Lines never contain the user's name; lines that say "Maviz" are used only while the assistant keeps the default name. Changing a line's text requires a new id.

## Visual design

- Dark "painel de bordo" theme, single family (Sora, self-hosted via @fontsource). Tokens in `:root` of `src/estilo.css` (entradas = `--entrada` mint, saídas = `--saida` coral, brand gradient cyan→violet). The one bold element is the Resumo orbit ring; keep other screens quiet (glass panels, thin borders). Mobile: bottom dock + drawer; desktop: fixed left rail (≥1000px). No emoji in buttons/nav; emoji only as category icons.
- **Theme colors:** never hardcode the accent (`rgba(79,209,255,…)`, `rgba(139,123,255,…)`) or the lavender lines/glass. Use `var(--ciano)`, `var(--plasma)`, `var(--tinta)` (theme-tinted neutral), with `color-mix(in srgb, var(--x) N%, transparent)` for alpha, so `html[data-tema]` (profile theme, `src/v1.css`) reaches every screen.
- **Device preferences** (`src/lib/aparencia.js`, localStorage `cf.aparencia`, applied before login): font (lazy `import()` per @fontsource font, sets `--fonte` via CSSOM), HUD color (`--holo/--gelo`; "auto" follows the month's campaign), HUD tone (`tomHud` vibrante | mono | suave → `html[data-tema-hud]`; `v11.css` derives `--ciano/--plasma` and tinted `--abismo/--abismo-2` from `--holo` with OKLCH relative colors, color-mix fallback; overrides the profile theme on that device) and collapsed rail (`html.menu-recolhido`, desktop only).
- **Login/invite HUD** (`src/telas/hud.js` + `src/hud.css`, which uses only `--holo/--gelo` through `color-mix`): concentric SVG rings rotated with CSS, live clock, typed greeting, "acesso autorizado" sequence (`hud.liberar(nome)`). Pure SVG/CSS, no WebGL; tear down with `fecharTelaEntrada()`.
- **Icons:** `src/assets/icons/icones.svg` sprite (`cat-*`, `conta-*`, `ui-*`) via `icone(id)`; a category icon `svg:cat-x` renders the vector, anything else is an emoji. SVG assets must not be inlined (`assetsInlineLimit`). The global `svg { width/height: 22px }` rule applies everywhere — large SVGs must override both. App icon source: `docs/marca/icone.svg`; PNGs in `public/icons` are rendered from it (any and maskable share the art, inside the 80% safe zone).

## Deploy

`.github/workflows/deploy.yml` runs tests + build on push to `main` and publishes `dist/` to GitHub Pages (repo `controle-financeiro-pwa`, `VITE_BASE_PATH=/<repo>/`). `VITE_SUPABASE_URL/KEY` come from repo secrets (publishable key only); the job fails if an `sb_secret_…` key shows up in the build.
