REVOKE ALL ON FUNCTION public.log_status_change() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.minha_unidade_id() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.minha_unidade_id() TO authenticated;