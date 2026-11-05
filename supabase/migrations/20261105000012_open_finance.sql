-- =====================================================================
--  Open Finance (Pluggy): conexões bancárias e fila de transações
--
--  O navegador nunca fala com a Pluggy com credenciais: quem grava aqui
--  são as Edge Functions (supabase/functions/of-*), com a chave de serviço
--  guardada só no servidor. O cliente apenas lê, escolhe a conta do app
--  para cada conta externa, marca transações como importadas/ignoradas e
--  pode apagar uma conexão.
--
--  Liberação por usuário (fase de testes): só o dono do projeto libera,
--  pelo SQL Editor:
--    insert into privado.open_finance_liberado (user_id)
--    select id from auth.users where email = 'seu-email@exemplo.com';
-- =====================================================================

-- ---------------------------------------------------------------------
-- Quem pode usar (fora da API: o usuário não consegue se liberar)
-- ---------------------------------------------------------------------
create table if not exists privado.open_finance_liberado (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  criado_em  timestamptz not null default now()
);
revoke all on privado.open_finance_liberado from public, anon, authenticated;

-- O app pergunta se o usuário atual está liberado (só responde sobre si mesmo)
create or replace function public.open_finance_liberado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.open_finance_liberado l where l.user_id = (select auth.uid()));
$$;
revoke execute on function public.open_finance_liberado() from public, anon;
grant  execute on function public.open_finance_liberado() to authenticated;

-- ---------------------------------------------------------------------
-- Conexões (um "item" da Pluggy = um login num banco)
-- ---------------------------------------------------------------------
create table public.conexoes_bancarias (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id               text not null unique check (char_length(item_id) between 1 and 100),
  instituicao           text not null default '' check (char_length(instituicao) <= 100),
  status                text not null default 'ATUALIZANDO'
                        check (status in ('ATUALIZADO', 'ATUALIZANDO', 'LOGIN_NECESSARIO', 'ERRO')),
  ultima_sincronizacao  timestamptz,
  criado_em             timestamptz not null default now(),
  unique (id, user_id)
);
create index conexoes_bancarias_user_idx on public.conexoes_bancarias (user_id);

-- ---------------------------------------------------------------------
-- Contas dentro de cada conexão, ligadas (ou não) a uma conta do app
-- ---------------------------------------------------------------------
create table public.contas_externas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conexao_id  uuid not null,
  account_id  text not null check (char_length(account_id) between 1 and 100),
  nome        text not null default '' check (char_length(nome) <= 120),
  tipo        text not null check (tipo in ('BANK', 'CREDIT')),
  saldo       numeric(14, 2),
  conta_id    uuid,
  unique (id, user_id),
  unique (conexao_id, account_id),
  foreign key (conexao_id, user_id) references public.conexoes_bancarias (id, user_id) on delete cascade,
  foreign key (conta_id, user_id)   references public.contas (id, user_id) on delete set null (conta_id)
);
create index contas_externas_user_idx on public.contas_externas (user_id);
create index contas_externas_conta_idx on public.contas_externas (conta_id);

-- ---------------------------------------------------------------------
-- Fila: transações trazidas do banco, aguardando a prévia da importação
-- ---------------------------------------------------------------------
create table public.transacoes_pendentes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conta_externa_id  uuid not null,
  transacao_id      text not null check (char_length(transacao_id) between 1 and 100),
  data              date not null,
  valor             numeric(14, 2) not null check (valor > 0 and valor < 1000000000),
  tipo              public.tipo_lancamento not null,
  descricao         text not null default '' check (char_length(descricao) <= 200),
  forma_pagamento   text check (forma_pagamento in ('Pix', 'Débito', 'Crédito', 'Dinheiro', 'TED', 'Boleto', 'Outro')),
  situacao          text not null default 'PENDENTE' check (situacao in ('PENDENTE', 'IMPORTADA', 'IGNORADA')),
  criado_em         timestamptz not null default now(),
  unique (user_id, transacao_id),
  foreign key (conta_externa_id, user_id) references public.contas_externas (id, user_id) on delete cascade
);
create index transacoes_pendentes_fila_idx on public.transacoes_pendentes (user_id, situacao, data);

-- ---------------------------------------------------------------------
-- Segurança: RLS de dono + 2FA restritivo; insert só pelo servidor
-- ---------------------------------------------------------------------
alter table public.conexoes_bancarias   enable row level security;
alter table public.contas_externas      enable row level security;
alter table public.transacoes_pendentes enable row level security;

revoke all on public.conexoes_bancarias, public.contas_externas, public.transacoes_pendentes from anon, authenticated;
grant select, delete            on public.conexoes_bancarias   to authenticated;
grant select                    on public.contas_externas      to authenticated;
grant update (conta_id)         on public.contas_externas      to authenticated;
grant select, delete            on public.transacoes_pendentes to authenticated;
grant update (situacao)         on public.transacoes_pendentes to authenticated;

do $$
declare t text;
begin
  foreach t in array array['conexoes_bancarias', 'contas_externas', 'transacoes_pendentes'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using ((select privado.sessao_mfa_ok())) with check ((select privado.sessao_mfa_ok()))',
      t || '_exige_mfa', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tg_bloquear_troca_user_id()',
      t || '_user_id_fixo', t);
  end loop;
end;
$$;
