GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.minha_unidade_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sou_admin() TO authenticated;