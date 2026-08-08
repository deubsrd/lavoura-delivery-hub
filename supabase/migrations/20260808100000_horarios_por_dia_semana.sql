-- Horário de funcionamento configurável por dia da semana. Substitui o
-- modelo antigo (hora_abertura/hora_fechamento fixos em `unidades`, iguais
-- todo dia) por uma linha por dia, permitindo fechar dias específicos ou
-- ter janelas diferentes por dia. As colunas antigas em `unidades`
-- permanecem (não usadas pelo cálculo a partir de agora) para não quebrar
-- nada que ainda dependa delas; `hora_limite_pedido` continua único por
-- unidade (não varia por dia).
CREATE TABLE public.horarios_unidade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  ativo boolean NOT NULL DEFAULT true,
  hora_abertura time NOT NULL DEFAULT '13:00',
  hora_fechamento time NOT NULL DEFAULT '19:00',
  UNIQUE (unidade_id, dia_semana)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.horarios_unidade TO authenticated;
GRANT ALL ON public.horarios_unidade TO service_role;

ALTER TABLE public.horarios_unidade ENABLE ROW LEVEL SECURITY;

CREATE POLICY "horarios_admin_all" ON public.horarios_unidade FOR ALL TO authenticated
  USING (unidade_id = private.minha_unidade_id() AND private.sou_admin())
  WITH CHECK (unidade_id = private.minha_unidade_id() AND private.sou_admin());

-- Semeia os 7 dias para cada unidade já existente, copiando o horário
-- fixo que já estava configurado (domingo marcado como fechado por
-- padrão, os demais dias abertos com o mesmo horário de antes).
INSERT INTO public.horarios_unidade (unidade_id, dia_semana, ativo, hora_abertura, hora_fechamento)
SELECT u.id, dia.n, dia.n <> 0, u.hora_abertura, u.hora_fechamento
FROM public.unidades u
CROSS JOIN generate_series(0, 6) AS dia(n);
