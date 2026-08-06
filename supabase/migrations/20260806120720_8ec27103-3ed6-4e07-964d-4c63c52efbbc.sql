-- Remove public read access to sensitive columns on public.unidades (notably codigo_convite)
REVOKE SELECT ON public.unidades FROM anon, authenticated;

GRANT SELECT (
  id, nome, slug, cidade, prazo_padrao_horas, created_at,
  hora_abertura, hora_fechamento, hora_limite_pedido, quantidade_maquinas
) ON public.unidades TO anon, authenticated;

GRANT ALL ON public.unidades TO service_role;

-- Keep row-level read allowed, but column privileges now restrict which columns are visible
DROP POLICY IF EXISTS unidades_public_read_safe_columns ON public.unidades;
CREATE POLICY unidades_public_read_safe_columns
  ON public.unidades FOR SELECT TO anon, authenticated
  USING (true);