import fs from "node:fs/promises";
import path from "node:path";

import { supabase } from "./supabaseClient.js";

const BUCKET = "whatsapp-sessions";

/**
 * Backup/restauração dos arquivos de credencial do Baileys
 * (useMultiFileAuthState) no Supabase Storage, um prefixo de pasta por
 * unidade — assim, se a VM for perdida/recriada, o worker consegue
 * retomar a sessão sem pedir escanear o QR de novo. O disco local
 * continua sendo a fonte "quente" (é o que o Baileys lê/escreve a cada
 * mensagem); o Storage é só a cópia de segurança.
 */

/** Baixa os arquivos de sessão salvos do Storage pra pasta local, se a pasta local ainda não tiver nada. */
export async function restaurarSessao(unidadeId, pastaLocal) {
  const jaTemArquivosLocais = await pastaTemArquivos(pastaLocal);
  if (jaTemArquivosLocais) return;

  const { data: arquivos, error } = await supabase.storage.from(BUCKET).list(unidadeId);
  if (error) {
    console.error(`[sessao:${unidadeId}] falha ao listar backup no Storage`, error.message);
    return;
  }
  if (!arquivos || arquivos.length === 0) return;

  await fs.mkdir(pastaLocal, { recursive: true });
  let restaurados = 0;
  for (const arquivo of arquivos) {
    const { data, error: erroDownload } = await supabase.storage
      .from(BUCKET)
      .download(`${unidadeId}/${arquivo.name}`);
    if (erroDownload || !data) {
      console.error(`[sessao:${unidadeId}] falha ao baixar ${arquivo.name}`, erroDownload?.message);
      continue;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    await fs.writeFile(path.join(pastaLocal, arquivo.name), buffer);
    restaurados++;
  }
  if (restaurados > 0) {
    console.log(`[sessao:${unidadeId}] restaurou ${restaurados} arquivo(s) de sessão do Storage`);
  }
}

/** Sobe todos os arquivos da pasta local de sessão pro Storage (upsert — sobrescreve). */
export async function sincronizarSessao(unidadeId, pastaLocal) {
  let nomes;
  try {
    nomes = await fs.readdir(pastaLocal);
  } catch {
    return;
  }
  for (const nome of nomes) {
    const caminho = path.join(pastaLocal, nome);
    const conteudo = await fs.readFile(caminho).catch(() => null);
    if (!conteudo) continue;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${unidadeId}/${nome}`, conteudo, { upsert: true, contentType: "application/json" });
    if (error) {
      console.error(`[sessao:${unidadeId}] falha ao sincronizar ${nome} pro Storage`, error.message);
    }
  }
}

/** Remove o backup da sessão no Storage (chamado ao desconectar de propósito, não em toda queda de conexão). */
export async function apagarBackupSessao(unidadeId) {
  const { data: arquivos } = await supabase.storage.from(BUCKET).list(unidadeId);
  if (!arquivos || arquivos.length === 0) return;
  const caminhos = arquivos.map((a) => `${unidadeId}/${a.name}`);
  await supabase.storage.from(BUCKET).remove(caminhos);
}

async function pastaTemArquivos(pasta) {
  try {
    const nomes = await fs.readdir(pasta);
    return nomes.length > 0;
  } catch {
    return false;
  }
}
