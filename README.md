# Controle Financeiro

App pessoal de controle financeiro (PWA), em português, instalável no celular.

- **Contas e cartões**: saldo por conta, fatura do cartão pelo mês de vencimento, carteira de cartões na tela inicial.
- **Lançamentos**: realizados e futuros (parcelas, despesas fixas), com "Paguei" nos vencimentos.
- **Importação de extrato**: modelo próprio (.xlsx/.csv) preenchido por IA, classificação automática por regras e histórico, detecção de transferências entre as próprias contas e de duplicados.
- **Relatórios e análise**: fluxo, patrimônio, comparação mês a mês, metas, 50/30/20 e diagnóstico com IA (Gemini, com a chave do próprio usuário), lido em voz pela assistente Vega.
- **Segurança**: acesso só por convite, dados isolados por usuário no banco (RLS), verificação em duas etapas opcional exigida pelo próprio banco, CSP estrita.

## Tecnologia
Vite + JavaScript puro, Supabase (Postgres + Auth + RLS), publicado no GitHub Pages. Sem servidor próprio.

## Rodar localmente
```bash
npm install
cp .env.example .env.local   # preencha com a URL e a chave publishable do Supabase
npm run dev
npm test
```

## Documentação
- [docs/SETUP-SUPABASE.md](docs/SETUP-SUPABASE.md): banco, autenticação, convites e segurança das contas.
- [docs/PUBLICAR.md](docs/PUBLICAR.md): publicar no GitHub Pages e instalar no celular.

`legacy/` guarda a versão antiga em Google Sheets + Apps Script, só como referência.
