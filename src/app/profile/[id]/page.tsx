"use client";

import { useEffect, useState, useRef } from "react";
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
} from "lucide-react";
import { ConnectionsModal } from "@/components/profile/ConnectionsModal";
import { DeleteAccountModal } from "@/components/profile/DeleteAccountModal";
import { useGuestUser } from "@/hooks/useGuestUser";
import { ImageCropModal } from "@/components/profile/ImageCropModal";
import { AccountSecurityCard } from "@/components/profile/AccountSecurityCard";
import { CardCustomizer } from "@/components/profile/CardCustomizer";

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
  const [connectionStatus, setConnectionStatus] = useState<"none" | "pending_sent" | "pending_received" | "accepted">("none");
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // File upload & crop state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);

  // Determine if the current user is viewing their own profile
  const isOwner = targetId === "me" || (currentUser && targetId === currentUser.id);
  const profileIdToFetch = targetId === "me" && currentUser ? currentUser.id : targetId;

  useEffect(() => {
    if (!isAuthLoaded) return;

    if (targetId === "me" && !currentUser) {
      router.push("/");
      return;
    }

    if (targetId === "me" && !isRegistered && guest) {
      setProfile({
        id: guest.id,
        username: guest.name,
        avatar: guest.avatar,
        bio: "Guest Profile (Anonymous Voice Handle)",
        card_bg_color: guest.cardBgColor || "#465B73",
        card_pattern: guest.cardPattern || "none",
      });
      setIsLoading(false);
      return;
    }

    async function fetchProfile() {
      if (!profileIdToFetch) return;
      setIsLoading(true);

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", profileIdToFetch)
        .single();

      if (data) {
        const cardBg = (data.card_bg_color && data.card_bg_color !== "#465B73")
          ? data.card_bg_color
          : (data.social_links?.card_bg_color || data.card_bg_color || "#465B73");
        const cardPattern = (data.card_pattern && data.card_pattern !== "none")
          ? data.card_pattern
          : (data.social_links?.card_pattern || data.card_pattern || "none");

        setProfile({
          ...data,
          card_bg_color: cardBg,
          card_pattern: cardPattern,
        });
        setBio(data.bio || "");

        const { count: followers } = await supabase
          .from("connections")
          .select("*", { count: "exact", head: true })
          .eq("receiver_id", profileIdToFetch)
          .eq("status", "accepted");

        const { count: following } = await supabase
          .from("connections")
          .select("*", { count: "exact", head: true })
          .eq("requester_id", profileIdToFetch)
          .eq("status", "accepted");

        if (followers !== null) setFollowersCount(followers);
        if (following !== null) setFollowingCount(following);

        if (currentUser && currentUser.id !== profileIdToFetch) {
          const { data: conn } = await supabase
            .from("connections")
            .select("*")
            .or(
              `and(requester_id.eq.${currentUser.id},receiver_id.eq.${profileIdToFetch}),and(requester_id.eq.${profileIdToFetch},receiver_id.eq.${currentUser.id})`
            )
            .maybeSingle();

          if (conn) {
            setConnectionId(conn.id);
            if (conn.status === "accepted") {
              setConnectionStatus("accepted");
            } else if (conn.requester_id === currentUser.id) {
              setConnectionStatus("pending_sent");
            } else {
              setConnectionStatus("pending_received");
            }
          } else {
            setConnectionStatus("none");
            setConnectionId(null);
          }
        }
      }
      setIsLoading(false);
    }

    fetchProfile();

    const channelId = `profile_live_${profileIdToFetch}_${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "connections",
        },
        () => {
          fetchProfile();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileIdToFetch, isAuthLoaded, currentUser, isRegistered, router, targetId, guest]);

  const handleSendFollowRequest = async () => {
    if (!currentUser || !profile) return;
    setIsConnecting(true);
    try {
      const { data } = await supabase
        .from("connections")
        .insert({
          requester_id: currentUser.id,
          receiver_id: profile.id,
          status: "pending",
        })
        .select()
        .single();

      if (data) {
        setConnectionStatus("pending_sent");
        setConnectionId(data.id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCancelOrUnfollowRequest = async () => {
    if (!connectionId) return;
    setIsConnecting(true);
    try {
      await supabase.from("connections").delete().eq("id", connectionId);
      setConnectionStatus("none");
      setConnectionId(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleAcceptFollowRequest = async () => {
    if (!connectionId || !currentUser || !profile) return;
    setIsConnecting(true);
    try {
      await supabase
        .from("connections")
        .update({ status: "accepted" })
        .eq("id", connectionId);

      setConnectionStatus("accepted");
      setFollowersCount((prev) => prev + 1);

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
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleStartMessage = async () => {
    if (!currentUser || !profile) return;
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
    await signOut();
    router.push("/");
  };

  const handleDeleteAccount = async () => {
    if (!currentUser || !profile) return;
    setIsDeletingAccount(true);

    try {
      await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          username: profile.username,
        }),
      });

      await supabase.from("profiles").delete().eq("id", currentUser.id);

      try {
        localStorage.removeItem(`yapclub_last_read_${currentUser.id}`);
        localStorage.removeItem(`yapclub_nicknames_${currentUser.id}`);
      } catch (e) {}

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

    const { error } = await supabase
      .from("profiles")
      .update({ bio })
      .eq("id", profile.id);

    if (!error) {
      setProfile({ ...profile, bio });
      setIsEditing(false);
    }
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

  const handleSaveTheme = async (cardBgColor: string, cardPattern: string) => {
    if (!isOwner) return;

    if (isRegistered && profile) {
      const updatedSocialLinks = {
        ...(profile.social_links || {}),
        card_bg_color: cardBgColor,
        card_pattern: cardPattern,
      };

      const { error } = await supabase
        .from("profiles")
        .update({
          social_links: updatedSocialLinks,
        })
        .eq("id", profile.id);

      // Best effort update to standalone columns if present in schema
      try {
        await supabase
          .from("profiles")
          .update({
            card_bg_color: cardBgColor,
            card_pattern: cardPattern,
          })
          .eq("id", profile.id);
      } catch (e) {}

      if (!error) {
        setProfile({
          ...profile,
          card_bg_color: cardBgColor,
          card_pattern: cardPattern,
          social_links: updatedSocialLinks,
        });
      }
    } else if (guest) {
      updateGuest({
        cardBgColor,
        cardPattern,
      });
      setProfile((prev: any) => ({
        ...prev,
        card_bg_color: cardBgColor,
        card_pattern: cardPattern,
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
    { id: "profile", label: "Overview", icon: User },
    { id: "theme", label: "Card Theme", icon: Palette },
    ...(isOwner && isRegistered ? [{ id: "security", label: "Security", icon: Shield }] : []),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col text-slate-200">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-6">
        
        {/* Streamlined Top Navigation Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <button
            onClick={() => router.push("/junctions")}
            className="inline-flex items-center gap-2 text-xs sm:text-sm text-slate-400 hover:text-white transition-colors cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 group-hover:border-white/20 active:scale-95 transition-all shrink-0">
              <ArrowLeft size={16} />
            </div>
            <span className="font-medium truncate">Back to Voice Rooms</span>
          </button>

          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 shrink-0">
            {isOwner ? "My Account" : "User Profile"}
          </span>
        </div>

        {/* SINGLE UNIFIED HERO PROFILE CARD */}
        <div className="bg-[#12131A]/95 border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl backdrop-blur-xl overflow-hidden relative">
          {/* Ambient Header Banner */}
          <div
            className="h-28 sm:h-36 w-full relative transition-colors duration-500 border-b border-white/5"
            style={{ backgroundColor: profile.card_bg_color || profile.social_links?.card_bg_color || "#465B73" }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-[#12131A]" />
          </div>

          <div className="px-5 sm:px-8 pb-6 relative flex flex-col items-center text-center -mt-14 sm:-mt-16">
            
            {/* Avatar Section */}
            <div className="relative group mb-3">
              <div className="w-24 h-24 sm:w-30 sm:h-30 rounded-full overflow-hidden border-4 border-[#12131A] shadow-2xl bg-indigo-900/50 flex items-center justify-center relative">
                {profile.avatar.includes("http") ? (
                  <img src={profile.avatar} alt={profile.username} className="w-full h-full object-cover" />
                ) : (
                  <UserAvatar avatar={profile.avatar} color="#6366F1" size="lg" className="!rounded-full !w-full !h-full" />
                )}
              </div>

              {isOwner && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="absolute bottom-0 right-0 w-8 h-8 sm:w-9 sm:h-9 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 disabled:opacity-50 cursor-pointer border-2 border-[#12131A]"
                    title="Change Profile Avatar"
                  >
                    {isUploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
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

            {/* Username & Badge */}
            <h1 className="text-xl sm:text-2xl font-extrabold text-white mb-1 tracking-tight">{profile.username}</h1>
            <span className="text-[11px] font-medium text-slate-400 bg-white/5 border border-white/10 px-3 py-0.5 rounded-full mb-4">
              {isRegistered ? "Registered Member" : "Guest Voice Handle"}
            </span>

            {/* Followers / Following Stats */}
            <div className="w-full max-w-xs sm:max-w-sm grid grid-cols-2 gap-2 p-2.5 rounded-2xl bg-black/40 border border-white/5 mb-4">
              <button
                onClick={() => isOwner && setConnectionsModalMode("followers")}
                className={`flex flex-col items-center py-1 rounded-xl transition-all ${isOwner ? "hover:bg-white/5 cursor-pointer" : "cursor-default"}`}
              >
                <span className="font-extrabold text-white text-base sm:text-lg">{followersCount}</span>
                <span className="text-slate-400 text-xs font-medium">Followers</span>
              </button>

              <button
                onClick={() => isOwner && setConnectionsModalMode("following")}
                className={`flex flex-col items-center py-1 rounded-xl transition-all ${isOwner ? "hover:bg-white/5 cursor-pointer" : "cursor-default"}`}
              >
                <span className="font-extrabold text-white text-base sm:text-lg">{followingCount}</span>
                <span className="text-slate-400 text-xs font-medium">Following</span>
              </button>
            </div>

            {/* Bio Section */}
            <div className="w-full max-w-md">
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Write a short bio..."
                    maxLength={150}
                    className="w-full h-20 p-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none text-xs sm:text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setBio(profile.bio || "");
                      }}
                      className="px-3 py-1 rounded-lg text-xs font-medium text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveProfile}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Save Bio
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative group p-3 rounded-xl bg-black/30 border border-white/5 hover:border-white/10 transition-colors text-center">
                  <p className="text-slate-300 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                    {profile.bio || <span className="text-slate-500 italic">No bio written yet.</span>}
                  </p>

                  {isOwner && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="absolute top-2 right-2 p-1 rounded-lg bg-white/5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white cursor-pointer"
                      title="Edit Bio"
                    >
                      <Edit3 size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Visitor Actions (Message / Follow) */}
            {!isOwner && (
              <div className="w-full max-w-md mt-4">
                <div className="flex items-center justify-center gap-2.5 w-full">
                  {connectionStatus === "accepted" ? (
                    <>
                      <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-emerald-500/20 text-emerald-400 font-semibold text-xs sm:text-sm border border-emerald-500/30">
                        <Check size={16} />
                        <span>Following</span>
                      </div>
                      <button
                        onClick={handleStartMessage}
                        disabled={isConnecting}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm transition-all shadow-lg shadow-indigo-600/20 active:scale-95 cursor-pointer"
                      >
                        {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
                        <span>Message</span>
                      </button>
                      <button
                        onClick={handleCancelOrUnfollowRequest}
                        disabled={isConnecting}
                        className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-white/5 transition-colors text-xs font-medium cursor-pointer"
                        title="Unfollow"
                      >
                        Unfollow
                      </button>
                    </>
                  ) : connectionStatus === "pending_sent" ? (
                    <button
                      onClick={handleCancelOrUnfollowRequest}
                      disabled={isConnecting}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-6 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-white/10 text-xs sm:text-sm font-semibold transition-all active:scale-95 cursor-pointer"
                    >
                      {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />}
                      <span>Requested (Click to Cancel)</span>
                    </button>
                  ) : connectionStatus === "pending_received" ? (
                    <div className="flex items-center gap-2.5 w-full">
                      <button
                        onClick={handleAcceptFollowRequest}
                        disabled={isConnecting}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm transition-all shadow-lg active:scale-95 cursor-pointer"
                      >
                        {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        <span>Accept Request</span>
                      </button>
                      <button
                        onClick={handleCancelOrUnfollowRequest}
                        disabled={isConnecting}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-semibold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer"
                      >
                        <span>Decline</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleSendFollowRequest}
                      disabled={isConnecting}
                      className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm transition-all shadow-lg shadow-indigo-600/20 active:scale-95 cursor-pointer"
                    >
                      {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                      <span>Request to Follow</span>
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* NATIVE SEGMENTED TAB SWITCHER (For Owner Options) */}
        {isOwner && (
          <div className="w-full p-1 bg-black/50 border border-white/10 rounded-2xl flex items-center gap-1 shadow-inner overflow-hidden">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as SettingsTab)}
                  className={`flex-1 min-h-[44px] h-11 flex items-center justify-center gap-1.5 px-2 sm:px-3 rounded-xl font-semibold text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 border border-indigo-500/40"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon size={16} className={`shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                  <span className="truncate leading-none whitespace-nowrap">{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* TAB 1: OVERVIEW & ACCOUNT CONTROLS */}
        {activeTab === "profile" && isOwner && (
          <div className="bg-[#12131A]/90 border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Account Management</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleLogout}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 hover:text-white font-semibold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer"
              >
                <LogOut size={16} />
                <span>Log Out of Account</span>
              </button>
              <button
                onClick={() => setIsDeleteModalOpen(true)}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 font-semibold text-xs sm:text-sm transition-all active:scale-95 shadow-sm cursor-pointer"
              >
                <Trash2 size={16} />
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: VOICE CARD THEME CUSTOMIZER */}
        {activeTab === "theme" && isOwner && (
          <CardCustomizer
            username={profile.username}
            avatar={profile.avatar}
            initialColor={profile.card_bg_color || profile.social_links?.card_bg_color || "#465B73"}
            initialPattern={profile.card_pattern || profile.social_links?.card_pattern || "none"}
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

      </main>

      {isOwner && connectionsModalMode && (
        <ConnectionsModal
          isOpen={true}
          onClose={() => setConnectionsModalMode(null)}
          currentUser={currentUser}
          mode={connectionsModalMode}
          onModeChange={(m) => setConnectionsModalMode(m)}
        />
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
