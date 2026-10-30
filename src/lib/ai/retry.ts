/** Falhas temporárias do provedor (ex.: 503 por excesso de demanda). */
const TEMPORARY_STATUS = new Set([500, 502, 503, 504]);

const RETRY_DELAYS_MS = [1_000, 3_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Repete a chamada após falhas temporárias; a última resposta é devolvida como veio. */
export async function retryOnTemporaryFailure(
  send: () => Promise<Response>,
  delaysMs: number[] = RETRY_DELAYS_MS,
  wait: (ms: number) => Promise<unknown> = sleep,
): Promise<Response> {
  let response = await send();
  for (const delay of delaysMs) {
    if (!TEMPORARY_STATUS.has(response.status)) break;
    await response.body?.cancel();
    await wait(delay);
    response = await send();
  }
  return response;
}
