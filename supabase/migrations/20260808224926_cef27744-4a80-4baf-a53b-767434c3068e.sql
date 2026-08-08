CREATE TABLE public.precos_por_horario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE RESTRICT,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  valor_cesto numeric(10, 2) NOT NULL CHECK (valor_cesto >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.precos_por_horario TO authenticated;
GRANT ALL ON public.precos_por_horario TO service_role;

ALTER TABLE public.precos_por_horario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "precos_horario_admin_all"
  ON public.precos_por_horario
  FOR ALL
  TO authenticated
  USING (unidade_id = private.minha_unidade_id() AND private.sou_admin())
  WITH CHECK (unidade_id = private.minha_unidade_id() AND private.sou_admin());