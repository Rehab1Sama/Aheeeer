import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

// ─── Password hashing ────────────────────────────────────────────────────────
// Uses scrypt with a per-password random salt (Node's built-in, no extra
// dependency needed). Replaces the previous unsalted SHA-256 + shared salt,
// which was vulnerable to rainbow-table and fast brute-force attacks since
// every user shared the same salt.

const SCRYPT_KEYLEN = 64;

// Support for verifying passwords hashed with the old (insecure) scheme, so
// existing accounts are not locked out. New/rotated passwords always use the
// new "scrypt:" format; needsRehash() tells callers to upgrade on next login.
const LEGACY_SALT = "sana-quran-salt";
function legacyHash(password: string): string {
  return createHash("sha256").update(password + LEGACY_SALT).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt:${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, hash: string | null | undefined): boolean {
  if (!hash) return false;

  if (hash.startsWith("scrypt:")) {
    const parts = hash.split(":");
    const salt = parts[1];
    const storedKeyHex = parts[2];
    if (!salt || !storedKeyHex) return false;
    try {
      const derivedKey = scryptSync(password, salt, SCRYPT_KEYLEN);
      const storedKey = Buffer.from(storedKeyHex, "hex");
      if (derivedKey.length !== storedKey.length) return false;
      return timingSafeEqual(derivedKey, storedKey);
    } catch {
      return false;
    }
  }

  // Legacy unsalted SHA-256 hash — verify once so old accounts keep working,
  // then callers should re-hash with hashPassword() and persist it.
  try {
    const expected = Buffer.from(legacyHash(password), "hex");
    const actual = Buffer.from(hash, "hex");
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// True if this hash was produced by the old insecure scheme and should be
// replaced with a fresh hashPassword() result the next time we have the
// plaintext password available (e.g. right after a successful login).
export function needsRehash(hash: string | null | undefined): boolean {
  return !hash || !hash.startsWith("scrypt:");
}

// ─── Session tokens ──────────────────────────────────────────────────────────
// HMAC-signed, base64url payload with an expiry. Signature comparison is
// timing-safe. Previously tokens never expired and fell back to a hardcoded
// secret ("fallback-secret") when SESSION_SECRET was unset, which meant a
// leaked/misconfigured deployment made tokens trivial to forge and leaked
// tokens valid forever.

const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.trim().length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET environment variable must be set (16+ characters) in production",
    );
  }
  // Non-production fallback only — never used if SESSION_SECRET is configured.
  return "dev-only-insecure-secret-do-not-use-in-production";
}

interface TokenPayload {
  userId: number;
  role: string;
  iat: number;
  exp: number;
}

export function generateToken(
  userId: number,
  role: string,
  ttlMs: number = DEFAULT_TOKEN_TTL_MS,
): string {
  const now = Date.now();
  const payloadObj: TokenPayload = { userId, role, iat: now, exp: now + ttlMs };
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sig = createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): { userId: number; role: string } | null {
  try {
    const dotIndex = token.indexOf(".");
    if (dotIndex === -1) return null;
    const payload = token.slice(0, dotIndex);
    const sig = token.slice(dotIndex + 1);
    if (!payload || !sig) return null;

    const expectedSig = createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as Partial<TokenPayload>;
    if (typeof decoded.userId !== "number" || typeof decoded.role !== "string") return null;
    if (typeof decoded.exp === "number" && Date.now() > decoded.exp) return null; // expired

    return { userId: decoded.userId, role: decoded.role };
  } catch {
    return null;
  }
}
