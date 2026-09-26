-- Relação opcional entre um pedido de delivery e UM item também
-- controlado no estoque da geladeira (ex.: uma bebida vendida junto com
-- a lavagem) — não é um carrinho com múltiplos produtos, só o cenário
-- descrito na especificação: "um item extra vendido junto com o
-- serviço". Quando preenchido, o servidor desconta item_quantidade da
-- contagem do dia automaticamente (ver criarPedido/criarPedidoManual/
-- criarPedidoBalcao em pedidos.functions.ts) em vez de a atendente
-- precisar contar o produto duas vezes.
ALTER TABLE public.pedidos_delivery
  ADD COLUMN item_id uuid REFERENCES public.itens(id) ON DELETE SET NULL,
  ADD COLUMN item_quantidade integer CHECK (item_quantidade IS NULL OR item_quantidade > 0);
