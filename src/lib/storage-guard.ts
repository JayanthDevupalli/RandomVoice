/**
 * Safe Browser Storage & UUID Validation Guard
 * Prevents DOM exceptions in strict incognito / private browsing mode,
 * quota exceeded errors, and validates UUID parameters.
 */

export function safeGetStorage<T = string>(key: string, fallback: T | null = null): T | null {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  } catch (err) {
    console.warn(`[StorageGuard] Failed to read key "${key}":`, err);
    return fallback;
  }
}

export function safeSetStorage(key: string, value: any): boolean {
  if (typeof window === "undefined") return false;
  try {
    const str = typeof value === "string" ? value : JSON.stringify(value);
    window.localStorage.setItem(key, str);
    return true;
  } catch (err) {
    console.warn(`[StorageGuard] Failed to write key "${key}":`, err);
    return false;
  }
}

export function safeRemoveStorage(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch (err) {
    console.warn(`[StorageGuard] Failed to remove key "${key}":`, err);
    return false;
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates whether a given string is a valid canonical RFC-4122 UUID.
 */
export function isValidUUID(id: any): boolean {
  if (typeof id !== "string") return false;
  return UUID_REGEX.test(id.trim());
}
