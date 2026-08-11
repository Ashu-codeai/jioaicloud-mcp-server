import CryptoJS from "crypto-js";
import { randomBytes } from "node:crypto";

const PBKDF_SALT = "F27D5C9927726BCEFE7510B1BDD3D137";
const PBKDF_PASS = "cyberSecurityHighAlert";

/** Matches the web client's passwordEncryptorUtil.encryptPassword */
export function encryptPassword(plain: string): string {
  const ivHex = randomBytes(32).toString("hex");
  const key = CryptoJS.PBKDF2(PBKDF_PASS, CryptoJS.enc.Hex.parse(PBKDF_SALT), {
    keySize: 128 / 32,
    iterations: 10000,
  });
  const encrypted = CryptoJS.AES.encrypt(plain, key, {
    iv: CryptoJS.enc.Hex.parse(ivHex),
  });
  return ivHex + CryptoJS.enc.Base64.stringify(encrypted.ciphertext);
}

/** HMAC used by web getSHA256(userId, passphrase) — library order is hmac(key, message). */
export function passphraseHash(userId: string, passphrase: string): string {
  return CryptoJS.HmacSHA256(passphrase, userId).toString();
}

/** AES-ECB encrypt with key derived from SHA1(sessionKey).substr(0,32) hex */
export function encryptPassPhrase(payload: string, sessionKey: string): string {
  const sha1 = CryptoJS.SHA1(CryptoJS.enc.Utf8.parse(sessionKey));
  const keyHex = sha1.toString(CryptoJS.enc.Hex).substring(0, 32);
  const key = CryptoJS.enc.Hex.parse(keyHex);
  const encrypted = CryptoJS.AES.encrypt(payload, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });
  return CryptoJS.enc.Base64.stringify(encrypted.ciphertext);
}

export function decryptPassPhrase(cipherB64: string, passphraseHashValue: string): string {
  const sha1 = CryptoJS.SHA1(CryptoJS.enc.Utf8.parse(passphraseHashValue));
  const keyHex = sha1.toString(CryptoJS.enc.Hex).substring(0, 32);
  const key = CryptoJS.enc.Hex.parse(keyHex);
  const ciphertext = CryptoJS.enc.Base64.parse(cipherB64);
  const decrypted = CryptoJS.AES.decrypt({ ciphertext } as CryptoJS.lib.CipherParams, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });
  // Match web client integrity check
  const ok =
    decrypted.words.filter((e) => e > 0).length === decrypted.words.length;
  if (!ok) return "";
  return decrypted.toString(CryptoJS.enc.Utf8);
}

/**
 * Build X-Enc-2FAHash header value used by GET /2fa/validation.
 * Encrypted payload: userId#twoFAHash#timestamp
 * Session key comes from decrypting encTwoFASessionKey with twoFAHash.
 */
export function buildEnc2FAHash(
  userId: string,
  passphrase: string,
  encTwoFASessionKey: string
): string {
  const twoFAHash = passphraseHash(userId, passphrase);
  const decrypted = decryptPassPhrase(encTwoFASessionKey, twoFAHash);
  const parts = decrypted.split("#");
  if (parts.length < 2 || !parts[1]) {
    throw new Error("Invalid passphrase or encTwoFASessionKey (could not decrypt session key)");
  }
  const sessionKeyPart = parts[1];
  const payload = `${userId}#${twoFAHash}#${Date.now()}`;
  return encryptPassPhrase(payload, sessionKeyPart);
}

export function createDeviceKey(): string {
  // Match JioAICloud web UUID generator
  let a = Date.now();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (v) => {
    const F = (a + 16 * Math.random()) % 16 | 0;
    a = Math.floor(a / 16);
    return (v === "x" ? F : (3 & F) | 8).toString(16);
  });
}
