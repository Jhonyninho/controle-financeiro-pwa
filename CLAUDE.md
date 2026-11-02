# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal finance PWA ("Controle Financeiro"), pt-BR. Code identifiers, UI text, SQL names and commit messages are in Portuguese — keep it that way. Always reply to the user in Brazilian Portuguese.

The project is **mid-migration** from Google Sheets + Apps Script (now in `legacy/`, reference only, do not extend) to **Supabase (Postgres + Auth + RLS) + Vite vanilla JS**, hosted on GitHub Pages. Access is **invite-only** (signups disabled in Supabase; owner invites via dashboard).

## Commands

```bash
npm run dev                         # Vite dev server (needs .env.local, see .env.example)
npm run build                       # production build to dist/ (CSP injected only here)
npm test                            # Vitest, all tests
npx vitest run tests/leitor.test.js # single file
npx vitest run -t "parseValor"      # tests matching a name
```

Database changes: add a new file in `supabase/migrations/` (never edit an applied one). Setup/run steps for the owner are in `docs/SETUP-SUPABASE.md`.

## Architecture

- **No custom backend.** The browser talks to Supabase directly with the public (publishable/anon) key. Security relies entirely on Postgres RLS: every table has `user_id default auth.uid()` and policies `(select auth.uid()) = user_id`; `anon` has no grants. Cross-user references are blocked by **composite foreign keys `(x_id, user_id)`** — any new table referencing another must follow that pattern. Never use the service_role/secret key in `src/` (`src/lib/supabase.js` refuses it).
- **Auth links** (invite, password reset) arrive as `?token_hash=…&type=invite|recovery` (custom email templates) and are handled by `validarLinkDoEmail()`; `detectSessionInUrl` is off on purpose.
- **XSS policy:** never assign `innerHTML` directly. Build markup with the `html` tagged template and write it with `renderizar()` (`src/lib/html.js`), which escapes every interpolated value. Imported statement descriptions are untrusted input. Production builds add a strict CSP (`vite.config.js`: no inline scripts/styles, `connect-src` limited to the Supabase origin), so no inline `<script>`/`style=""`/event-handler attributes.
- **Data model** (`supabase/migrations/`): `contas`, `categorias`, `lancamentos`, `importacoes`, `regras_classificacao`, `perfis`.
  - A **conta** (tipo CORRENTE/DIGITAL/POUPANCA/CARTEIRA/INVESTIMENTO) owns its payment methods (`tem_debito/tem_credito/tem_pix/tem_ted`); the credit card is NOT a separate account — `dia_fechamento/dia_vencimento/limite_credito` live on the account. Allowed `forma_pagamento` per account: `meiosDaConta()` in `src/estado.js`.
  - `lancamentos`: realized and future in one table (`status` REALIZADO/PREVISTO); `data` is `date`; `valor` is positive `numeric`, sign carried by `tipo` ENTRADA/SAIDA. A DB trigger sets `fatura_mes` (1st day of the **due-date** month) when `forma_pagamento = 'Crédito'`; the same rule is mirrored in JS as `mesDaFatura()` (`src/lib/calculos.js`) — keep both in sync (SQL `calcular_fatura_mes`, migration 0005). Credit purchases don't move the account balance; they sum into the bill.
  - `categorias`: flat categoria+subcategoria with `icone`, `cor` (palette key, see `CORES`/`.cor-*` CSS) and `fora_dos_gastos` (transfers, bill payment, investments — excluded from income/expense totals via `categoriasForaDosGastos()`). Defaults come from SQL `semear_categorias()`; keyword rules in `REGRAS_PADRAO` reference those names.
- **Dates/money in JS:** dates are `'AAAA-MM-DD'` strings end to end (no `Date` objects, avoids UTC shifts); parse/format only through `src/lib/formatos.js`.

### Balances

`contas.saldo_inicial` is the balance at the END of `saldo_inicial_data`. SQL `saldo_contas_em(date)` (migration 0007) = saldo_inicial + realized movements after that date, excluding `forma_pagamento = 'Crédito'` (card purchases hit the bill; the bill payment is what leaves the account). Monthly roll-forward per account and consolidated is `saldosMensais()` in `calculos.js` (opening balance from the RPC at day before the period). Own-account transfers count in account balances but are excluded from income/expense totals.

Salary routed from a conta-salário arrives as a transfer from the user's own name with no counterpart; the import preview (and Relatórios → Transferências) asks the user via `perguntarSalario` and can save a rule — rules outrank transfer detection, so later imports classify it as Salário automatically.

### Fixed expenses, series and analysis (v1.0, migration 0008)

- **Fixa x variável:** `categorias.fixa` is the default per subcategory (seeded by `eh_fixa_padrao()` + insert trigger); `lancamentos.despesa_fixa` overrides it (null = follow category). Always decide through `ehFixa()` (`src/lib/analise.js`).
- **Series:** `serie_id/serie_tipo` (PARCELA | FIXA) + `parcela_atual/parcela_total` link generated PREVISTO rows. Installments: `gerarParcelas` / `abrirGerarParcelas`; fixed-expense projection: `planejarFixas` (`src/importacao/previstos.js`), offered in Futuros via `src/ui/fixas.js` (the user confirms; nothing is generated silently).
- **Anti-duplicidade previsto→realizado:** on import, `conciliarPrevistos()` matches each row to a PREVISTO of the same account/type (date ±7 days; equal value + a shared word, or ±15% value + same description); after the RPC the matched PREVISTO rows are deleted (`excluirPrevistos`, guarded by `status = PREVISTO`).
- **Análise e metas** (`src/telas/analise.js`, pure logic in `src/lib/analise.js`): month-over-month by category and payment method, alerts that evaluate variable categories vs the 3-month average separately from fixed costs, goal simulator (`metas` table, RLS like the others), 50/30/20.
- **Gemini** (`src/servicos/ia.js`): the user's own API key lives only in localStorage (never in the DB); client-side rate limit (per minute/day, sliding window); the payload from `montarPayloadIA()` is aggregates + sanitized category names only — never descriptions, account names or person names. Response is forced to a JSON schema and rendered escaped. CSP `connect-src` allows `generativelanguage.googleapis.com`.
- **Resumo** has two views (Fluxo = entradas x saídas; Patrimônio = sum of real account balances, segmented ring, minus card bills still to come). Category rows in Resumo/Relatórios/Análise open `abrirDetalheCategoria` (drill-down).
- **Configurações** (`src/telas/configuracoes.js`) is the hub for Contas and Categorias (routes with `grupo: 'configuracoes'`), profile photo (192px WebP data URL in `perfis.avatar`, CHECK-limited), theme (`perfis.tema`, applied as `html[data-tema]` overriding `--ciano/--plasma`, see `src/v1.css`) and the Gemini key.
- **Icons:** `src/assets/icons/icones.svg` sprite (`cat-*`, `conta-*`, `ui-*`), used via `icone(id)`; a category icon `svg:cat-x` renders the vector, anything else is an emoji. SVG assets must not be inlined (`assetsInlineLimit` in vite.config.js).
- **Version:** single source is `package.json` → `__VERSAO__` (vite define) → `src/lib/versao.js`; also bump the cache name in `public/sw.js`.

### v1.1: home, appearance, campaigns and voice

- **Resumo is the home** (layout "C" from `Modelos Visuais Gerados/`, prototypes only, not app code): greeting + clock, day notices, orbit (Fluxo/Patrimônio) beside full-color account cards (`.cartao` tinted by `--banco` from the account `skin`), shortcuts with live counts, top spending and upcoming bills with "Paguei" (`confirmarPagamento` exported from `futuros.js`). Styles in `src/v11.css`.
- Desktop home is 3 columns (orbit | wallet | shortcuts) at ≥1360px. Account cards on the home are a **wallet stack** (`src/ui/carteira.js`: collapsed strips, drag down / handle to open, tap brings a card to the front; positions via `style.transform`).
- **Futuros, Relatórios and Análise** use folder tabs (`.abas-pasta` / `.guias-pasta` in `v11.css`) with optional counters (`contador`, `alerta` on each guia).
- **Device preferences** (`src/lib/aparencia.js`, localStorage `cf.aparencia`, applied before login): font (self-hosted @fontsource, lazy `import()` per font, sets `--fonte` via CSSOM), HUD color (`--holo/--gelo`; `hud.css` uses only these vars through `color-mix`; "auto" follows the month's campaign) and collapsed rail (`html.menu-recolhido`, desktop only).
- **Campaigns/holidays** (`src/lib/campanhas.js`, pure, tested): monthly awareness campaigns, national holidays incl. Easter-based ones, money dates (IPVA, IR, 13º, Black Friday). `avisosDoDia(hoje)` feeds the Resumo banners; dismissed keys in `cf.avisosFechados`.
- **Voice** (`src/servicos/voz.js`): narrates the AI diagnosis with a live caption. Engines: Web Speech (`speechSynthesis`, free) or Gemini TTS (same user key, counts toward the IA rate limit, PCM decoded and played through Web Audio so no `media-src`/blob is needed; optional "HUD" filter chain). Falls back to the browser voice on quota errors. No cloning of real people's voices. Gemini text is split by `blocosDeFala()` (short first chunk, ≤4 requests, one counted use) and the chunks are scheduled back to back on one AudioContext, so speech starts in seconds. `falarSaudacao()` greets once per session after login ("Bom dia, Nome! …"); its neural audio is cached in IndexedDB (`cf-voz`) so it is generated only once per text.
- **Own assistant persona** (default name `Vega`, `configVoz().assistente/estilo/efeito`): original character, never an imitation of a real person or film character. `estilo: 'assistente'` sends `instrucaoDeFala()` (delivery instructions) with the Gemini TTS text, adds `promptSistema(nome)` personality to the diagnosis (assistant name only, never the user's), and greets as "Boa noite, Nome. Aqui é Vega, …" with a synthesized boot chime (`vinheta`). `efeito` levels: `assistente` (`cadeiaAssistente`: EQ, comb echo, light ring modulation, short generated room reverb, played 5% slower), `sutil`, `desligado`.

- **HUD tones:** `aparencia.tomHud` (vibrante | mono | suave, device-level, listed in the theme modal) sets `html[data-tema-hud]`; `v11.css` derives `--ciano/--plasma` and a tinted `--abismo/--abismo-2` from `--holo` with OKLCH relative colors (color-mix fallback). It overrides the profile theme on that device.
- **Theme colors:** never hardcode the accent (`rgba(79,209,255,…)`, `rgba(139,123,255,…)`) or the lavender lines/glass. Use `var(--ciano)`, `var(--plasma)` and `var(--tinta)` (theme-tinted neutral), with `color-mix(in srgb, var(--x) N%, transparent)` for alpha, so `html[data-tema]` reaches every screen.

### v1.2: deploy, install and account security (migration 0009)

- **Deploy:** `.github/workflows/deploy.yml` runs tests + build on push to `main` and publishes `dist/` to GitHub Pages (repo `controle-financeiro-pwa`, `VITE_BASE_PATH=/<repo>/`). `VITE_SUPABASE_URL/KEY` come from repo secrets (publishable key only); the job fails if an `sb_secret_…` key shows up in the build. Owner steps in `docs/PUBLICAR.md`. The repo is public: never commit real names, statements or keys (tests use the fictitious "Rafael Augusto da Conceição Moreira").
- **Install (PWA):** `src/ui/instalar.js` keeps the `beforeinstallprompt` event (Android/Chromium) for an "Instalar" button; iOS gets step-by-step instructions. Offered as a dismissible home notice (key `instalar-app`) on phones and as a card in Configurações. Manifest has any + maskable icons and shortcuts; iOS uses the `apple-*` metas and `apple-touch-icon.png`.
- **2FA (TOTP):** `src/servicos/seguranca.js` wraps `supabase.auth.mfa`. After password login, or at startup with a saved session, `nivelDaSessao().precisaCodigo` routes to `mostrarCodigo()` (`telas/auth.js`) before `entrarNoApp`. Enforced server-side: migration 0009 adds a RESTRICTIVE `*_exige_mfa` policy on every table using `privado.sessao_mfa_ok()` (aal2 required only for users with a verified factor). **New tables must get the same restrictive policy.** Configurações also has Trocar senha and Sair de todos os aparelhos (`signOut({ scope: 'global' })`).
- **Clickjacking:** Pages can't send `frame-ancestors`, so `main.js` refuses to run inside any iframe in production.

### Visual design

Dark "painel de bordo" theme, single family (Sora, self-hosted via @fontsource — CSP forbids external fonts). Tokens live in `:root` of `src/estilo.css` (entradas = `--entrada` mint, saídas = `--saida` coral, brand gradient cyan→violet). The one bold element is the Resumo orbit ring; keep other screens quiet (glass panels, thin borders). Mobile uses a bottom dock + drawer; desktop a fixed left rail (≥1000px). No emoji in buttons/nav (SVG sprite in `index.html`); emoji only as category icons.

The login/invite screens use a holographic HUD (`src/telas/hud.js` markup + `src/hud.css`): concentric SVG rings rotated with CSS, live clock, typed greeting, and an "acesso autorizado" sequence (`hud.liberar(nome)`) before entering the app. Pure SVG/CSS, no WebGL; tear down with `fecharTelaEntrada()`. The global `svg { width/height: 22px }` icon rule applies everywhere — large SVGs must override both width and height.

### Frontend structure

- `src/main.js` — auth bootstrap, hash router (`#/<rota>`), month selector, 30-min idle logout. Each route is a module in `src/telas/` exporting `{ titulo, usaMes, montar(el) }`. The router creates a **fresh container element per navigation**, so screens attach listeners to `el` (event delegation via `data-acao`) and never to `#conteudo`/`document`. To reload the current screen from inside it, re-fetch and re-render a sub-area, or dispatch `hashchange` — never call `montar(el)` again on the same element (duplicates listeners).
- `src/servicos/api.js` — the only place that calls Supabase; whitelists writable columns (`apenas()`), paginates past the 1000-row limit (`todos()`), and maps Postgres errors to pt-BR messages (`ErroApi`).
- `src/estado.js` — reference data loaded once after login (perfil, contas, categorias, selected month) plus lookup helpers.
- `src/ui/combo.js` — searchable category combobox (`campoCategoria`); value lives in a hidden input that fires a bubbling `change`, so it drops in where a <select> was. Use it instead of long category <select>s.
- `src/ui/componentes.js` — `<dialog>` modals (`abrirModal`, `confirmar`), toasts, `<select>` option builders.
- `src/lib/calculos.js` — pure aggregations (sums in integer cents). Credit-card accounts are summarized by `fatura_mes` (set by DB trigger, migration 0004), other accounts by `data`.

### Statement import (core feature)

Only `.xlsx/.xls/.csv` in the app's own template — bank-specific formats are intentionally not supported. The user downloads the template (generated with their categories + an AI prompt, `src/importacao/modelo.js`), has an external AI fill it from their bank statement, and imports it. Pipeline, all client-side:

1. `leitor.js` — read file (SheetJS; CSV with UTF-8→Windows-1252 fallback and delimiter detection), locate header by column aliases, validate per row (errors don't abort the file), skip balance lines, compute a SHA-256 dedup hash (`data|valor|tipo|descrição normalizada|occurrence n`).
2. `classificador.js` — category priority: sheet value → user rules → history (same description without numbers) → `REGRAS_PADRAO` keywords → unclassified.
2b. Choosing a category for a row (import preview) or editing a saved entry's category opens `abrirReplicarCategoria` (`src/ui/replicar.js`): lists entries with the same `chaveDescricao` + `tipo` for bulk apply, and can save a rule so future imports auto-classify.
2c. Transfers between the user's own accounts (`src/importacao/transferencias.js`): `mencionaTitular()` matches `perfis.nome_completo` in the description (abbreviations allowed), and `encontrarPares()` matches same value / opposite type / ≤3 days in another account; both sides get "Transferências › Entre minhas contas" (fora dos gastos). Takes precedence over keyword/history suggestions but not over sheet/user rules.
3. RPC `importar_lancamentos(conta, arquivo, itens jsonb)` inserts in one transaction (SECURITY INVOKER, so RLS applies) and silently skips duplicates via the partial unique index on `hash_import`. Deleting an `importacoes` row cascades to its lançamentos ("undo import").

SheetJS is installed from `cdn.sheetjs.com` (the npm registry version is outdated and vulnerable) — don't replace it with `npm i xlsx`.

## Private data

`extratos/` and all `*.xlsx/*.csv/*.pdf` are real bank data and are gitignored. Test fixtures must be synthetic and built inside tests (`tests/`), never copied from real statements.
