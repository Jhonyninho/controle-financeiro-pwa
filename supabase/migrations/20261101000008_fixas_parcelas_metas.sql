-- =====================================================================
--  0008 — DESPESAS FIXAS, PARCELAMENTOS/SÉRIES, METAS E PREFERÊNCIAS
-- =====================================================================

-- ---------------------------------------------------------------------
-- Despesa fixa x variável
--   categorias.fixa: padrão da subcategoria (Aluguel, Condomínio, Internet…)
--   lancamentos.despesa_fixa: exceção por lançamento (null = segue a categoria)
-- ---------------------------------------------------------------------
alter table public.categorias add column if not exists fixa boolean not null default false;
alter table public.lancamentos add column if not exists despesa_fixa boolean;

create or replace function public.eh_fixa_padrao(p_nome text, p_sub text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_nome, coalesce(p_sub, '')) in (
    ('Moradia', 'Aluguel'), ('Moradia', 'Condomínio'), ('Moradia', 'Internet e TV'), ('Moradia', 'IPTU'),
    ('Moradia', 'Energia elétrica'), ('Moradia', 'Água'), ('Moradia', 'Gás'),
    ('Saúde', 'Plano de saúde'), ('Saúde', 'Academia'),
    ('Educação', 'Escola e faculdade'), ('Educação', 'Cursos'),
    ('Assinaturas', 'Streaming'), ('Assinaturas', 'Apps e software'), ('Assinaturas', 'Celular'),
    ('Assinaturas', 'Clubes e associações'),
    ('Dívidas e empréstimos', 'Empréstimo'), ('Dívidas e empréstimos', 'Financiamento'),
    ('Dívidas e empréstimos', 'Acordos e parcelamentos')
  );
$$;

-- marca as categorias padrão já existentes
update public.categorias set fixa = true
 where tipo = 'SAIDA' and public.eh_fixa_padrao(nome, subcategoria);

-- novas contas (semear_categorias) já nascem com as fixas marcadas
create or replace function public.tg_categoria_fixa_padrao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo = 'SAIDA' and not new.fixa and public.eh_fixa_padrao(new.nome, new.subcategoria) then
    new.fixa := true;
  end if;
  return new;
end;
$$;

drop trigger if exists categorias_fixa_padrao on public.categorias;
create trigger categorias_fixa_padrao
  before insert on public.categorias
  for each row execute function public.tg_categoria_fixa_padrao();

-- ---------------------------------------------------------------------
-- Séries de lançamentos futuros (parcelas e despesas fixas replicadas)
-- ---------------------------------------------------------------------
alter table public.lancamentos
  add column if not exists serie_id      uuid,
  add column if not exists serie_tipo    text,
  add column if not exists parcela_atual smallint,
  add column if not exists parcela_total smallint;

alter table public.lancamentos drop constraint if exists lancamentos_serie_tipo_check;
alter table public.lancamentos add constraint lancamentos_serie_tipo_check
  check (serie_tipo is null or serie_tipo in ('PARCELA', 'FIXA'));

alter table public.lancamentos drop constraint if exists lancamentos_parcelas_check;
alter table public.lancamentos add constraint lancamentos_parcelas_check
  check (
    (parcela_atual is null and parcela_total is null)
    or (parcela_total between 2 and 420 and parcela_atual between 1 and parcela_total)
  );

create index if not exists lancamentos_serie_idx on public.lancamentos (user_id, serie_id) where serie_id is not null;
create index if not exists lancamentos_previstos_idx on public.lancamentos (user_id, conta_id, data) where status = 'PREVISTO';

-- ---------------------------------------------------------------------
-- Metas de economia
-- ---------------------------------------------------------------------
create table if not exists public.metas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome           text not null check (char_length(btrim(nome)) between 1 and 80),
  valor_alvo     numeric(14, 2) not null check (valor_alvo > 0 and valor_alvo < 1000000000),
  valor_guardado numeric(14, 2) not null default 0 check (valor_guardado >= 0 and valor_guardado < 1000000000),
  prazo_meses    smallint not null check (prazo_meses between 1 and 600),
  inicio         date not null default current_date,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

alter table public.metas enable row level security;
revoke all on public.metas from anon;

drop policy if exists metas_select on public.metas;
drop policy if exists metas_insert on public.metas;
drop policy if exists metas_update on public.metas;
drop policy if exists metas_delete on public.metas;
create policy metas_select on public.metas for select to authenticated using ((select auth.uid()) = user_id);
create policy metas_insert on public.metas for insert to authenticated with check ((select auth.uid()) = user_id);
create policy metas_update on public.metas for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy metas_delete on public.metas for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.metas to authenticated;

drop trigger if exists metas_atualizado_em on public.metas;
create trigger metas_atualizado_em
  before update on public.metas
  for each row execute function public.tg_set_atualizado_em();

drop trigger if exists metas_user_id_fixo on public.metas;
create trigger metas_user_id_fixo
  before update on public.metas
  for each row execute function public.tg_bloquear_troca_user_id();

-- ---------------------------------------------------------------------
-- Preferências do perfil: tema do app e foto (imagem pequena em data URL)
-- ---------------------------------------------------------------------
alter table public.perfis
  add column if not exists tema   text not null default 'aurora',
  add column if not exists avatar text;

alter table public.perfis drop constraint if exists perfis_tema_check;
alter table public.perfis add constraint perfis_tema_check
  check (tema in ('aurora', 'esmeralda', 'solar', 'magenta', 'gelo'));

alter table public.perfis drop constraint if exists perfis_avatar_check;
alter table public.perfis add constraint perfis_avatar_check
  check (
    avatar is null
    or (char_length(avatar) <= 150000 and avatar ~ '^data:image/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$')
  );
