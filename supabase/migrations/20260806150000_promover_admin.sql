-- Promove manualmente a atendente vinculada ao e-mail deubsrd@gmail.com
-- a admin da sua unidade, conforme pedido direto do responsável da rede.
UPDATE public.atendentes
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'deubsrd@gmail.com');
