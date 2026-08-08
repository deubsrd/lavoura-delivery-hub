import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env deste worker (whatsapp-worker/.env, não o .env do app principal).",
  );
}

// service_role: ignora RLS de propósito — este processo é o único que
// escreve mensagens recebidas, atualiza status de envio e mexe na sessão
// de todas as unidades. Nunca reuse esse client fora deste worker.
export const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
