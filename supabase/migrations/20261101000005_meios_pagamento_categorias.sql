-- =====================================================================
--  CONTAS COM MEIOS DE PAGAMENTO + NOVAS CATEGORIAS
--
--  * Uma conta (ex.: "Banco do Brasil") reúne seus meios de pagamento:
--    Débito, Crédito, Pix e TED. O cartão de crédito deixa de ser uma conta
--    separada: fechamento/vencimento/limite ficam na própria conta.
--  * Novo tipo: Conta digital (e Poupança). O tipo vira texto com CHECK.
--  * Fatura: compras com forma_pagamento = 'Crédito' recebem fatura_mes =
--    mês do VENCIMENTO da fatura.
--  * Categorias ganham ícone, cor e "fora dos gastos" (transferências,
--    pagamento de fatura e investimentos não contam como despesa).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Meios de pagamento na conta
-- ---------------------------------------------------------------------
alter table public.contas
  add column tem_debito     boolean not null default true,
  add column tem_credito    boolean not null default false,
  add column tem_pix        boolean not null default true,
  add column tem_ted        boolean not null default true,
  add column limite_credito numeric(14, 2) check (limite_credito is null or limite_credito >= 0);

update public.contas set tem_credito = true, tem_debito = false, tem_pix = false, tem_ted = false where tipo = 'CREDITO';
update public.contas set tem_debito = false, tem_pix = false, tem_ted = false where tipo = 'CARTEIRA';

-- Compras já lançadas em contas que eram "cartão de crédito" passam a ser forma Crédito
update public.lancamentos l
   set forma_pagamento = 'Crédito'
  from public.contas c
 where c.id = l.conta_id and c.tipo = 'CREDITO' and l.tipo = 'SAIDA';

-- ---------------------------------------------------------------------
-- 2. Tipo da conta: enum -> texto com CHECK (mais fácil de evoluir)
-- ---------------------------------------------------------------------
drop trigger if exists contas_recalcular_faturas on public.contas;
drop trigger if exists lancamentos_fatura_mes on public.lancamentos;
drop function if exists public.tg_recalcular_faturas_conta();
drop function if exists public.tg_calcular_fatura_mes();

alter table public.contas alter column tipo drop default;
alter table public.contas
  alter column tipo type text
  using (case when tipo::text = 'CREDITO' then 'DIGITAL' else tipo::text end);
alter table public.contas alter column tipo set default 'CORRENTE';
alter table public.contas
  add constraint contas_tipo_check check (tipo in ('CORRENTE', 'DIGITAL', 'POUPANCA', 'CARTEIRA', 'INVESTIMENTO'));
drop type public.tipo_conta;

-- ---------------------------------------------------------------------
-- 3. Fatura do cartão (pelo mês do vencimento)
--    Compra depois do fechamento entra no ciclo seguinte; se o vencimento
--    é num dia <= fechamento, a fatura vence no mês seguinte ao fechamento.
--    Ex.: fecha 25 / vence 5  -> compra 20/10 vence 05/11 -> fatura nov.
--         fecha 3  / vence 10 -> compra 05/10 vence 10/11 -> fatura nov.
-- ---------------------------------------------------------------------
create function public.calcular_fatura_mes(p_data date, p_fechamento smallint, p_vencimento smallint)
returns date
language sql
immutable
set search_path = ''
as $$
  select (
    date_trunc('month', p_data)
    + case when p_fechamento is not null and extract(day from p_data) > p_fechamento
           then interval '1 month' else interval '0 month' end
    + case when p_fechamento is not null and p_vencimento is not null and p_vencimento <= p_fechamento
           then interval '1 month' else interval '0 month' end
  )::date
$$;

grant execute on function public.calcular_fatura_mes(date, smallint, smallint) to authenticated;

create function public.tg_calcular_fatura_mes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_credito boolean;
  v_fech    smallint;
  v_venc    smallint;
begin
  select c.tem_credito, c.dia_fechamento, c.dia_vencimento
    into v_credito, v_fech, v_venc
    from public.contas c
   where c.id = new.conta_id and c.user_id = new.user_id;

  if new.forma_pagamento = 'Crédito' and coalesce(v_credito, false) then
    new.fatura_mes := public.calcular_fatura_mes(new.data, v_fech, v_venc);
  else
    new.fatura_mes := null;
  end if;
  return new;
end;
$$;

create trigger lancamentos_fatura_mes
  before insert or update of data, conta_id, forma_pagamento on public.lancamentos
  for each row execute function public.tg_calcular_fatura_mes();

create function public.tg_recalcular_faturas_conta()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.tem_credito, new.dia_fechamento, new.dia_vencimento)
     is distinct from (old.tem_credito, old.dia_fechamento, old.dia_vencimento) then
    update public.lancamentos l
       set data = l.data -- dispara tg_calcular_fatura_mes
     where l.conta_id = new.id and l.user_id = new.user_id and l.forma_pagamento = 'Crédito';
  end if;
  return new;
end;
$$;

create trigger contas_recalcular_faturas
  after update of tem_credito, dia_fechamento, dia_vencimento on public.contas
  for each row execute function public.tg_recalcular_faturas_conta();

-- recalcula o que já existe
update public.lancamentos set data = data where forma_pagamento = 'Crédito' or fatura_mes is not null;

-- ---------------------------------------------------------------------
-- 4. Categorias: ícone, cor e "fora dos gastos"
-- ---------------------------------------------------------------------
alter table public.categorias
  add column icone text not null default '🏷️' check (char_length(icone) between 1 and 8),
  add column cor text not null default 'cinza'
    check (cor in ('violeta', 'azul', 'ciano', 'teal', 'verde', 'lima', 'amarelo', 'laranja', 'vermelho', 'rosa', 'magenta', 'cinza')),
  add column fora_dos_gastos boolean not null default false;

-- Conjunto padrão (inspirado nos apps de finanças do mercado)
create function public.semear_categorias(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.categorias (user_id, tipo, nome, subcategoria, icone, cor, fora_dos_gastos)
  select p_user, c.tipo::public.tipo_lancamento, c.nome, c.sub, c.icone, c.cor, c.fora
  from (values
    -- ===== SAÍDAS =====
    ('SAIDA', 'Moradia', 'Aluguel', '🏠', 'azul', false),
    ('SAIDA', 'Moradia', 'Condomínio', '🏠', 'azul', false),
    ('SAIDA', 'Moradia', 'Energia elétrica', '🏠', 'azul', false),
    ('SAIDA', 'Moradia', 'Água', '🏠', 'azul', false),
    ('SAIDA', 'Moradia', 'Gás', '🏠', 'azul', false),
    ('SAIDA', 'Moradia', 'Internet e TV', '🏠', 'azul', false),
    ('SAIDA', 'Moradia', 'Manutenção e reparos', '🏠', 'azul', false),
    ('SAIDA', 'Moradia', 'IPTU', '🏠', 'azul', false),
    ('SAIDA', 'Mercado', 'Supermercado', '🛒', 'verde', false),
    ('SAIDA', 'Mercado', 'Hortifrúti e feira', '🛒', 'verde', false),
    ('SAIDA', 'Mercado', 'Padaria', '🛒', 'verde', false),
    ('SAIDA', 'Mercado', 'Açougue', '🛒', 'verde', false),
    ('SAIDA', 'Restaurantes', 'Restaurante', '🍽️', 'laranja', false),
    ('SAIDA', 'Restaurantes', 'Delivery', '🍽️', 'laranja', false),
    ('SAIDA', 'Restaurantes', 'Lanches e café', '🍽️', 'laranja', false),
    ('SAIDA', 'Restaurantes', 'Bares', '🍽️', 'laranja', false),
    ('SAIDA', 'Transporte', 'Combustível', '🚗', 'ciano', false),
    ('SAIDA', 'Transporte', 'Aplicativo e táxi', '🚗', 'ciano', false),
    ('SAIDA', 'Transporte', 'Transporte público', '🚗', 'ciano', false),
    ('SAIDA', 'Transporte', 'Estacionamento e pedágio', '🚗', 'ciano', false),
    ('SAIDA', 'Transporte', 'Manutenção do veículo', '🚗', 'ciano', false),
    ('SAIDA', 'Transporte', 'Seguro e IPVA', '🚗', 'ciano', false),
    ('SAIDA', 'Saúde', 'Farmácia', '❤️', 'vermelho', false),
    ('SAIDA', 'Saúde', 'Consultas', '❤️', 'vermelho', false),
    ('SAIDA', 'Saúde', 'Exames', '❤️', 'vermelho', false),
    ('SAIDA', 'Saúde', 'Plano de saúde', '❤️', 'vermelho', false),
    ('SAIDA', 'Saúde', 'Dentista', '❤️', 'vermelho', false),
    ('SAIDA', 'Saúde', 'Academia', '❤️', 'vermelho', false),
    ('SAIDA', 'Educação', 'Cursos', '🎓', 'violeta', false),
    ('SAIDA', 'Educação', 'Escola e faculdade', '🎓', 'violeta', false),
    ('SAIDA', 'Educação', 'Livros e material', '🎓', 'violeta', false),
    ('SAIDA', 'Lazer', 'Passeios', '🎉', 'rosa', false),
    ('SAIDA', 'Lazer', 'Viagens', '🎉', 'rosa', false),
    ('SAIDA', 'Lazer', 'Shows e eventos', '🎉', 'rosa', false),
    ('SAIDA', 'Lazer', 'Hobbies e jogos', '🎉', 'rosa', false),
    ('SAIDA', 'Assinaturas', 'Streaming', '📺', 'magenta', false),
    ('SAIDA', 'Assinaturas', 'Apps e software', '📺', 'magenta', false),
    ('SAIDA', 'Assinaturas', 'Celular', '📺', 'magenta', false),
    ('SAIDA', 'Assinaturas', 'Clubes e associações', '📺', 'magenta', false),
    ('SAIDA', 'Compras', 'Roupas e calçados', '🛍️', 'amarelo', false),
    ('SAIDA', 'Compras', 'Eletrônicos', '🛍️', 'amarelo', false),
    ('SAIDA', 'Compras', 'Casa e decoração', '🛍️', 'amarelo', false),
    ('SAIDA', 'Compras', 'Presentes', '🛍️', 'amarelo', false),
    ('SAIDA', 'Compras', 'Compras online', '🛍️', 'amarelo', false),
    ('SAIDA', 'Cuidados pessoais', 'Cabeleireiro e barbearia', '💈', 'teal', false),
    ('SAIDA', 'Cuidados pessoais', 'Estética e beleza', '💈', 'teal', false),
    ('SAIDA', 'Cuidados pessoais', 'Higiene', '💈', 'teal', false),
    ('SAIDA', 'Pets', 'Ração', '🐾', 'lima', false),
    ('SAIDA', 'Pets', 'Veterinário', '🐾', 'lima', false),
    ('SAIDA', 'Pets', 'Pet shop', '🐾', 'lima', false),
    ('SAIDA', 'Família', 'Filhos', '👪', 'ciano', false),
    ('SAIDA', 'Família', 'Ajuda a familiares', '👪', 'ciano', false),
    ('SAIDA', 'Impostos e tarifas', 'Tarifas bancárias', '🧾', 'cinza', false),
    ('SAIDA', 'Impostos e tarifas', 'Juros e multas', '🧾', 'cinza', false),
    ('SAIDA', 'Impostos e tarifas', 'IOF', '🧾', 'cinza', false),
    ('SAIDA', 'Impostos e tarifas', 'Impostos', '🧾', 'cinza', false),
    ('SAIDA', 'Dívidas e empréstimos', 'Empréstimo', '💳', 'vermelho', false),
    ('SAIDA', 'Dívidas e empréstimos', 'Financiamento', '💳', 'vermelho', false),
    ('SAIDA', 'Dívidas e empréstimos', 'Acordos e parcelamentos', '💳', 'vermelho', false),
    ('SAIDA', 'Doações', 'Doações', '🤝', 'verde', false),
    ('SAIDA', 'Doações', 'Dízimo e ofertas', '🤝', 'verde', false),
    ('SAIDA', 'Investimentos', 'Aplicação', '📈', 'violeta', true),
    ('SAIDA', 'Investimentos', 'Previdência privada', '📈', 'violeta', true),
    ('SAIDA', 'Transferências', 'Entre minhas contas', '🔁', 'cinza', true),
    ('SAIDA', 'Transferências', 'Pagamento de fatura', '🔁', 'cinza', true),
    ('SAIDA', 'Outros', 'Pix e transferências a terceiros', '❔', 'cinza', false),
    ('SAIDA', 'Outros', 'Saques', '❔', 'cinza', false),
    ('SAIDA', 'Outros', 'Diversos', '❔', 'cinza', false),
    -- ===== ENTRADAS =====
    ('ENTRADA', 'Salário', 'Salário mensal', '💼', 'verde', false),
    ('ENTRADA', 'Salário', 'Adiantamento', '💼', 'verde', false),
    ('ENTRADA', 'Salário', '13º salário', '💼', 'verde', false),
    ('ENTRADA', 'Salário', 'Férias', '💼', 'verde', false),
    ('ENTRADA', 'Salário', 'PLR e bônus', '💼', 'verde', false),
    ('ENTRADA', 'Renda extra', 'Freelance', '💻', 'ciano', false),
    ('ENTRADA', 'Renda extra', 'Vendas', '💻', 'ciano', false),
    ('ENTRADA', 'Renda extra', 'Aluguel recebido', '💻', 'ciano', false),
    ('ENTRADA', 'Rendimentos', 'Juros e rendimentos', '📈', 'violeta', false),
    ('ENTRADA', 'Rendimentos', 'Dividendos', '📈', 'violeta', false),
    ('ENTRADA', 'Reembolsos e estornos', 'Estorno', '↩️', 'azul', false),
    ('ENTRADA', 'Reembolsos e estornos', 'Reembolso', '↩️', 'azul', false),
    ('ENTRADA', 'Reembolsos e estornos', 'Cashback', '↩️', 'azul', false),
    ('ENTRADA', 'Benefícios', 'Vale-alimentação e refeição', '🎁', 'amarelo', false),
    ('ENTRADA', 'Benefícios', 'FGTS', '🎁', 'amarelo', false),
    ('ENTRADA', 'Benefícios', 'Seguro-desemprego', '🎁', 'amarelo', false),
    ('ENTRADA', 'Benefícios', 'Rescisão', '🎁', 'amarelo', false),
    ('ENTRADA', 'Benefícios', 'Restituição de IR', '🎁', 'amarelo', false),
    ('ENTRADA', 'Recebimentos', 'Pix recebido', '💸', 'teal', false),
    ('ENTRADA', 'Recebimentos', 'Presentes recebidos', '💸', 'teal', false),
    ('ENTRADA', 'Investimentos', 'Resgate de investimento', '📈', 'violeta', true),
    ('ENTRADA', 'Transferências', 'Entre minhas contas', '🔁', 'cinza', true),
    ('ENTRADA', 'Transferências', 'Pagamento de fatura', '🔁', 'cinza', true),
    ('ENTRADA', 'Outras receitas', 'Diversos', '❔', 'cinza', false)
  ) as c (tipo, nome, sub, icone, cor, fora)
  on conflict (user_id, tipo, nome, subcategoria)
  do update set icone = excluded.icone, cor = excluded.cor, fora_dos_gastos = excluded.fora_dos_gastos;
$$;

revoke execute on function public.semear_categorias(uuid) from public, anon, authenticated;

-- Novos usuários: perfil + categorias novas
create or replace function public.criar_dados_iniciais()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'nome', 80), ''));
  perform public.semear_categorias(new.id);
  return new;
end;
$$;

-- Usuários existentes: remove categorias antigas que ainda não foram usadas
-- (sem lançamentos nem regras) e cria o conjunto novo.
do $$
declare u record;
begin
  for u in select id from auth.users loop
    delete from public.categorias c
     where c.user_id = u.id
       and not exists (select 1 from public.lancamentos l where l.categoria_id = c.id)
       and not exists (select 1 from public.regras_classificacao r where r.categoria_id = c.id);
    perform public.semear_categorias(u.id);
  end loop;
end;
$$;
