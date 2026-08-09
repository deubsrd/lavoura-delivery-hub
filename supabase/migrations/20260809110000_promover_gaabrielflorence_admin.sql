-- Repromove gaabrielflorence@gmail.com a admin da unidade (o e-mail correto
-- — a tentativa anterior, gaabriel@gmail.com, era um erro de digitação e
-- foi revertida). Já existe uma migração antiga com o mesmo efeito
-- (20260806180000_promover_gabriel_admin.sql); esta é só pra garantir que
-- o UPDATE realmente rode agora, caso aquela nunca tenha sido aplicada no
-- banco — é idempotente, rodar de novo em quem já é admin não muda nada.
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
