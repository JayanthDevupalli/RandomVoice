/**
 * YapClub Account Recovery Utilities
 * Provides secure generation, normalization, and verification of recovery codes.
 */

// Characters excluding easily confused ones (no 0/O, 1/I/L)
const RECOVERY_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Generates a human-readable, cryptographically strong recovery code.
 * Example format: YAP-7K2M-9P4Q-8F1A
 */
export function generateRecoveryCode(): string {
  const getRandomChunk = (len: number) => {
    let result = "";
    if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
      const buffer = new Uint8Array(len);
      window.crypto.getRandomValues(buffer);
      for (let i = 0; i < len; i++) {
        result += RECOVERY_CHARS[buffer[i] % RECOVERY_CHARS.length];
      }
    } else {
      for (let i = 0; i < len; i++) {
        result += RECOVERY_CHARS[Math.floor(Math.random() * RECOVERY_CHARS.length)];
      }
    }
    return result;
  };

  return `YAP-${getRandomChunk(4)}-${getRandomChunk(4)}-${getRandomChunk(4)}`;
}

/**
 * Normalizes a recovery code for matching:
 * Uppercases, strips all whitespace, hyphens, and non-alphanumeric chars.
 */
export function normalizeRecoveryCode(code: string): string {
  if (!code) return "";
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Verifies whether an entered recovery code matches the stored recovery code.
 * Tolerant of case and hyphen variations.
 */
export function verifyRecoveryCode(enteredCode: string, storedCode: string): boolean {
  if (!enteredCode || !storedCode) return false;
  return normalizeRecoveryCode(enteredCode) === normalizeRecoveryCode(storedCode);
}
