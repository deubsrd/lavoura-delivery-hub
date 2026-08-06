CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.minha_unidade_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT unidade_id FROM public.atendentes WHERE id = auth.uid()
$$;
REVOKE ALL ON FUNCTION private.minha_unidade_id() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sou_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.atendentes WHERE id = auth.uid()), false)
$$;
REVOKE ALL ON FUNCTION private.sou_admin() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.log_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pedido_status_historico (pedido_id, status) VALUES (NEW.id, NEW.status);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.pedido_status_historico (pedido_id, status, observacao)
    VALUES (NEW.id, NEW.status, NEW.motivo_cancelamento);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.log_status_change() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "unidades_public_read" ON public.unidades;
CREATE POLICY "unidades_public_read_safe_columns" ON public.unidades
  FOR SELECT TO anon, authenticated USING (true);
REVOKE SELECT ON public.unidades FROM anon, authenticated;
GRANT SELECT (id, nome, slug, cidade, prazo_padrao_horas, created_at, hora_abertura, hora_fechamento, hora_limite_pedido)
  ON public.unidades TO anon, authenticated;

ALTER VIEW public.unidades_publico SET (security_invoker = true);

DROP POLICY IF EXISTS "clientes_read_unidade" ON public.clientes;
DROP POLICY IF EXISTS "clientes_update_unidade" ON public.clientes;
CREATE POLICY "clientes_read_unidade" ON public.clientes FOR SELECT TO authenticated
  USING (unidade_id = private.minha_unidade_id());
CREATE POLICY "clientes_update_unidade" ON public.clientes FOR UPDATE TO authenticated
  USING (unidade_id = private.minha_unidade_id())
  WITH CHECK (unidade_id = private.minha_unidade_id());

DROP POLICY IF EXISTS "pedidos_read_unidade" ON public.pedidos_delivery;
DROP POLICY IF EXISTS "pedidos_update_unidade" ON public.pedidos_delivery;
CREATE POLICY "pedidos_read_unidade" ON public.pedidos_delivery FOR SELECT TO authenticated
  USING (unidade_id = private.minha_unidade_id());
CREATE POLICY "pedidos_update_unidade" ON public.pedidos_delivery FOR UPDATE TO authenticated
  USING (unidade_id = private.minha_unidade_id())
  WITH CHECK (unidade_id = private.minha_unidade_id());

DROP POLICY IF EXISTS "historico_read_unidade" ON public.pedido_status_historico;
DROP POLICY IF EXISTS "historico_insert_unidade" ON public.pedido_status_historico;
CREATE POLICY "historico_read_unidade" ON public.pedido_status_historico FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pedidos_delivery p
    WHERE p.id = pedido_status_historico.pedido_id
      AND p.unidade_id = private.minha_unidade_id()
  ));
CREATE POLICY "historico_insert_unidade" ON public.pedido_status_historico FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pedidos_delivery p
    WHERE p.id = pedido_status_historico.pedido_id
      AND p.unidade_id = private.minha_unidade_id()
  ));

DROP POLICY IF EXISTS "precos_admin_all" ON public.configuracao_precos;
CREATE POLICY "precos_admin_all" ON public.configuracao_precos FOR ALL TO authenticated
  USING (unidade_id = private.minha_unidade_id() AND private.sou_admin())
  WITH CHECK (unidade_id = private.minha_unidade_id() AND private.sou_admin());
DROP POLICY IF EXISTS "faixas_admin_all" ON public.faixas_delivery;
CREATE POLICY "faixas_admin_all" ON public.faixas_delivery FOR ALL TO authenticated
  USING (unidade_id = private.minha_unidade_id() AND private.sou_admin())
  WITH CHECK (unidade_id = private.minha_unidade_id() AND private.sou_admin());
DROP POLICY IF EXISTS "promocoes_admin_all" ON public.promocoes_dia_semana;
CREATE POLICY "promocoes_admin_all" ON public.promocoes_dia_semana FOR ALL TO authenticated
  USING (unidade_id = private.minha_unidade_id() AND private.sou_admin())
  WITH CHECK (unidade_id = private.minha_unidade_id() AND private.sou_admin());

DROP POLICY IF EXISTS "notificacoes_read_unidade" ON public.notificacoes_pedido;
CREATE POLICY "notificacoes_read_unidade" ON public.notificacoes_pedido FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pedidos_delivery p
    WHERE p.id = notificacoes_pedido.pedido_id
      AND p.unidade_id = private.minha_unidade_id()
  ));

DROP TRIGGER IF EXISTS pedidos_log_status ON public.pedidos_delivery;
CREATE TRIGGER pedidos_log_status
  AFTER INSERT OR UPDATE ON public.pedidos_delivery
  FOR EACH ROW EXECUTE FUNCTION private.log_status_change();

REVOKE ALL ON FUNCTION public.unidade_por_codigo_convite(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.minha_unidade_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sou_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_status_change() FROM PUBLIC, anon, authenticated;