/**
 * Geolocalização gratuita via OpenStreetMap (Nominatim), sem chave de API
 * nem custo. Geocodifica endereços em texto para latitude/longitude, e
 * calcula a distância entre dois pontos com a fórmula de Haversine
 * (linha reta) multiplicada por um fator de aproximação de rota, já que
 * Nominatim não tem um equivalente a "Distance Matrix" com roteamento.
 * Qualquer falha (endereço não encontrado, indisponibilidade, erro de
 * rede) vira mensagem amigável em vez de quebrar o restante do fluxo —
 * o preço do delivery fica "a confirmar".
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// Política de uso do Nominatim exige um User-Agent que identifique o app.
// Atualize com um contato real se o tráfego crescer e a OSM Foundation
// precisar entrar em contato.
const USER_AGENT = "LavouraDeliveryHub/1.0 (+https://lavoura-link.lovable.app)";

// Fator de "circuitousness": aproxima a distância real de rota a partir da
// distância em linha reta (Haversine). 1.3 é um valor comum na literatura
// de logística para malha viária urbana comum. Ajuste comparando com
// entregas reais (distância no mapa vs. valor calculado aqui) — cidades
// com traçado mais direto podem funcionar melhor com um valor menor
// (ex.: 1.15–1.2).
const FATOR_APROXIMACAO_ROTA = 1.3;

// O servidor público do Nominatim pede no máximo ~1 requisição/segundo.
// Serializa as chamadas dentro deste processo para respeitar isso; não é
// uma garantia distribuída, mas é suficiente para o volume de uma unidade.
const INTERVALO_MINIMO_MS = 1100;
let filaNominatim: Promise<void> = Promise.resolve();
let ultimaChamada = 0;

function throttleNominatim<T>(fn: () => Promise<T>): Promise<T> {
  const proxima = filaNominatim.then(async () => {
    const espera = Math.max(0, INTERVALO_MINIMO_MS - (Date.now() - ultimaChamada));
    if (espera > 0) await new Promise((resolve) => setTimeout(resolve, espera));
    ultimaChamada = Date.now();
  });
  filaNominatim = proxima;
  return proxima.then(fn);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const raioTerraKm = 6371;
  const toRad = (graus: number) => (graus * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return raioTerraKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type ResultadoGeocodificacao =
  | { ok: true; latitude: number; longitude: number; enderecoFormatado: string }
  | { ok: false; mensagem: string };

const MENSAGEM_GEOCODIFICACAO_PADRAO =
  "Não foi possível localizar esse endereço agora. Confira se está completo (rua, número, bairro, cidade) e tente de novo.";

/** Converte um endereço em texto para latitude/longitude via OpenStreetMap Nominatim (gratuito, sem chave). */
export async function geocodarEndereco(endereco: string): Promise<ResultadoGeocodificacao> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", endereco);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");

  try {
    const response = await throttleNominatim(() => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      return fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      }).finally(() => clearTimeout(timeout));
    });

    if (!response.ok) {
      console.error(`[geolocalizacao] HTTP ${response.status} ao geocodificar endereço`);
      return { ok: false, mensagem: MENSAGEM_GEOCODIFICACAO_PADRAO };
    }

    const json = (await response.json()) as {
      lat: string;
      lon: string;
      display_name?: string;
    }[];

    const resultado = json[0];
    if (!resultado) {
      return { ok: false, mensagem: MENSAGEM_GEOCODIFICACAO_PADRAO };
    }

    const latitude = Number(resultado.lat);
    const longitude = Number(resultado.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      console.error(
        "[geolocalizacao] resposta do Nominatim sem coordenadas válidas",
        JSON.stringify(resultado),
      );
      return { ok: false, mensagem: MENSAGEM_GEOCODIFICACAO_PADRAO };
    }

    return {
      ok: true,
      latitude,
      longitude,
      enderecoFormatado: resultado.display_name ?? endereco,
    };
  } catch (err) {
    console.error("[geolocalizacao] falha ao chamar Nominatim", err);
    return { ok: false, mensagem: MENSAGEM_GEOCODIFICACAO_PADRAO };
  }
}

export type ResultadoDistancia =
  { ok: true; distanciaKm: number } | { ok: false; mensagem: string };

/** Distância aproximada de rota (Haversine × fator de aproximação) entre a unidade e um endereço de destino. */
export async function calcularDistanciaKm(params: {
  origemLatitude: number | null;
  origemLongitude: number | null;
  enderecoDestino: string;
}): Promise<ResultadoDistancia> {
  if (params.origemLatitude === null || params.origemLongitude === null) {
    return {
      ok: false,
      mensagem:
        "Não foi possível calcular a distância de entrega agora; a equipe vai confirmar o valor do frete com você.",
    };
  }

  const destino = await geocodarEndereco(params.enderecoDestino);
  if (!destino.ok) return destino;

  const distanciaKm =
    haversineKm(
      params.origemLatitude,
      params.origemLongitude,
      destino.latitude,
      destino.longitude,
    ) * FATOR_APROXIMACAO_ROTA;

  return { ok: true, distanciaKm };
}
