-- Horário de coleta escolhido pelo cliente no formulário público (regra de
-- negócio: intervalo mínimo de 30 min entre coletas da mesma unidade).
ALTER TABLE public.pedidos_delivery
  ADD COLUMN horario_coleta timestamptz,
  ADD COLUMN pedido_fora_do_horario boolean NOT NULL DEFAULT false;

-- Exclusividade do slot a nível de banco.
CREATE UNIQUE INDEX idx_pedidos_unidade_horario_coleta
  ON public.pedidos_delivery (unidade_id, horario_coleta)
  WHERE status <> 'cancelado' AND horario_coleta IS NOT NULL;