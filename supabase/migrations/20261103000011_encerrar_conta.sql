-- =====================================================================
--  Encerrar conta (em vez de excluir)
--
--  Quando a pessoa encerra a conta no banco, o histórico continua no app.
--  contas.encerrada_em guarda o dia do encerramento; o app esconde a conta
--  dos formulários e o banco recusa lançamentos com data depois desse dia
--  (lançamentos até o encerramento continuam podendo ser importados/editados).
-- =====================================================================

alter table public.contas add column if not exists encerrada_em date;

create or replace function public.tg_bloquear_conta_encerrada()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_encerrada date;
  v_nome text;
begin
  select c.encerrada_em, c.nome into v_encerrada, v_nome
    from public.contas c
   where c.id = new.conta_id;
  if v_encerrada is not null and new.data > v_encerrada then
    raise exception 'A conta % foi encerrada em %. Não é possível lançar depois dessa data.',
      v_nome, to_char(v_encerrada, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists lancamentos_conta_encerrada on public.lancamentos;
create trigger lancamentos_conta_encerrada
  before insert or update of conta_id, data on public.lancamentos
  for each row execute function public.tg_bloquear_conta_encerrada();
