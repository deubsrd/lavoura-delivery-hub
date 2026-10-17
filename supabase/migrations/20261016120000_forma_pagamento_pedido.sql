-- Forma de pagamento do pedido de balcão (dinheiro em espécie, Pix, cartão
-- ou totem da loja). NULL = pedidos antigos / delivery, sem forma informada.
ALTER TABLE public.pedidos_delivery
  ADD COLUMN forma_pagamento text
  CHECK (forma_pagamento IS NULL OR forma_pagamento IN ('dinheiro', 'pix', 'cartao', 'totem'));
