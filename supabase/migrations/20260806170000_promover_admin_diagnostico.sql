-- As duas tentativas anteriores (20260806150000, 20260806160000) não
-- surtiram efeito — usuário confirmou (logout+login, botão "Preços"
-- continua ausente) que a conta deubsrd@gmail.com segue sem role admin.
-- Hipótese: comparação de e-mail sensível a caixa (email = '...') não
-- bateu com o valor real salvo em auth.users. Corrige com comparação
-- case-insensitive e, dessa vez, FALHA de forma visível (RAISE
-- EXCEPTION) se não encontrar a conta, em vez de silenciosamente não
-- fazer nada — para dar um sinal claro nos logs de migração se o
-- problema for outro (ex.: e-mail diferente do esperado).
DO $$
DECLARE
  usuario_id uuid;
  linhas_afetadas integer;
BEGIN
  SELECT id INTO usuario_id
  FROM auth.users
  WHERE lower(email) = lower('deubsrd@gmail.com')
  LIMIT 1;

  IF usuario_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário em auth.users com e-mail deubsrd@gmail.com (case-insensitive).';
  END IF;

  UPDATE public.atendentes
  SET role = 'admin'
  WHERE id = usuario_id;

  GET DIAGNOSTICS linhas_afetadas = ROW_COUNT;

  IF linhas_afetadas = 0 THEN
    RAISE EXCEPTION 'Usuário % encontrado em auth.users, mas não existe linha correspondente em public.atendentes.', usuario_id;
  END IF;
END $$;
