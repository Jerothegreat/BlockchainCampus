import { pbkdf2Sync, randomBytes } from "node:crypto";

/**
 * PIN verifier the POS checks OFFLINE, so it must ship to the device. A 6-digit PIN can
 * never be made uncrackable there; PBKDF2 with a per-student salt makes each guess cost
 * ~100k SHA-256 rounds and kills precomputed tables. /sync is also restricted to registered
 * POS devices so the verifiers don't leak publicly.
 *
 * Client (WebCrypto) recipe, must match exactly:
 *   key  = importKey("raw", utf8(pin), "PBKDF2")
 *   bits = deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(pinSalt), iterations: pinIter }, key, 256)
 *   pinHash === hex(bits)
 */
export const PIN_ITERATIONS = 100_000;

export function hashPin(pin: string, saltHex: string, iterations = PIN_ITERATIONS): string {
  return pbkdf2Sync(pin, Buffer.from(saltHex, "hex"), iterations, 32, "sha256").toString("hex");
}

export function newPinVerifier(pin: string) {
  const salt = randomBytes(16).toString("hex");
  return { salt, iterations: PIN_ITERATIONS, hash: hashPin(pin, salt) };
}
