"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useGuestUser } from "./useGuestUser";
import { GuestUser } from "@/lib/types";

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

function resolveUserRole(username?: string, dbRole?: string): UserRole {
  if (username) {
    const clean = username.trim().toLowerCase();
    if (clean === "jayanthadmin" || clean === "jayanth") {
      return "super_admin";
    }
  }
  if (dbRole === "super_admin" || dbRole === "admin" || dbRole === "manager") {
    return dbRole;
  }
  return "user";
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
      } else if (event === "SIGNED_OUT") {
        if (mounted) setUser(null);
      }
    });

    // Real-time broadcast listener for instant cross-tab / cross-window user updates
    const broadcastChannel = supabase
      .channel("user_updates_broadcast")
      .on("broadcast", { event: "profile_updated" }, (msg: any) => {
        if (!mounted || !msg?.payload) return;
        const { targetUserId, targetUsername, newRole, isBanned } = msg.payload;
        setUser((prev) => {
          if (!prev) return prev;
          const match = (targetUserId && prev.id === targetUserId) ||
                        (targetUsername && prev.username.toLowerCase() === targetUsername.toLowerCase());
          if (!match) return prev;
          return {
            ...prev,
            role: newRole || prev.role,
            isBanned: isBanned !== undefined ? isBanned : prev.isBanned,
          };
        });
      })
      .subscribe();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      supabase.removeChannel(broadcastChannel);
    };
  }, []);

  // Targeted Real-time subscription to update profile & ban status strictly for the active user
  useEffect(() => {
    if (!user?.id || !user.isRegistered) return;

    const profileChannel = supabase
      .channel(`user_profile_${user.id}`)
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

  const refreshUser = async () => {
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
  };

  const isLoaded = guestLoaded && isAuthLoaded;

  // The active profile is the Registered User if they are logged in, otherwise the Guest
  const activeProfile: HybridUser | null = user || (guest ? {
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
    refreshUser,
  };
}
