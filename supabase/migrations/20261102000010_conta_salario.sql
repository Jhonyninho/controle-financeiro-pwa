-- =====================================================================
--  Conta salário vinculada a uma conta existente
--
--  O salário cai na conta salário no mês dele (conta como receita daquele
--  mês) e depois é transferido para a conta vinculada (transferência entre
--  as próprias contas, que não conta como receita de novo).
--
--  * novo tipo de conta: SALARIO
--  * contas.conta_vinculada_id: para onde o salário é transferido. FK
--    composta (id, user_id) como as demais: impede vincular conta de outro
--    usuário. Excluir a conta vinculada só desfaz o vínculo.
--  RLS e a política restritiva de MFA da tabela contas já cobrem a coluna.
-- =====================================================================

alter table public.contas drop constraint if exists contas_tipo_check;
alter table public.contas
  add constraint contas_tipo_check check (tipo in ('CORRENTE', 'DIGITAL', 'POUPANCA', 'CARTEIRA', 'INVESTIMENTO', 'SALARIO'));

alter table public.contas add column if not exists conta_vinculada_id uuid;

alter table public.contas
  add constraint contas_conta_vinculada_fk
  foreign key (conta_vinculada_id, user_id) references public.contas (id, user_id)
  on delete set null (conta_vinculada_id);

-- só conta salário tem vínculo, e nunca com ela mesma
alter table public.contas
  add constraint contas_vinculo_check
  check (conta_vinculada_id is null or (tipo = 'SALARIO' and conta_vinculada_id <> id));

create index if not exists contas_conta_vinculada_idx on public.contas (conta_vinculada_id) where conta_vinculada_id is not null;
