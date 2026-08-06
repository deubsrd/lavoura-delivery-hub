-- Precificação configurável por unidade. Só admins da unidade (ver
-- sou_admin(), migração atendente_role) podem ler/editar essas tabelas —
-- o cálculo em si roda no servidor com service role (bypassa RLS), então
-- nenhuma dessas policies bloqueia o formulário público de pedido.

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

-- dia_semana segue a convenção de Date#getDay() no JS: 0 = domingo ... 6 = sábado.
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

-- Dados de exemplo para a unidade já existente, com os mesmos valores do
-- detalhamento ilustrado no pedido de implementação — ajustáveis a
-- qualquer momento pela tela de admin.
INSERT INTO public.configuracao_precos (unidade_id, valor_lavagem_por_cesto, valor_secagem_por_cesto, valor_atendente_por_pedido)
SELECT id, 8.00, 6.00, 10.00 FROM public.unidades WHERE slug = 'boa-vista';

INSERT INTO public.faixas_delivery (unidade_id, distancia_ate_km, valor)
SELECT id, 3, 10.00 FROM public.unidades WHERE slug = 'boa-vista'
UNION ALL
SELECT id, 8, 18.00 FROM public.unidades WHERE slug = 'boa-vista';

INSERT INTO public.promocoes_dia_semana (unidade_id, dia_semana, tipo_desconto, valor, aplica_em, ativo)
SELECT id, 2, 'percentual', 10, 'tudo', true FROM public.unidades WHERE slug = 'boa-vista';
