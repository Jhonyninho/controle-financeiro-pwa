-- =====================================================================
--  FUNÇÕES
-- =====================================================================

-- ---------------------------------------------------------------------
-- Dados iniciais de cada novo usuário (perfil + categorias padrão).
-- Roda quando o usuário aceita o convite e é criado em auth.users.
-- ---------------------------------------------------------------------
create function public.criar_dados_iniciais()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'nome', 80), ''));

  insert into public.categorias (user_id, tipo, nome, subcategoria)
  select new.id, c.tipo::public.tipo_lancamento, c.nome, c.sub
  from (values
    ('ENTRADA', 'Salário', 'Mensal'),
    ('ENTRADA', 'Salário', 'Adiantamento'),
    ('ENTRADA', 'Salário', '13º Salário'),
    ('ENTRADA', 'Salário', 'Férias'),
    ('ENTRADA', 'Renda Extra', 'Freelance'),
    ('ENTRADA', 'Renda Extra', 'Vendas'),
    ('ENTRADA', 'Saldo em Conta', 'Acumulado'),
    ('ENTRADA', 'Reembolso', 'Diversos'),
    ('ENTRADA', 'Benefícios', 'Saque Aniversário'),
    ('ENTRADA', 'Benefícios', 'Rescisão'),
    ('ENTRADA', 'Benefícios', 'Seguro Desemprego'),
    ('ENTRADA', 'Dividendos', 'Diversos'),
    ('ENTRADA', 'Recebidos', 'Pix'),
    ('ENTRADA', 'Recebidos', 'Diversos'),
    ('ENTRADA', 'Transferência', 'Entre contas'),
    ('SAIDA', 'Moradia', 'Aluguel'),
    ('SAIDA', 'Moradia', 'Condomínio'),
    ('SAIDA', 'Moradia', 'Água'),
    ('SAIDA', 'Moradia', 'Luz'),
    ('SAIDA', 'Alimentação', 'Mercado'),
    ('SAIDA', 'Alimentação', 'Restaurante'),
    ('SAIDA', 'Alimentação', 'Delivery'),
    ('SAIDA', 'Transporte', 'Combustível'),
    ('SAIDA', 'Transporte', 'Aplicativo'),
    ('SAIDA', 'Transporte', 'Pedágio/Estacionamento'),
    ('SAIDA', 'Veículo', 'Manutenção'),
    ('SAIDA', 'Lazer', 'Streaming'),
    ('SAIDA', 'Lazer', 'Passeio'),
    ('SAIDA', 'Saúde', 'Farmácia'),
    ('SAIDA', 'Saúde', 'Dentista'),
    ('SAIDA', 'Saúde', 'Consulta Médica'),
    ('SAIDA', 'Saúde', 'Exame Médico'),
    ('SAIDA', 'Educação', 'Cursos'),
    ('SAIDA', 'Comunicação', 'Internet'),
    ('SAIDA', 'Comunicação', 'Celular'),
    ('SAIDA', 'Despesas Pessoais', 'Beleza'),
    ('SAIDA', 'Despesas Pessoais', 'Seguro'),
    ('SAIDA', 'Despesas Pessoais', 'Assinaturas'),
    ('SAIDA', 'Despesas Pessoais', 'Vestuário'),
    ('SAIDA', 'Despesas Pessoais', 'Móveis'),
    ('SAIDA', 'Despesas Pessoais', 'Eletrônicos'),
    ('SAIDA', 'Financeiro', 'Empréstimo'),
    ('SAIDA', 'Financeiro', 'Fatura Cartão'),
    ('SAIDA', 'Tarifas e Impostos', 'Taxas'),
    ('SAIDA', 'Tarifas e Impostos', 'IOF'),
    ('SAIDA', 'Transferência', 'Entre contas'),
    ('SAIDA', 'Transferência', 'Pix enviado'),
    ('SAIDA', 'Outros', 'Diversos')
  ) as c (tipo, nome, sub);

  return new;
end;
$$;

revoke execute on function public.criar_dados_iniciais() from public, anon, authenticated;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_dados_iniciais();

-- ---------------------------------------------------------------------
-- Importação em massa, numa única transação.
-- SECURITY INVOKER: roda com as permissões do usuário, então o RLS vale.
-- Itens duplicados (mesmo hash na mesma conta) são ignorados.
--
-- p_itens: [{ data, tipo, valor, descricao, descricao_original,
--             categoria_id, forma_pagamento, hash }]
-- ---------------------------------------------------------------------
create function public.importar_lancamentos(
  p_conta_id uuid,
  p_arquivo  text,
  p_itens    jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user        uuid := auth.uid();
  v_total       integer;
  v_importados  integer;
  v_importacao  uuid;
begin
  if v_user is null then
    raise exception 'não autenticado';
  end if;

  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'p_itens deve ser uma lista';
  end if;

  v_total := jsonb_array_length(p_itens);
  if v_total = 0 or v_total > 5000 then
    raise exception 'a planilha deve ter entre 1 e 5000 lançamentos (recebido: %)', v_total;
  end if;

  insert into public.importacoes (user_id, conta_id, arquivo_nome, periodo_inicio, periodo_fim)
  select v_user, p_conta_id, left(coalesce(p_arquivo, 'planilha'), 200),
         min((i ->> 'data')::date), max((i ->> 'data')::date)
  from jsonb_array_elements(p_itens) as i
  returning id into v_importacao;

  insert into public.lancamentos (
    user_id, conta_id, importacao_id, categoria_id, data, tipo, valor,
    descricao, descricao_original, forma_pagamento, status, hash_import
  )
  select
    v_user,
    p_conta_id,
    v_importacao,
    nullif(i ->> 'categoria_id', '')::uuid,
    (i ->> 'data')::date,
    (i ->> 'tipo')::public.tipo_lancamento,
    (i ->> 'valor')::numeric(14, 2),
    left(coalesce(i ->> 'descricao', ''), 200),
    left(i ->> 'descricao_original', 300),
    nullif(i ->> 'forma_pagamento', ''),
    'REALIZADO',
    i ->> 'hash'
  from jsonb_array_elements(p_itens) as i
  on conflict (user_id, conta_id, hash_import) where hash_import is not null
  do nothing;

  get diagnostics v_importados = row_count;

  if v_importados = 0 then
    -- nada novo: não deixa um registro de importação vazio
    delete from public.importacoes where id = v_importacao;
    v_importacao := null;
  else
    update public.importacoes
       set qtd_importados = v_importados,
           qtd_ignorados  = v_total - v_importados
     where id = v_importacao;
  end if;

  return jsonb_build_object(
    'importacao_id', v_importacao,
    'importados',    v_importados,
    'duplicados',    v_total - v_importados
  );
end;
$$;

revoke execute on function public.importar_lancamentos(uuid, text, jsonb) from public, anon;
grant  execute on function public.importar_lancamentos(uuid, text, jsonb) to authenticated;
