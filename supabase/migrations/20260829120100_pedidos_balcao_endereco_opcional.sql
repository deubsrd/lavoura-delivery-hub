-- Pedido de balcão não tem endereço (cliente traz e busca pessoalmente),
-- então rua/numero/bairro deixam de ser obrigatórios — mas continuam
-- exigidos para qualquer outro tipo_servico (busca/entrega/busca_e_entrega),
-- via CHECK, para não permitir um pedido de delivery sem endereço.
ALTER TABLE public.pedidos_delivery
  ALTER COLUMN rua DROP NOT NULL,
  ALTER COLUMN numero DROP NOT NULL,
  ALTER COLUMN bairro DROP NOT NULL;

ALTER TABLE public.pedidos_delivery
  ADD CONSTRAINT pedidos_delivery_endereco_obrigatorio_exceto_balcao
  CHECK (
    tipo_servico = 'balcao'
    OR (rua IS NOT NULL AND numero IS NOT NULL AND bairro IS NOT NULL)
  );
