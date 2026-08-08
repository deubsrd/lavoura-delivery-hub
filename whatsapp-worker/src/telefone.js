/**
 * Convenção de telefone usada no resto do app (ver whatsappLink em
 * src/lib/lavoura.ts do app principal): `clientes.telefone` e
 * `whatsapp_mensagens.telefone` guardam só dígitos, SEM código de país —
 * ex. "92991176452" (DDD + número, 11 dígitos), não "5592991176452". Já
 * um JID do WhatsApp/Baileys é "5592991176452@s.whatsapp.net", COM código
 * de país. Essas duas funções fazem a ponte, sempre assumindo Brasil
 * ("55") quando o número não tiver código de país já.
 */

export function paraJid(telefoneLocal) {
  const digitos = telefoneLocal.replace(/\D/g, "");
  const comPais = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `${comPais}@s.whatsapp.net`;
}

/** "5592991176452@s.whatsapp.net" -> "92991176452" (tira o "55" e o sufixo do JID). */
export function paraTelefoneLocal(jid) {
  const digitos = jid.replace(/@.*$/, "").replace(/\D/g, "");
  return digitos.startsWith("55") && digitos.length > 11 ? digitos.slice(2) : digitos;
}
