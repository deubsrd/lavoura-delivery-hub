import "dotenv/config";
import path from "node:path";

import { Manager } from "./manager.js";

const sessionsDir = path.resolve(process.env.SESSIONS_DIR || "./sessions");

console.log(`[worker] iniciando — sessões em ${sessionsDir}`);

const manager = new Manager(sessionsDir);
await manager.iniciar();

console.log("[worker] pronto — observando whatsapp_conexoes e whatsapp_mensagens");

// PM2/systemd mandam SIGTERM num restart/stop normal — encerra os sockets
// sem deslogar (a sessão continua válida e é retomada no próximo start).
for (const sinal of ["SIGTERM", "SIGINT"]) {
  process.on(sinal, () => {
    console.log(`[worker] recebido ${sinal}, encerrando…`);
    manager.encerrarTudoLocal();
    process.exit(0);
  });
}

process.on("unhandledRejection", (err) => {
  console.error("[worker] unhandledRejection", err);
});
