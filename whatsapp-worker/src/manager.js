import { supabase } from "./supabaseClient.js";
import { WhatsappSession } from "./whatsappSession.js";
import { iniciarFilaDeSaida } from "./fila.js";

/**
 * Dono de todas as sessões WhatsApp ativas (uma por unidade) e ponto
 * único que decide quando abrir/fechar uma sessão, a partir do que está
 * em whatsapp_conexoes. Nunca chamado pelo app Cloudflare diretamente —
 * só reage ao que aparece no banco (comando='conectar'/'desconectar',
 * ou status='conectado' de uma sessão que existia antes do worker
 * reiniciar).
 */
export class Manager {
  constructor(sessionsDir) {
    this.sessionsDir = sessionsDir;
    this.sessoes = new Map();
  }

  async iniciar() {
    await this._varredura();

    supabase
      .channel("whatsapp-conexoes-comandos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conexoes" },
        (payload) => this._aoMudarConexao(payload.new),
      )
      .subscribe();

    iniciarFilaDeSaida((unidadeId) => {
      const sessao = this.sessoes.get(unidadeId);
      return sessao?.sock?.user ? sessao : null;
    });

    // Rede de segurança: se algum evento do Realtime se perder (reconexão
    // do canal, etc.), uma nova varredura periódica ainda pega o comando.
    setInterval(() => this._varredura(), 60_000);
  }

  async _varredura() {
    const { data: conexoes, error } = await supabase
      .from("whatsapp_conexoes")
      .select("unidade_id, status, comando");
    if (error) {
      console.error("[manager] falha ao listar whatsapp_conexoes", error.message);
      return;
    }
    for (const conexao of conexoes ?? []) {
      await this._aoMudarConexao(conexao);
    }
  }

  async _aoMudarConexao(conexao) {
    if (!conexao) return;
    const { unidade_id: unidadeId, comando, status } = conexao;

    if (comando === "desconectar" && this.sessoes.has(unidadeId)) {
      console.log(`[manager] desconectando unidade ${unidadeId}`);
      const sessao = this.sessoes.get(unidadeId);
      this.sessoes.delete(unidadeId);
      await sessao.desconectar();
      return;
    }

    const devePrecisarDeSessao = comando === "conectar" || status === "conectado" || status === "conectando";
    if (devePrecisarDeSessao && !this.sessoes.has(unidadeId)) {
      console.log(`[manager] iniciando sessão pra unidade ${unidadeId}`);
      const sessao = new WhatsappSession(unidadeId, this.sessionsDir);
      this.sessoes.set(unidadeId, sessao);
      try {
        await sessao.iniciar();
      } catch (err) {
        console.error(`[manager] falha ao iniciar sessão ${unidadeId}`, err);
        this.sessoes.delete(unidadeId);
      }
    }
  }

  /** Encerra os sockets sem invalidar sessão nenhuma — usado no shutdown do processo (SIGTERM/SIGINT). */
  encerrarTudoLocal() {
    for (const sessao of this.sessoes.values()) sessao.encerrarLocal();
  }
}
