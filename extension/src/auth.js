// PBKDF2-SHA256 password hashing with WebCrypto. Stored format: "iterations.saltBase64.hashBase64".

const ITERATIONS = 200_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, HASH_BITS),
  );
}

export async function hashPassword(password) {
  if (!password) throw new Error("Password is empty.");
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${ITERATIONS}.${toBase64(salt)}.${toBase64(hash)}`;
}

export async function verifyPassword(password, stored) {
  if (!password || typeof stored !== "string") return false;

  const parts = stored.split(".");
  if (parts.length !== 3) return false;
  const iterations = Number(parts[0]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  try {
    const expected = fromBase64(parts[2]);
    const actual = await derive(password, fromBase64(parts[1]), iterations);
    if (actual.length !== expected.length) return false;

    let difference = 0;
    for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
    return difference === 0;
  } catch {
    return false;
  }
}
