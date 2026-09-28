"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useUser, HybridUser } from "@/hooks/useUser";
import { Navbar } from "@/components/layout/Navbar";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { LogOut, Edit3, Camera, Check, X, ShieldAlert, Loader2, ArrowLeft, Trash2, UserPlus, MessageSquare, Clock, UserCheck } from "lucide-react";
import { ConnectionsModal } from "@/components/profile/ConnectionsModal";
import { DeleteAccountModal } from "@/components/profile/DeleteAccountModal";
import { useGuestUser } from "@/hooks/useGuestUser";
import { ImageCropModal } from "@/components/profile/ImageCropModal";
import { AccountSecurityCard } from "@/components/profile/AccountSecurityCard";

export default function ProfilePage({ params: propParams }: { params?: { id: string } }) {
  const router = useRouter();
  const routeParams = useParams();
  const targetId = (routeParams?.id as string) || propParams?.id || "me";

  const { user: currentUser, isRegistered, isLoaded: isAuthLoaded, signOut } = useUser();
  const { clearProfile } = useGuestUser();
  
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
  const isOwner = isRegistered && (targetId === "me" || targetId === currentUser?.id);
  const profileIdToFetch = targetId === "me" && currentUser ? currentUser.id : targetId;

  useEffect(() => {
    if (!isAuthLoaded) return;

    if (targetId === "me" && (!currentUser || !isRegistered)) {
      router.push("/");
      return;
    }

    async function fetchProfile() {
      if (!profileIdToFetch) return;
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", profileIdToFetch)
        .single();

      if (data) {
        setProfile(data);
        setBio(data.bio || "");

        // Fetch counts for followers and following
        const { count: followers } = await supabase
          .from("connections")
          .select("*", { count: 'exact', head: true })
          .eq("receiver_id", profileIdToFetch)
          .eq("status", "accepted");
          
        const { count: following } = await supabase
          .from("connections")
          .select("*", { count: 'exact', head: true })
          .eq("requester_id", profileIdToFetch)
          .eq("status", "accepted");
          
        if (followers !== null) setFollowersCount(followers);
        if (following !== null) setFollowingCount(following);

        // Fetch connection status if not viewing own profile
        if (currentUser && currentUser.id !== profileIdToFetch) {
          const { data: conn } = await supabase
            .from("connections")
            .select("*")
            .or(`and(requester_id.eq.${currentUser.id},receiver_id.eq.${profileIdToFetch}),and(requester_id.eq.${profileIdToFetch},receiver_id.eq.${currentUser.id})`)
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
  }, [profileIdToFetch, isAuthLoaded, currentUser, isRegistered, router, targetId]);

  const handleSendFollowRequest = async () => {
    if (!currentUser || !profile) return;
    setIsConnecting(true);
    try {
      const { data, error } = await supabase
        .from("connections")
        .insert({
          requester_id: currentUser.id,
          receiver_id: profile.id,
          status: "pending"
        })
        .select()
        .single();

      if (!error && data) {
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
      setFollowersCount(prev => prev + 1);

      // Create direct conversation if missing
      const { data: myConvs } = await supabase
        .from('conversation_members')
        .select('conversation_id, conversations!inner(type)')
        .eq('user_id', currentUser.id)
        .eq('conversations.type', 'direct');

      let existingConvId = null;
      if (myConvs && myConvs.length > 0) {
        const convIds = myConvs.map((c: any) => c.conversation_id);
        const { data: shared } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', profile.id)
          .in('conversation_id', convIds);
          
        if (shared && shared.length > 0) {
          existingConvId = shared[0].conversation_id;
        }
      }

      if (!existingConvId) {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({ type: 'direct' })
          .select('id')
          .single();
          
        if (newConv) {
          await supabase.from('conversation_members').insert([
            { conversation_id: newConv.id, user_id: currentUser.id },
            { conversation_id: newConv.id, user_id: profile.id }
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
        .from('conversation_members')
        .select('conversation_id, conversations!inner(type)')
        .eq('user_id', currentUser.id)
        .eq('conversations.type', 'direct');

      let existingConvId = null;

      if (myConvs && myConvs.length > 0) {
        const convIds = myConvs.map((c: any) => c.conversation_id);
        const { data: shared } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', profile.id)
          .in('conversation_id', convIds);
          
        if (shared && shared.length > 0) {
          existingConvId = shared[0].conversation_id;
        }
      }

      if (!existingConvId) {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({ type: 'direct' })
          .select('id')
          .single();
          
        if (newConv) {
          await supabase.from('conversation_members').insert([
            { conversation_id: newConv.id, user_id: currentUser.id },
            { conversation_id: newConv.id, user_id: profile.id }
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

  return (
    <div className="min-h-screen bg-background flex flex-col text-slate-200">
      <Navbar />

      <main className="flex-1 max-w-xl sm:max-w-2xl w-full mx-auto px-3.5 sm:px-6 py-4 sm:py-8 space-y-3.5 sm:space-y-5">
        {/* Back Button */}
        <button
          onClick={() => router.push("/junctions")}
          className="inline-flex items-center gap-2 text-xs sm:text-sm text-slate-400 hover:text-white transition-colors group mb-0.5"
        >
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 group-hover:border-white/20 active:scale-95 transition-all">
            <ArrowLeft size={14} />
          </div>
          <span>Back to Voice Rooms</span>
        </button>

        {/* Profile Card */}
        <div className="bg-[#12131A]/90 border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-56 h-56 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative flex flex-col items-center text-center">
            
            {/* Avatar Section */}
            <div className="relative group mb-3.5 sm:mb-5">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-4 border-[#12131A] shadow-xl bg-indigo-900/50 flex items-center justify-center">
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
                    className="absolute bottom-0 right-0 w-8 h-8 sm:w-9 sm:h-9 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 disabled:opacity-50"
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

            {/* Username & Stats */}
            <h1 className="text-xl sm:text-2xl font-bold text-white mb-1.5">{profile.username}</h1>
            
            <div className="flex items-center gap-6 text-sm mb-4 sm:mb-5">
              <button 
                onClick={() => isOwner && setConnectionsModalMode("followers")}
                className={`flex flex-col items-center transition-transform ${isOwner ? 'hover:scale-105 group cursor-pointer' : 'cursor-default'}`}
              >
                <span className="font-bold text-white text-base sm:text-lg group-hover:text-indigo-400 transition-colors">{followersCount}</span>
                <span className="text-slate-400 text-xs font-medium group-hover:text-slate-300 transition-colors">Followers</span>
              </button>
              <div className="w-px h-7 bg-white/10" />
              <button 
                onClick={() => isOwner && setConnectionsModalMode("following")}
                className={`flex flex-col items-center transition-transform ${isOwner ? 'hover:scale-105 group cursor-pointer' : 'cursor-default'}`}
              >
                <span className="font-bold text-white text-base sm:text-lg group-hover:text-indigo-400 transition-colors">{followingCount}</span>
                <span className="text-slate-400 text-xs font-medium group-hover:text-slate-300 transition-colors">Following</span>
              </button>
            </div>

            {/* Bio Section */}
            <div className="w-full max-w-md mx-auto mb-4 sm:mb-6">
              {isEditing ? (
                <div className="flex flex-col gap-2.5">
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Write a short bio..."
                    maxLength={150}
                    className="w-full h-24 p-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none text-xs sm:text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => { setIsEditing(false); setBio(profile.bio || ""); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={saveProfile}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-xs font-medium transition-colors"
                    >
                      {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative group p-3 rounded-xl border border-transparent hover:border-white/5 hover:bg-white/[0.02] transition-colors">
                  <p className="text-slate-300 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                    {profile.bio || <span className="text-slate-500 italic">No bio yet.</span>}
                  </p>
                  
                  {isOwner && (
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-white/5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white"
                    >
                      <Edit3 size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="w-full">
              {isOwner ? (
                <div className="grid grid-cols-2 gap-2.5 w-full sm:max-w-xs sm:mx-auto">
                  <button
                    onClick={handleLogout}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 hover:text-white font-medium text-xs sm:text-sm transition-all active:scale-95"
                  >
                    <LogOut size={15} />
                    <span>Log Out</span>
                  </button>
                  <button
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 font-medium text-xs sm:text-sm transition-all active:scale-95 shadow-sm"
                  >
                    <Trash2 size={15} />
                    <span>Delete</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 max-w-sm mx-auto w-full">
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
                        className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-white/5 transition-colors text-xs font-medium"
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
                    <div className="flex items-center gap-2 w-full">
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
              )}
            </div>

          </div>
        </div>

        {/* Account Recovery Code Section (Owner Only - Dedicated Card) */}
        {isOwner && (
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

