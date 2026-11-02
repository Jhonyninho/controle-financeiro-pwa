-- =====================================================================
--  FATURA DO CARTÃO
--  Em contas do tipo CREDITO, preenche lancamentos.fatura_mes (1º dia do mês
--  da fatura) a partir da data da compra e do dia de fechamento da conta:
--  compra DEPOIS do dia de fechamento cai na fatura do mês seguinte.
--  Vale para lançamentos manuais e importados.
-- =====================================================================

create function public.tg_calcular_fatura_mes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tipo       public.tipo_conta;
  v_fechamento smallint;
begin
  select c.tipo, c.dia_fechamento
    into v_tipo, v_fechamento
    from public.contas c
   where c.id = new.conta_id
     and c.user_id = new.user_id;

  if v_tipo is distinct from 'CREDITO' then
    new.fatura_mes := null;
  elsif v_fechamento is not null and extract(day from new.data) > v_fechamento then
    new.fatura_mes := (date_trunc('month', new.data) + interval '1 month')::date;
  else
    new.fatura_mes := date_trunc('month', new.data)::date;
  end if;

  return new;
end;
$$;

create trigger lancamentos_fatura_mes
  before insert or update of data, conta_id on public.lancamentos
  for each row execute function public.tg_calcular_fatura_mes();

-- Ao mudar tipo/fechamento de uma conta, recalcula as faturas dela
create function public.tg_recalcular_faturas_conta()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.tipo is distinct from old.tipo or new.dia_fechamento is distinct from old.dia_fechamento then
    -- o UPDATE dispara tg_calcular_fatura_mes em cada linha
    update public.lancamentos l
       set data = l.data
     where l.conta_id = new.id
       and l.user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger contas_recalcular_faturas
  after update of tipo, dia_fechamento on public.contas
  for each row execute function public.tg_recalcular_faturas_conta();

create index lancamentos_user_fatura_idx on public.lancamentos (user_id, fatura_mes) where fatura_mes is not null;
