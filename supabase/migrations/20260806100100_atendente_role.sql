-- Papel de admin por unidade: só quem tem role = 'admin' pode configurar
-- preços, faixas de delivery e promoções (ver migração de
-- configuracao_precos/faixas_delivery/promocoes_dia_semana). A primeira
-- atendente vinculada a cada unidade vira admin automaticamente (ver
-- garantirVinculoAtendente em src/lib/atendentes.functions.ts); admins
-- adicionais precisam ser promovidas manualmente via SQL por enquanto,
-- não existe uma tela de gestão de papéis nesta entrega.

CREATE TYPE public.atendente_role AS ENUM ('atendente', 'admin');

ALTER TABLE public.atendentes
  ADD COLUMN role public.atendente_role NOT NULL DEFAULT 'atendente';

CREATE OR REPLACE FUNCTION public.sou_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.atendentes WHERE id = auth.uid()), false)
$$;

REVOKE ALL ON FUNCTION public.sou_admin() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.sou_admin() TO authenticated;
