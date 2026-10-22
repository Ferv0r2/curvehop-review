import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";

/**
 * Source pages are fetched on the mini PC, inside its private network (Tailscale). A cited URL, a redirect or a
 * script on a rendered page must never make the service request an address of that network. Only public internet
 * addresses are reached: a host name that names a private network is refused as written, and every DNS answer is
 * checked at the moment of connecting, so the address checked is the address connected to.
 */
export const SOURCE_PRIVATE_ADDRESS = "SOURCE_PRIVATE_ADDRESS";
export const SOURCE_PRIVATE_HOST = "SOURCE_PRIVATE_HOST";

/** Names that only resolve inside a private network (Tailscale MagicDNS, mDNS, internal zones). */
const PRIVATE_SUFFIXES = [".ts.net", ".local", ".internal", ".localhost", ".home.arpa"];

const V4_BLOCKED: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

const v4Number = (ip: string) => ip.split(".").reduce((value, part) => value * 256 + Number(part), 0);
const inV4 = (value: number, [base, bits]: readonly [string, number]) => Math.floor(value / 2 ** (32 - bits)) === Math.floor(v4Number(base) / 2 ** (32 - bits));
const publicV4 = (value: number) => !V4_BLOCKED.some(block => inV4(value, block));

/** The eight 16-bit groups of an IPv6 address, or null when it is not one. */
function v6Groups(ip: string): number[] | null {
  let text = ip.split("%")[0].toLowerCase();
  const v4 = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    if (isIP(v4[1]) !== 4) return null;
    const value = v4Number(v4[1]);
    text = `${text.slice(0, -v4[1].length)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [], tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail].map(group => /^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN);
  return groups.some(Number.isNaN) ? null : groups;
}

const embeddedV4 = (high: number, low: number) => high * 65536 + low;

function publicV6(groups: number[]) {
  const [a, b] = groups, zeroUntil = (n: number) => groups.slice(0, n).every(group => group === 0);
  if (zeroUntil(8)) return false; // ::
  if (zeroUntil(7) && groups[7] === 1) return false; // ::1
  if (zeroUntil(5) && groups[5] === 0xffff) return publicV4(embeddedV4(groups[6], groups[7])); // ::ffff:a.b.c.d
  if (zeroUntil(6)) return publicV4(embeddedV4(groups[6], groups[7])); // ::a.b.c.d (deprecated)
  if (a === 0x64 && b === 0xff9b && groups.slice(2, 6).every(group => group === 0)) return publicV4(embeddedV4(groups[6], groups[7])); // NAT64
  if (a === 0x64 && b === 0xff9b && groups[2] === 1) return false; // 64:ff9b:1::/48 local NAT64
  if (a === 0x100 && b === 0 && groups[2] === 0 && groups[3] === 0) return false; // 100::/64 discard
  if (a === 0x2001 && b < 0x200) return false; // 2001::/23 protocol assignments, Teredo
  if (a === 0x2001 && b === 0xdb8) return false; // documentation
  if (a === 0x2002) return publicV4(embeddedV4(groups[1], groups[2])); // 6to4
  if (a === 0x3fff && b >> 12 === 0) return false; // 3fff::/20 documentation
  if ((a & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80 || (a & 0xffc0) === 0xfec0) return false; // link-local, site-local
  if ((a & 0xff00) === 0xff00) return false; // multicast
  return true;
}

/** True only for an address on the public internet. Anything unparsable is not public. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address.split("%")[0]);
  if (family === 4) return publicV4(v4Number(address));
  if (family === 6) { const groups = v6Groups(address); return !!groups && publicV6(groups); }
  return false;
}

/** Why a host name, as written, may name a private network; null when it may be public. */
export function hostProblem(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isIP(host)) return isPublicAddress(host) ? null : SOURCE_PRIVATE_ADDRESS;
  // A single label (`router`, `orbit-macmini`) is completed by local search domains.
  if (!host || host === "localhost" || !host.includes(".") || PRIVATE_SUFFIXES.some(suffix => host.endsWith(suffix))) return SOURCE_PRIVATE_HOST;
  return null;
}

/** Why a URL must not be requested; null when its host may be public. The DNS answer is still checked on connect. */
export function publicUrlProblem(url: string): string | null {
  let host: string;
  try { host = new URL(url).hostname; } catch { return SOURCE_PRIVATE_HOST; }
  return hostProblem(host);
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void;
type Resolver = (hostname: string, options: { all: true; family?: number; hints?: number }, callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void;
const refusal = (code: string) => Object.assign(new Error(code), { code });

/**
 * A `lookup` for net/tls connections that answers only with public addresses. If any address of a name is private,
 * the whole name is refused, so a name cannot pair a public address with a private one. The connection is made to the
 * address returned here, so there is no window between checking and connecting.
 */
export function createPublicLookup(resolve: Resolver = dnsLookup as unknown as Resolver) {
  return (hostname: string, options: unknown, callback?: LookupCallback) => {
    const done = (typeof options === "function" ? options : callback) as LookupCallback;
    const opts = (typeof options === "number" ? { family: options } : options && typeof options === "object" ? options : {}) as { family?: number; hints?: number; all?: boolean };
    const problem = hostProblem(hostname);
    if (problem) { process.nextTick(done, refusal(problem)); return; }
    resolve(hostname, { family: opts.family, hints: opts.hints, all: true }, (error, addresses) => {
      if (error) return done(error);
      if (!addresses?.length) return done(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }));
      if (addresses.some(entry => !isPublicAddress(entry.address))) return done(refusal(SOURCE_PRIVATE_ADDRESS));
      if (opts.all) return done(null, addresses);
      done(null, addresses[0].address, addresses[0].family);
    });
  };
}

/** The refusal code carried anywhere in an error's cause chain, if the failure was a refused private destination. */
export function destinationRefusal(error: unknown): string | null {
  for (let current = error, depth = 0; current && typeof current === "object" && depth < 5; current = (current as { cause?: unknown }).cause, depth++) {
    const code = (current as { code?: unknown }).code, message = (current as { message?: unknown }).message;
    for (const value of [code, message]) if (value === SOURCE_PRIVATE_ADDRESS || value === SOURCE_PRIVATE_HOST) return value;
  }
  return null;
}
