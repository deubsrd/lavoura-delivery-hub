-- O painel passa a carregar por padrão só os pedidos dos últimos 30 dias
-- (com opção de expandir para 90 dias ou todo o histórico). Esse índice
-- composto cobre tanto o filtro por unidade (já usado via RLS) quanto o
-- corte por data_pedido.
CREATE INDEX idx_pedidos_unidade_data ON public.pedidos_delivery (unidade_id, data_pedido DESC);
