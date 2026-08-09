-- Promove manualmente a atendente vinculada ao e-mail gaabriel@gmail.com a
-- admin da sua unidade, a pedido direto do responsável da rede. Nota: e-mail
-- diferente do promovido anteriormente (gaabrielflorence@gmail.com, migração
-- 20260806180000) — se for a mesma pessoa e isso for um erro de digitação,
-- essa migração falha alto (RAISE EXCEPTION) em vez de silenciosamente não
-- fazer nada, então o problema fica óbvio no log em vez de "sumir".
DO $$
DECLARE
  usuario_id uuid;
  linhas_afetadas integer;
BEGIN
  SELECT id INTO usuario_id
  FROM auth.users
  WHERE lower(email) = lower('gaabriel@gmail.com')
  LIMIT 1;

  IF usuario_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário em auth.users com e-mail gaabriel@gmail.com (case-insensitive).';
  END IF;

  UPDATE public.atendentes
  SET role = 'admin'
  WHERE id = usuario_id;

  GET DIAGNOSTICS linhas_afetadas = ROW_COUNT;

  IF linhas_afetadas = 0 THEN
    RAISE EXCEPTION 'Usuário % encontrado em auth.users, mas não existe linha correspondente em public.atendentes.', usuario_id;
  END IF;
END $$;
