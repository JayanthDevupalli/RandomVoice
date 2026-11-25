"use client";

const STORAGE_KEY = "yapclub_device_token";
const IDB_NAME = "yapclub_device_store";
const IDB_STORE = "tokens";
const COOKIE_NAME = "yc_did";

let cachedFingerprint: string | null = null;
let pendingPromise: Promise<string> | null = null;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, val: string) {
  if (typeof document === "undefined") return;
  try {
    const maxAge = 60 * 60 * 24 * 365 * 2; // 2 years
    document.cookie = `${name}=${encodeURIComponent(val)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {}
}

function readIndexedDb(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction(IDB_STORE, "readonly");
          const getReq = tx.objectStore(IDB_STORE).get(STORAGE_KEY);
          getReq.onsuccess = () => resolve(typeof getReq.result === "string" ? getReq.result : null);
          getReq.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writeIndexedDb(val: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve();
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction(IDB_STORE, "readwrite");
          tx.objectStore(IDB_STORE).put(val, STORAGE_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback deterministic FNV-1a hash
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv_${(h >>> 0).toString(16)}`;
}

function collectHardwareSignals(): string {
  if (typeof window === "undefined") return "ssr";
  const parts: string[] = [
    navigator.platform || "",
    navigator.language || "",
    String(navigator.hardwareConcurrency || 0),
    String((navigator as any).deviceMemory || 0),
    String(screen?.width || 0),
    String(screen?.height || 0),
    String(screen?.colorDepth || 0),
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  ];

  // Lightweight WebGL renderer string (survives incognito & localStorage clears)
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl && "getParameter" in gl) {
      const webgl = gl as WebGLRenderingContext;
      const ext = webgl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        parts.push(String(webgl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || ""));
        parts.push(String(webgl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || ""));
      }
    }
  } catch {}

  return parts.join("|");
}

/**
 * Returns a stable device fingerprint hash that persists across
 * localStorage clears, IndexedDB, cookies, and Incognito sessions.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "";
  if (cachedFingerprint) return cachedFingerprint;
  if (pendingPromise) return pendingPromise;

  pendingPromise = (async () => {
    try {
      let persistedToken: string | null = null;
      try {
        persistedToken = localStorage.getItem(STORAGE_KEY);
      } catch {}
      if (!persistedToken) {
        persistedToken = readCookie(COOKIE_NAME);
      }
      if (!persistedToken) {
        persistedToken = await readIndexedDb();
      }

      const hwHash = await sha256Hex(collectHardwareSignals());
      const finalId = persistedToken || `dev_${hwHash.slice(0, 28)}`;

      // Re-sync across all 3 persistence layers
      try {
        localStorage.setItem(STORAGE_KEY, finalId);
      } catch {}
      writeCookie(COOKIE_NAME, finalId);
      await writeIndexedDb(finalId);

      cachedFingerprint = finalId;
      return finalId;
    } catch {
      return "";
    } finally {
      pendingPromise = null;
    }
  })();

  return pendingPromise;
}
