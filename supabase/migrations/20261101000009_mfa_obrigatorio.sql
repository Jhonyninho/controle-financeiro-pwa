-- =====================================================================
--  v1.2: verificação em duas etapas (TOTP) garantida pelo banco
--
--  Quem cadastrou um app autenticador só lê/grava os próprios dados com
--  uma sessão "aal2" (senha + código). Assim, mesmo com a senha vazada,
--  uma sessão só com senha (aal1) não enxerga nada.
--  Quem não cadastrou continua entrando só com a senha.
--
--  As políticas são RESTRITIVAS: somam-se (AND) às políticas de dono já
--  existentes, nunca ampliam o acesso.
-- =====================================================================

-- Schema fora da API (não exposto pelo PostgREST)
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;

-- true quando a sessão atual tem o nível exigido para a conta
create or replace function privado.sessao_mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
      or not exists (
           select 1 from auth.mfa_factors f
            where f.user_id = (select auth.uid())
              and f.status = 'verified'
         );
$$;

revoke execute on function privado.sessao_mfa_ok() from public, anon;
grant  execute on function privado.sessao_mfa_ok() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['perfis', 'contas', 'categorias', 'importacoes', 'lancamentos', 'regras_classificacao', 'metas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_exige_mfa', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using ((select privado.sessao_mfa_ok())) with check ((select privado.sessao_mfa_ok()))',
      t || '_exige_mfa', t);
  end loop;
end;
$$;

-- Conferência (opcional): toda tabela pública deve ter RLS ligado.
-- select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
