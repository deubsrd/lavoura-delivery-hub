-- Registro das notificações de estoque baixo disparadas pra tela de
-- autonomia e alertas — mesmo padrão de notificacoes_pedido: o envio em
-- si roda no servidor (webhook do WhatsApp), esta tabela só guarda o
-- resultado de cada tentativa, e serve pra não notificar o mesmo item
-- toda vez que alguém abre a tela (só quando ele "entra" em vermelho de
-- novo depois de ter saído).
CREATE TABLE public.notificacoes_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.itens(id) ON DELETE CASCADE,
  dias_autonomia numeric(6, 2),
  sucesso boolean NOT NULL,
  resposta text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notificacoes_estoque TO authenticated;
GRANT ALL ON public.notificacoes_estoque TO service_role;
ALTER TABLE public.notificacoes_estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notificacoes_estoque_read_unidade" ON public.notificacoes_estoque FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.itens i
    WHERE i.id = item_id AND i.unidade_id = public.minha_unidade_id()
  )
);
