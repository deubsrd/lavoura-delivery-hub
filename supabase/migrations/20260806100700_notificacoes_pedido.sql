-- Espaço para notificações automáticas de status (WhatsApp). O envio em si
-- roda no servidor (src/lib/notificacoes.server.ts); esta tabela só
-- registra o resultado de cada tentativa.
CREATE TABLE public.notificacoes_pedido (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos_delivery(id) ON DELETE CASCADE,
  status_notificado public.pedido_status NOT NULL,
  sucesso boolean NOT NULL,
  resposta text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notificacoes_pedido TO authenticated;
GRANT ALL ON public.notificacoes_pedido TO service_role;
ALTER TABLE public.notificacoes_pedido ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notificacoes_read_unidade" ON public.notificacoes_pedido FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.pedidos_delivery p
    WHERE p.id = pedido_id AND p.unidade_id = public.minha_unidade_id()
  )
);
