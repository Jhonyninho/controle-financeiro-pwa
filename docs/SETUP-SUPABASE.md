# Configuração do Supabase (passo a passo)

## 1. Criar o projeto
1. Crie uma conta em https://supabase.com (plano Free).
2. **New project** → nome `controle-financeiro`, região **South America (São Paulo)**, gere uma senha forte para o banco e guarde num gerenciador de senhas.

## 2. Criar as tabelas
No painel: **SQL Editor** → **New query**. Cole e rode, **nesta ordem**, o conteúdo de cada arquivo de `supabase/migrations/`:

| Arquivo | O que faz |
|---|---|
| `…0001_schema.sql` | tabelas (perfis, contas, categorias, importações, lançamentos, regras) |
| `…0002_seguranca_rls.sql` | RLS: cada usuário só enxerga os próprios dados |
| `…0003_funcoes.sql` | dados iniciais do usuário e importação de extrato |
| `…0004_fatura_cartao.sql` | mês da fatura do cartão |
| `…0005_meios_pagamento_categorias.sql` | meios de pagamento por conta, categorias padrão |
| `…0006_nome_titular.sql` | nome completo do titular (transferências entre contas) |
| `…0007_saldos_por_conta.sql` | saldo de cada conta numa data |
| `…0008_fixas_parcelas_metas.sql` | despesas fixas, parcelas e metas |
| `…0009_mfa_obrigatorio.sql` | o banco exige o código da verificação em duas etapas de quem a ativou |

Nunca edite um arquivo que já foi rodado: mudanças novas vão num arquivo novo com o próximo número.

Depois confira em **Advisors → Security Advisor** que não há alertas.

## 3. Autenticação só por convite
Em **Authentication**:
- **Sign In / Providers → Email**: deixe ligado. Em **User Signups**, **desligue "Allow new users to sign up"**. Assim ninguém cria conta sozinho.
- **Sign In / Providers → Email**: senha mínima **10 caracteres**, exigindo letras e números (o app exige o mesmo).
- **Multi-Factor (MFA)**: deixe **TOTP (App Authenticator)** ativado (já vem ligado). É o que permite a verificação em duas etapas em Configurações.
- **Rate Limits**: os padrões já limitam tentativas de login; não aumente.
- **URL Configuration** (é para cá que os links dos e-mails levam):
  - *Site URL*: o endereço publicado, ex.: `https://jhonyninho.github.io/controle-financeiro-pwa/`. Enquanto testa só no PC, `http://localhost:5173/`.
  - *Redirect URLs*: adicione os dois: `http://localhost:5173/**` e `https://jhonyninho.github.io/controle-financeiro-pwa/**`.
- **Emails → Templates**: **não precisa mexer.** O app funciona com os modelos padrão (em inglês) de *Invite user* e *Reset password*.
  - Opcional: para personalizar o texto em português é necessário configurar um SMTP próprio (veja a seção 8).

> O e-mail embutido do Supabase envia poucos e-mails por hora, o suficiente para convites pessoais.
> O link de **redefinir senha** precisa ser aberto **no mesmo navegador** em que a pessoa clicou em "Esqueci minha senha".

## 4. Convidar alguém
**Authentication → Users → Add user → Send invitation**, informe o e-mail. A pessoa recebe o link, define a senha no app e já entra com as categorias padrão criadas.

Para remover o acesso: **Users → (usuário) → Delete user**. Todos os dados dela são apagados junto (cascade).

## 5. Como as contas de cada usuário ficam protegidas
- **Isolamento no banco (RLS):** toda tabela tem `user_id` e políticas `auth.uid() = user_id`. Um usuário não consegue ler nem alterar dados de outro, mesmo manipulando o app. As chaves estrangeiras são compostas `(id, user_id)`, então também não dá para "apontar" um lançamento para a conta de outra pessoa.
- **Verificação em duas etapas (opcional, recomendada):** em **Configurações → Verificação em duas etapas** cada usuário cadastra um app autenticador (Google Authenticator, Microsoft Authenticator, Authy). A partir daí o login pede senha + código, e o **banco** (migration 0009) recusa qualquer leitura/gravação de uma sessão que não passou pelo código.
- **Sair de todos os aparelhos:** em Configurações, encerra a sessão em todo lugar (celular perdido, computador emprestado).
- **Sessão:** sai sozinho após 30 minutos sem uso.
- **Navegador:** CSP estrita (só scripts do próprio site, conexões só com o Supabase e os serviços de IA/voz escolhidos pelo usuário), nada de HTML sem escape, e o app não abre dentro de iframe de outro site.
- **Chaves de IA e voz (Groq, OpenRouter, Gemini, Azure, ElevenLabs):** ficam só no aparelho de cada pessoa, nunca no banco.

**Usuário perdeu o celular com o autenticador:** no painel, **Authentication → Users → (usuário) → Multi-Factor Authentication → remover o fator**. Ou no SQL Editor:
```sql
delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'pessoa@exemplo.com');
```
Depois a pessoa entra só com a senha e cadastra o novo celular.

## 6. Chaves para o app
**Project Settings → API Keys**: copie a **Project URL** e a chave **publishable** (ou "anon") para o `.env.local` (veja `.env.example`) e para os *secrets* do GitHub (veja `docs/PUBLICAR.md`).

**Nunca** use a chave *secret* / *service_role* no app nem a envie ao GitHub. O app se recusa a iniciar com ela e o deploy falha se ela aparecer no build.

## 7. Plano gratuito: cuidados
- Projeto sem acesso por 7 dias é pausado; reative em **Project → Restore** (os dados ficam).
- Não há backup automático no plano Free: exporte periodicamente (exportação CSV das tabelas no **Table Editor** ou `pg_dump`). Guarde os arquivos fora do repositório (CSV está no `.gitignore`).

## 8. (Opcional) E-mails em português com SMTP próprio
Necessário só se quiser editar o texto dos e-mails.
1. Crie uma conta gratuita num serviço de envio (ex.: Resend ou Brevo) e gere as credenciais SMTP.
2. **Authentication → Emails → SMTP Settings**: ative *Custom SMTP* e preencha host, porta, usuário, senha e remetente.
3. Em **Emails → Templates**, edite o texto de *Invite user* e *Reset password* à vontade, **mantendo o link `{{ .ConfirmationURL }}`**.

## 9. (Opcional) Conexão com bancos — Open Finance via Pluggy
Por enquanto, liberada só para quem o dono escolher. O navegador nunca recebe as credenciais da Pluggy: quem fala com ela são as Edge Functions em `supabase/functions/of-*`.

1. **Pluggy:** crie uma conta em dashboard.pluggy.ai e copie o `CLIENT_ID` e o `CLIENT_SECRET` do ambiente de testes.
2. **Banco:** aplique a migração `20261105000012_open_finance.sql` no SQL Editor. Depois, libere o seu usuário:
   ```sql
   insert into privado.open_finance_liberado (user_id)
   select id from auth.users where email = 'seu-email@exemplo.com';
   ```
3. **Supabase CLI** (uma vez): instale, rode `supabase login` e depois `supabase link --project-ref SEU-PROJETO`.
4. **Segredos das funções.** Ficam só no Supabase, nunca no repositório nem em variáveis `VITE_`. Para gerar um segredo longo e aleatório, use `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`.
   ```bash
   supabase secrets set PLUGGY_CLIENT_ID=... PLUGGY_CLIENT_SECRET=... \
     PLUGGY_WEBHOOK_SECRET=<segredo longo e aleatório> \
     APP_ORIGENS=https://SEU-USUARIO.github.io,http://localhost:5173
   ```
5. **Publicar as funções.** O webhook não usa login: ele se protege pelo segredo.
   ```bash
   supabase functions deploy of-token of-conexao of-sincronizar of-desconectar
   supabase functions deploy of-webhook --no-verify-jwt
   ```
6. **Webhook na Pluggy:** cadastre `https://SEU-PROJETO.supabase.co/functions/v1/of-webhook` para os eventos `item/updated`, `item/error`, `item/login_required`, `item/deleted` e `transactions/created`.
   - Envie o segredo no cabeçalho `x-webhook-secret`.
   - Se o painel não aceitar cabeçalhos, acrescente `?chave=<segredo>` ao final da URL.
7. **Bancos de teste:** para o widget mostrar os bancos fictícios da Pluggy, crie a variável `VITE_PLUGGY_SANDBOX=1`.
   - No GitHub: Settings → Secrets and variables → Actions → **Variables**.
   - Localmente: no `.env.local`.

No app, o caminho é **Importar extrato → Bancos conectados → Conectar banco**. Depois de conectar:
- escolha a conta do app para cada conta do banco;
- use **Conferir N nova(s)** para abrir a mesma prévia da planilha.

**Desconectar** encerra o acesso na Pluggy e apaga as transações ainda não importadas. Os lançamentos já importados continuam no app.

**Uso comercial:** liberar para todos exige o ambiente de produção da Pluggy (com contrato e custo por conexão) e uma política de privacidade publicada, porque o app passa a tratar dados bancários (LGPD).
