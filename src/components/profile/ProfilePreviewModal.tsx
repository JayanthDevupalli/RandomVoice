"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { X, UserPlus, ShieldAlert, Loader2, Check, MessageSquare, UserCheck, Unlock, Clock, LogIn } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { JunctionParticipant } from "@/lib/types";
import { useRouter } from "next/navigation";
import { socialService } from "@/lib/social-service";

interface ProfilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  participant: JunctionParticipant | null;
}

export function ProfilePreviewModal({ isOpen, onClose, participant }: ProfilePreviewModalProps) {
  const router = useRouter();
  const { user: currentUser, isRegistered } = useUser();
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "none" | "pending_from_me" | "pending_from_them" | "accepted" | "blocked_by_me" | "has_blocked_me"
  >("none");
  const [incomingReqId, setIncomingReqId] = useState<string | undefined>(undefined);
  const [isRequesting, setIsRequesting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !participant) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    // 1. Fast check: Only skip if definitely an explicit guest (temporary guest ID or guest nickname)
    const isExplicitGuest =
      (participant as any).isGuest === true ||
      participant.id?.startsWith("guest_") ||
      participant.identity?.toLowerCase().startsWith("guest_") ||
      participant.identity?.toLowerCase().startsWith("guest ") ||
      participant.name?.toLowerCase().startsWith("guest ");

    if (isExplicitGuest) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    async function fetchDetails() {
      setIsLoading(true);

      const isUUID = (str?: string) =>
        Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

      const cleanIdent = (participant?.identity || "").trim();
      const cleanUser = (participant?.username || "").trim();

      try {
        const filters: string[] = [];
        if (isUUID(participant?.id)) {
          filters.push(`id.eq.${participant?.id}`);
        }
        if (isUUID(participant?.identity)) {
          filters.push(`id.eq.${participant?.identity}`);
        }
        if (cleanUser && !cleanUser.includes(" ") && !cleanUser.startsWith("guest_")) {
          filters.push(`username.ilike.${cleanUser}`);
        }
        if (cleanIdent && !cleanIdent.includes(" ") && !cleanIdent.startsWith("guest_") && cleanIdent !== cleanUser) {
          filters.push(`username.ilike.${cleanIdent}`);
        }

        if (filters.length === 0) {
          setProfile(null);
          return;
        }

        const { data: profileData, error } = await supabase
          .from("profiles")
          .select("*")
          .or(filters.join(","))
          .maybeSingle();

        if (error || !profileData) {
          setProfile(null);
          return;
        }

        setProfile(profileData);

        // 2. If we are logged in, check relationship
        if (isRegistered && currentUser && currentUser.id !== profileData.id) {
          try {
            const rel = await socialService.getRelationship(currentUser.id, profileData.id);
            if (rel.hasBlockedMe) {
              setConnectionStatus("has_blocked_me");
            } else if (rel.isBlockedByMe) {
              setConnectionStatus("blocked_by_me");
            } else if (rel.isFollowing) {
              setConnectionStatus("accepted");
            } else if (rel.hasPendingRequestFromMe) {
              setConnectionStatus("pending_from_me");
            } else if (rel.hasPendingRequestFromThem) {
              setConnectionStatus("pending_from_them");
              setIncomingReqId(rel.incomingRequestId);
            } else {
              setConnectionStatus("none");
            }
          } catch (relErr) {
            console.warn("Failed to check relationship:", relErr);
            setConnectionStatus("none");
          }
        }
      } catch (err) {
        console.error("Failed to load profile in preview modal:", err);
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDetails();
  }, [isOpen, participant, currentUser, isRegistered]);

  const handleFollow = async () => {
    if (!isRegistered || !currentUser || !profile) {
      onClose();
      router.push("/login");
      return;
    }
    
    setIsRequesting(true);
    try {
      const res = await socialService.followUser(currentUser.id, profile.id);
      if (res.success) {
        setConnectionStatus("pending_from_me");
      } else if (res.error) {
        alert(res.error);
      }
    } catch (err: any) {
      alert("Failed to send follow request. Try again.");
    } finally {
      setIsRequesting(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!currentUser || !profile) return;
    setIsRequesting(true);
    try {
      const res = await socialService.cancelFollowRequest(currentUser.id, profile.id);
      if (res.success) {
        setConnectionStatus("none");
      } else if (res.error) {
        alert(res.error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleAcceptRequest = async () => {
    if (!currentUser || !profile) return;
    setIsRequesting(true);
    try {
      const res = await socialService.acceptFollowRequest(currentUser.id, profile.id, incomingReqId);
      if (res.success) {
        setConnectionStatus("accepted");
      } else if (res.error) {
        alert(res.error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleDeclineRequest = async () => {
    if (!currentUser || !profile) return;
    setIsRequesting(true);
    try {
      const res = await socialService.declineFollowRequest(currentUser.id, profile.id, incomingReqId);
      if (res.success) {
        setConnectionStatus("none");
      } else if (res.error) {
        alert(res.error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleUnblock = async () => {
    if (!currentUser || !profile) return;
    setIsRequesting(true);
    try {
      const res = await socialService.unblockUser(currentUser.id, profile.id);
      if (res.success) {
        setConnectionStatus("none");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleViewFullProfile = () => {
    onClose();
    if (profile) {
      router.push(`/profile/${profile.id}`);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && participant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-sm bg-[#12131A] border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden p-6 text-center"
          >
            {/* Header / Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>

            {profile ? (
              // Registered User View
              (() => {
                const isMain = profile.username?.trim().toLowerCase() === "jayanthadmin" || profile.username?.trim().toLowerCase() === "jayanth" || profile.role === "super_admin";
                const modalRole = isMain ? "super_admin" : (profile.role === "admin" ? "admin" : profile.role === "manager" ? "manager" : participant.userRole || "user");

                return (
                  <div className="flex flex-col items-center">
                    <div className="w-24 h-24 rounded-3xl overflow-hidden border-4 border-[#12131A] shadow-xl bg-indigo-900/50 mb-4 cursor-pointer hover:scale-105 transition-transform relative" onClick={handleViewFullProfile}>
                      {profile.avatar.includes("http") ? (
                        <img src={profile.avatar} alt={profile.username} className="w-full h-full object-cover rounded-3xl" />
                      ) : (
                        <UserAvatar avatar={profile.avatar} color="#6366F1" size="lg" iconSize={42} className="!rounded-3xl !w-full !h-full" badgeRole={modalRole !== "user" ? modalRole : undefined} />
                      )}
                    </div>
                    
                    <div className="flex items-center justify-center gap-1.5 mb-0.5 flex-wrap">
                      <h3 className="text-xl font-bold text-white">
                        {profile.display_name || profile.social_links?.display_name || profile.username}
                      </h3>
                      {modalRole !== "user" && (
                        <RoleBadge role={modalRole} size="xs" />
                      )}
                    </div>

                    <p className="text-xs font-semibold text-indigo-300/80 mb-2">
                      @{profile.username}
                    </p>
                    
                    <p className="text-sm text-slate-400 line-clamp-2 mb-6 px-4">
                      {profile.bio || "No bio yet."}
                    </p>

                {/* Interaction Button */}
                {currentUser?.id !== profile.id && (
                  <div className="w-full">
                    {!isRegistered || !currentUser ? (
                      <div className="w-full flex flex-col gap-2.5">
                        <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 text-center leading-relaxed">
                          Want to connect with <span className="font-semibold text-white">{profile.display_name || profile.username}</span>? Log in to send follow requests and message!
                        </div>
                        <button
                          onClick={() => {
                            onClose();
                            router.push("/login");
                          }}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/25 active:scale-95 cursor-pointer"
                        >
                          <LogIn size={16} />
                          Log in to Connect
                        </button>
                      </div>
                    ) : connectionStatus === "has_blocked_me" ? (
                      <div className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 text-slate-400 font-medium text-sm border border-white/10 cursor-not-allowed">
                        <ShieldAlert size={16} />
                        Account Unavailable
                      </div>
                    ) : connectionStatus === "blocked_by_me" ? (
                      <button 
                        onClick={handleUnblock}
                        disabled={isRequesting}
                        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-sm transition-colors shadow-lg shadow-rose-600/20 active:scale-95 cursor-pointer"
                      >
                        {isRequesting ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
                        Unblock User
                      </button>
                    ) : connectionStatus === "accepted" ? (
                      <button className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 font-medium text-sm border border-emerald-500/30 cursor-default">
                        <UserCheck size={16} />
                        Following
                      </button>
                    ) : connectionStatus === "pending_from_them" ? (
                      <div className="flex items-center gap-2 w-full">
                        <button
                          onClick={handleAcceptRequest}
                          disabled={isRequesting}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors shadow-lg shadow-emerald-600/20 active:scale-95 cursor-pointer"
                        >
                          {isRequesting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          Accept
                        </button>
                        <button
                          onClick={handleDeclineRequest}
                          disabled={isRequesting}
                          className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 font-medium text-sm transition-colors active:scale-95 cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    ) : connectionStatus === "pending_from_me" ? (
                      <button
                        onClick={handleCancelRequest}
                        disabled={isRequesting}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-200 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 font-medium text-sm transition-colors active:scale-95 cursor-pointer"
                        title="Click to cancel follow request"
                      >
                        {isRequesting ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} className="text-amber-400" />}
                        Requested (Cancel)
                      </button>
                    ) : (
                      <button 
                        onClick={handleFollow}
                        disabled={isRequesting}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors shadow-lg shadow-indigo-600/20 active:scale-95 cursor-pointer"
                      >
                        {isRequesting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                        Follow
                      </button>
                    )}
                  </div>
                )}
                
                <button 
                  onClick={handleViewFullProfile}
                  className="mt-4 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                >
                  View Full Profile
                </button>
              </div>
            );
          })()
        ) : (
          // Guest User View
          <div className="flex flex-col items-center py-4">
            <div
              className="w-24 h-24 rounded-3xl overflow-hidden border-4 border-[#12131A] shadow-xl mb-4 relative flex items-center justify-center"
              style={{
                backgroundColor: participant.color ? `${participant.color}25` : "rgba(30, 41, 59, 0.8)",
                borderColor: participant.color ? `${participant.color}40` : "rgba(255, 255, 255, 0.1)",
              }}
            >
              <UserAvatar
                avatar={participant.avatar || "zap"}
                color={participant.color || "#6366F1"}
                size="xl"
                iconSize={44}
                className="!rounded-3xl !w-full !h-full"
                badgeRole={participant.userRole && participant.userRole !== "user" ? participant.userRole : undefined}
              />
            </div>
            
            <div className="flex items-center justify-center gap-1.5 mb-1.5 flex-wrap">
              <h3 className="text-xl font-bold text-white">{participant.name || "Guest User"}</h3>
              {participant.userRole && participant.userRole !== "user" && (
                <RoleBadge role={participant.userRole} size="xs" />
              )}
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-slate-300 tracking-wide mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Guest Account</span>
            </div>
            
            <p className="text-sm text-slate-400 max-w-[220px] mb-5 leading-relaxed">
              This user is participating in this room as a guest.
            </p>

            {!isRegistered ? (
              <div className="w-full p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 leading-relaxed text-center">
                ✨ Sign up for a YapClub account to build your permanent profile and connect with others!
              </div>
            ) : (
              <div className="w-full p-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-400 text-center">
                Guest accounts cannot be followed or messaged directly.
              </div>
            )}
          </div>
        )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
