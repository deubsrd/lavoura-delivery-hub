-- Atualiza as faixas de delivery com os valores reais informados pela
-- rede. A partir desta entrega, o valor de cada faixa é cobrado uma vez
-- por "perna" do trajeto (coleta e/ou entrega) — ver
-- src/lib/pedido-calculo.server.ts. A última faixa (999km) funciona como
-- teto "acima disso" sem limite superior real: nenhuma distância de
-- entrega plausível vai passar de 999km, então ela sempre casa como
-- fallback para "acima do maior limite configurado".
DELETE FROM public.faixas_delivery
WHERE unidade_id = (SELECT id FROM public.unidades WHERE slug = 'boa-vista');

INSERT INTO public.faixas_delivery (unidade_id, distancia_ate_km, valor)
SELECT id, 7.9, 10.00 FROM public.unidades WHERE slug = 'boa-vista'
UNION ALL
SELECT id, 12.9, 15.00 FROM public.unidades WHERE slug = 'boa-vista'
UNION ALL
SELECT id, 16.9, 20.00 FROM public.unidades WHERE slug = 'boa-vista'
UNION ALL
SELECT id, 999, 25.00 FROM public.unidades WHERE slug = 'boa-vista';
