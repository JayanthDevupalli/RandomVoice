"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useGuestUser } from "./useGuestUser";
import { GuestUser } from "@/lib/types";

export interface HybridUser {
  id: string;
  name: string;
  avatar: string;
  color: string;
  bio: string;
  isRegistered: boolean;
}

export function useUser() {
  const { guest, hasCompletedOnboarding, isLoaded: guestLoaded, updateGuest } = useGuestUser();
  const [user, setUser] = useState<HybridUser | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // Fetch profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (profile && mounted) {
          setUser({
            id: profile.id,
            name: profile.username,
            avatar: profile.avatar,
            color: "#6366F1", // Default color for registered users
            bio: profile.bio || "",
            isRegistered: true,
          });
        }
      }
      if (mounted) setIsAuthLoaded(true);
    }

    checkAuth();

    // Listen for auth changes (e.g. login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (profile && mounted) {
          setUser({
            id: profile.id,
            name: profile.username,
            avatar: profile.avatar,
            color: "#6366F1",
            bio: profile.bio || "",
            isRegistered: true,
          });
        }
      } else if (event === 'SIGNED_OUT') {
        if (mounted) setUser(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const isLoaded = guestLoaded && isAuthLoaded;

  // The active profile is the Registered User if they are logged in, otherwise the Guest
  const activeProfile = user || (guest ? {
    id: guest.id,
    name: guest.name,
    avatar: guest.avatar,
    color: guest.color,
    bio: "",
    isRegistered: false,
  } : null);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    user: activeProfile,
    isRegistered: user !== null,
    hasCompletedOnboarding,
    isLoaded,
    signOut,
  };
}
