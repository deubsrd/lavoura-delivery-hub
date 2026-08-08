-- Preço customizado do cesto (lavagem + secagem combinadas) por dia da
-- semana + faixa de horário — mesma ideia da tela "Preços por dia/horário"
-- de referência, aplicada ao preço do cesto em vez de por máquina. Quando o
-- horário de coleta do pedido cai dentro de uma dessas janelas, o preço de
-- lavagem+secagem daquele pedido usa `valor_cesto` no lugar da soma de
-- valor_lavagem_por_cesto + valor_secagem_por_cesto (ver calcularPreco em
-- pedido-calculo.server.ts). `hora_fim <= hora_inicio` é permitido e
-- significa uma janela que atravessa a meia-noite (ex.: 23:00–00:59).
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

CREATE POLICY "precos_horario_admin_all" ON public.precos_por_horario FOR ALL TO authenticated
  USING (unidade_id = private.minha_unidade_id() AND private.sou_admin())
  WITH CHECK (unidade_id = private.minha_unidade_id() AND private.sou_admin());
