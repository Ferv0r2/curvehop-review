import { MAX_REQUEST_BYTES } from './jev-shadow';

/** Shared transport only. Callers own durable attempt claims and response contracts. No retries. */
export async function postJev(request: unknown, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  if (!apiKey?.trim() || /[\r\n]/.test(apiKey)) throw new Error('JEV_KEY');
  let body: string;
  try { body = JSON.stringify(request); } catch { throw new Error('JEV_REQUEST'); }
  if (typeof body !== 'string' || Buffer.byteLength(body) > MAX_REQUEST_BYTES) throw new Error('JEV_REQUEST');
  let errorCode = 'JEV_NETWORK';
  try {
    const response = await fetchImpl('https://api.typesafe.ai/v1/systemone', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' }, body,
    });
    errorCode = `JEV_HTTP_${response.status}`;
    if (!response.ok) { await response.body?.cancel(); throw new Error(); }
    errorCode = 'JEV_RESPONSE';
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > 65_536) throw new Error();
        chunks.push(part.value);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { throw new Error(errorCode); }
}
