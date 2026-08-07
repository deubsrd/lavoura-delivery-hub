-- Promove a primeira atendente de cada unidade a admin quando a unidade ainda não tem admin
UPDATE public.atendentes a
SET role = 'admin'
WHERE a.role <> 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.atendentes b
    WHERE b.unidade_id = a.unidade_id AND b.role = 'admin'
  )
  AND a.id = (
    SELECT c.id FROM public.atendentes c
    WHERE c.unidade_id = a.unidade_id
    ORDER BY c.created_at ASC
    LIMIT 1
  );