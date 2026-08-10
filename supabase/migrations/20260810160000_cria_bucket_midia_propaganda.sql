-- A migração anterior (20260810143248) criou as políticas de RLS para o
-- bucket "midia-propaganda" mas nunca criou o bucket em si, então todo
-- upload ficava com URL pública quebrada ("Bucket not found").
INSERT INTO storage.buckets (id, name, public)
VALUES ('midia-propaganda', 'midia-propaganda', true)
ON CONFLICT (id) DO NOTHING;
