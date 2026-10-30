const encoder = new TextEncoder();
const HEX_SIGNATURE = /^sha256=([a-fA-F0-9]{64})$/;

async function hmacHex(secret: string, message: string): Promise<string> {
  if (!secret) throw new Error("HMAC secret is not configured.");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(left: string, right: string): boolean {
  // Length and format are public. For equal-length digests, inspect every byte.
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

export async function sign(secret: string, timestamp: string, rawBody: string): Promise<string> {
  return `sha256=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`;
}

export async function verify(
  secret: string,
  timestamp: string | null,
  signature: string | null,
  rawBody: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(nowSeconds - seconds) > 300) return false;
  const match = HEX_SIGNATURE.exec(signature);
  if (!match) return false;
  const expected = await hmacHex(secret, `${timestamp}.${rawBody}`);
  return constantTimeEqual(expected, match[1].toLowerCase());
}
