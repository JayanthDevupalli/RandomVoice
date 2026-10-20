"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { Navbar } from "@/components/layout/Navbar";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  LogOut,
  Edit3,
  Camera,
  Check,
  ShieldAlert,
  Loader2,
  ArrowLeft,
  Trash2,
  UserPlus,
  MessageSquare,
  Clock,
  User,
  Palette,
  Shield,
  Sparkles,
  ShieldCheck,
  Quote,
  Users,
  UserCheck,
  MoreVertical,
  Ban,
  Unlock,
  Copy,
  CheckCheck,
  Crown,
  Lock,
  X,
} from "lucide-react";
import { ConnectionsModal } from "@/components/profile/ConnectionsModal";
import { DeleteAccountModal } from "@/components/profile/DeleteAccountModal";
import { useGuestUser } from "@/hooks/useGuestUser";
import { ImageCropModal } from "@/components/profile/ImageCropModal";
import { AccountSecurityCard } from "@/components/profile/AccountSecurityCard";
import { CardCustomizer } from "@/components/profile/CardCustomizer";
import { getCardThemeStyle } from "@/lib/card-themes";
import { socialService } from "@/lib/social-service";
import { RoleBadge } from "@/components/ui/RoleBadge";

type SettingsTab = "profile" | "theme" | "security";

export default function ProfilePage({ params: propParams }: { params?: { id: string } }) {
  const router = useRouter();
  const routeParams = useParams();
  const searchParams = useSearchParams();
  const targetId = (routeParams?.id as string) || propParams?.id || "me";

  const initialTab = (searchParams?.get("tab") as SettingsTab) || "profile";
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  const { user: currentUser, isRegistered, isLoaded: isAuthLoaded, signOut } = useUser();
  const { guest, updateGuest, clearProfile } = useGuestUser();

  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [connectionsModalMode, setConnectionsModalMode] = useState<"followers" | "following" | "requests" | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Connection status with target user if not owner
  const [isFollowing, setIsFollowing] = useState(false);
  const [followsMe, setFollowsMe] = useState(false);
  const [hasPendingRequestFromMe, setHasPendingRequestFromMe] = useState(false);
  const [hasPendingRequestFromThem, setHasPendingRequestFromThem] = useState(false);
  const [incomingRequestId, setIncomingRequestId] = useState<string | undefined>(undefined);
  const [outgoingRequestId, setOutgoingRequestId] = useState<string | undefined>(undefined);
  const [isAcceptedConnection, setIsAcceptedConnection] = useState(false);
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [hasBlockedMe, setHasBlockedMe] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isBlockingAction, setIsBlockingAction] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const visitorMenuRef = useRef<HTMLDivElement>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // File upload & crop state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);

  const isUUID = (str?: string) =>
    str ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str) : false;

  // Determine if the current user is viewing their own profile
  const isOwner = targetId === "me" || Boolean(
    currentUser && profile && (
      currentUser.id === profile.id ||
      (currentUser.username && profile.username && currentUser.username.toLowerCase() === profile.username.toLowerCase())
    )
  );

  const fetchProfile = useCallback(async (isInitial = false) => {
    let effectiveTarget = targetId;

    if (effectiveTarget === "me") {
      if (currentUser?.id) {
        effectiveTarget = currentUser.id;
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          effectiveTarget = session.user.id;
        }
      }
    }

    if (!effectiveTarget || effectiveTarget === "me") {
      if (isInitial && isAuthLoaded && !isRegistered && guest) {
        const gDisplayName = guest.displayName || guest.name;
        setProfile({
          id: guest.id,
          username: guest.username || guest.name,
          display_name: gDisplayName,
          avatar: guest.avatar,
          bio: "Guest Profile (Anonymous Voice Handle)",
          card_bg_color: guest.cardBgColor || "#465B73",
        });
        setBio("Guest Profile (Anonymous Voice Handle)");
        setDisplayName(gDisplayName);
        setIsLoading(false);
      }
      return;
    }

    if (isInitial) setIsLoading(true);

    try {
      let query = supabase.from("profiles").select("*");
      if (isUUID(effectiveTarget)) {
        query = query.eq("id", effectiveTarget);
      } else {
        query = query.ilike("username", effectiveTarget);
      }

      const { data } = await query.maybeSingle();

      if (data) {
        const isCurrentProfileOwner = Boolean(
          (currentUser?.id && data.id === currentUser.id) ||
          (currentUser?.username && data.username && currentUser.username.toLowerCase() === data.username.toLowerCase()) ||
          effectiveTarget === "me"
        );

        // Sanitize sensitive credentials: never expose recovery_code to non-owners
        const safeSocialLinks = { ...(data.social_links || {}) };
        if (!isCurrentProfileOwner) {
          delete safeSocialLinks.recovery_code;
        }

        const cardBg = (data.card_bg_color && data.card_bg_color !== "#465B73")
          ? data.card_bg_color
          : (safeSocialLinks?.card_bg_color || data.card_bg_color || "#465B73");

        const cleanName = data.username?.trim().toLowerCase() || "";
        const rawRole = data.role || safeSocialLinks?.role;
        const userRole = (cleanName === "jayanthadmin" || cleanName === "jayanth")
          ? "super_admin"
          : (rawRole || "user");
        const resolvedDisplayName = data.display_name || safeSocialLinks?.display_name || data.username || "";

        setProfile({
          ...data,
          recovery_code: isCurrentProfileOwner ? data.recovery_code : undefined,
          social_links: safeSocialLinks,
          display_name: resolvedDisplayName,
          role: userRole,
          is_banned: userRole === "super_admin" ? false : Boolean(data.is_banned ?? safeSocialLinks?.is_banned),
          card_bg_color: cardBg,
        });
        setBio(data.bio || "");
        setDisplayName(resolvedDisplayName);

        // Accurate follow & following counts via socialService with real UUID
        const counts = await socialService.getFollowCounts(data.id);
        setFollowersCount(counts.followersCount);
        setFollowingCount(counts.followingCount);

        if (currentUser && currentUser.id !== data.id) {
          const rel = await socialService.getRelationship(currentUser.id, data.id);
          setIsFollowing(rel.isFollowing);
          setFollowsMe(rel.followsMe);
          setHasPendingRequestFromMe(rel.hasPendingRequestFromMe);
          setHasPendingRequestFromThem(rel.hasPendingRequestFromThem);
          setIncomingRequestId(rel.incomingRequestId);
          setOutgoingRequestId(rel.outgoingRequestId);
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
  }, [targetId, currentUser?.id, isAuthLoaded, isRegistered, guest]);

  useEffect(() => {
    if (!isAuthLoaded) return;

    if (targetId === "me" && !currentUser && !isRegistered && !guest) {
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
  }, [targetId, isAuthLoaded, currentUser?.id, isRegistered, router, guest, fetchProfile]);

  const handleSendFollowRequest = async () => {
    if (!currentUser || !profile) return;
    setIsConnecting(true);
    try {
      const res = await socialService.followUser(currentUser.id, profile.id);
      if (res.success) {
        setHasPendingRequestFromMe(true);
      } else if (res.error) {
        alert(res.error);
      }
    } catch (e) {
      console.error(e);
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
      } else if (res.error) {
        alert(res.error);
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
      } else if (res.error) {
        alert(res.error);
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
      } else if (res.error) {
        alert(res.error);
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
      } else if (res.error) {
        alert(res.error);
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
      } else if (res.error) {
        alert(res.error);
      }
    } catch (e) {
      console.error("Failed to block user:", e);
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
      } else if (res.error) {
        alert(res.error);
      }
    } catch (e) {
      console.error("Failed to unblock user:", e);
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
    }
  };

  const handleStartMessage = async () => {
    if (!currentUser || !profile) return;
    if (isBlockedByMe) {
      alert("You have blocked this user. Unblock them to send messages.");
      return;
    }
    if (hasBlockedMe) {
      alert("This account is unavailable.");
      return;
    }
    if (!isAcceptedConnection) {
      alert("Follow request must be accepted before you can message this user.");
      return;
    }
    setIsConnecting(true);
    try {
      const { data: myConvs } = await supabase
        .from("conversation_members")
        .select("conversation_id, conversations!inner(type)")
        .eq("user_id", currentUser.id)
        .eq("conversations.type", "direct");

      let existingConvId = null;

      if (myConvs && myConvs.length > 0) {
        const convIds = myConvs.map((c: any) => c.conversation_id);
        const { data: shared } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", profile.id)
          .in("conversation_id", convIds);

        if (shared && shared.length > 0) {
          existingConvId = shared[0].conversation_id;
        }
      }

      if (!existingConvId) {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({ type: "direct" })
          .select("id")
          .single();

        if (newConv) {
          await supabase.from("conversation_members").insert([
            { conversation_id: newConv.id, user_id: currentUser.id },
            { conversation_id: newConv.id, user_id: profile.id },
          ]);
          existingConvId = newConv.id;
        }
      }

      router.push(`/messages?id=${existingConvId}`);
    } catch (e) {
      console.error(e);
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
      const { data: { session } } = await supabase.auth.getSession();
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
      } catch (e) { }

      clearProfile();
      await signOut();
      window.location.href = "/";
    } catch (err) {
      console.error("Failed to delete account:", err);
      setIsDeletingAccount(false);
    }
  };

  const saveProfile = async () => {
    if (!isOwner || !profile) return;
    setIsSaving(true);

    const trimmedDisplayName = displayName.trim() || profile.username;
    const updatedSocialLinks = {
      ...(profile.social_links || {}),
      display_name: trimmedDisplayName,
    };

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
        await supabase
          .from("profiles")
          .update({
            bio,
            social_links: updatedSocialLinks,
          })
          .eq("id", profile.id);
      }
    } else if (guest) {
      updateGuest({
        displayName: trimmedDisplayName,
        name: trimmedDisplayName,
      });
    }

    setProfile({
      ...profile,
      bio,
      display_name: trimmedDisplayName,
      social_links: updatedSocialLinks,
    });
    setIsEditing(false);
    setIsSaving(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !isOwner || !profile) return;

    const file = e.target.files[0];
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert("Image must be smaller than 8MB");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setTempImageSrc(objectUrl);
    setCropModalOpen(true);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleApplyCroppedImage = async (croppedBlob: Blob) => {
    if (!isOwner || !profile) return;
    setIsUploading(true);

    const fileName = `${profile.id}-${Date.now()}.jpg`;
    const filePath = `public/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, croppedBlob, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar: data.publicUrl })
        .eq("id", profile.id);

      if (updateError) throw updateError;

      setProfile({ ...profile, avatar: data.publicUrl });
      setCropModalOpen(false);

      if (tempImageSrc) {
        URL.revokeObjectURL(tempImageSrc);
        setTempImageSrc(null);
      }
    } catch (err) {
      console.error("Upload failed", err);
      alert("Failed to upload cropped image. Make sure the storage bucket exists.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveTheme = async (cardBgColor: string) => {
    if (!isOwner) return;

    if (isRegistered && profile) {
      const updatedSocialLinks = {
        ...(profile.social_links || {}),
        card_bg_color: cardBgColor,
      };

      const { error } = await supabase
        .from("profiles")
        .update({
          social_links: updatedSocialLinks,
        })
        .eq("id", profile.id);

      try {
        await supabase
          .from("profiles")
          .update({
            card_bg_color: cardBgColor,
          })
          .eq("id", profile.id);
      } catch (e) { }

      if (!error) {
        setProfile({
          ...profile,
          card_bg_color: cardBgColor,
          social_links: updatedSocialLinks,
        });
      }
    } else if (guest) {
      updateGuest({
        cardBgColor,
      });
      setProfile((prev: any) => ({
        ...prev,
        card_bg_color: cardBgColor,
      }));
    }
  };

  if (!isAuthLoaded || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
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

  const themeStyle = getCardThemeStyle(
    profile.card_bg_color || profile.social_links?.card_bg_color || "#465B73"
  );

  return (
    <div className="min-h-screen bg-background flex flex-col text-slate-200">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">

        {/* Top Header Navigation Bar */}
        <div className="flex items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-white/10">
          <button
            onClick={() => router.push("/junctions")}
            className="inline-flex items-center gap-2 sm:gap-2.5 text-xs sm:text-sm text-slate-400 hover:text-white transition-colors cursor-pointer group min-w-0"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 group-hover:border-white/20 active:scale-95 transition-all shrink-0 shadow-sm">
              <ArrowLeft size={15} className="sm:w-4 sm:h-4" />
            </div>
            <span className="font-semibold tracking-wide truncate">Back to Voice Rooms</span>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] sm:text-xs font-semibold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
              {isOwner ? "My Dashboard" : `${profile.username}'s Profile`}
            </span>

            {/* Visitor 3-Dot Options Dropdown */}
            {!isOwner && currentUser && (
              <div className="relative" ref={visitorMenuRef}>
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 transition-all active:scale-95 cursor-pointer"
                  title="Profile Options"
                  aria-label="Profile Options"
                >
                  <MoreVertical size={16} />
                </button>

                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl bg-[#12131A] border border-white/10 shadow-2xl py-1.5 z-50 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150">
                    <button
                      onClick={handleCopyProfileLink}
                      className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left cursor-pointer"
                    >
                      {copiedLink ? <CheckCheck size={15} className="text-emerald-400" /> : <Copy size={15} className="text-indigo-400" />}
                      <span>{copiedLink ? "Link Copied!" : "Copy Profile Link"}</span>
                    </button>

                    {isBlockedByMe ? (
                      <button
                        onClick={handleUnblockUser}
                        disabled={isBlockingAction}
                        className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 transition-colors text-left cursor-pointer"
                      >
                        <Unlock size={15} />
                        <span>Unblock @{profile.username}</span>
                      </button>
                    ) : (
                      <button
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

        {/* 2-COLUMN SPLIT DASHBOARD LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">

          {/* LEFT SIDEBAR: PROFILE HERO CARD */}
          <div className="lg:col-span-4 xl:col-span-4 space-y-6 lg:sticky lg:top-24">
            <div className="bg-[#12131A]/95 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-xl overflow-hidden relative group">
              
              {/* Cover Banner Accent */}
              <div
                className="h-28 sm:h-32 w-full relative transition-all duration-500 border-b border-white/10 overflow-hidden"
                style={{ backgroundColor: profile.card_bg_color || profile.social_links?.card_bg_color || "#465B73" }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-[#12131A]" />
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[10px] font-medium text-slate-300 flex items-center gap-1.5">
                  <Sparkles size={11} className="text-indigo-400" />
                  <span>Voice Card Theme</span>
                </div>
              </div>

              {/* Profile Details Container */}
              <div className="px-5 sm:px-6 pb-6 relative flex flex-col items-center text-center -mt-14">

                {/* Blocked by viewer alert banner */}
                {isBlockedByMe && (
                  <div className="w-full mb-3 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold flex items-center justify-center gap-2 animate-in fade-in">
                    <ShieldAlert size={14} className="text-amber-400 shrink-0" />
                    <span>You have blocked @{profile.username}</span>
                  </div>
                )}

                {/* Avatar with Ring */}
                {(() => {
                  const isMainAdminProfile = (
                    profile.username?.trim().toLowerCase() === "jayanthadmin" ||
                    profile.username?.trim().toLowerCase() === "jayanth" ||
                    profile.role === "super_admin"
                  );
                  const profileRole = isMainAdminProfile
                    ? "super_admin"
                    : (profile.role === "admin" ? "admin" : profile.role === "manager" ? "manager" : "user");

                  return (
                    <>
                      <div className="relative mb-3">
                        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-visible border-4 border-[#12131A] shadow-2xl bg-indigo-900/40 flex items-center justify-center relative">
                          {profile.avatar.includes("http") ? (
                            <img src={profile.avatar} alt={profile.username} className="w-full h-full object-cover rounded-full" />
                          ) : (
                            <UserAvatar
                              avatar={profile.avatar}
                              color="#6366F1"
                              size="lg"
                              className="!rounded-full !w-full !h-full"
                              badgeRole={profileRole !== "user" ? profileRole : undefined}
                            />
                          )}
                        </div>

                        {isOwner && (
                          <>
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploading}
                              className="absolute bottom-0 right-0 w-8 h-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 disabled:opacity-50 cursor-pointer border-2 border-[#12131A] z-10"
                              title="Change Avatar"
                            >
                              {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                            </button>
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleFileSelect}
                              accept="image/*"
                              className="hidden"
                            />
                          </>
                        )}
                      </div>

                      {/* Shown Name & Status Badge */}
                      <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mb-0.5 flex items-center justify-center gap-2 flex-wrap">
                        <span>{profile.display_name || profile.username}</span>
                        {profileRole !== "user" && (
                          <RoleBadge role={profileRole} size="xs" showLabel={false} />
                        )}
                      </h1>
                      <div className="text-xs sm:text-sm font-semibold text-indigo-300/80 mb-2">
                        @{profile.username}
                      </div>
                      <div className="flex items-center gap-1.5 mb-4 flex-wrap justify-center">
                        {hasBlockedMe ? (
                          <span className="text-[11px] font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-full flex items-center gap-1">
                            <ShieldAlert size={12} className="text-rose-400" />
                            Account Unavailable
                          </span>
                        ) : profile.is_banned ? (
                          <span className="text-[11px] font-bold text-rose-300 bg-rose-500/15 border border-rose-500/30 px-3 py-1 rounded-full flex items-center gap-1 shadow-[0_0_10px_rgba(244,63,94,0.2)]">
                            <Ban size={12} className="text-rose-400" />
                            Account Suspended
                          </span>
                        ) : profileRole !== "user" ? (
                          <RoleBadge role={profileRole} size="sm" showLabel={true} />
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-300 bg-white/5 border border-white/10 px-3 py-1 rounded-full flex items-center gap-1">
                            <ShieldCheck size={12} className={isRegistered ? "text-indigo-400" : "text-amber-400"} />
                            {isRegistered ? "Registered Member" : "Guest Handle"}
                          </span>
                        )}
                      </div>
                    </>
                  );
                })()}

                {/* Stats Row */}
                <div className="w-full grid grid-cols-2 gap-2 p-2.5 rounded-2xl bg-black/40 border border-white/5 mb-4">
                  {hasBlockedMe ? (
                    <>
                      <div className="flex flex-col items-center py-1.5 rounded-xl opacity-60">
                        <span className="font-extrabold text-white text-base sm:text-lg">--</span>
                        <span className="text-slate-400 text-xs font-medium">Followers</span>
                      </div>
                      <div className="flex flex-col items-center py-1.5 rounded-xl opacity-60">
                        <span className="font-extrabold text-white text-base sm:text-lg">--</span>
                        <span className="text-slate-400 text-xs font-medium">Following</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setConnectionsModalMode("followers")}
                        className="flex flex-col items-center py-1.5 rounded-xl hover:bg-white/5 transition-all cursor-pointer"
                      >
                        <span className="font-extrabold text-white text-base sm:text-lg">{followersCount}</span>
                        <span className="text-slate-400 text-xs font-medium">Followers</span>
                      </button>

                      <button
                        onClick={() => setConnectionsModalMode("following")}
                        className="flex flex-col items-center py-1.5 rounded-xl hover:bg-white/5 transition-all cursor-pointer"
                      >
                        <span className="font-extrabold text-white text-base sm:text-lg">{followingCount}</span>
                        <span className="text-slate-400 text-xs font-medium">Following</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Bio Box */}
                <div className="w-full">
                  {hasBlockedMe ? (
                    <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 text-center w-full">
                      <p className="text-slate-500 text-xs italic">This account is unavailable.</p>
                    </div>
                  ) : isEditing ? (
                    <div className="flex flex-col gap-2.5 text-left">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Shown Name (Display Name)
                        </label>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="e.g. Jay"
                          maxLength={32}
                          className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                          About / Bio
                        </label>
                        <textarea
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          placeholder="Write a short bio..."
                          maxLength={150}
                          className="w-full h-20 p-3 bg-black/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none text-xs"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            setBio(profile.bio || "");
                            setDisplayName(profile.display_name || profile.username || "");
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveProfile}
                          disabled={isSaving}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative group p-3.5 rounded-2xl bg-black/30 border border-white/5 hover:border-white/10 transition-colors text-center w-full">
                      <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-400 mb-1">
                        <Quote size={12} className="text-indigo-400" />
                        <span>About</span>
                      </div>
                      <p className="text-slate-300 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                        {profile.bio || <span className="text-slate-500 italic">No bio written yet.</span>}
                      </p>

                      {isOwner && (
                        <button
                          onClick={() => setIsEditing(true)}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white cursor-pointer"
                          title="Edit Bio"
                        >
                          <Edit3 size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Visitor / Connection Action Buttons */}
                {!isOwner && (
                  <div className="w-full mt-4">
                    {hasBlockedMe ? (
                      <div className="w-full py-2.5 px-4 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-xs font-semibold flex items-center justify-center gap-2">
                        <ShieldAlert size={15} className="text-slate-500" />
                        <span>Account Unavailable</span>
                      </div>
                    ) : isBlockedByMe ? (
                      <button
                        onClick={handleUnblockUser}
                        disabled={isBlockingAction}
                        className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
                      >
                        {isBlockingAction ? <Loader2 size={15} className="animate-spin" /> : <Unlock size={15} />}
                        <span>Unblock</span>
                      </button>
                    ) : hasPendingRequestFromThem ? (
                      /* Incoming Follow Request: Accept or Decline */
                      <div className="flex flex-col gap-2 w-full animate-in fade-in">
                        <div className="text-[11px] font-semibold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 py-1.5 px-3 rounded-xl flex items-center justify-center gap-1.5">
                          <UserPlus size={13} />
                          <span>Sent you a follow request</span>
                        </div>
                        <div className="flex items-center gap-2 w-full">
                          <button
                            onClick={handleAcceptFollowRequest}
                            disabled={isConnecting}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                          >
                            {isConnecting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            <span>Accept Request</span>
                          </button>
                          <button
                            onClick={handleDeclineFollowRequest}
                            disabled={isConnecting}
                            className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 font-semibold text-xs transition-all active:scale-95 cursor-pointer"
                          >
                            <span>Decline</span>
                          </button>
                        </div>
                      </div>
                    ) : hasPendingRequestFromMe ? (
                      /* Outgoing Pending Request: Shows Requested with Cancel option and Locked Message */
                      <div className="flex items-center justify-center gap-2.5 w-full animate-in fade-in">
                        <button
                          onClick={handleCancelFollowRequest}
                          disabled={isConnecting}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-semibold bg-white/10 hover:bg-rose-500/20 text-slate-200 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 transition-all shadow-sm active:scale-95 cursor-pointer"
                          title="Click to cancel follow request"
                        >
                          {isConnecting ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <>
                              <Clock size={14} className="text-amber-400" />
                              <span>Requested (Cancel)</span>
                            </>
                          )}
                        </button>

                        <button
                          disabled={true}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-white/5 border border-white/5 text-slate-500 font-semibold text-xs cursor-not-allowed opacity-60"
                          title="Messaging is locked until the follow request is accepted"
                        >
                          <Lock size={14} />
                          <span>Message (Locked)</span>
                        </button>
                      </div>
                    ) : (
                      /* Normal / Accepted state */
                      <div className="flex items-center justify-center gap-2.5 w-full">
                        <button
                          onClick={isFollowing ? handleUnfollowUser : handleSendFollowRequest}
                          disabled={isConnecting}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all shadow-md active:scale-95 cursor-pointer ${
                            isFollowing
                              ? "bg-white/10 hover:bg-rose-500/20 text-white hover:text-rose-300 border border-white/10 hover:border-rose-500/30"
                              : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25"
                          }`}
                        >
                          {isConnecting ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : isFollowing ? (
                            <>
                              <UserCheck size={15} className="text-emerald-400" />
                              <span>Following</span>
                            </>
                          ) : (
                            <>
                              <UserPlus size={15} />
                              <span>{followsMe ? "Follow Back" : "Follow"}</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={isAcceptedConnection ? handleStartMessage : undefined}
                          disabled={isConnecting || !isAcceptedConnection}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl font-semibold text-xs transition-all shadow-md ${
                            isAcceptedConnection
                              ? "bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 active:scale-95 cursor-pointer"
                              : "bg-white/5 border border-white/5 text-slate-500 cursor-not-allowed opacity-60"
                          }`}
                          title={isAcceptedConnection ? "Send direct message" : "Follow request must be accepted before you can message this user"}
                        >
                          {isConnecting ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : !isAcceptedConnection ? (
                            <>
                              <Lock size={14} />
                              <span>Message</span>
                            </>
                          ) : (
                            <>
                              <MessageSquare size={15} />
                              <span>Message</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* RIGHT MAIN CONTENT AREA: TABBED CONTROLS */}
          <div className="lg:col-span-8 xl:col-span-8 space-y-6">

            {/* TAB NAVIGATION BAR */}
            <div className={`bg-[#12131A]/95 border border-white/10 rounded-2xl p-1.5 grid gap-1.5 shadow-xl backdrop-blur-xl ${
              TABS.length === 3 ? "grid-cols-3" : TABS.length === 2 ? "grid-cols-2" : "grid-cols-1"
            }`}>
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as SettingsTab)}
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

            {/* TAB 1: OVERVIEW */}
            {activeTab === "profile" && (
              <div className="space-y-6">
                {/* Profile Overview Card */}
                <div className="bg-[#12131A]/90 border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl backdrop-blur-xl space-y-5 sm:space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-white/10 gap-2">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shadow-inner shrink-0">
                        <User size={18} className="sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">Account Overview</h2>
                        <p className="text-[11px] sm:text-xs text-slate-400 truncate">Personal details and voice activity status</p>
                      </div>
                    </div>
                    {isOwner && (
                      <span className="text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                        Active Now
                      </span>
                    )}
                  </div>

                  {/* Profile Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-black/40 border border-white/5 space-y-1">
                      <span className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                        <User size={12} className="text-indigo-400" />
                        Shown Name
                      </span>
                      <p className="text-xs sm:text-sm font-bold text-white truncate">
                        {profile.display_name || profile.username}
                      </p>
                    </div>

                    <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-black/40 border border-white/5 space-y-1">
                      <span className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                        <Sparkles size={12} className="text-indigo-400" />
                        Username / Handle
                      </span>
                      <p className="text-xs sm:text-sm font-bold text-indigo-300 font-mono truncate">
                        @{profile.username}
                      </p>
                    </div>

                    <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-black/40 border border-white/5 space-y-1">
                      <span className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                        <ShieldCheck size={12} className="text-indigo-400" />
                        Account Type
                      </span>
                      <p className="text-xs sm:text-sm font-bold text-indigo-300 truncate">
                        {isRegistered ? "Registered Member" : "Anonymous Guest"}
                      </p>
                    </div>

                    <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-black/40 border border-white/5 space-y-1">
                      <span className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                        <Users size={12} className="text-indigo-400" />
                        Total Followers
                      </span>
                      <p className="text-xs sm:text-sm font-bold text-white">{followersCount} Connections</p>
                    </div>

                    <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-black/40 border border-white/5 space-y-1">
                      <span className="text-[11px] sm:text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                        <UserPlus size={12} className="text-indigo-400" />
                        Total Following
                      </span>
                      <p className="text-xs sm:text-sm font-bold text-white">{followingCount} Users</p>
                    </div>
                  </div>

                  {/* Live Seat Theme Preview Badge Box */}
                  <div className="p-5 rounded-2xl bg-black/40 border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Palette size={14} className="text-indigo-400" />
                        Voice Room Seat Card Theme
                      </span>
                      {isOwner && (
                        <button
                          onClick={() => setActiveTab("theme")}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer transition-colors"
                        >
                          Customize →
                        </button>
                      )}
                    </div>

                    <div
                      style={themeStyle}
                      className="p-4 rounded-2xl border flex items-center justify-between text-white shadow-xl transition-all border-white/10 relative overflow-hidden"
                    >
                      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                      <div className="flex items-center gap-3 z-10">
                        <div className="w-10 h-10 rounded-full ring-1.5 ring-white/20 overflow-hidden bg-black/40 shrink-0">
                          {profile.avatar.includes("http") ? (
                            <img src={profile.avatar} alt="avatar" className="w-full h-full object-cover rounded-full" />
                          ) : (
                            <UserAvatar avatar={profile.avatar} color="#6366F1" size="sm" className="!rounded-full !w-full !h-full" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{profile.display_name || profile.username}</div>
                          <div className="text-[10px] text-slate-300/80 font-medium truncate">@{profile.username}</div>
                        </div>
                      </div>

                      <span className="text-[10px] font-mono font-medium px-2.5 py-1 rounded-full bg-black/40 border border-white/10 text-slate-300 z-10 shrink-0">
                        SEAT PREVIEW
                      </span>
                    </div>
                  </div>

                  {/* Account Management Actions (If Owner) */}
                  {isOwner && (
                    <div className="pt-4 border-t border-white/10 space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Account Management</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          onClick={handleLogout}
                          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 hover:text-white font-semibold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shadow-sm"
                        >
                          <LogOut size={16} />
                          <span>Log Out of Account</span>
                        </button>
                        <button
                          onClick={() => setIsDeleteModalOpen(true)}
                          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 font-semibold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shadow-sm"
                        >
                          <Trash2 size={16} />
                          <span>Delete Account</span>
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}

            {/* TAB 2: VOICE CARD THEME CUSTOMIZER */}
            {activeTab === "theme" && isOwner && (
              <CardCustomizer
                username={profile.username}
                avatar={profile.avatar}
                initialColor={profile.card_bg_color || profile.social_links?.card_bg_color || "#465B73"}
                onSave={handleSaveTheme}
              />
            )}

            {/* TAB 3: ACCOUNT SECURITY */}
            {activeTab === "security" && isOwner && isRegistered && (
              <AccountSecurityCard
                userId={profile.id}
                username={profile.username}
                initialRecoveryCode={profile.recovery_code || profile.social_links?.recovery_code}
                onCodeUpdated={(newCode) => {
                  setProfile({ ...profile, recovery_code: newCode });
                }}
              />
            )}

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
        />
      )}

      {/* Block User Confirmation Modal */}
      {isBlockModalOpen && profile && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsBlockModalOpen(false)} />
          <div className="relative w-full max-w-sm bg-[#12131A] border border-white/10 rounded-3xl p-6 shadow-2xl z-10 text-center space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto">
              <Ban size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white mb-1">Block @{profile.username}?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                They won't be able to message you, view your profile, or see your activity in voice rooms. YapClub won't notify them that you blocked them.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleBlockUser}
                disabled={isBlockingAction}
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold transition-all shadow-lg shadow-rose-600/30 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isBlockingAction ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                <span>Block User</span>
              </button>
              <button
                onClick={() => setIsBlockModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isOwner && (
        <DeleteAccountModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleDeleteAccount}
          isDeleting={isDeletingAccount}
          username={profile.username}
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
        isSaving={isUploading}
      />
    </div>
  );
}

