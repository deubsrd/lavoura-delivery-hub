ALTER TABLE public.pedidos_delivery
  ADD COLUMN origem text NOT NULL DEFAULT 'site'
  CHECK (origem IN ('site', 'manual'));