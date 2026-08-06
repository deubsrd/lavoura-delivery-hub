ALTER TABLE public.unidades
  ADD COLUMN codigo_convite text UNIQUE NOT NULL
    DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

REVOKE SELECT ON public.unidades FROM anon, authenticated;
DROP POLICY IF EXISTS "unidades_public_read" ON public.unidades;

CREATE VIEW public.unidades_publico AS
  SELECT id, nome, slug, cidade, prazo_padrao_horas, created_at
  FROM public.unidades;

GRANT SELECT ON public.unidades_publico TO anon, authenticated;

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

CREATE INDEX idx_pedidos_unidade_data ON public.pedidos_delivery (unidade_id, data_pedido DESC);

CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE RESTRICT,
  cpf text NOT NULL,
  nome_completo text NOT NULL,
  telefone text NOT NULL,
  ultima_rua text,
  ultimo_numero text,
  ultimo_bairro text,
  ultimo_complemento text,
  ultima_referencia text,
  ultima_rua_entrega text,
  ultimo_numero_entrega text,
  ultimo_bairro_entrega text,
  ultimo_complemento_entrega text,
  ultima_referencia_entrega text,
  ultimo_mesmo_endereco_entrega boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, cpf)
);

GRANT SELECT, UPDATE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clientes_read_unidade" ON public.clientes FOR SELECT TO authenticated
  USING (unidade_id = public.minha_unidade_id());
CREATE POLICY "clientes_update_unidade" ON public.clientes FOR UPDATE TO authenticated
  USING (unidade_id = public.minha_unidade_id()) WITH CHECK (unidade_id = public.minha_unidade_id());

CREATE TRIGGER clientes_updated_at BEFORE UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pedidos_delivery
  ADD COLUMN cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

ALTER TABLE public.unidades
  ADD COLUMN hora_abertura time NOT NULL DEFAULT '13:00',
  ADD COLUMN hora_fechamento time NOT NULL DEFAULT '19:00',
  ADD COLUMN hora_limite_pedido time NOT NULL DEFAULT '17:00',
  ADD COLUMN quantidade_maquinas integer NOT NULL DEFAULT 3,
  ADD COLUMN endereco_completo text,
  ADD COLUMN latitude numeric(9, 6),
  ADD COLUMN longitude numeric(9, 6);

CREATE OR REPLACE VIEW public.unidades_publico AS
  SELECT id, nome, slug, cidade, prazo_padrao_horas, created_at,
         hora_abertura, hora_fechamento, hora_limite_pedido
  FROM public.unidades;

ALTER TABLE public.pedidos_delivery DROP COLUMN horario_preferido;
DROP TYPE public.horario_preferido;

CREATE TABLE public.configuracao_precos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL UNIQUE REFERENCES public.unidades(id) ON DELETE RESTRICT,
  valor_lavagem_por_cesto numeric(10, 2) NOT NULL,
  valor_secagem_por_cesto numeric(10, 2) NOT NULL,
  valor_atendente_por_pedido numeric(10, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.faixas_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE RESTRICT,
  distancia_ate_km numeric(6, 2) NOT NULL,
  valor numeric(10, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE public.tipo_desconto AS ENUM ('percentual', 'valor_fixo');
CREATE TYPE public.aplica_desconto_em AS ENUM ('tudo', 'lavagem', 'secagem', 'atendente', 'delivery');

CREATE TABLE public.promocoes_dia_semana (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE RESTRICT,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  tipo_desconto public.tipo_desconto NOT NULL,
  valor numeric(10, 2) NOT NULL,
  aplica_em public.aplica_desconto_em NOT NULL DEFAULT 'tudo',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracao_precos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faixas_delivery TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promocoes_dia_semana TO authenticated;
GRANT ALL ON public.configuracao_precos TO service_role;
GRANT ALL ON public.faixas_delivery TO service_role;
GRANT ALL ON public.promocoes_dia_semana TO service_role;

ALTER TABLE public.configuracao_precos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faixas_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promocoes_dia_semana ENABLE ROW LEVEL SECURITY;

CREATE POLICY "precos_admin_all" ON public.configuracao_precos FOR ALL TO authenticated
  USING (unidade_id = public.minha_unidade_id() AND public.sou_admin())
  WITH CHECK (unidade_id = public.minha_unidade_id() AND public.sou_admin());
CREATE POLICY "faixas_admin_all" ON public.faixas_delivery FOR ALL TO authenticated
  USING (unidade_id = public.minha_unidade_id() AND public.sou_admin())
  WITH CHECK (unidade_id = public.minha_unidade_id() AND public.sou_admin());
CREATE POLICY "promocoes_admin_all" ON public.promocoes_dia_semana FOR ALL TO authenticated
  USING (unidade_id = public.minha_unidade_id() AND public.sou_admin())
  WITH CHECK (unidade_id = public.minha_unidade_id() AND public.sou_admin());

CREATE TRIGGER precos_updated_at BEFORE UPDATE ON public.configuracao_precos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.configuracao_precos (unidade_id, valor_lavagem_por_cesto, valor_secagem_por_cesto, valor_atendente_por_pedido)
SELECT id, 8.00, 6.00, 10.00 FROM public.unidades WHERE slug = 'boa-vista';

INSERT INTO public.faixas_delivery (unidade_id, distancia_ate_km, valor)
SELECT id, 3, 10.00 FROM public.unidades WHERE slug = 'boa-vista'
UNION ALL
SELECT id, 8, 18.00 FROM public.unidades WHERE slug = 'boa-vista';

INSERT INTO public.promocoes_dia_semana (unidade_id, dia_semana, tipo_desconto, valor, aplica_em, ativo)
SELECT id, 2, 'percentual', 10, 'tudo', true FROM public.unidades WHERE slug = 'boa-vista';

ALTER TABLE public.pedidos_delivery
  ADD COLUMN valor_lavagem numeric(10, 2),
  ADD COLUMN valor_secagem numeric(10, 2),
  ADD COLUMN valor_atendente numeric(10, 2),
  ADD COLUMN valor_delivery numeric(10, 2),
  ADD COLUMN valor_desconto numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN desconto_descricao text,
  ADD COLUMN distancia_km numeric(6, 2),
  ADD COLUMN valor_total numeric(10, 2);

CREATE TABLE public.notificacoes_pedido (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos_delivery(id) ON DELETE CASCADE,
  status_notificado public.pedido_status NOT NULL,
  sucesso boolean NOT NULL,
  resposta text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notificacoes_pedido TO authenticated;
GRANT ALL ON public.notificacoes_pedido TO service_role;
ALTER TABLE public.notificacoes_pedido ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notificacoes_read_unidade" ON public.notificacoes_pedido FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.pedidos_delivery p
    WHERE p.id = pedido_id AND p.unidade_id = public.minha_unidade_id()
  )
);