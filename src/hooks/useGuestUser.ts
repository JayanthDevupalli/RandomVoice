"use client";

import { useState, useEffect, useCallback } from "react";
import { GuestUser } from "@/lib/types";
import { generateRandomGuest, generateRandomNickname } from "@/lib/guest-utils";

const STORAGE_KEY = "junction_guest_profile";
const ONBOARDING_KEY = "junction_onboarding_completed";
const GUEST_SYNC_EVENT = "yapclub_guest_profile_sync";

function readStoredGuest(): GuestUser | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return null;
}

function readStoredOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "true";
  } catch (e) {}
  return false;
}

function broadcastSync(guest: GuestUser, onboarded?: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(GUEST_SYNC_EVENT, { detail: { guest, onboarded } })
  );
}

export function useGuestUser() {
  const [guest, setGuest] = useState<GuestUser>(() => {
    const stored = readStoredGuest();
    if (stored) return stored;
    return generateRandomGuest();
  });

  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(() => {
    return readStoredOnboarding();
  });

  const [isLoaded, setIsLoaded] = useState(true);

  // Synchronize state across all components and browser tabs/windows
  useEffect(() => {
    const syncFromStorage = () => {
      const stored = readStoredGuest();
      const onboarded = readStoredOnboarding();
      if (stored) {
        setGuest(stored);
      }
      setHasCompletedOnboarding(onboarded);
    };

    syncFromStorage();

    const handleCustomSync = (e: any) => {
      if (e.detail?.guest) {
        setGuest(e.detail.guest);
      }
      if (typeof e.detail?.onboarded === "boolean") {
        setHasCompletedOnboarding(e.detail.onboarded);
      }
    };

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setGuest(JSON.parse(e.newValue));
        } catch {}
      }
      if (e.key === ONBOARDING_KEY) {
        setHasCompletedOnboarding(e.newValue === "true");
      }
    };

    window.addEventListener(GUEST_SYNC_EVENT, handleCustomSync);
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      window.removeEventListener(GUEST_SYNC_EVENT, handleCustomSync);
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, []);

  const updateGuest = useCallback((updates: Partial<GuestUser>) => {
    setGuest((prev) => {
      const current = prev || readStoredGuest() || generateRandomGuest();
      const cleanName = updates.name !== undefined ? updates.name.trim() : current.name;
      const updated: GuestUser = {
        ...current,
        ...updates,
        name: cleanName,
        displayName: updates.displayName !== undefined ? updates.displayName.trim() : cleanName,
        username: updates.username !== undefined ? updates.username.trim() : cleanName.toLowerCase().replace(/[^a-z0-9_]/g, ""),
      };

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save guest profile", e);
      }

      broadcastSync(updated);
      return updated;
    });
  }, []);

  const completeOnboarding = useCallback((personaUpdates?: Partial<GuestUser>) => {
    const current = readStoredGuest() || guest || generateRandomGuest();
    const cleanName = personaUpdates?.name ? personaUpdates.name.trim() : (current.name || "Guest");
    const updated: GuestUser = {
      ...current,
      ...personaUpdates,
      name: cleanName,
      displayName: cleanName,
      username: cleanName.toLowerCase().replace(/[^a-z0-9_]/g, ""),
      avatar: personaUpdates?.avatar || current.avatar || "zap",
      color: personaUpdates?.color || current.color || "#6366F1",
    };

    setGuest(updated);
    setHasCompletedOnboarding(true);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      localStorage.setItem(ONBOARDING_KEY, "true");
    } catch (e) {}

    broadcastSync(updated, true);
  }, [guest]);

  const resetOnboarding = useCallback(() => {
    setHasCompletedOnboarding(false);
    try {
      localStorage.removeItem(ONBOARDING_KEY);
    } catch (e) {}
    if (typeof window !== "undefined") {
      broadcastSync(guest, false);
    }
  }, [guest]);

  const clearProfile = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(ONBOARDING_KEY);
    } catch (e) {}
    const newGuest = generateRandomGuest();
    setGuest(newGuest);
    setHasCompletedOnboarding(false);
    broadcastSync(newGuest, false);
  }, []);

  const randomizeName = useCallback(() => {
    const newName = generateRandomNickname();
    updateGuest({ name: newName });
  }, [updateGuest]);

  const setAvatar = useCallback((avatar: string) => {
    updateGuest({ avatar });
  }, [updateGuest]);

  const setColor = useCallback((color: string) => {
    updateGuest({ color });
  }, [updateGuest]);

  return {
    guest,
    hasCompletedOnboarding,
    isLoaded,
    updateGuest,
    completeOnboarding,
    resetOnboarding,
    clearProfile,
    randomizeName,
    setAvatar,
    setColor,
  };
}

