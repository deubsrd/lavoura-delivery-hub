import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Alerta sonoro em loop (estilo iFood) para pedidos aguardando decisão da
 * atendente. Não depende de nenhum arquivo de áudio — o som ("ding-dong")
 * é sintetizado na hora via Web Audio API.
 *
 * Por quê loop e não um toque único: um "ping" isolado passa despercebido
 * se a atendente estiver de costas pro balcão ou atendendo outra cliente.
 * Aqui o alerta soa repetidamente enquanto `pendingCount` (pedidos com
 * status "recebido", ou seja, ainda não aceitos nem recusados) for maior
 * que zero, e só para quando esse número chega a zero — isto é, quando a
 * atendente aceita (avança o status) ou recusa (cancela) todos os pedidos
 * novos.
 *
 * Vários pedidos em sequência não empilham vários loops: há só um
 * `setInterval` ativo por vez (ver `iniciar`, que é no-op se já estiver
 * tocando). E nenhum pedido novo passa batido: se a atendente silenciar o
 * lote atual e chegar um pedido com um id que ela ainda não viu, o alerta
 * volta a soar automaticamente (ver efeito de "novos ids não silenciados").
 */
export function useOrderAlertSound(pendingCount: number, pendingIds: string[]) {
  const [isRinging, setIsRinging] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioBloqueado, setAudioBloqueado] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenciadosRef = useRef<Set<string>>(new Set());

  const getContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    return ctxRef.current;
  }, []);

  const tocarBip = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    // Se mesmo depois de tentar retomar o contexto ele continuar suspenso,
    // é a política de autoplay do navegador bloqueando som sem gesto do
    // usuário — sinaliza isso na UI em vez de falhar silenciosamente.
    setAudioBloqueado(ctx.state === "suspended");
    if (ctx.state === "suspended") return;

    const agora = ctx.currentTime;
    // Dois tons curtos em sequência ("ding-dong"), com envelope de
    // ataque/decaimento suave pra não estalar nos alto-falantes.
    for (const { freq, inicio } of [
      { freq: 880, inicio: 0 },
      { freq: 660, inicio: 0.16 },
    ]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = agora + inicio;
      const dur = 0.14;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.35, t0 + 0.015);
      gain.gain.linearRampToValueAtTime(0, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }
  }, [getContext]);

  const parar = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRinging(false);
  }, []);

  const iniciar = useCallback(() => {
    if (timerRef.current) return; // já tocando — não empilha outro loop
    setIsRinging(true);
    tocarBip();
    timerRef.current = setInterval(tocarBip, 1500);
  }, [tocarBip]);

  // Detecta pedido novo (id que não estava na lista silenciada) e
  // reativa o alerta automaticamente, mesmo que a atendente tenha
  // silenciado o lote anterior.
  useEffect(() => {
    if (pendingCount === 0) return;
    const temIdNaoSilenciado = pendingIds.some((id) => !silenciadosRef.current.has(id));
    if (temIdNaoSilenciado && isMuted) {
      setIsMuted(false);
      silenciadosRef.current = new Set();
    }
  }, [pendingCount, pendingIds, isMuted]);

  useEffect(() => {
    if (pendingCount > 0 && !isMuted) {
      iniciar();
    } else {
      parar();
    }
  }, [pendingCount, isMuted, iniciar, parar]);

  // Navegadores bloqueiam áudio sem gesto do usuário. Qualquer clique ou
  // tecla na página tenta destravar o AudioContext, cobrindo o caso de um
  // pedido chegar antes de qualquer interação da atendente na aba.
  useEffect(() => {
    function destravar() {
      const ctx = getContext();
      if (ctx && ctx.state === "suspended") {
        ctx
          .resume()
          .then(() => setAudioBloqueado(false))
          .catch(() => {});
      }
    }
    document.addEventListener("click", destravar);
    document.addEventListener("keydown", destravar);
    return () => {
      document.removeEventListener("click", destravar);
      document.removeEventListener("keydown", destravar);
    };
  }, [getContext]);

  // Limpeza ao desmontar (ex.: atendente saiu do painel).
  useEffect(() => () => parar(), [parar]);

  const silenciar = useCallback(() => {
    silenciadosRef.current = new Set(pendingIds);
    setIsMuted(true);
  }, [pendingIds]);

  return { isRinging, isMuted, audioBloqueado, silenciar };
}
