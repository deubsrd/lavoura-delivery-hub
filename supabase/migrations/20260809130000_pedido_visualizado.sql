-- Marca quando a atendente clicou "Marcar como visualizado" num pedido
-- recém-chegado — para o alerta sonoro do painel (ver
-- src/hooks/use-order-alert-sound.ts). Diferente de avançar o status: só
-- reconhece que alguém viu o pedido e para o som, sem aceitar/processar
-- nada. Sincroniza entre atendentes via Realtime (já assinado em
-- pedidos_delivery), então uma atendente marcando como visualizado já para
-- o alarme na tela de todo mundo.
ALTER TABLE public.pedidos_delivery
  ADD COLUMN visualizado_em timestamptz;
