CREATE TYPE public.categoria_item AS ENUM ('limpeza', 'geladeira');
CREATE TYPE public.unidade_medida_item AS ENUM ('litro', 'unidade', 'pacote');

CREATE TABLE public.itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE RESTRICT,
  nome text NOT NULL,
  categoria public.categoria_item NOT NULL,
  unidade_medida public.unidade_medida_item NOT NULL,
  estoque_minimo numeric(10, 2) NOT NULL DEFAULT 0,
  custo_unitario numeric(10, 2),
  limite_alerta_amarelo_dias numeric(5, 1) NOT NULL DEFAULT 7,
  limite_alerta_vermelho_dias numeric(5, 1) NOT NULL DEFAULT 3,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lancamentos_diarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.itens(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE RESTRICT,
  data date NOT NULL,
  quantidade numeric(10, 2) NOT NULL CHECK (quantidade >= 0),
  usuario_id uuid REFERENCES public.atendentes(id) ON DELETE SET NULL,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'delivery')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, data)
);
CREATE INDEX idx_lancamentos_diarios_item_data ON public.lancamentos_diarios (item_id, data DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.itens TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lancamentos_diarios TO authenticated;
GRANT ALL ON public.itens TO service_role;
GRANT ALL ON public.lancamentos_diarios TO service_role;
ALTER TABLE public.itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos_diarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "itens_select_unidade" ON public.itens FOR SELECT TO authenticated
  USING (unidade_id = public.minha_unidade_id());
CREATE POLICY "itens_admin_escreve" ON public.itens FOR INSERT TO authenticated
  WITH CHECK (unidade_id = public.minha_unidade_id() AND public.sou_admin());
CREATE POLICY "itens_admin_atualiza" ON public.itens FOR UPDATE TO authenticated
  USING (unidade_id = public.minha_unidade_id() AND public.sou_admin())
  WITH CHECK (unidade_id = public.minha_unidade_id() AND public.sou_admin());
CREATE POLICY "itens_admin_remove" ON public.itens FOR DELETE TO authenticated
  USING (unidade_id = public.minha_unidade_id() AND public.sou_admin());
CREATE POLICY "lancamentos_select_unidade" ON public.lancamentos_diarios FOR SELECT TO authenticated
  USING (unidade_id = public.minha_unidade_id());
CREATE POLICY "lancamentos_insert_unidade" ON public.lancamentos_diarios FOR INSERT TO authenticated
  WITH CHECK (unidade_id = public.minha_unidade_id());
CREATE POLICY "lancamentos_update_unidade" ON public.lancamentos_diarios FOR UPDATE TO authenticated
  USING (unidade_id = public.minha_unidade_id()) WITH CHECK (unidade_id = public.minha_unidade_id());

CREATE TRIGGER itens_updated_at BEFORE UPDATE ON public.itens
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER lancamentos_diarios_updated_at BEFORE UPDATE ON public.lancamentos_diarios
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
  EXISTS (SELECT 1 FROM public.itens i WHERE i.id = item_id AND i.unidade_id = public.minha_unidade_id())
);

ALTER TABLE public.pedidos_delivery
  ADD COLUMN item_id uuid REFERENCES public.itens(id) ON DELETE SET NULL,
  ADD COLUMN item_quantidade integer CHECK (item_quantidade IS NULL OR item_quantidade > 0);

NOTIFY pgrst, 'reload schema';