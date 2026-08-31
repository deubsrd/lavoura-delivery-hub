-- Novo tipo de serviço: atendimento de balcão — cliente traz a roupa
-- pessoalmente e busca depois, sem delivery. Precisa estar em migration
-- própria (sem uso do valor no mesmo arquivo): ALTER TYPE ... ADD VALUE
-- não pode ser referenciado na mesma transação em que foi adicionado.
ALTER TYPE public.tipo_servico ADD VALUE IF NOT EXISTS 'balcao';
