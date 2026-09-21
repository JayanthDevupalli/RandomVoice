"use client";

import { useState, useEffect } from "react";
import { GuestUser } from "@/lib/types";
import { generateRandomGuest, generateRandomNickname } from "@/lib/guest-utils";

const STORAGE_KEY = "junction_guest_profile";
const ONBOARDING_KEY = "junction_onboarding_completed";

const DEFAULT_GUEST: GuestUser = {
  id: "guest_init",
  name: "CyberOtter",
  avatar: "zap",
  color: "#6366F1",
};

export function useGuestUser() {
  const [guest, setGuest] = useState<GuestUser>(DEFAULT_GUEST);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const onboarded = localStorage.getItem(ONBOARDING_KEY);

      if (stored) {
        setGuest(JSON.parse(stored));
      } else {
        const initial = generateRandomGuest();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        setGuest(initial);
      }

      if (onboarded === "true") {
        setHasCompletedOnboarding(true);
      }
    } catch (e) {
      setGuest(generateRandomGuest());
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const updateGuest = (updates: Partial<GuestUser>) => {
    if (!guest) return;
    const updated = { ...guest, ...updates };
    setGuest(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save guest profile", e);
    }
  };

  const completeOnboarding = (personaUpdates?: Partial<GuestUser>) => {
    if (personaUpdates && guest) {
      const updated = { ...guest, ...personaUpdates };
      setGuest(updated);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {}
    }
    setHasCompletedOnboarding(true);
    try {
      localStorage.setItem(ONBOARDING_KEY, "true");
    } catch (e) {}
  };

  const resetOnboarding = () => {
    setHasCompletedOnboarding(false);
    try {
      localStorage.removeItem(ONBOARDING_KEY);
    } catch (e) {}
  };

  const clearProfile = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(ONBOARDING_KEY);
    } catch (e) {}
    setGuest(generateRandomGuest());
    setHasCompletedOnboarding(false);
  };

  const randomizeName = () => {
    updateGuest({ name: generateRandomNickname() });
  };

  const setAvatar = (emoji: string) => {
    updateGuest({ avatar: emoji });
  };

  const setColor = (color: string) => {
    updateGuest({ color });
  };

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

