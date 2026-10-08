import { request } from "node:https";
import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";

export function isPublicAddress(value: string): boolean {
  const ip = value.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  // Only global-unicast IPv6, excluding documentation and transition ranges.
  if (isIP(ip) !== 6 || !/^[23][0-9a-f]{3}:/.test(ip)) return false;
  return !(ip.startsWith("2001:db8:") || (ip.startsWith("2001:") && parseInt(ip.split(":")[1] || "0", 16) < 0x200) || ip.startsWith("2002:") || ip.startsWith("3fff:"));
}

export function webhookUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Enter a valid HTTPS webhook URL."); }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Webhook URLs must use HTTPS on the standard port without embedded credentials.");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost") || (isIP(host) && !isPublicAddress(host))) throw new Error("Private or local webhook destinations are not allowed.");
  return url;
}

export async function publicWebhookAddresses(url: URL): Promise<string[]> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : [...await resolve4(host).catch(() => []), ...await resolve6(host).catch(() => [])];
  if (!addresses.length || addresses.some(ip => !isPublicAddress(ip))) throw new Error("Webhook destination did not resolve exclusively to public addresses.");
  return addresses;
}

export async function sendSafeWebhook(input: string, body: string, headers: Record<string, string>): Promise<{ status: number }> {
  if (Buffer.byteLength(body) > 1_048_576) throw new Error("Webhook payload is too large.");
  const url = webhookUrl(input);
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  let addresses: string[];
  try {
    addresses = await Promise.race([publicWebhookAddresses(url), new Promise<never>((_, reject) => {
      dnsTimer = setTimeout(() => reject(new Error("Webhook DNS lookup timed out.")), 5_000); dnsTimer.unref();
    })]);
  } finally { if (dnsTimer) clearTimeout(dnsTimer); }
  const address = addresses[0], family = isIP(address);
  return new Promise((resolve, reject) => {
    const req = request(url, { method: "POST", headers: { ...headers, "content-length": String(Buffer.byteLength(body)) },
      agent: false, lookup: (_hostname, options, callback) => {
        // HTTPS still verifies the URL hostname; DNS cannot change this connection.
        if (typeof options === "object" && options.all) (callback as Function)(null, [{ address, family }]);
        else callback(null, address, family);
      },
    }, res => {
      const status = res.statusCode || 0;
      // Do not follow Location or download attacker-controlled response bodies.
      res.destroy();
      resolve({ status });
    });
    const timer = setTimeout(() => { const error = new Error("Webhook request timed out."); error.name = "TimeoutError"; req.destroy(error); }, 10_000);
    timer.unref();
    req.once("error", reject);
    req.once("close", () => clearTimeout(timer));
    req.end(body);
  });
}
