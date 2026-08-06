-- Retrato congelado do preço no momento da criação do pedido: mudanças
-- futuras em configuracao_precos/faixas_delivery/promocoes_dia_semana não
-- podem alterar pedidos já criados.
ALTER TABLE public.pedidos_delivery
  ADD COLUMN valor_lavagem numeric(10, 2),
  ADD COLUMN valor_secagem numeric(10, 2),
  ADD COLUMN valor_atendente numeric(10, 2),
  ADD COLUMN valor_delivery numeric(10, 2),
  ADD COLUMN valor_desconto numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN desconto_descricao text,
  ADD COLUMN distancia_km numeric(6, 2),
  ADD COLUMN valor_total numeric(10, 2);
