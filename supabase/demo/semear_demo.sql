-- =====================================================================
--  Dados simulados para o usuário de DEMONSTRAÇÃO (não é migração)
--
--  Como usar (dono do projeto, no SQL Editor do Supabase):
--   1. Authentication → Users → Invite user: convide um e-mail só para a demo
--      e defina a senha pelo link do convite (sem 2FA, para apresentar fácil).
--   2. Troque o e-mail na linha "v_email" abaixo e rode este arquivo inteiro.
--   3. Pode rodar de novo quando quiser: ele APAGA os lançamentos, contas,
--      metas, regras e importações DESSE usuário e recria tudo, com datas
--      relativas a hoje (6 meses de histórico + 3 meses de futuros).
--
--  Tudo é fictício (titular "Rafael Augusto da Conceição Moreira", empresas
--  inventadas). Nunca use um e-mail de usuário real aqui: os dados dele
--  seriam apagados.
-- =====================================================================

create or replace function pg_temp.cat(p_user uuid, p_tipo text, p_nome text, p_sub text)
returns uuid language sql as $$
  select id from public.categorias
   where user_id = p_user and tipo = p_tipo::public.tipo_lancamento and nome = p_nome and subcategoria = p_sub
   limit 1
$$;

create or replace function pg_temp.valor(p_min numeric, p_max numeric)
returns numeric language sql as $$
  select round((p_min + random() * (p_max - p_min))::numeric, 2)
$$;

create or replace function pg_temp.lanc(
  p_user uuid, p_conta uuid, p_data date, p_tipo text, p_valor numeric, p_desc text,
  p_cat uuid, p_forma text, p_status text default 'REALIZADO',
  p_serie uuid default null, p_serie_tipo text default null, p_parc int default null, p_total int default null
) returns void language sql as $$
  insert into public.lancamentos
    (user_id, conta_id, data, tipo, valor, descricao, categoria_id, forma_pagamento, status,
     serie_id, serie_tipo, parcela_atual, parcela_total)
  values
    (p_user, p_conta, p_data, p_tipo::public.tipo_lancamento, p_valor, p_desc, p_cat, p_forma, p_status::public.status_lancamento,
     p_serie, p_serie_tipo, p_parc, p_total)
$$;

do $$
declare
  v_email   text := 'demo@exemplo.com';  -- << troque pelo e-mail do usuário de demonstração
  v_user    uuid;
  v_hoje    date := current_date;
  v_inicio  date := (date_trunc('month', current_date) - interval '5 months')::date;
  c_cor     uuid; c_sal uuid; c_res uuid; c_cart uuid;
  v_mes     date;
  v_d       date;
  i         int;
  n         int;
  v_serie   uuid;
  r         record;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'Usuário % não encontrado. Convide-o em Authentication → Users primeiro.', v_email;
  end if;

  perform setseed(0.42); -- mesmos valores a cada execução

  -- limpa os dados desse usuário (as categorias padrão ficam)
  delete from public.lancamentos where user_id = v_user;
  delete from public.importacoes where user_id = v_user;
  delete from public.regras_classificacao where user_id = v_user;
  delete from public.metas where user_id = v_user;
  delete from public.contas where user_id = v_user;
  if not exists (select 1 from public.categorias where user_id = v_user) then
    perform public.semear_categorias(v_user);
  end if;

  update public.perfis
     set nome = 'Rafael', nome_completo = 'Rafael Augusto da Conceição Moreira'
   where id = v_user;

  -- contas fictícias
  insert into public.contas (user_id, nome, tipo, skin, ordem, tem_debito, tem_credito, tem_pix, tem_ted,
                             dia_fechamento, dia_vencimento, limite_credito, bandeira, saldo_inicial, saldo_inicial_data)
  values (v_user, 'Banco Horizonte', 'CORRENTE', 'padrao', 10, true, true, true, true, 3, 10, 6000, 'Mastercard', 2350, v_inicio - 1)
  returning id into c_cor;
  insert into public.contas (user_id, nome, tipo, skin, ordem, tem_debito, tem_credito, tem_pix, tem_ted, saldo_inicial, saldo_inicial_data, conta_vinculada_id)
  values (v_user, 'Conta salário', 'SALARIO', 'padrao', 20, false, false, true, true, 0, v_inicio - 1, c_cor)
  returning id into c_sal;
  insert into public.contas (user_id, nome, tipo, skin, ordem, tem_debito, tem_credito, tem_pix, tem_ted, saldo_inicial, saldo_inicial_data)
  values (v_user, 'Reserva Nimbus', 'INVESTIMENTO', 'padrao', 30, false, false, true, true, 4000, v_inicio - 1)
  returning id into c_res;
  insert into public.contas (user_id, nome, tipo, skin, ordem, tem_debito, tem_credito, tem_pix, tem_ted, saldo_inicial, saldo_inicial_data)
  values (v_user, 'Carteira', 'CARTEIRA', 'padrao', 40, false, false, false, false, 150, v_inicio - 1)
  returning id into c_cart;

  -- seis meses de histórico, mês a mês
  for m in 0..5 loop
    v_mes := (v_inicio + make_interval(months => m))::date;

    -- salário cai na conta salário e é transferido para a corrente no dia seguinte
    v_d := v_mes + 4;
    if v_d <= v_hoje then
      perform pg_temp.lanc(v_user, c_sal, v_d, 'ENTRADA', 5200, 'TED SALARIO EMPRESA ALFA LTDA', pg_temp.cat(v_user, 'ENTRADA', 'Salário', 'Salário mensal'), 'TED');
    end if;
    if v_mes + 5 <= v_hoje then
      perform pg_temp.lanc(v_user, c_sal, v_mes + 5, 'SAIDA', 5200, 'TRANSF PARA BANCO HORIZONTE', pg_temp.cat(v_user, 'SAIDA', 'Transferências', 'Entre minhas contas'), 'TED');
      perform pg_temp.lanc(v_user, c_cor, v_mes + 5, 'ENTRADA', 5200, 'TED RECEBIDA RAFAEL A C MOREIRA', pg_temp.cat(v_user, 'ENTRADA', 'Transferências', 'Entre minhas contas'), 'TED');
    end if;

    -- renda extra em alguns meses
    if m in (1, 4) and v_mes + 17 <= v_hoje then
      perform pg_temp.lanc(v_user, c_cor, v_mes + 17, 'ENTRADA', pg_temp.valor(600, 1200), 'PIX RECEBIDO PROJETO FREELANCE', pg_temp.cat(v_user, 'ENTRADA', 'Renda extra', 'Freelance'), 'Pix');
    end if;

    -- despesas fixas
    for r in select * from (values
        (9,  'Moradia', 'Aluguel', 'PIX IMOBILIARIA LAR FELIZ', 1450.00::numeric, 1450.00::numeric, 'Pix'),
        (9,  'Moradia', 'Condomínio', 'BOLETO CONDOMINIO RESIDENCIAL IPES', 380, 380, 'Boleto'),
        (7,  'Saúde', 'Plano de saúde', 'PLANO SAUDE VIDA BOA', 289, 289, 'Débito'),
        (14, 'Moradia', 'Energia elétrica', 'ENERGIA DISTRIBUIDORA REGIONAL', 150, 235, 'Débito'),
        (15, 'Moradia', 'Água', 'AGUA E SANEAMENTO MUNICIPAL', 72, 96, 'Débito'),
        (19, 'Moradia', 'Internet e TV', 'FIBRA RAPIDA INTERNET', 109.90, 109.90, 'Débito'),
        (11, 'Assinaturas', 'Celular', 'TELEFONIA MOVEL CONECTA', 59.90, 59.90, 'Débito'),
        (4,  'Saúde', 'Academia', 'ACADEMIA CORPO ATIVO', 99.90, 99.90, 'Crédito'),
        (12, 'Assinaturas', 'Streaming', 'STREAMING FILMES PLUS', 39.90, 39.90, 'Crédito'),
        (12, 'Assinaturas', 'Streaming', 'MUSICA SEM FIM PREMIUM', 21.90, 21.90, 'Crédito')
      ) as t(dia, grupo, sub, descr, vmin, vmax, forma)
    loop
      v_d := v_mes + r.dia;
      if v_d <= v_hoje then
        perform pg_temp.lanc(v_user, c_cor, v_d, 'SAIDA', pg_temp.valor(r.vmin, r.vmax), r.descr, pg_temp.cat(v_user, 'SAIDA', r.grupo, r.sub), r.forma);
      end if;
    end loop;

    -- reserva: aplicação mensal e rendimento
    if v_mes + 6 <= v_hoje then
      perform pg_temp.lanc(v_user, c_cor, v_mes + 6, 'SAIDA', 400, 'APLICACAO RESERVA NIMBUS', pg_temp.cat(v_user, 'SAIDA', 'Investimentos', 'Aplicação'), 'Pix');
      perform pg_temp.lanc(v_user, c_res, v_mes + 6, 'ENTRADA', 400, 'APLICACAO RECEBIDA RAFAEL A C MOREIRA', pg_temp.cat(v_user, 'ENTRADA', 'Transferências', 'Entre minhas contas'), 'Pix');
    end if;
    if (v_mes + interval '1 month' - interval '1 day')::date <= v_hoje then
      perform pg_temp.lanc(v_user, c_res, (v_mes + interval '1 month' - interval '1 day')::date, 'ENTRADA', pg_temp.valor(38, 52), 'RENDIMENTO RESERVA NIMBUS', pg_temp.cat(v_user, 'ENTRADA', 'Rendimentos', 'Juros e rendimentos'), 'Outro');
    end if;

    -- gastos variáveis (mercado, delivery, transporte, saúde, lazer)
    for r in select * from (values
        ('Mercado', 'Supermercado', 'SUPERMERCADO BOM PRECO', 5, 110.00::numeric, 390.00::numeric, 'Crédito'),
        ('Mercado', 'Padaria', 'PADARIA PAO DOURADO', 6, 12, 38, 'Débito'),
        ('Mercado', 'Hortifrúti e feira', 'HORTIFRUTI VERDE VIDA', 2, 45, 95, 'Pix'),
        ('Restaurantes', 'Delivery', 'DELIVERY SABOR EXPRESS', 4, 38, 89, 'Crédito'),
        ('Restaurantes', 'Restaurante', 'RESTAURANTE TEMPERO DA CASA', 2, 70, 160, 'Crédito'),
        ('Restaurantes', 'Lanches e café', 'CAFE GRAO NOBRE', 3, 9, 28, 'Débito'),
        ('Transporte', 'Combustível', 'POSTO ESTRELA DO SUL', 3, 140, 230, 'Crédito'),
        ('Transporte', 'Aplicativo e táxi', 'APP CORRIDA URBANA', 4, 14, 42, 'Crédito'),
        ('Saúde', 'Farmácia', 'FARMACIA SAUDE MAIS', 2, 25, 120, 'Débito'),
        ('Lazer', 'Passeios', 'CINEMA CENTRAL PARK', 1, 60, 140, 'Crédito'),
        ('Cuidados pessoais', 'Cabeleireiro e barbearia', 'BARBEARIA NAVALHA DE OURO', 1, 45, 70, 'Pix')
      ) as t(grupo, sub, descr, vezes, vmin, vmax, forma)
    loop
      n := r.vezes + (case when random() < 0.3 then 1 else 0 end);
      for i in 1..n loop
        v_d := v_mes + floor(random() * 28)::int;
        if v_d <= v_hoje then
          perform pg_temp.lanc(v_user, c_cor, v_d, 'SAIDA', pg_temp.valor(r.vmin, r.vmax), r.descr, pg_temp.cat(v_user, 'SAIDA', r.grupo, r.sub), r.forma);
        end if;
      end loop;
    end loop;

    -- dinheiro vivo: saque e pequenos gastos na carteira
    if v_mes + 2 <= v_hoje then
      perform pg_temp.lanc(v_user, c_cart, v_mes + 2, 'SAIDA', pg_temp.valor(15, 45), 'FEIRA DO BAIRRO', pg_temp.cat(v_user, 'SAIDA', 'Mercado', 'Hortifrúti e feira'), 'Dinheiro');
    end if;

    -- compras pontuais
    if m = 2 and v_mes + 20 <= v_hoje then
      perform pg_temp.lanc(v_user, c_cor, v_mes + 20, 'SAIDA', 389.90, 'LOJA MODA URBANA', pg_temp.cat(v_user, 'SAIDA', 'Compras', 'Roupas e calçados'), 'Crédito');
    end if;
    if m = 4 and v_mes + 13 <= v_hoje then
      perform pg_temp.lanc(v_user, c_cor, v_mes + 13, 'SAIDA', 1240.00, 'POUSADA MAR AZUL', pg_temp.cat(v_user, 'SAIDA', 'Lazer', 'Viagens'), 'Crédito');
    end if;
  end loop;

  -- compra parcelada: notebook em 10x, 3 parcelas já pagas, o resto previsto
  v_serie := gen_random_uuid();
  for i in 1..10 loop
    v_d := (v_inicio + make_interval(months => 2 + i - 1) + interval '7 days')::date;
    perform pg_temp.lanc(v_user, c_cor, v_d, 'SAIDA', 349.90, format('NOTEBOOK LOJA TECNO (%s/10)', i),
      pg_temp.cat(v_user, 'SAIDA', 'Compras', 'Eletrônicos'), 'Crédito',
      case when v_d <= v_hoje then 'REALIZADO' else 'PREVISTO' end, v_serie, 'PARCELA', i, 10);
  end loop;

  -- pagamento das faturas do cartão já vencidas (sai da corrente)
  for r in
    select fatura_mes, sum(case when tipo = 'SAIDA' then valor else -valor end) as total
      from public.lancamentos
     where user_id = v_user and conta_id = c_cor and forma_pagamento = 'Crédito' and status = 'REALIZADO'
     group by fatura_mes
  loop
    v_d := (r.fatura_mes + 9)::date; -- vence dia 10
    if v_d <= v_hoje and r.total > 0 then
      perform pg_temp.lanc(v_user, c_cor, v_d, 'SAIDA', r.total, 'PAGAMENTO FATURA CARTAO HORIZONTE', pg_temp.cat(v_user, 'SAIDA', 'Transferências', 'Pagamento de fatura'), 'Débito');
    end if;
  end loop;

  -- próximos 3 meses: despesas fixas e salário previstos
  for m in 1..3 loop
    v_mes := (date_trunc('month', v_hoje) + make_interval(months => m))::date;
    v_serie := null;
    perform pg_temp.lanc(v_user, c_cor, v_mes + 9, 'SAIDA', 1450, 'Moradia › Aluguel', pg_temp.cat(v_user, 'SAIDA', 'Moradia', 'Aluguel'), 'Pix', 'PREVISTO', null, 'FIXA');
    perform pg_temp.lanc(v_user, c_cor, v_mes + 9, 'SAIDA', 380, 'Moradia › Condomínio', pg_temp.cat(v_user, 'SAIDA', 'Moradia', 'Condomínio'), 'Boleto', 'PREVISTO', null, 'FIXA');
    perform pg_temp.lanc(v_user, c_cor, v_mes + 7, 'SAIDA', 289, 'Saúde › Plano de saúde', pg_temp.cat(v_user, 'SAIDA', 'Saúde', 'Plano de saúde'), 'Débito', 'PREVISTO', null, 'FIXA');
    perform pg_temp.lanc(v_user, c_cor, v_mes + 14, 'SAIDA', 190, 'Moradia › Energia elétrica', pg_temp.cat(v_user, 'SAIDA', 'Moradia', 'Energia elétrica'), 'Débito', 'PREVISTO', null, 'FIXA');
    perform pg_temp.lanc(v_user, c_cor, v_mes + 19, 'SAIDA', 109.90, 'Moradia › Internet e TV', pg_temp.cat(v_user, 'SAIDA', 'Moradia', 'Internet e TV'), 'Débito', 'PREVISTO', null, 'FIXA');
    perform pg_temp.lanc(v_user, c_sal, v_mes + 4, 'ENTRADA', 5200, 'Salário', pg_temp.cat(v_user, 'ENTRADA', 'Salário', 'Salário mensal'), 'TED', 'PREVISTO');
  end loop;
  -- IPVA do mês que vem (conta a pagar avulsa)
  perform pg_temp.lanc(v_user, c_cor, (date_trunc('month', v_hoje) + interval '1 month' + interval '19 days')::date, 'SAIDA', 1180, 'IPVA', pg_temp.cat(v_user, 'SAIDA', 'Transporte', 'Seguro e IPVA'), 'Boleto', 'PREVISTO');

  -- metas
  insert into public.metas (user_id, nome, valor_alvo, valor_guardado, prazo_meses, inicio)
  values (v_user, 'Reserva de emergência', 15000, 6400, 18, v_inicio),
         (v_user, 'Viagem de férias', 6000, 1800, 10, v_inicio + 60);

  raise notice 'Demonstração pronta para % (% lançamentos).', v_email,
    (select count(*) from public.lancamentos where user_id = v_user);
end $$;
