-- Fecha o cadastro aberto de atendentes: cada unidade passa a ter um
-- código de convite que só é acessível pelo backend (nunca por SELECT
-- direto do client), usado para vincular uma nova atendente à unidade
-- certa sem expor um dropdown com todas as unidades da rede.

ALTER TABLE public.unidades
  ADD COLUMN codigo_convite text UNIQUE NOT NULL
    DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

-- A partir daqui unidades não é mais legível diretamente por anon/authenticated.
REVOKE SELECT ON public.unidades FROM anon, authenticated;
DROP POLICY IF EXISTS "unidades_public_read" ON public.unidades;

-- View pública sem a coluna codigo_convite, para os usos que hoje dependem
-- de listar/consultar unidades publicamente (form de pedido, tela de login).
CREATE VIEW public.unidades_publico AS
  SELECT id, nome, slug, cidade, prazo_padrao_horas, created_at
  FROM public.unidades;

GRANT SELECT ON public.unidades_publico TO anon, authenticated;

-- Valida um código de convite sem nunca expor a coluna codigo_convite em
-- nenhuma consulta direta pelo client (SECURITY DEFINER lê a tabela real,
-- mas só devolve o uuid da unidade correspondente, nunca o código).
CREATE OR REPLACE FUNCTION public.unidade_por_codigo_convite(codigo text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.unidades WHERE codigo_convite = codigo
$$;

REVOKE ALL ON FUNCTION public.unidade_por_codigo_convite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.unidade_por_codigo_convite(text) TO anon, authenticated;
