CREATE TABLE public.unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  cidade text NOT NULL,
  prazo_padrao_horas integer NOT NULL DEFAULT 48,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.unidades TO anon, authenticated;
GRANT ALL ON public.unidades TO service_role;
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unidades_public_read" ON public.unidades FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.atendentes (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.atendentes TO authenticated;
GRANT ALL ON public.atendentes TO service_role;
ALTER TABLE public.atendentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "atendentes_self_read" ON public.atendentes FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "atendentes_self_update" ON public.atendentes FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.minha_unidade_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT unidade_id FROM public.atendentes WHERE id = auth.uid()
$$;

CREATE TYPE public.tipo_servico AS ENUM ('busca', 'entrega', 'busca_e_entrega');
CREATE TYPE public.horario_preferido AS ENUM ('manha', 'tarde', 'sem_preferencia');
CREATE TYPE public.pedido_status AS ENUM ('recebido', 'motoboy_busca', 'processando', 'pronto', 'motoboy_entrega', 'entregue', 'cancelado');

CREATE TABLE public.pedidos_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE RESTRICT,
  nome_completo text NOT NULL,
  telefone text NOT NULL,
  rua text NOT NULL,
  numero text NOT NULL,
  bairro text NOT NULL,
  complemento text,
  referencia text,
  mesmo_endereco_entrega boolean,
  rua_entrega text,
  numero_entrega text,
  bairro_entrega text,
  complemento_entrega text,
  referencia_entrega text,
  quantidade_cestos integer NOT NULL DEFAULT 1,
  tipo_servico public.tipo_servico NOT NULL,
  horario_preferido public.horario_preferido NOT NULL DEFAULT 'sem_preferencia',
  observacoes text,
  status public.pedido_status NOT NULL DEFAULT 'recebido',
  motivo_cancelamento text,
  motoboy_nome text,
  data_pedido timestamptz NOT NULL DEFAULT now(),
  data_prevista_retorno timestamptz,
  data_entrega_efetiva timestamptz,
  ip_origem text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.pedidos_delivery TO authenticated;
GRANT ALL ON public.pedidos_delivery TO service_role;
ALTER TABLE public.pedidos_delivery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pedidos_read_unidade" ON public.pedidos_delivery FOR SELECT TO authenticated USING (unidade_id = public.minha_unidade_id());
CREATE POLICY "pedidos_update_unidade" ON public.pedidos_delivery FOR UPDATE TO authenticated USING (unidade_id = public.minha_unidade_id()) WITH CHECK (unidade_id = public.minha_unidade_id());

CREATE TABLE public.pedido_status_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos_delivery(id) ON DELETE CASCADE,
  status public.pedido_status NOT NULL,
  observacao text,
  timestamp timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.pedido_status_historico TO authenticated;
GRANT ALL ON public.pedido_status_historico TO service_role;
ALTER TABLE public.pedido_status_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "historico_read_unidade" ON public.pedido_status_historico FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.pedidos_delivery p WHERE p.id = pedido_id AND p.unidade_id = public.minha_unidade_id())
);
CREATE POLICY "historico_insert_unidade" ON public.pedido_status_historico FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.pedidos_delivery p WHERE p.id = pedido_id AND p.unidade_id = public.minha_unidade_id())
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER pedidos_updated_at BEFORE UPDATE ON public.pedidos_delivery
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.log_status_change()
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

CREATE TRIGGER pedidos_log_status AFTER INSERT OR UPDATE OF status ON public.pedidos_delivery
FOR EACH ROW EXECUTE FUNCTION public.log_status_change();

CREATE INDEX idx_pedidos_unidade_status ON public.pedidos_delivery (unidade_id, status);
CREATE INDEX idx_historico_pedido ON public.pedido_status_historico (pedido_id);

ALTER TABLE public.pedidos_delivery REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos_delivery;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedido_status_historico;

INSERT INTO public.unidades (nome, slug, cidade, prazo_padrao_horas)
VALUES ('Lavoura Boa Vista', 'boa-vista', 'Boa Vista', 48);