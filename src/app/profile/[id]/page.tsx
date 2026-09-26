"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useUser, HybridUser } from "@/hooks/useUser";
import { Navbar } from "@/components/layout/Navbar";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { LogOut, Edit3, Camera, Check, X, ShieldAlert, Loader2, ArrowLeft } from "lucide-react";
import { ConnectionsModal } from "@/components/profile/ConnectionsModal";

export default function ProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user: currentUser, isRegistered, isLoaded: isAuthLoaded, signOut } = useUser();
  
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [connectionsModalMode, setConnectionsModalMode] = useState<"followers" | "following" | null>(null);
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Determine if the current user is viewing their own profile
  const isOwner = isRegistered && (params.id === "me" || params.id === currentUser?.id);
  const profileIdToFetch = params.id === "me" && currentUser ? currentUser.id : params.id;

  useEffect(() => {
    if (!isAuthLoaded) return;

    // If they try to view /profile/me but aren't logged in, redirect to home
    if (params.id === "me" && (!currentUser || !isRegistered)) {
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

        // Fetch counts (only works if owner due to RLS)
        if (profileIdToFetch === currentUser?.id) {
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
        }
      }
      setIsLoading(false);
    }

    fetchProfile();
  }, [profileIdToFetch, isAuthLoaded, currentUser, isRegistered, router, params.id]);

  const handleLogout = async () => {
    await signOut();
    router.push("/");
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !isOwner || !profile) return;
    
    const file = e.target.files[0];
    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be smaller than 2MB");
      return;
    }

    setIsUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${profile.id}-${Math.random()}.${fileExt}`;
    const filePath = `public/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      
      await supabase
        .from("profiles")
        .update({ avatar: data.publicUrl })
        .eq("id", profile.id);

      setProfile({ ...profile, avatar: data.publicUrl });
      
      // Force refresh to update the navbar avatar
      window.location.reload();
    } catch (err) {
      console.error("Upload failed", err);
      alert("Failed to upload image. Make sure the storage bucket exists.");
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

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 sm:py-10">
        {/* Back Button */}
        <button
          onClick={() => router.push("/junctions")}
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-4 group"
        >
          <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 group-hover:border-white/20 active:scale-95 transition-all">
            <ArrowLeft size={16} />
          </div>
          <span>Back to Voice Rooms</span>
        </button>

        {/* Profile Card */}
        <div className="bg-[#12131A]/80 border border-white/5 rounded-[2rem] p-6 sm:p-10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          {/* Background Glow */}
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative flex flex-col items-center text-center">
            
            {/* Avatar Section */}
            <div className="relative group mb-6">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-[#12131A] shadow-xl bg-indigo-900/50 flex items-center justify-center">
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
                    className="absolute bottom-0 right-0 w-10 h-10 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                  >
                    {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImageUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </>
              )}
            </div>

            {/* Username & Stats */}
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">{profile.username}</h1>
            
            {isOwner && (
              <div className="flex items-center gap-6 text-sm mb-8">
                <button 
                  onClick={() => setConnectionsModalMode("followers")}
                  className="flex flex-col items-center hover:scale-105 transition-transform group"
                >
                  <span className="font-bold text-white text-lg group-hover:text-indigo-400 transition-colors">{followersCount}</span>
                  <span className="text-slate-500 font-medium group-hover:text-slate-300 transition-colors">Followers</span>
                </button>
                <div className="w-px h-8 bg-white/10" />
                <button 
                  onClick={() => setConnectionsModalMode("following")}
                  className="flex flex-col items-center hover:scale-105 transition-transform group"
                >
                  <span className="font-bold text-white text-lg group-hover:text-indigo-400 transition-colors">{followingCount}</span>
                  <span className="text-slate-500 font-medium group-hover:text-slate-300 transition-colors">Following</span>
                </button>
              </div>
            )}

            {/* Bio Section */}
            <div className="w-full max-w-md mx-auto mb-8">
              {isEditing ? (
                <div className="flex flex-col gap-3">
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Write a short bio..."
                    maxLength={150}
                    className="w-full h-24 p-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => { setIsEditing(false); setBio(profile.bio || ""); }}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={saveProfile}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-sm font-medium transition-colors"
                    >
                      {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative group p-4 rounded-xl border border-transparent hover:border-white/5 hover:bg-white/[0.02] transition-colors">
                  <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                    {profile.bio || <span className="text-slate-500 italic">No bio yet.</span>}
                  </p>
                  
                  {isOwner && (
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white"
                    >
                      <Edit3 size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="w-full flex items-center justify-center gap-3">
              {isOwner ? (
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 font-medium text-sm transition-colors"
                >
                  <LogOut size={16} />
                  Log Out
                </button>
              ) : (
                <button
                  className="w-full max-w-[200px] flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors shadow-lg shadow-indigo-600/20"
                >
                  Request to Follow
                </button>
              )}
            </div>

          </div>
        </div>
      </main>

      {isOwner && connectionsModalMode && (
        <ConnectionsModal
          isOpen={true}
          onClose={() => setConnectionsModalMode(null)}
          currentUser={currentUser}
          mode={connectionsModalMode}
        />
      )}
    </div>
  );
}
