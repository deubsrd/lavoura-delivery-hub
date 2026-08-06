-- Configuração operacional por unidade: horário de funcionamento (usado
-- tanto no texto informativo do formulário quanto no cálculo de prazo),
-- quantidade de conjuntos lavadora+secadora rodando em paralelo, e
-- endereço/coordenadas da própria unidade (origem do cálculo de distância
-- de delivery via Google Maps).
ALTER TABLE public.unidades
  ADD COLUMN hora_abertura time NOT NULL DEFAULT '13:00',
  ADD COLUMN hora_fechamento time NOT NULL DEFAULT '19:00',
  ADD COLUMN hora_limite_pedido time NOT NULL DEFAULT '17:00',
  ADD COLUMN quantidade_maquinas integer NOT NULL DEFAULT 3,
  ADD COLUMN endereco_completo text,
  ADD COLUMN latitude numeric(9, 6),
  ADD COLUMN longitude numeric(9, 6);

-- endereco_completo/latitude/longitude ficam nulos até serem preenchidos
-- manualmente (Supabase dashboard) com a localização real de cada unidade;
-- sem eles o cálculo de distância do delivery mostra um aviso amigável em
-- vez de travar o formulário (ver src/lib/google-maps.server.ts).

CREATE OR REPLACE VIEW public.unidades_publico AS
  SELECT id, nome, slug, cidade, prazo_padrao_horas, created_at,
         hora_abertura, hora_fechamento, hora_limite_pedido
  FROM public.unidades;

-- horario_preferido sai do escopo do pedido: no lugar, o form mostra um
-- texto fixo com o horário de funcionamento configurado acima.
ALTER TABLE public.pedidos_delivery DROP COLUMN horario_preferido;
DROP TYPE public.horario_preferido;
