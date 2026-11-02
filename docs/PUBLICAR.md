# Publicar o app e instalar no celular

O app é publicado de graça no **GitHub Pages** (HTTPS), e de lá qualquer pessoa convidada instala no celular como um aplicativo (PWA). Não passa por Play Store nem App Store.

## 1. Criar o repositório (uma vez)
1. Em https://github.com/new crie o repositório `controle-financeiro-pwa`.
   - **Público**: obrigatório para usar o GitHub Pages no plano gratuito. Não há dados pessoais no código: extratos, planilhas, `.env.local` e `Dados para ajustes/` estão no `.gitignore`.
   - Não marque "Add a README" (o repositório precisa nascer vazio).
2. No PC, na pasta do projeto:
   ```bash
   git remote add origin https://github.com/jhonyninho/controle-financeiro-pwa.git
   git push -u origin main
   ```
   Na primeira vez o Windows abre o navegador para você entrar na conta do GitHub.

## 2. Configurar o deploy (uma vez)
No repositório, no GitHub:
1. **Settings → Secrets and variables → Actions → New repository secret**, crie:
   - `VITE_SUPABASE_URL` = `https://SEU-PROJETO.supabase.co`
   - `VITE_SUPABASE_KEY` = a chave **publishable** (`sb_publishable_…`). **Nunca** a secret.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions → Publicar no GitHub Pages → Run workflow** (ou faça qualquer push na `main`).

O workflow (`.github/workflows/deploy.yml`) roda os testes, gera o build com o caminho `/controle-financeiro-pwa/`, confere que nenhuma chave secreta entrou no build e publica. O endereço fica:

```
https://jhonyninho.github.io/controle-financeiro-pwa/
```

3. No Supabase, coloque esse endereço em **Authentication → URL Configuration** (Site URL e Redirect URLs, veja `SETUP-SUPABASE.md`), senão os links de convite e de redefinir senha voltam para o lugar errado.

## 3. Atualizar o app
Cada `git push` na `main` publica sozinho em 1 a 2 minutos. Ao lançar uma versão, suba o número em `package.json` e o nome do cache em `public/sw.js`. Quem já tem o app instalado recebe a versão nova na próxima vez que abrir com internet.

## 4. Instalar no celular
Abra o endereço do app no celular e entre com seu e-mail e senha.

**Android (Chrome, Edge, Samsung Internet):**
- na tela inicial do app aparece o aviso **"Instale o app no celular" → Instalar**; ou
- **Configurações → Instalar o app**; ou
- menu **⋮ → Instalar app / Adicionar à tela inicial**.

**iPhone / iPad (Safari, ou Chrome no iOS 16.4+):**
1. Toque em **Compartilhar** (quadrado com seta para cima).
2. **Adicionar à Tela de Início → Adicionar**.

O ícone **Financeiro** aparece na tela de início e o app abre em tela cheia. Segure o ícone (Android) para atalhos de Lançamentos, Futuros e Importar extrato.

**Computador:** ícone de instalar na barra de endereço do Chrome/Edge.

> Os dados financeiros nunca ficam guardados no aparelho: o app instalado só guarda a interface (para abrir rápido) e busca os dados no Supabase a cada uso. Sem internet ele abre, mas não mostra dados.
