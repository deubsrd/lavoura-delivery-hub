-- Promove manualmente a atendente vinculada ao e-mail
-- gaabrielflorence@gmail.com a admin da sua unidade, a pedido direto do
-- responsável da rede. Comparação case-insensitive e falha visível (em
-- vez de silenciosamente não fazer nada) — mesmo padrão que resolveu o
-- problema da promoção anterior (deubsrd@gmail.com).
DO $$
DECLARE
  usuario_id uuid;
  linhas_afetadas integer;
BEGIN
  SELECT id INTO usuario_id
  FROM auth.users
  WHERE lower(email) = lower('gaabrielflorence@gmail.com')
  LIMIT 1;

  IF usuario_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário em auth.users com e-mail gaabrielflorence@gmail.com (case-insensitive).';
  END IF;

  UPDATE public.atendentes
  SET role = 'admin'
  WHERE id = usuario_id;

  GET DIAGNOSTICS linhas_afetadas = ROW_COUNT;

  IF linhas_afetadas = 0 THEN
    RAISE EXCEPTION 'Usuário % encontrado em auth.users, mas não existe linha correspondente em public.atendentes.', usuario_id;
  END IF;
END $$;
