-- Marca pedidos cancelados como "teste" — usado quando a atendente ou o
-- time cria um pedido só pra testar o sistema e depois cancela. Esses
-- pedidos não devem contar na taxa de desistência do Dashboard (nem no
-- numerador nem no denominador), já que não representam um cliente real
-- desistindo. Ver Card/Dialog de cancelamento em painel.tsx e o cálculo
-- de taxaCancelamentoEsteMes em dashboard.tsx.
ALTER TABLE public.pedidos_delivery
  ADD COLUMN cancelamento_teste boolean NOT NULL DEFAULT false;
