-- Mídia de propaganda (imagem ou vídeo) exibida ao lado do hero da home
-- pública — configurada pelo admin em Configurações > Identificação.
ALTER TABLE public.unidades
  ADD COLUMN midia_propaganda_url text,
  ADD COLUMN midia_propaganda_tipo text CHECK (midia_propaganda_tipo IN ('imagem', 'video'));

-- A home pública (sem login) precisa ler isso — reexpõe a view com as duas
-- colunas novas, mantendo todas as que já existiam.
CREATE OR REPLACE VIEW public.unidades_publico AS
  SELECT id, nome, slug, cidade, prazo_padrao_horas, created_at,
         hora_abertura, hora_fechamento, hora_limite_pedido,
         midia_propaganda_url, midia_propaganda_tipo
  FROM public.unidades;

-- CREATE OR REPLACE VIEW não reseta storage parameters já aplicados via
-- ALTER VIEW, mas reafirma aqui por segurança (é o que faz a view respeitar
-- as políticas de RLS do usuário que consulta, não do dono da view).
ALTER VIEW public.unidades_publico SET (security_invoker = true);

-- Bucket público (a mídia precisa aparecer na home sem autenticação).
-- Upload/gerenciamento só pelo admin da própria unidade — os arquivos
-- ficam sob um prefixo de pasta "{unidade_id}/...", e a policy confere
-- esse prefixo contra a unidade do usuário logado.
INSERT INTO storage.buckets (id, name, public)
VALUES ('midia-propaganda', 'midia-propaganda', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "midia_propaganda_leitura_publica" ON storage.objects FOR SELECT
  USING (bucket_id = 'midia-propaganda');

CREATE POLICY "midia_propaganda_admin_insere" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'midia-propaganda'
    AND (storage.foldername(name))[1] = private.minha_unidade_id()::text
    AND private.sou_admin()
  );

CREATE POLICY "midia_propaganda_admin_atualiza" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'midia-propaganda'
    AND (storage.foldername(name))[1] = private.minha_unidade_id()::text
    AND private.sou_admin()
  );

CREATE POLICY "midia_propaganda_admin_remove" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'midia-propaganda'
    AND (storage.foldername(name))[1] = private.minha_unidade_id()::text
    AND private.sou_admin()
  );
