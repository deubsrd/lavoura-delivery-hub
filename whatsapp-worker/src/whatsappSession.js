import fs from "node:fs/promises";
import path from "node:path";

import baileysPkg from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";

import { supabase } from "./supabaseClient.js";
import { restaurarSessao, sincronizarSessao, apagarBackupSessao } from "./sessionStorage.js";
import { paraJid, paraTelefoneLocal } from "./telefone.js";

const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } =
  baileysPkg;

const LOGGER = pino({ level: process.env.BAILEYS_LOG_LEVEL || "warn" });

/**
 * Uma sessão Baileys = um número de WhatsApp = uma unidade. Cuida de
 * conectar, gerar/gravar QR, reconectar sozinho quando a conexão cai por
 * motivo transitório, gravar mensagem recebida no Supabase e expor
 * `enviarMensagem` pra fila de saída (ver fila.js) usar.
 */
export class WhatsappSession {
  constructor(unidadeId, sessionsDir) {
    this.unidadeId = unidadeId;
    this.pastaSessao = path.join(sessionsDir, unidadeId);
    this.sock = null;
    this.encerradaPeloUsuario = false;
    this.syncTimer = null;
  }

  async iniciar() {
    await fs.mkdir(this.pastaSessao, { recursive: true });
    await restaurarSessao(this.unidadeId, this.pastaSessao);

    const { state, saveCreds } = await useMultiFileAuthState(this.pastaSessao);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: state,
      logger: LOGGER,
      // Cada unidade aparece com um nome reconhecível na lista de
      // "aparelhos conectados" do WhatsApp do cliente.
      browser: ["Lavoura Delivery", "Chrome", "1.0"],
    });

    this.sock.ev.on("creds.update", async () => {
      await saveCreds();
      this._agendarSincronizacaoStorage();
    });

    this.sock.ev.on("connection.update", (update) => this._aoAtualizarConexao(update));
    this.sock.ev.on("messages.upsert", (evento) => this._aoReceberMensagens(evento));
  }

  _agendarSincronizacaoStorage() {
    // Debounce: creds.update pode disparar várias vezes seguidas (troca
    // de chaves, etc.) — junta tudo numa sincronização só, alguns
    // segundos depois da última mudança.
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      sincronizarSessao(this.unidadeId, this.pastaSessao).catch((err) =>
        console.error(`[sessao:${this.unidadeId}] falha ao sincronizar sessão`, err),
      );
    }, 5000);
  }

  async _aoAtualizarConexao(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrPng = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
      await this._atualizarConexaoNoBanco({ status: "conectando", qr_atual: qrPng, erro: null });
    }

    if (connection === "open") {
      const telefone = this.sock.user?.id ? paraTelefoneLocal(this.sock.user.id) : null;
      await this._atualizarConexaoNoBanco({
        status: "conectado",
        qr_atual: null,
        telefone_conectado: telefone,
        conectado_em: new Date().toISOString(),
        comando: "nenhum",
        erro: null,
      });
      console.log(`[sessao:${this.unidadeId}] conectado (${telefone})`);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const deslogado = statusCode === DisconnectReason.loggedOut;

      if (this.encerradaPeloUsuario || deslogado) {
        await this._atualizarConexaoNoBanco({
          status: "desconectado",
          qr_atual: null,
          telefone_conectado: null,
          comando: "nenhum",
          erro: deslogado ? "Sessão desconectada pelo WhatsApp (deslogado no celular)." : null,
        });
        await fs.rm(this.pastaSessao, { recursive: true, force: true }).catch(() => {});
        await apagarBackupSessao(this.unidadeId).catch(() => {});
        console.log(`[sessao:${this.unidadeId}] encerrada definitivamente`);
        return;
      }

      // Qualquer outro motivo (queda de rede, restart do WhatsApp, etc.):
      // reconecta sozinho. Isso é o comportamento padrão recomendado pela
      // documentação do Baileys.
      console.log(`[sessao:${this.unidadeId}] conexão caiu (${statusCode ?? "?"}), reconectando…`);
      await this._atualizarConexaoNoBanco({ status: "conectando" });
      await this.iniciar();
    }
  }

  async _aoReceberMensagens({ messages, type }) {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue; // eco da própria mensagem enviada, não é "recebida"
      if (!msg.key.remoteJid || msg.key.remoteJid.endsWith("@g.us")) continue; // ignora grupos

      const texto =
        msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? null;
      if (!texto) continue; // MVP: só texto (áudio/imagem/etc. ficam de fora por enquanto)

      const telefone = paraTelefoneLocal(msg.key.remoteJid);

      const { data: cliente } = await supabase
        .from("clientes")
        .select("id")
        .eq("unidade_id", this.unidadeId)
        .eq("telefone", telefone)
        .maybeSingle();

      const { error } = await supabase.from("whatsapp_mensagens").insert({
        unidade_id: this.unidadeId,
        cliente_id: cliente?.id ?? null,
        telefone,
        direcao: "recebida",
        origem: "manual",
        status: "enviada",
        texto,
      });
      if (error) {
        console.error(`[sessao:${this.unidadeId}] falha ao gravar mensagem recebida`, error.message);
      }
    }
  }

  async _atualizarConexaoNoBanco(campos) {
    const { error } = await supabase
      .from("whatsapp_conexoes")
      .update(campos)
      .eq("unidade_id", this.unidadeId);
    if (error) {
      console.error(`[sessao:${this.unidadeId}] falha ao atualizar whatsapp_conexoes`, error.message);
    }
  }

  /** Manda uma mensagem de texto — usada pela fila de saída (ver fila.js). */
  async enviarMensagem(telefoneLocal, texto) {
    if (!this.sock) throw new Error("Sessão ainda não conectada.");
    await this.sock.sendMessage(paraJid(telefoneLocal), { text: texto });
  }

  /** Desconecta de propósito (usuário pediu, ver whatsapp_conexoes.comando = 'desconectar'). */
  async desconectar() {
    this.encerradaPeloUsuario = true;
    try {
      await this.sock?.logout();
    } catch (err) {
      console.error(`[sessao:${this.unidadeId}] erro ao desconectar`, err);
    }
  }

  /** Só encerra o processo local (ex.: shutdown do worker) sem invalidar a sessão — reconecta sozinho no próximo start. */
  encerrarLocal() {
    this.sock?.end(undefined);
  }
}
