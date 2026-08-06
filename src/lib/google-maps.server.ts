/**
 * Distância de delivery via Google Maps Distance Matrix API, usando a
 * latitude/longitude cadastrada da unidade como origem. Qualquer falha
 * (chave não configurada, unidade sem coordenadas, erro de rede, resposta
 * inesperada da API) vira uma mensagem amigável em vez de quebrar o
 * restante do fluxo de pedido — o preço do delivery fica "a confirmar".
 */

export type ResultadoDistancia =
  | { ok: true; distanciaKm: number }
  | { ok: false; mensagem: string };

const MENSAGEM_PADRAO =
  "Não foi possível calcular a distância de entrega agora; a equipe vai confirmar o valor do frete com você.";

export type ResultadoGeocodificacao =
  | { ok: true; latitude: number; longitude: number; enderecoFormatado: string }
  | { ok: false; mensagem: string };

const MENSAGEM_GEOCODIFICACAO_PADRAO =
  "Não foi possível localizar esse endereço agora. Confira se está completo (rua, número, bairro, cidade) e tente de novo.";

/** Converte um endereço em texto para latitude/longitude via Google Geocoding API. */
export async function geocodarEndereco(endereco: string): Promise<ResultadoGeocodificacao> {
  const apiKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!apiKey) {
    return {
      ok: false,
      mensagem: "Cálculo de localização indisponível: GOOGLE_MAPS_API_KEY não configurada.",
    };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", endereco);
  url.searchParams.set("key", apiKey);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[google-maps] HTTP ${response.status} ao geocodificar endereço`);
      return { ok: false, mensagem: MENSAGEM_GEOCODIFICACAO_PADRAO };
    }

    const json = (await response.json()) as {
      status: string;
      results?: {
        formatted_address?: string;
        geometry?: { location?: { lat: number; lng: number } };
      }[];
    };

    const resultado = json.results?.[0];
    const localizacao = resultado?.geometry?.location;
    if (json.status !== "OK" || !resultado || !localizacao) {
      console.error("[google-maps] geocodificação sem resultado utilizável", JSON.stringify(json));
      return { ok: false, mensagem: MENSAGEM_GEOCODIFICACAO_PADRAO };
    }

    return {
      ok: true,
      latitude: localizacao.lat,
      longitude: localizacao.lng,
      enderecoFormatado: resultado.formatted_address ?? endereco,
    };
  } catch (err) {
    console.error("[google-maps] falha ao chamar Geocoding API", err);
    return { ok: false, mensagem: MENSAGEM_GEOCODIFICACAO_PADRAO };
  }
}

export async function calcularDistanciaKm(params: {
  origemLatitude: number | null;
  origemLongitude: number | null;
  enderecoDestino: string;
}): Promise<ResultadoDistancia> {
  const apiKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!apiKey) return { ok: false, mensagem: MENSAGEM_PADRAO };
  if (params.origemLatitude === null || params.origemLongitude === null) {
    return { ok: false, mensagem: MENSAGEM_PADRAO };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${params.origemLatitude},${params.origemLongitude}`);
  url.searchParams.set("destinations", params.enderecoDestino);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("units", "metric");
  url.searchParams.set("key", apiKey);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[google-maps] HTTP ${response.status} ao calcular distância`);
      return { ok: false, mensagem: MENSAGEM_PADRAO };
    }

    const json = (await response.json()) as {
      status: string;
      rows?: { elements?: { status: string; distance?: { value: number } }[] }[];
    };

    const elemento = json.rows?.[0]?.elements?.[0];
    if (json.status !== "OK" || !elemento || elemento.status !== "OK" || !elemento.distance) {
      console.error("[google-maps] resposta sem distância utilizável", JSON.stringify(json));
      return { ok: false, mensagem: MENSAGEM_PADRAO };
    }

    return { ok: true, distanciaKm: elemento.distance.value / 1000 };
  } catch (err) {
    console.error("[google-maps] falha ao chamar Distance Matrix", err);
    return { ok: false, mensagem: MENSAGEM_PADRAO };
  }
}
