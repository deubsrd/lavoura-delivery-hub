-- Rastreia se o pedido veio do link público (site) ou foi lançado
-- manualmente pela atendente/admin no painel (ex.: pedido por telefone),
-- pra dar controle sobre pedidos feitos fora do fluxo normal.
ALTER TABLE public.pedidos_delivery
  ADD COLUMN origem text NOT NULL DEFAULT 'site'
  CHECK (origem IN ('site', 'manual'));
