"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useGuestUser } from "@/hooks/useGuestUser";
import { generateRandomGuest } from "@/lib/guest-utils";

export type UserRole = "super_admin" | "admin" | "manager" | "user";

export interface HybridUser {
  id: string;
  name: string; // Friendly Shown Name (e.g. "Jay")
  username: string; // Unique handle (e.g. "devdallii")
  displayName?: string; // Display Name (e.g. "Jay")
  avatar: string;
  color: string;
  cardBgColor?: string;
  bio: string;
  isRegistered: boolean;
  role: UserRole;
  isBanned?: boolean;
  bannedReason?: string;
}

export interface UserContextType {
  user: HybridUser | null;
  isRegistered: boolean;
  hasCompletedOnboarding: boolean;
  isLoaded: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

function resolveUserRole(username?: string, dbRole?: string): UserRole {
  if (dbRole === "super_admin" || dbRole === "admin" || dbRole === "manager") {
    return dbRole;
  }
  return "user";
}

const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { guest, hasCompletedOnboarding, isLoaded: guestLoaded } = useGuestUser();
  const [user, setUser] = useState<HybridUser | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single();

          if (profile && mounted) {
            const cardBg = (profile.card_bg_color && profile.card_bg_color !== "#465B73")
              ? profile.card_bg_color
              : (profile.social_links?.card_bg_color || profile.card_bg_color || "#465B73");

            const rawRole = profile.role || profile.social_links?.role;
            const userRole = resolveUserRole(profile.username, rawRole);
            const isUserBanned = userRole === "super_admin" ? false : Boolean(profile.is_banned ?? profile.social_links?.is_banned);
            const userBannedReason = profile.banned_reason || profile.social_links?.banned_reason || undefined;
            const displayName = profile.display_name || profile.social_links?.display_name || profile.username;

            setUser({
              id: profile.id,
              name: displayName,
              username: profile.username,
              displayName: displayName,
              avatar: profile.avatar,
              color: "#6366F1",
              cardBgColor: cardBg,
              bio: profile.bio || "",
              isRegistered: true,
              role: userRole,
              isBanned: isUserBanned,
              bannedReason: userBannedReason,
            });
          }
        } else {
          // User is logged out. Ensure the guest profile in localStorage is a genuine guest persona,
          // not contaminated with a registered member's username.
          try {
            const rawStored = localStorage.getItem("junction_guest_profile");
            if (rawStored) {
              const parsed = JSON.parse(rawStored);
              if (parsed?.name) {
                const { data: existingProf } = await supabase
                  .from("profiles")
                  .select("id")
                  .ilike("username", parsed.name.trim())
                  .maybeSingle();

                if (existingProf && mounted) {
                  const newGuest = generateRandomGuest();
                  localStorage.setItem("junction_guest_profile", JSON.stringify(newGuest));
                  window.dispatchEvent(
                    new CustomEvent("yapclub_guest_profile_sync", { detail: { guest: newGuest, onboarded: true } })
                  );
                }
              }
            }
          } catch {}
        }
      } catch (err) {
        console.warn("Failed to check auth in UserProvider:", err);
      } finally {
        if (mounted) setIsAuthLoaded(true);
      }
    }

    checkAuth();

    // Listen for auth changes (e.g. login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single();

          if (profile && mounted) {
            const cardBg = (profile.card_bg_color && profile.card_bg_color !== "#465B73")
              ? profile.card_bg_color
              : (profile.social_links?.card_bg_color || profile.card_bg_color || "#465B73");

            const rawRole = profile.role || profile.social_links?.role;
            const userRole = resolveUserRole(profile.username, rawRole);
            const isUserBanned = userRole === "super_admin" ? false : Boolean(profile.is_banned ?? profile.social_links?.is_banned);
            const userBannedReason = profile.banned_reason || profile.social_links?.banned_reason || undefined;
            const displayName = profile.display_name || profile.social_links?.display_name || profile.username;

            setUser({
              id: profile.id,
              name: displayName,
              username: profile.username,
              displayName: displayName,
              avatar: profile.avatar,
              color: "#6366F1",
              cardBgColor: cardBg,
              bio: profile.bio || "",
              isRegistered: true,
              role: userRole,
              isBanned: isUserBanned,
              bannedReason: userBannedReason,
            });
          }
        } catch (err) {
          console.warn("Error fetching profile on auth state change:", err);
        }
      } else if (event === "SIGNED_OUT") {
        if (mounted) {
          setUser(null);
          const newGuest = generateRandomGuest();
          try {
            localStorage.setItem("junction_guest_profile", JSON.stringify(newGuest));
          } catch {}
          window.dispatchEvent(
            new CustomEvent("yapclub_guest_profile_sync", { detail: { guest: newGuest, onboarded: true } })
          );
        }
      }
    });

    // Real-time broadcast listener for instant cross-tab / cross-window user updates
    const existingBroadcast = supabase.getChannels().find(
      (c) => c.topic === "realtime:user_updates_broadcast" || c.topic === "user_updates_broadcast"
    );
    if (existingBroadcast) {
      supabase.removeChannel(existingBroadcast);
    }

    const broadcastChannel = supabase
      .channel("user_updates_broadcast")
      .on("broadcast", { event: "profile_updated" }, (msg: any) => {
        if (!mounted || !msg?.payload) return;
        const { targetUserId, targetUsername, newRole, isBanned, displayName } = msg.payload;
        setUser((prev) => {
          if (!prev) return prev;
          const match = (targetUserId && prev.id === targetUserId) ||
                        (targetUsername && prev.username.toLowerCase() === targetUsername.toLowerCase());
          if (!match) return prev;
          return {
            ...prev,
            name: displayName !== undefined ? displayName : prev.name,
            displayName: displayName !== undefined ? displayName : prev.displayName,
            role: newRole || prev.role,
            isBanned: isBanned !== undefined ? isBanned : prev.isBanned,
          };
        });
      })
      .subscribe();

    const handleLocalProfileUpdate = (e: any) => {
      const updatedDisplayName = e?.detail?.displayName;
      if (updatedDisplayName) {
        setUser((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            name: updatedDisplayName,
            displayName: updatedDisplayName,
          };
        });
      }
    };
    window.addEventListener("yapclub_profile_updated", handleLocalProfileUpdate);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener("yapclub_profile_updated", handleLocalProfileUpdate);
      supabase.removeChannel(broadcastChannel);
    };
  }, []);

  // Targeted Real-time subscription to update profile & ban status strictly for the active user
  useEffect(() => {
    if (!user?.id || !user.isRegistered) return;

    // Use a unique channel ID with random suffix to avoid collision with any previous or concurrent channel
    const channelId = `user_profile_${user.id}_${Math.random().toString(36).substring(2, 9)}`;

    const profileChannel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload: any) => {
          const updated = payload.new;
          if (!updated) return;
          setUser((prev) => {
            if (!prev || prev.id !== updated.id) return prev;
            const cardBg =
              updated.card_bg_color && updated.card_bg_color !== "#465B73"
                ? updated.card_bg_color
                : updated.social_links?.card_bg_color || updated.card_bg_color || "#465B73";

            const rawRole = updated.role || updated.social_links?.role;
            const userRole = resolveUserRole(updated.username, rawRole);
            const isUserBanned =
              userRole === "super_admin"
                ? false
                : Boolean(updated.is_banned ?? updated.social_links?.is_banned);
            const userBannedReason =
              updated.banned_reason || updated.social_links?.banned_reason || undefined;
            const displayName = updated.display_name || updated.social_links?.display_name || updated.username;

            return {
              ...prev,
              name: displayName,
              username: updated.username,
              displayName: displayName,
              avatar: updated.avatar,
              cardBgColor: cardBg,
              bio: updated.bio || "",
              role: userRole,
              isBanned: isUserBanned,
              bannedReason: userBannedReason,
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [user?.id, user?.isRegistered]);

  const refreshUser = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (profile) {
          const cardBg = (profile.card_bg_color && profile.card_bg_color !== "#465B73")
            ? profile.card_bg_color
            : (profile.social_links?.card_bg_color || profile.card_bg_color || "#465B73");

          const rawRole = profile.role || profile.social_links?.role;
          const userRole = resolveUserRole(profile.username, rawRole);
          const isUserBanned = userRole === "super_admin" ? false : Boolean(profile.is_banned ?? profile.social_links?.is_banned);
          const userBannedReason = profile.banned_reason || profile.social_links?.banned_reason || undefined;
          const displayName = profile.display_name || profile.social_links?.display_name || profile.username;

          setUser({
            id: profile.id,
            name: displayName,
            username: profile.username,
            displayName: displayName,
            avatar: profile.avatar,
            color: "#6366F1",
            cardBgColor: cardBg,
            bio: profile.bio || "",
            isRegistered: true,
            role: userRole,
            isBanned: isUserBanned,
            bannedReason: userBannedReason,
          });
        }
      }
    } catch (e) {
      console.warn("Failed to refresh user:", e);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    const newGuest = generateRandomGuest();
    try {
      localStorage.setItem("junction_guest_profile", JSON.stringify(newGuest));
    } catch {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("yapclub_guest_profile_sync", { detail: { guest: newGuest, onboarded: true } })
      );
    }
  }, []);

  const isLoaded = guestLoaded && isAuthLoaded;

  const activeProfile: HybridUser | null = useMemo(() => {
    if (user) return user;
    if (guest) {
      return {
        id: guest.id,
        name: guest.displayName || guest.name,
        username: guest.username || guest.name.toLowerCase().replace(/\s+/g, ""),
        displayName: guest.displayName || guest.name,
        avatar: guest.avatar || "zap",
        color: guest.color || "#6366F1",
        cardBgColor: guest.cardBgColor || "#465B73",
        bio: "",
        isRegistered: false,
        role: "user" as UserRole,
        isBanned: false,
      };
    }
    return null;
  }, [user, guest]);

  const value = useMemo(
    () => ({
      user: activeProfile,
      isRegistered: user !== null,
      hasCompletedOnboarding,
      isLoaded,
      signOut,
      refreshUser,
    }),
    [activeProfile, user, hasCompletedOnboarding, isLoaded, signOut, refreshUser]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextType {
  const context = useContext(UserContext);
  if (!context) {
    return {
      user: null,
      isRegistered: false,
      hasCompletedOnboarding: false,
      isLoaded: false,
      signOut: async () => {},
      refreshUser: async () => {},
    };
  }
  return context;
}
