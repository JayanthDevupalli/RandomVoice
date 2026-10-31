"use client";

export interface ActiveTabSession {
  tabId: string;
  junctionId: string;
  junctionName?: string;
  identity: string;
  lastHeartbeat: number;
}

export type TabSessionBusEvent =
  | {
      type: "SESSION_CLAIMED";
      tabId: string;
      junctionId: string;
      junctionName?: string;
      identity: string;
      timestamp: number;
    }
  | {
      type: "SESSION_RELEASED";
      tabId: string;
      junctionId?: string;
      timestamp: number;
    }
  | {
      type: "HEARTBEAT";
      tabId: string;
      junctionId: string;
      timestamp: number;
    };

const STORAGE_KEY = "yapclub_active_junction_session";
const CHANNEL_NAME = "yapclub_junction_session_bus";
const HEARTBEAT_INTERVAL_MS = 3000;
const HEARTBEAT_EXPIRY_MS = 10000; // 10s considered abandoned/crashed

let cachedTabId: string | null = null;
let heartbeatTimer: any = null;
let broadcastChannel: BroadcastChannel | null = null;

/**
 * Get or initialize a stable tab ID for this browser tab.
 * Persists in sessionStorage so page reloads inside the same tab maintain the same tabId.
 */
export function getTabId(): string {
  if (typeof window === "undefined") return "server_tab";
  if (cachedTabId) return cachedTabId;

  try {
    const existing = sessionStorage.getItem("yapclub_tab_id");
    if (existing) {
      cachedTabId = existing;
      return existing;
    }
    const newId = "tab_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
    sessionStorage.setItem("yapclub_tab_id", newId);
    cachedTabId = newId;
    return newId;
  } catch {
    const fallbackId = "tab_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
    cachedTabId = fallbackId;
    return fallbackId;
  }
}

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (!broadcastChannel && typeof BroadcastChannel !== "undefined") {
    try {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      broadcastChannel = null;
    }
  }
  return broadcastChannel;
}

/**
 * Read the current active junction session across all tabs from localStorage.
 */
export function getActiveTabSession(): ActiveTabSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session: ActiveTabSession = JSON.parse(raw);
    const now = Date.now();
    // If heartbeat expired, the session tab was abruptly closed or crashed
    if (now - (session.lastHeartbeat || 0) > HEARTBEAT_EXPIRY_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Check if the current tab is the active owner of the given junction (or any junction).
 */
export function isCurrentTabActiveOwner(junctionId?: string): boolean {
  const current = getActiveTabSession();
  if (!current) return false;
  const myTabId = getTabId();
  if (current.tabId !== myTabId) return false;
  if (junctionId && current.junctionId !== junctionId) return false;
  return true;
}

/**
 * Claim exclusive voice session for this tab.
 * Broadcasts to all other tabs to immediately yield and shut down any active audio.
 */
export function claimJunctionSession(
  junctionId: string,
  identity: string,
  junctionName?: string
): void {
  if (typeof window === "undefined") return;
  const myTabId = getTabId();
  const session: ActiveTabSession = {
    tabId: myTabId,
    junctionId,
    junctionName,
    identity,
    lastHeartbeat: Date.now(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {}

  // Broadcast claim to all other tabs
  const channel = getChannel();
  const event: TabSessionBusEvent = {
    type: "SESSION_CLAIMED",
    tabId: myTabId,
    junctionId,
    junctionName,
    identity,
    timestamp: Date.now(),
  };

  try {
    channel?.postMessage(event);
  } catch {}

  // Start heartbeat interval
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    try {
      const active = getActiveTabSession();
      if (active && active.tabId === myTabId && active.junctionId === junctionId) {
        active.lastHeartbeat = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
      } else {
        // We are no longer the owner
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      }
    } catch {}
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Release active voice session for this tab.
 */
export function releaseJunctionSession(junctionId?: string): void {
  if (typeof window === "undefined") return;
  const myTabId = getTabId();

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  const current = getActiveTabSession();
  if (current && current.tabId === myTabId) {
    if (!junctionId || current.junctionId === junctionId) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}

      const channel = getChannel();
      try {
        channel?.postMessage({
          type: "SESSION_RELEASED",
          tabId: myTabId,
          junctionId: current.junctionId,
          timestamp: Date.now(),
        });
      } catch {}
    }
  }
}

/**
 * Listen to cross-tab session events (takeovers, releases).
 */
export function listenToTabSessionEvents(callbacks: {
  onSuperseded: (event: TabSessionBusEvent & { type: "SESSION_CLAIMED" }) => void;
  onSessionReleased?: (event: TabSessionBusEvent & { type: "SESSION_RELEASED" }) => void;
}): () => void {
  if (typeof window === "undefined") return () => {};

  const myTabId = getTabId();
  const channel = getChannel();

  const handleMessage = (e: MessageEvent) => {
    const data = e.data as TabSessionBusEvent;
    if (!data || !data.type) return;

    if (data.type === "SESSION_CLAIMED") {
      if (data.tabId !== myTabId) {
        callbacks.onSuperseded(data);
      }
    } else if (data.type === "SESSION_RELEASED") {
      if (data.tabId !== myTabId) {
        callbacks.onSessionReleased?.(data);
      }
    }
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      if (!e.newValue) {
        callbacks.onSessionReleased?.({
          type: "SESSION_RELEASED",
          tabId: "unknown",
          timestamp: Date.now(),
        });
      } else {
        try {
          const session = JSON.parse(e.newValue) as ActiveTabSession;
          if (session && session.tabId !== myTabId) {
            callbacks.onSuperseded({
              type: "SESSION_CLAIMED",
              tabId: session.tabId,
              junctionId: session.junctionId,
              junctionName: session.junctionName,
              identity: session.identity,
              timestamp: Date.now(),
            });
          }
        } catch {}
      }
    }
  };

  channel?.addEventListener("message", handleMessage);
  window.addEventListener("storage", handleStorage);

  return () => {
    channel?.removeEventListener("message", handleMessage);
    window.removeEventListener("storage", handleStorage);
  };
}

