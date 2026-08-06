-- A promoção anterior (20260806150000) rodou antes da conta
-- deubsrd@gmail.com existir de fato (atendente logou depois disso), então
-- o UPDATE não encontrou nenhuma linha pra atualizar. Refaz agora que a
-- conta já existe. Idempotente — seguro rodar de novo.
UPDATE public.atendentes
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'deubsrd@gmail.com');
