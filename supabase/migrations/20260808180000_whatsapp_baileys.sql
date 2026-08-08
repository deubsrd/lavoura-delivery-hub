-- Integração WhatsApp via Baileys (conexão direta por QR code, rodando num
-- script Node standalone fora deste app — ver whatsapp-worker/). O app
-- Cloudflare e o script da VM nunca se chamam diretamente: toda a
-- comunicação passa por estas tabelas + Supabase Realtime.
--
-- Uma conexão por unidade (cada lavanderia pareia o próprio número).
-- `comando` é uma fila de 1 posição só: o app grava 'conectar'/
-- 'desconectar', o script assina via Realtime, executa e volta o campo pra
-- 'nenhum'. Não há histórico de comandos — não precisa, cada unidade só
-- tem uma conexão ativa por vez.
CREATE TYPE public.whatsapp_status AS ENUM ('desconectado', 'conectando', 'conectado');
CREATE TYPE public.whatsapp_comando AS ENUM ('nenhum', 'conectar', 'desconectar');

CREATE TABLE public.whatsapp_conexoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL UNIQUE REFERENCES public.unidades(id) ON DELETE CASCADE,
  status public.whatsapp_status NOT NULL DEFAULT 'desconectado',
  comando public.whatsapp_comando NOT NULL DEFAULT 'nenhum',
  qr_atual text,
  telefone_conectado text,
  conectado_em timestamptz,
  erro text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.whatsapp_conexoes TO authenticated;
GRANT ALL ON public.whatsapp_conexoes TO service_role;
ALTER TABLE public.whatsapp_conexoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_conexoes_admin_all" ON public.whatsapp_conexoes FOR ALL TO authenticated
  USING (unidade_id = private.minha_unidade_id() AND private.sou_admin())
  WITH CHECK (unidade_id = private.minha_unidade_id() AND private.sou_admin());

CREATE TRIGGER whatsapp_conexoes_updated_at BEFORE UPDATE ON public.whatsapp_conexoes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Mensagens enviadas/recebidas, uma tabela só pra notificação automática de
-- status de pedido (origem='automatica') e chat manual (origem='manual') —
-- a atendente vê tudo na mesma conversa. `status` só é significativo pra
-- direcao='enviada' (o script atualiza pendente -> enviada/falhou depois
-- de tentar mandar pro WhatsApp); mensagens recebidas já entram 'enviada'
-- (não fazem sentido "pendentes").
CREATE TYPE public.mensagem_direcao AS ENUM ('enviada', 'recebida');
CREATE TYPE public.mensagem_origem AS ENUM ('automatica', 'manual');
CREATE TYPE public.mensagem_status AS ENUM ('pendente', 'enviada', 'entregue', 'lida', 'falhou');

CREATE TABLE public.whatsapp_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  pedido_id uuid REFERENCES public.pedidos_delivery(id) ON DELETE SET NULL,
  telefone text NOT NULL,
  direcao public.mensagem_direcao NOT NULL,
  origem public.mensagem_origem NOT NULL DEFAULT 'manual',
  status public.mensagem_status NOT NULL DEFAULT 'pendente',
  texto text NOT NULL,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz
);

CREATE INDEX idx_whatsapp_mensagens_unidade_telefone
  ON public.whatsapp_mensagens (unidade_id, telefone, created_at DESC);
-- Fila de saída que o script Baileys consome: toda mensagem 'enviada' (no
-- sentido direcao) que ainda está com status 'pendente'.
CREATE INDEX idx_whatsapp_mensagens_pendentes
  ON public.whatsapp_mensagens (unidade_id, created_at)
  WHERE direcao = 'enviada' AND status = 'pendente';

GRANT SELECT, INSERT ON public.whatsapp_mensagens TO authenticated;
GRANT ALL ON public.whatsapp_mensagens TO service_role;
ALTER TABLE public.whatsapp_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_mensagens_admin_read" ON public.whatsapp_mensagens FOR SELECT TO authenticated
  USING (unidade_id = private.minha_unidade_id() AND private.sou_admin());
-- Só o service_role (script na VM) grava recebidas, atualiza status ou
-- registra notificação automática; o app só insere mensagem manual nova
-- (sempre 'enviada'/'manual'/'pendente' — o resto do ciclo de vida é do
-- script).
CREATE POLICY "whatsapp_mensagens_admin_insert_manual" ON public.whatsapp_mensagens FOR INSERT TO authenticated
  WITH CHECK (
    unidade_id = private.minha_unidade_id() AND private.sou_admin()
    AND direcao = 'enviada' AND origem = 'manual' AND status = 'pendente'
  );

ALTER TABLE public.whatsapp_conexoes REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_mensagens REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conexoes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_mensagens;

-- Backup das credenciais de sessão do Baileys (arquivos do
-- useMultiFileAuthState, um "prefixo de pasta" por unidade dentro do
-- bucket). Bucket privado: só o service_role (script na VM, que usa a
-- service_role key) acessa — RLS de storage.objects nem entra em jogo
-- porque service_role sempre ignora RLS; não expor esse bucket a
-- authenticated/anon.
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-sessions', 'whatsapp-sessions', false)
ON CONFLICT (id) DO NOTHING;
