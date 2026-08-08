-- Horário de coleta escolhido pelo cliente no formulário público (regra de
-- negócio: intervalo mínimo de 30 min entre coletas da mesma unidade — ver
-- DURACAO_SLOT_COLETA_MINUTOS em src/lib/pedido-calculo.server.ts). Nulo nos
-- pedidos criados antes desta migration (não têm coleta agendada por
-- horário — o campo não é retroativamente preenchido).
--
-- `pedido_fora_do_horario` marca pedidos feitos com a unidade fechada (fora
-- do horário de funcionamento no momento em que o cliente enviou o
-- pedido, não no horário de coleta escolhido): esses pedidos são
-- agendados automaticamente para o próximo horário livre e não devem
-- exigir aceite manual da atendente nem disparar o alerta sonoro de
-- pedido novo (ver painel.tsx). Pedidos feitos com a unidade aberta
-- continuam exigindo aceite normalmente, mesmo que o horário de coleta
-- escolhido seja num dia futuro.
ALTER TABLE public.pedidos_delivery
  ADD COLUMN horario_coleta timestamptz,
  ADD COLUMN pedido_fora_do_horario boolean NOT NULL DEFAULT false;

-- Exclusividade do slot a nível de banco: garante que dois pedidos da
-- mesma unidade nunca fiquem com o mesmo horario_coleta, mesmo sob
-- concorrência (duas pessoas confirmando o mesmo horário ao mesmo
-- tempo — a segunda tentativa de INSERT recebe erro de unicidade, ver
-- criarPedido em pedidos.functions.ts). Pedidos cancelados liberam o
-- slot de volta (fora do índice), e pedidos sem horario_coleta (registros
-- antigos) não entram na restrição.
CREATE UNIQUE INDEX idx_pedidos_unidade_horario_coleta
  ON public.pedidos_delivery (unidade_id, horario_coleta)
  WHERE status <> 'cancelado' AND horario_coleta IS NOT NULL;
