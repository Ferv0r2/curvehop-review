/**
 * The network fetcher for discovery, with the address check pinned to the
 * connection: node:http(s) is given a `lookup` that resolves the host,
 * refuses it when any address is private, loopback, link-local, CGNAT
 * (100.64/10, Tailscale), ULA, multicast or unspecified, and hands the socket
 * only the vetted address. A lookup failure is a refusal. Nothing is cached,
 * so a host cannot pass a check and then be re-resolved elsewhere.
 *
 * Redirects are never followed here (the caller checks every hop), no
 * Accept-Encoding is sent, and TLS certificates are verified.
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { type LookupFunction } from "node:net";
import { isPublicAddress } from "../public-destination";
import { PassThrough, Readable, pipeline } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

/** Private, loopback, link-local, CGNAT, ULA, multicast and unspecified addresses (IPv4, IPv6, IPv4-mapped). */
export function isPrivateAddress(address: string): boolean {
  // Share CIDR/mapped-address handling with source verification. Keep discovery's
  // existing conservative NAT64 denial; 192.0.78.x is public, unlike 192.0.0/24.
  return !isPublicAddress(address) || /^64:ff9b:/i.test(address);
}

type Resolve = (host: string) => Promise<{ address: string; family: number }[]>;
const systemResolve: Resolve = host => new Promise((resolve, reject) =>
  dnsLookup(host, { all: true }, (error, addresses) => (error ? reject(error) : resolve(addresses as LookupAddress[]))));

/** A socket lookup that only ever yields a vetted public address. */
export function vettedLookup(resolve: Resolve = systemResolve, allowed: (address: string) => boolean = a => !isPrivateAddress(a)): LookupFunction {
  return ((hostname: string, options: { all?: boolean }, callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => {
    resolve(hostname).then(addresses => {
      if (!addresses.length || addresses.some(a => !allowed(a.address)))
        return callback(Object.assign(new Error(`EPRIVATEADDR ${hostname}`), { code: "EPRIVATEADDR" }), "", 0);
      // Every address was vetted; connect to one, IPv4 first (no happy-eyeballs across families here).
      const chosen = addresses.find(a => a.family === 4) ?? addresses[0];
      if (options?.all) callback(null, [{ address: chosen.address, family: chosen.family }]);
      else callback(null, chosen.address, chosen.family);
    }, error => callback(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: (error as NodeJS.ErrnoException)?.code ?? "ENOTFOUND" }), "", 0));
  }) as LookupFunction;
}

/**
 * The response body, decompressed when the server compressed it anyway. The
 * stages are joined with stream.pipeline, so a transport error, a premature
 * close, a timeout or an abort destroys every stage and the reader sees an
 * error instead of waiting forever. A premature close of the response itself
 * (fewer bytes than declared, or a cut chunked body) is turned into an error too.
 */
export function bodyStream(response: IncomingMessage): Readable {
  const encoding = String(response.headers["content-encoding"] ?? "").toLowerCase();
  const decompressor = encoding === "gzip" || encoding === "x-gzip" ? createGunzip() : encoding === "deflate" ? createInflate() : encoding === "br" ? createBrotliDecompress() : null;
  const out = decompressor ?? new PassThrough();
  // The body reader gets errors through the web stream; this listener only keeps an error raised before the
  // reader attaches (or after it cancels) from becoming an unhandled 'error' event.
  out.on("error", () => {});
  pipeline(response, out, error => {
    if (error && !out.destroyed) out.destroy(error);
  });
  // An IncomingMessage that ends without "complete" was cut off.
  response.on("close", () => { if (!response.complete && !out.destroyed) out.destroy(Object.assign(new Error("premature close"), { code: "ERR_STREAM_PREMATURE_CLOSE" })); });
  return out;
}

/**
 * A web stream over a Node stream that only hands out data when the reader pulls, and
 * destroys the source when the reader cancels. Readable.toWeb pushes 'data' into the
 * controller, and on Node 24 a chunk arriving after the reader cancelled (an early 429/403
 * return, a size cap) throws "Controller is already closed" outside any try/catch, which
 * killed the first live discover run (2026-10-09). Pulling one chunk at a time never
 * enqueues after close.
 */
export function pullStream(stream: Readable): ReadableStream<Uint8Array> {
  const iterator = stream[Symbol.asyncIterator]();
  let finished = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (finished) return;
        if (done) { finished = true; controller.close(); return; }
        controller.enqueue(value instanceof Uint8Array ? value : Buffer.from(value as string));
      } catch (error) {
        if (!finished) { finished = true; controller.error(error); }
      }
    },
    async cancel() {
      finished = true;
      stream.destroy();
      try { await iterator.return?.(); } catch { /* the source was destroyed on purpose */ }
    },
  }, { highWaterMark: 0 });
}

/** A fetch-compatible GET over node:http(s) with the vetted lookup. */
export function createPinnedFetch(options: { resolve?: Resolve; allowed?: (address: string) => boolean } = {}) {
  const lookup = vettedLookup(options.resolve, options.allowed);
  return (raw: string, init: RequestInit = {}): Promise<Response> => new Promise((resolve, reject) => {
    const url = new URL(raw);
    const requestOptions = {
      method: "GET",
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      lookup,
      // One vetted address per connection; Node's autoSelectFamily path stalls with a custom lookup (Node 22).
      autoSelectFamily: false,
      agent: false,
      ...(init.signal ? { signal: init.signal } : {}),
    } as RequestOptions;
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, requestOptions, response => {
      const status = response.statusCode ?? 0;
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers))
        if (value !== undefined && key !== "content-encoding" && key !== "content-length") for (const item of Array.isArray(value) ? value : [value]) headers.append(key, item);
      const empty = status === 204 || status === 304 || status < 200;
      if (empty) { response.on("error", () => {}); response.resume(); }
      try { resolve(new Response(empty ? null : pullStream(bodyStream(response)), { status: status < 200 || status > 599 ? 502 : status, headers })); }
      catch (error) { reject(error); }
    });
    request.on("error", error => {
      const timedOut = init.signal?.aborted && (init.signal.reason as { name?: string } | undefined)?.name === "TimeoutError";
      reject(timedOut ? Object.assign(new Error("timeout"), { name: "TimeoutError" }) : error);
    });
    request.end();
  });
}
