"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams, useSearchParams, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { useGuestUser } from "@/hooks/useGuestUser";
import { useGlobalPresence } from "@/components/providers/GlobalPresenceProvider";
import { Navbar } from "@/components/layout/Navbar";
import { ConnectionsModal } from "@/components/profile/ConnectionsModal";
import { DeleteAccountModal } from "@/components/profile/DeleteAccountModal";
import { ImageCropModal } from "@/components/profile/ImageCropModal";
import { AccountSecurityCard } from "@/components/profile/AccountSecurityCard";
import { CardCustomizer } from "@/components/profile/CardCustomizer";
import { ProfileHeroCard } from "@/components/profile/ProfileHeroCard";
import { ProfileOverviewTab } from "@/components/profile/ProfileOverviewTab";
import { AvatarSelectorModal } from "@/components/profile/AvatarSelectorModal";
import { BlockUserModal } from "@/components/profile/BlockUserModal";
import { ProfileSkeleton } from "@/components/profile/ProfileSkeleton";
import { ProfileToast, ProfileToastState } from "@/components/profile/ProfileToast";
import { socialService } from "@/lib/social-service";
import { stripExifAndSanitizeImage } from "@/lib/image-privacy";
import { ProfileRecord, isProfileUuid } from "@/lib/profile-constants";
import {
  ArrowLeft,
  Ban,
  CheckCheck,
  Copy,
  MoreVertical,
  Palette,
  Shield,
  ShieldAlert,
  Unlock,
  User,
} from "lucide-react";

type SettingsTab = "profile" | "theme" | "security";

export default function ProfilePage({ params: propParams }: { params?: { id: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const routeParams = useParams();
  const searchParams = useSearchParams();
  const targetId = (routeParams?.id as string) || propParams?.id || "me";

  const requestedTab = (searchParams?.get("tab") as SettingsTab) || "profile";
  const [activeTab, setActiveTab] = useState<SettingsTab>(requestedTab);

  const { user: currentUser, isRegistered, isLoaded: isAuthLoaded, signOut, refreshUser } = useUser();
  const { guest, updateGuest, clearProfile } = useGuestUser();
  const { isUserOnline, showOnline, setShowOnline } = useGlobalPresence();

  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [connectionsModalMode, setConnectionsModalMode] = useState<"followers" | "following" | "requests" | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Connection status with target user if not owner
  const [isFollowing, setIsFollowing] = useState(false);
  const [followsMe, setFollowsMe] = useState(false);
  const [hasPendingRequestFromMe, setHasPendingRequestFromMe] = useState(false);
  const [hasPendingRequestFromThem, setHasPendingRequestFromThem] = useState(false);
  const [incomingRequestId, setIncomingRequestId] = useState<string | undefined>(undefined);
  const [isAcceptedConnection, setIsAcceptedConnection] = useState(false);
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [hasBlockedMe, setHasBlockedMe] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isBlockingAction, setIsBlockingAction] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const visitorMenuRef = useRef<HTMLDivElement>(null);

  // Avatar upload, crop & vector selection state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);

  // Non-blocking toast feedback
  const [toast, setToast] = useState<ProfileToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Determine if the current user is viewing their own profile
  const isOwner =
    targetId === "me" ||
    Boolean(
      currentUser &&
        profile &&
        (currentUser.id === profile.id ||
          (currentUser.username &&
            profile.username &&
            currentUser.username.toLowerCase() === profile.username.toLowerCase()))
    );

  // Mutual connection check for viewing connection lists
  const isMutualConnection = Boolean(isFollowing && followsMe);
  const canViewConnections = isOwner || isMutualConnection;

  // Sync tab with URL search param changes and validate permissions
  useEffect(() => {
    const paramTab = searchParams?.get("tab");
    if (paramTab === "theme" && isOwner) {
      setActiveTab("theme");
    } else if (paramTab === "security" && isOwner && isRegistered) {
      setActiveTab("security");
    } else {
      setActiveTab("profile");
    }
  }, [searchParams, isOwner, isRegistered]);

  // Close visitor 3-dot menu on outside click or Escape
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (visitorMenuRef.current && !visitorMenuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  const handleSwitchTab = useCallback(
    (nextTab: SettingsTab) => {
      setActiveTab(nextTab);
      if (pathname) {
        const nextUrl = nextTab === "profile" ? pathname : `${pathname}?tab=${nextTab}`;
        router.replace(nextUrl, { scroll: false });
      }
    },
    [pathname, router]
  );

  const currentUserId = currentUser?.id;
  const currentUserUsername = currentUser?.username;

  const fetchProfile = useCallback(
    async (isInitial = false) => {
      let effectiveTarget = targetId;

      if (effectiveTarget === "me") {
        if (currentUserId) {
          effectiveTarget = currentUserId;
        } else {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.user?.id) {
            effectiveTarget = session.user.id;
          }
        }
      }

      if (!effectiveTarget || effectiveTarget === "me" || (!isRegistered && guest && effectiveTarget === guest.id)) {
        if (isAuthLoaded && !isRegistered && guest) {
          const gDisplayName = guest.displayName || guest.name;
          setProfile({
            id: guest.id,
            username: guest.username || guest.name,
            display_name: gDisplayName,
            avatar: guest.avatar || "zap",
            bio: guest.bio || "Guest Profile (Anonymous Voice Handle)",
            card_bg_color: guest.cardBgColor || "#465B73",
            role: "user",
            is_banned: false,
            isGuestProfile: true,
            social_links: {
              interests: guest.interests || [],
              vibe_status: guest.vibeStatus || "",
              card_bg_color: guest.cardBgColor || "#465B73",
            },
          });
          setIsLoading(false);
        }
        return;
      }

      if (isInitial) setIsLoading(true);

      try {
        let query = supabase.from("profiles").select("*");
        if (isProfileUuid(effectiveTarget)) {
          query = query.eq("id", effectiveTarget);
        } else {
          query = query.ilike("username", effectiveTarget);
        }

        const { data } = await query.maybeSingle();

        if (data) {
          const isCurrentProfileOwner = Boolean(
            (currentUserId && data.id === currentUserId) ||
              (currentUserUsername &&
                data.username &&
                currentUserUsername.toLowerCase() === data.username.toLowerCase()) ||
              effectiveTarget === "me"
          );

          // Sanitize sensitive credentials: never expose recovery_code to non-owners
          const safeSocialLinks = { ...(data.social_links || {}) };
          if (!isCurrentProfileOwner) {
            delete safeSocialLinks.recovery_code;
          }

          const cardBg =
            data.card_bg_color && data.card_bg_color !== "#465B73"
              ? data.card_bg_color
              : safeSocialLinks?.card_bg_color || data.card_bg_color || "#465B73";

          const rawRole = data.role || safeSocialLinks?.role;
          const userRole =
            rawRole === "super_admin" || rawRole === "admin" || rawRole === "manager"
              ? rawRole
              : "user";
          const resolvedDisplayName = data.display_name || safeSocialLinks?.display_name || data.username || "";

          setProfile({
            ...data,
            recovery_code: isCurrentProfileOwner ? data.recovery_code : undefined,
            social_links: safeSocialLinks,
            display_name: resolvedDisplayName,
            avatar: data.avatar || "sparkles",
            bio: data.bio || "",
            role: userRole,
            is_banned: userRole === "super_admin" ? false : Boolean(data.is_banned ?? safeSocialLinks?.is_banned),
            card_bg_color: cardBg,
            isGuestProfile: false,
          });

          // Fetch counts & pending incoming requests (if owner) in parallel
          const [counts, pendingIncoming] = await Promise.all([
            socialService.getFollowCounts(data.id),
            isCurrentProfileOwner && isRegistered
              ? socialService.getPendingIncomingRequests(data.id)
              : Promise.resolve([]),
          ]);

          setFollowersCount(counts.followersCount);
          setFollowingCount(counts.followingCount);
          if (isCurrentProfileOwner) {
            setPendingRequestsCount(pendingIncoming.length);
          }

          if (currentUserId && currentUserId !== data.id) {
            const rel = await socialService.getRelationship(currentUserId, data.id);
            setIsFollowing(rel.isFollowing);
            setFollowsMe(rel.followsMe);
            setHasPendingRequestFromMe(rel.hasPendingRequestFromMe);
            setHasPendingRequestFromThem(rel.hasPendingRequestFromThem);
            setIncomingRequestId(rel.incomingRequestId);
            setIsAcceptedConnection(rel.isAcceptedConnection);
            setIsBlockedByMe(rel.isBlockedByMe);
            setHasBlockedMe(rel.hasBlockedMe);
          }
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        if (isInitial) setIsLoading(false);
      }
    },
    [targetId, currentUserId, currentUserUsername, isAuthLoaded, isRegistered, guest]
  );

  useEffect(() => {
    if (!isAuthLoaded) return;

    if (targetId === "me" && !currentUserId && !isRegistered && !guest) {
      router.push("/");
      return;
    }

    fetchProfile(true);

    const handleSocialEvent = () => {
      fetchProfile(false);
    };
    window.addEventListener("yapclub_social_updated", handleSocialEvent);

    return () => {
      window.removeEventListener("yapclub_social_updated", handleSocialEvent);
    };
  }, [targetId, isAuthLoaded, currentUserId, isRegistered, router, guest, fetchProfile]);

  const handleSendFollowRequest = async () => {
    if (!currentUser || !profile) return;
    setIsConnecting(true);
    try {
      const res = await socialService.followUser(currentUser.id, profile.id);
      if (res.success) {
        setHasPendingRequestFromMe(true);
        showToast("success", `Follow request sent to @${profile.username}`);
      } else if (res.error) {
        showToast("error", res.error);
      }
    } catch (e) {
      console.error(e);
      showToast("error", "Could not send follow request.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCancelFollowRequest = async () => {
    if (!currentUser || !profile) return;
    setIsConnecting(true);
    try {
      const res = await socialService.cancelFollowRequest(currentUser.id, profile.id);
      if (res.success) {
        setHasPendingRequestFromMe(false);
        showToast("success", "Follow request cancelled.");
      } else if (res.error) {
        showToast("error", res.error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleAcceptFollowRequest = async () => {
    if (!currentUser || !profile) return;
    setIsConnecting(true);
    try {
      const res = await socialService.acceptFollowRequest(currentUser.id, profile.id, incomingRequestId);
      if (res.success) {
        setHasPendingRequestFromThem(false);
        setFollowsMe(true);
        setIsAcceptedConnection(true);
        const counts = await socialService.getFollowCounts(profile.id);
        setFollowersCount(counts.followersCount);
        setFollowingCount(counts.followingCount);
        showToast("success", `You and @${profile.username} are now connected.`);
      } else if (res.error) {
        showToast("error", res.error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDeclineFollowRequest = async () => {
    if (!currentUser || !profile) return;
    setIsConnecting(true);
    try {
      const res = await socialService.declineFollowRequest(currentUser.id, profile.id, incomingRequestId);
      if (res.success) {
        setHasPendingRequestFromThem(false);
        showToast("success", "Follow request declined.");
      } else if (res.error) {
        showToast("error", res.error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleUnfollowUser = async () => {
    if (!currentUser || !profile) return;
    setIsConnecting(true);
    try {
      const res = await socialService.unfollowUser(currentUser.id, profile.id);
      if (res.success) {
        setIsFollowing(false);
        setIsAcceptedConnection(followsMe);
        setFollowersCount((prev) => Math.max(0, prev - 1));
        showToast("success", `Unfollowed @${profile.username}`);
      } else if (res.error) {
        showToast("error", res.error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleBlockUser = async () => {
    if (!currentUser || !profile) return;
    setIsBlockingAction(true);
    try {
      const res = await socialService.blockUser(currentUser.id, profile.id);
      if (res.success) {
        setIsBlockedByMe(true);
        setIsFollowing(false);
        setFollowsMe(false);
        setIsBlockModalOpen(false);
        setIsMenuOpen(false);
        const counts = await socialService.getFollowCounts(profile.id);
        setFollowersCount(counts.followersCount);
        setFollowingCount(counts.followingCount);
        showToast("success", `Blocked @${profile.username}`);
      } else if (res.error) {
        showToast("error", res.error);
      }
    } catch (e) {
      console.error("Failed to block user:", e);
      showToast("error", "Failed to block user.");
    } finally {
      setIsBlockingAction(false);
    }
  };

  const handleUnblockUser = async () => {
    if (!currentUser || !profile) return;
    setIsBlockingAction(true);
    try {
      const res = await socialService.unblockUser(currentUser.id, profile.id);
      if (res.success) {
        setIsBlockedByMe(false);
        setIsMenuOpen(false);
        const counts = await socialService.getFollowCounts(profile.id);
        setFollowersCount(counts.followersCount);
        setFollowingCount(counts.followingCount);
        showToast("success", `Unblocked @${profile.username}`);
      } else if (res.error) {
        showToast("error", res.error);
      }
    } catch (e) {
      console.error("Failed to unblock user:", e);
      showToast("error", "Failed to unblock user.");
    } finally {
      setIsBlockingAction(false);
    }
  };

  const handleCopyProfileLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      setIsMenuOpen(false);
      showToast("success", "Profile link copied to clipboard.");
    }
  };

  const handleStartMessage = async () => {
    if (!currentUser || !profile) return;
    if (isBlockedByMe) {
      showToast("error", "You have blocked this user. Unblock them to send messages.");
      return;
    }
    if (hasBlockedMe) {
      showToast("error", "This account is unavailable.");
      return;
    }
    if (!isAcceptedConnection) {
      showToast("error", "Follow request must be accepted before you can message this user.");
      return;
    }
    setIsConnecting(true);
    try {
      const existingConvId = await socialService.ensureDirectConversation(currentUser.id, profile.id);
      router.push(existingConvId ? `/messages?id=${existingConvId}` : "/messages");
    } catch (e) {
      console.error(e);
      showToast("error", "Failed to open conversation.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleLogout = async () => {
    clearProfile();
    await signOut();
    window.location.href = "/";
  };

  const handleDeleteAccount = async () => {
    if (!currentUser || !profile) return;
    setIsDeletingAccount(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          userId: currentUser.id,
          username: profile.username,
        }),
      });

      await supabase.from("profiles").delete().eq("id", currentUser.id);

      try {
        localStorage.removeItem(`yapclub_last_read_${currentUser.id}`);
        localStorage.removeItem(`yapclub_nicknames_${currentUser.id}`);
      } catch {}

      clearProfile();
      await signOut();
      window.location.href = "/";
    } catch (err) {
      console.error("Failed to delete account:", err);
      setIsDeletingAccount(false);
      showToast("error", "Failed to delete account. Please try again.");
    }
  };

  const handleSaveProfileDetails = async ({
    displayName,
    bio,
  }: {
    displayName: string;
    bio: string;
  }): Promise<boolean> => {
    if (!isOwner || !profile) return false;
    const trimmedDisplayName = displayName.trim() || profile.username;
    const updatedSocialLinks = {
      ...(profile.social_links || {}),
      display_name: trimmedDisplayName,
    };

    try {
      if (isRegistered) {
        const { error } = await supabase
          .from("profiles")
          .update({
            bio,
            display_name: trimmedDisplayName,
            social_links: updatedSocialLinks,
          })
          .eq("id", profile.id);

        if (error) {
          const fallback = await supabase
            .from("profiles")
            .update({
              bio,
              social_links: updatedSocialLinks,
            })
            .eq("id", profile.id);
          if (fallback.error) throw fallback.error;
        }
      } else if (guest) {
        updateGuest({
          displayName: trimmedDisplayName,
          name: trimmedDisplayName,
          bio,
        });
      }

      setProfile({
        ...profile,
        bio,
        display_name: trimmedDisplayName,
        social_links: updatedSocialLinks,
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("yapclub_profile_updated", {
            detail: { displayName: trimmedDisplayName },
          })
        );
      }
      if (refreshUser) refreshUser();
      showToast("success", "Profile details updated.");
      return true;
    } catch (err) {
      console.error("Failed to save profile details:", err);
      showToast("error", "Could not save profile changes.");
      return false;
    }
  };

  const handleSaveVoiceIdentity = async ({
    interests,
    vibeStatus,
  }: {
    interests: string[];
    vibeStatus: string;
  }): Promise<boolean> => {
    if (!isOwner || !profile) return false;
    const updatedSocialLinks = {
      ...(profile.social_links || {}),
      interests,
      vibe_status: vibeStatus,
    };

    try {
      if (isRegistered) {
        const { error } = await supabase
          .from("profiles")
          .update({ social_links: updatedSocialLinks })
          .eq("id", profile.id);
        if (error) throw error;
      } else if (guest) {
        updateGuest({
          interests,
          vibeStatus,
        });
      }

      setProfile({
        ...profile,
        social_links: updatedSocialLinks,
      });
      showToast("success", "Voice identity updated.");
      return true;
    } catch (err) {
      console.error("Failed to save voice identity:", err);
      showToast("error", "Failed to save voice topics & vibe.");
      return false;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !isOwner || !profile) return;

    const file = e.target.files[0];
    if (!file.type.startsWith("image/")) {
      showToast("error", "Please select a valid image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast("error", "Image must be smaller than 8MB.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setTempImageSrc(objectUrl);
    setCropModalOpen(true);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSelectVectorAvatar = async (avatarId: string) => {
    if (!isOwner || !profile) return;
    setIsUploadingAvatar(true);

    try {
      if (isRegistered) {
        const { error } = await supabase
          .from("profiles")
          .update({ avatar: avatarId })
          .eq("id", profile.id);
        if (error) throw error;
      } else if (guest) {
        updateGuest({ avatar: avatarId });
      }

      setProfile({ ...profile, avatar: avatarId });
      setIsAvatarModalOpen(false);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("yapclub_profile_updated", {
            detail: { avatar: avatarId },
          })
        );
      }
      if (refreshUser) refreshUser();
      showToast("success", "Avatar icon updated.");
    } catch (err) {
      console.error("Failed to update vector avatar:", err);
      showToast("error", "Could not update avatar.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleApplyCroppedImage = async (croppedBlob: Blob) => {
    if (!isOwner || !profile) return;
    setIsUploadingAvatar(true);

    try {
      // Privacy safeguard: Strip all EXIF / GPS / device metadata before uploading
      const sanitizedBlob = await stripExifAndSanitizeImage(croppedBlob, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.92,
      });

      const fileName = `${profile.id}-${Date.now()}.jpg`;
      const filePath = `public/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, sanitizedBlob, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);

      if (isRegistered) {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ avatar: data.publicUrl })
          .eq("id", profile.id);

        if (updateError) throw updateError;
      } else if (guest) {
        updateGuest({ avatar: data.publicUrl });
      }

      setProfile({ ...profile, avatar: data.publicUrl });
      setCropModalOpen(false);

      if (tempImageSrc) {
        URL.revokeObjectURL(tempImageSrc);
        setTempImageSrc(null);
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("yapclub_profile_updated", {
            detail: { avatar: data.publicUrl },
          })
        );
      }
      if (refreshUser) refreshUser();
      showToast("success", "Profile picture updated.");
    } catch (err: any) {
      console.error("Upload failed", err);
      if (guest) {
        try {
          const sanitizedBlob = await stripExifAndSanitizeImage(croppedBlob, {
            maxWidth: 400,
            maxHeight: 400,
            quality: 0.85,
          });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            updateGuest({ avatar: base64data });
            setProfile({ ...profile, avatar: base64data });
            setCropModalOpen(false);
            if (tempImageSrc) {
              URL.revokeObjectURL(tempImageSrc);
              setTempImageSrc(null);
            }
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("yapclub_profile_updated", {
                  detail: { avatar: base64data },
                })
              );
            }
            showToast("success", "Guest avatar updated.");
          };
          reader.readAsDataURL(sanitizedBlob);
          return;
        } catch {
          setCropModalOpen(false);
        }
      }
      showToast("error", err?.message || "Failed to upload image. Please try again.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveTheme = async (cardBgColor: string) => {
    if (!isOwner || !profile) return;

    try {
      if (isRegistered) {
        const updatedSocialLinks = {
          ...(profile.social_links || {}),
          card_bg_color: cardBgColor,
        };

        const { error } = await supabase
          .from("profiles")
          .update({ social_links: updatedSocialLinks })
          .eq("id", profile.id);

        try {
          await supabase
            .from("profiles")
            .update({ card_bg_color: cardBgColor })
            .eq("id", profile.id);
        } catch {}

        if (error) throw error;

        setProfile({
          ...profile,
          card_bg_color: cardBgColor,
          social_links: updatedSocialLinks,
        });
      } else if (guest) {
        updateGuest({ cardBgColor });
        setProfile({
          ...profile,
          card_bg_color: cardBgColor,
          social_links: { ...(profile.social_links || {}), card_bg_color: cardBgColor },
        });
      }
      showToast("success", "Voice card theme saved.");
    } catch (err) {
      console.error("Failed to save theme:", err);
      showToast("error", "Could not save card theme.");
    }
  };

  if (!isAuthLoaded || isLoading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex flex-col text-slate-200">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <ShieldAlert className="w-12 h-12 text-rose-500 mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Profile Not Found</h2>
          <p className="text-slate-400">This user does not exist or has been deleted.</p>
        </div>
      </div>
    );
  }

  const TABS = [
    { id: "profile", label: "Overview", mobileLabel: "Overview", icon: User },
    ...(isOwner ? [{ id: "theme", label: "Voice Card Theme", mobileLabel: "Card Theme", icon: Palette }] : []),
    ...(isOwner && isRegistered ? [{ id: "security", label: "Security", mobileLabel: "Security", icon: Shield }] : []),
  ];

  const isTargetOnline = isOwner
    ? isRegistered
      ? showOnline
      : true
    : !hasBlockedMe && !isBlockedByMe && isUserOnline(profile.id);

  return (
    <div className="min-h-screen bg-background flex flex-col text-slate-200">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Top Header Navigation Bar */}
        <div className="flex items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-white/10">
          <button
            type="button"
            onClick={() => router.push("/junctions")}
            className="inline-flex items-center gap-2 sm:gap-2.5 text-xs sm:text-sm text-slate-400 hover:text-white transition-colors cursor-pointer group min-w-0"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 group-hover:border-white/20 active:scale-95 transition-all shrink-0 shadow-sm">
              <ArrowLeft size={15} className="sm:w-4 sm:h-4" />
            </div>
            <span className="font-semibold tracking-wide truncate">Back to Voice Rooms</span>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${
                isTargetOnline ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
              }`}
            />
            <span className="text-[11px] sm:text-xs font-semibold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
              {isOwner ? "My Dashboard" : `${profile.display_name || profile.username}'s Profile`}
            </span>

            {/* Visitor 3-Dot Options Dropdown */}
            {!isOwner && currentUser && (
              <div className="relative" ref={visitorMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen((prev) => !prev)}
                  className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 transition-all active:scale-95 cursor-pointer"
                  title="Profile Options"
                  aria-label="Profile Options"
                >
                  <MoreVertical size={16} />
                </button>

                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl bg-[#12131A] border border-white/10 shadow-2xl py-1.5 z-50 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150">
                    <button
                      type="button"
                      onClick={handleCopyProfileLink}
                      className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left cursor-pointer"
                    >
                      {copiedLink ? (
                        <CheckCheck size={15} className="text-emerald-400" />
                      ) : (
                        <Copy size={15} className="text-indigo-400" />
                      )}
                      <span>{copiedLink ? "Link Copied!" : "Copy Profile Link"}</span>
                    </button>

                    {isBlockedByMe ? (
                      <button
                        type="button"
                        onClick={handleUnblockUser}
                        disabled={isBlockingAction}
                        className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 transition-colors text-left cursor-pointer"
                      >
                        <Unlock size={15} />
                        <span>Unblock @{profile.username}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          setIsBlockModalOpen(true);
                        }}
                        className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors text-left cursor-pointer"
                      >
                        <Ban size={15} />
                        <span>Block @{profile.username}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Hidden File Input for Avatar Upload */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*"
          className="hidden"
        />

        {/* 2-COLUMN SPLIT DASHBOARD LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* LEFT SIDEBAR: PROFILE HERO CARD */}
          <div className="lg:col-span-4 xl:col-span-4 space-y-6 lg:sticky lg:top-24">
            <ProfileHeroCard
              profile={profile}
              isOwner={isOwner}
              isRegisteredOwner={isRegistered}
              isOnline={isTargetOnline}
              followersCount={followersCount}
              followingCount={followingCount}
              pendingRequestsCount={pendingRequestsCount}
              canViewConnections={canViewConnections}
              isFollowing={isFollowing}
              followsMe={followsMe}
              hasPendingRequestFromMe={hasPendingRequestFromMe}
              hasPendingRequestFromThem={hasPendingRequestFromThem}
              isAcceptedConnection={isAcceptedConnection}
              isBlockedByMe={isBlockedByMe}
              hasBlockedMe={hasBlockedMe}
              isConnecting={isConnecting}
              isBlockingAction={isBlockingAction}
              isUploadingAvatar={isUploadingAvatar}
              onOpenAvatarModal={() => setIsAvatarModalOpen(true)}
              onOpenConnections={(mode) => setConnectionsModalMode(mode)}
              onSaveProfileDetails={handleSaveProfileDetails}
              onSendFollowRequest={handleSendFollowRequest}
              onCancelFollowRequest={handleCancelFollowRequest}
              onAcceptFollowRequest={handleAcceptFollowRequest}
              onDeclineFollowRequest={handleDeclineFollowRequest}
              onUnfollowUser={handleUnfollowUser}
              onUnblockUser={handleUnblockUser}
              onStartMessage={handleStartMessage}
              onJumpToThemeTab={isOwner ? () => handleSwitchTab("theme") : undefined}
            />
          </div>

          {/* RIGHT MAIN CONTENT AREA: TABBED CONTROLS */}
          <div className="lg:col-span-8 xl:col-span-8 space-y-6">
            {/* TAB NAVIGATION BAR */}
            <div
              className={`bg-[#12131A]/95 border border-white/10 rounded-2xl p-1.5 grid gap-1.5 shadow-xl backdrop-blur-xl ${
                TABS.length === 3 ? "grid-cols-3" : TABS.length === 2 ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleSwitchTab(tab.id as SettingsTab)}
                    className={`min-h-[44px] h-11 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 rounded-xl font-semibold text-xs sm:text-sm transition-all cursor-pointer ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 border border-indigo-500/40"
                        : "text-slate-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon size={16} className={`shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden text-[11px] truncate">{tab.mobileLabel}</span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              {activeTab === "profile" && (
                <motion.div
                  key="tab-profile"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                >
                  <ProfileOverviewTab
                    profile={profile}
                    isOwner={isOwner}
                    isRegisteredOwner={isRegistered}
                    isOnline={isTargetOnline}
                    showOnline={showOnline}
                    onToggleShowOnline={async (val) => {
                      await setShowOnline(val);
                      showToast("success", val ? "Online status is now visible." : "You now appear offline.");
                    }}
                    onSaveVoiceIdentity={handleSaveVoiceIdentity}
                    onSwitchTab={handleSwitchTab}
                    onLogout={handleLogout}
                    onOpenDeleteModal={() => setIsDeleteModalOpen(true)}
                  />
                </motion.div>
              )}

              {activeTab === "theme" && isOwner && (
                <motion.div
                  key="tab-theme"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                >
                  <CardCustomizer
                    username={profile.username}
                    displayName={profile.display_name || profile.username}
                    avatar={profile.avatar}
                    initialColor={profile.card_bg_color || profile.social_links?.card_bg_color || "#465B73"}
                    onSave={handleSaveTheme}
                  />
                </motion.div>
              )}

              {activeTab === "security" && isOwner && isRegistered && (
                <motion.div
                  key="tab-security"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                >
                  <AccountSecurityCard
                    userId={profile.id}
                    username={profile.username}
                    initialRecoveryCode={profile.recovery_code || profile.social_links?.recovery_code}
                    onCodeUpdated={(newCode) => {
                      setProfile({ ...profile, recovery_code: newCode });
                      showToast("success", "Recovery code updated.");
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Connections Modal */}
      {connectionsModalMode && profile && (
        <ConnectionsModal
          isOpen={true}
          onClose={() => setConnectionsModalMode(null)}
          targetUserId={profile.id}
          targetUsername={profile.username}
          currentUserId={currentUser?.id}
          initialMode={connectionsModalMode}
          onCountsChanged={() => fetchProfile(false)}
          isMutualConnection={canViewConnections}
          initialFollowersCount={followersCount}
          initialFollowingCount={followingCount}
        />
      )}

      {/* Block User Confirmation Modal */}
      <BlockUserModal
        isOpen={isBlockModalOpen && Boolean(profile)}
        username={profile.username}
        isBlocking={isBlockingAction}
        onClose={() => setIsBlockModalOpen(false)}
        onConfirm={handleBlockUser}
      />

      {/* Delete Account Modal */}
      {isOwner && (
        <DeleteAccountModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleDeleteAccount}
          isDeleting={isDeletingAccount}
          username={profile.username}
        />
      )}

      {/* Unified Avatar Selector Modal */}
      {isOwner && (
        <AvatarSelectorModal
          isOpen={isAvatarModalOpen}
          currentAvatar={profile.avatar}
          isSaving={isUploadingAvatar}
          onClose={() => setIsAvatarModalOpen(false)}
          onSelectVectorAvatar={handleSelectVectorAvatar}
          onUploadPhotoClick={() => fileInputRef.current?.click()}
        />
      )}

      {/* Image Crop Modal */}
      <ImageCropModal
        isOpen={cropModalOpen}
        imageSrc={tempImageSrc}
        onClose={() => {
          setCropModalOpen(false);
          if (tempImageSrc) {
            URL.revokeObjectURL(tempImageSrc);
            setTempImageSrc(null);
          }
        }}
        onApplyCrop={handleApplyCroppedImage}
        isSaving={isUploadingAvatar}
      />

      {/* Non-blocking Toast */}
      <ProfileToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
