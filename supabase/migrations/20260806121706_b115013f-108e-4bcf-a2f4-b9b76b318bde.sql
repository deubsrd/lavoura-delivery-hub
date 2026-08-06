GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.minha_unidade_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.sou_admin() TO anon, authenticated, service_role;