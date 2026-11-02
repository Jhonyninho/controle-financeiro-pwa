-- =====================================================================
--  CONTROLE FINANCEIRO — SCHEMA
--  Toda tabela tem user_id. Chaves estrangeiras compostas (id, user_id)
--  garantem que um lançamento só referencie conta/categoria do MESMO usuário,
--  mesmo que alguém tente forjar um UUID de outra pessoa.
-- =====================================================================

create type public.tipo_lancamento   as enum ('ENTRADA', 'SAIDA');
create type public.tipo_conta        as enum ('CORRENTE', 'CREDITO', 'CARTEIRA', 'INVESTIMENTO');
create type public.status_lancamento as enum ('REALIZADO', 'PREVISTO');
create type public.origem_regra      as enum ('MANUAL', 'APRENDIDA');

-- ---------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- ---------------------------------------------------------------------
create table public.perfis (
  id        uuid primary key references auth.users (id) on delete cascade,
  nome      text not null default '' check (char_length(nome) <= 80),
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Contas (bancos, cartões, carteiras)
-- ---------------------------------------------------------------------
create table public.contas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome           text not null check (char_length(btrim(nome)) between 1 and 60),
  tipo           public.tipo_conta not null default 'CORRENTE',
  bandeira       text check (char_length(bandeira) <= 30),
  skin           text check (skin ~ '^[a-z0-9-]{0,30}$'),
  dia_fechamento smallint check (dia_fechamento between 1 and 31),
  dia_vencimento smallint check (dia_vencimento between 1 and 31),
  ativo          boolean not null default true,
  mostrar_resumo boolean not null default true,
  ordem          integer not null default 999,
  criado_em      timestamptz not null default now(),
  unique (user_id, nome),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- Categorias (categoria + subcategoria, como no app antigo)
-- ---------------------------------------------------------------------
create table public.categorias (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo         public.tipo_lancamento not null,
  nome         text not null check (char_length(btrim(nome)) between 1 and 60),
  subcategoria text not null default '' check (char_length(subcategoria) <= 60),
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  unique (user_id, tipo, nome, subcategoria),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- Importações (cada planilha importada)
-- ---------------------------------------------------------------------
create table public.importacoes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conta_id       uuid not null,
  arquivo_nome   text not null check (char_length(arquivo_nome) <= 200),
  qtd_importados integer not null default 0,
  qtd_ignorados  integer not null default 0,
  periodo_inicio date,
  periodo_fim    date,
  criado_em      timestamptz not null default now(),
  unique (id, user_id),
  foreign key (conta_id, user_id) references public.contas (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Lançamentos (realizados e previstos/futuros na mesma tabela)
-- ---------------------------------------------------------------------
create table public.lancamentos (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conta_id           uuid not null,
  categoria_id       uuid,
  importacao_id      uuid,
  data               date not null,
  tipo               public.tipo_lancamento not null,
  valor              numeric(14, 2) not null check (valor > 0 and valor < 1000000000),
  descricao          text not null default '' check (char_length(descricao) <= 200),
  descricao_original text check (char_length(descricao_original) <= 300),
  forma_pagamento    text check (forma_pagamento in ('Pix', 'Débito', 'Crédito', 'Dinheiro', 'TED', 'Boleto', 'Outro')),
  status             public.status_lancamento not null default 'REALIZADO',
  fatura_mes         date check (fatura_mes is null or extract(day from fatura_mes) = 1),
  hash_import        text check (char_length(hash_import) <= 64),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  foreign key (conta_id, user_id)      references public.contas (id, user_id) on delete restrict,
  foreign key (categoria_id, user_id)  references public.categorias (id, user_id) on delete set null (categoria_id),
  foreign key (importacao_id, user_id) references public.importacoes (id, user_id) on delete cascade
);

-- Impede importar o mesmo lançamento duas vezes na mesma conta
create unique index lancamentos_dedup_idx
  on public.lancamentos (user_id, conta_id, hash_import)
  where hash_import is not null;

create index lancamentos_user_data_idx on public.lancamentos (user_id, data desc);
create index lancamentos_user_status_idx on public.lancamentos (user_id, status);

-- ---------------------------------------------------------------------
-- Regras de classificação automática
-- ---------------------------------------------------------------------
create table public.regras_classificacao (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  padrao       text not null check (char_length(padrao) between 2 and 100),
  categoria_id uuid not null,
  origem       public.origem_regra not null default 'MANUAL',
  prioridade   integer not null default 100,
  criado_em    timestamptz not null default now(),
  unique (user_id, padrao),
  foreign key (categoria_id, user_id) references public.categorias (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- atualizado_em automático
-- ---------------------------------------------------------------------
create function public.tg_set_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger lancamentos_atualizado_em
  before update on public.lancamentos
  for each row execute function public.tg_set_atualizado_em();

-- user_id nunca pode ser alterado depois de criado
create function public.tg_bloquear_troca_user_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id não pode ser alterado';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['contas', 'categorias', 'importacoes', 'lancamentos', 'regras_classificacao'] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.tg_bloquear_troca_user_id()',
      t || '_user_id_fixo', t
    );
  end loop;
end;
$$;
