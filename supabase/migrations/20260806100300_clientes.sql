-- Cadastro de cliente por CPF: guarda o último endereço usado para que o
-- formulário público possa oferecer "usar o mesmo endereço de novo".
CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE RESTRICT,
  cpf text NOT NULL,
  nome_completo text NOT NULL,
  telefone text NOT NULL,
  ultima_rua text,
  ultimo_numero text,
  ultimo_bairro text,
  ultimo_complemento text,
  ultima_referencia text,
  ultima_rua_entrega text,
  ultimo_numero_entrega text,
  ultimo_bairro_entrega text,
  ultimo_complemento_entrega text,
  ultima_referencia_entrega text,
  ultimo_mesmo_endereco_entrega boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, cpf)
);

-- Todo acesso de escrita/leitura vindo do formulário público passa pelo
-- server function com supabaseAdmin (service role, ignora RLS), igual ao
-- padrão já usado em pedidos_delivery. A policy abaixo só existe para o
-- painel poder, no futuro, consultar clientes da própria unidade.
GRANT SELECT, UPDATE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clientes_read_unidade" ON public.clientes FOR SELECT TO authenticated
  USING (unidade_id = public.minha_unidade_id());
CREATE POLICY "clientes_update_unidade" ON public.clientes FOR UPDATE TO authenticated
  USING (unidade_id = public.minha_unidade_id()) WITH CHECK (unidade_id = public.minha_unidade_id());

CREATE TRIGGER clientes_updated_at BEFORE UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pedidos_delivery
  ADD COLUMN cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;
