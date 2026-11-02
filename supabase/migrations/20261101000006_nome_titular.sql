-- =====================================================================
--  NOME DO TITULAR
--  Nome completo como aparece nos extratos. Usado para reconhecer Pix/TED
--  entre as próprias contas do usuário (ex.: "PIX ENVIADO RAFAEL A C MOREIRA").
-- =====================================================================
alter table public.perfis
  add column nome_completo text not null default '' check (char_length(nome_completo) <= 120);
