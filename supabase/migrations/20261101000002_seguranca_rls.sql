-- =====================================================================
--  SEGURANÇA — ROW LEVEL SECURITY
--  A chave pública do Supabase fica no navegador; quem protege os dados é
--  o próprio banco: cada usuário só enxerga e altera as próprias linhas.
-- =====================================================================

-- Visitante não logado (role anon) não acessa nada
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;

alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-- RLS em todas as tabelas
alter table public.perfis               enable row level security;
alter table public.contas               enable row level security;
alter table public.categorias           enable row level security;
alter table public.importacoes          enable row level security;
alter table public.lancamentos          enable row level security;
alter table public.regras_classificacao enable row level security;

-- Perfil: o usuário lê e edita só o próprio (criação é feita pelo trigger)
create policy perfis_select on public.perfis
  for select to authenticated using ((select auth.uid()) = id);
create policy perfis_update on public.perfis
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Demais tabelas: CRUD completo restrito ao dono
do $$
declare t text;
begin
  foreach t in array array['contas', 'categorias', 'importacoes', 'lancamentos', 'regras_classificacao'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete', t);
  end loop;
end;
$$;

-- perfis: sem insert/delete pelo cliente
revoke insert, delete on public.perfis from authenticated;
