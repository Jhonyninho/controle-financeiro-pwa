-- =====================================================================
--  SALDO POR CONTA
--  saldo_inicial = saldo da conta no FIM do dia saldo_inicial_data
--  (ex.: "Saldo anterior" do primeiro extrato importado). O saldo em
--  qualquer data é: saldo_inicial + entradas − saídas realizadas depois
--  dessa data, sem contar compras no crédito (elas vão para a fatura;
--  o que sai da conta é o pagamento da fatura).
--  Transferências entre contas entram na conta de destino e saem da conta
--  de origem, então se anulam no consolidado.
-- =====================================================================

alter table public.contas
  add column saldo_inicial      numeric(14, 2) not null default 0,
  add column saldo_inicial_data date;

create function public.saldo_contas_em(p_data date)
returns table (conta_id uuid, saldo numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.saldo_inicial + coalesce(sum(case when l.tipo = 'ENTRADA' then l.valor else -l.valor end), 0)
  from public.contas c
  left join public.lancamentos l
    on  l.conta_id = c.id
    and l.user_id = c.user_id
    and l.status = 'REALIZADO'
    and l.forma_pagamento is distinct from 'Crédito'
    and l.data <= p_data
    and (c.saldo_inicial_data is null or l.data > c.saldo_inicial_data)
  group by c.id, c.saldo_inicial
$$;

revoke execute on function public.saldo_contas_em(date) from public, anon;
grant  execute on function public.saldo_contas_em(date) to authenticated;
