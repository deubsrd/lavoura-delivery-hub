ALTER TABLE public.unidades
  ADD COLUMN midia_propaganda_url text,
  ADD COLUMN midia_propaganda_tipo text CHECK (midia_propaganda_tipo IN ('imagem', 'video'));

CREATE OR REPLACE VIEW public.unidades_publico AS
  SELECT id, nome, slug, cidade, prazo_padrao_horas, created_at,
         hora_abertura, hora_fechamento, hora_limite_pedido,
         midia_propaganda_url, midia_propaganda_tipo
  FROM public.unidades;

ALTER VIEW public.unidades_publico SET (security_invoker = true);

GRANT SELECT ON public.unidades_publico TO anon, authenticated;
GRANT ALL ON public.unidades_publico TO service_role;

GRANT SELECT (midia_propaganda_url, midia_propaganda_tipo) ON public.unidades TO anon, authenticated;

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