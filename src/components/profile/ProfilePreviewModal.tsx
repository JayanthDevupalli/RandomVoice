"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import {
  X,
  UserPlus,
  ShieldAlert,
  Loader2,
  Check,
  MessageSquare,
  UserCheck,
  Unlock,
  Clock,
  LogIn,
  Lock,
} from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { JunctionParticipant } from "@/lib/types";
import { useRouter } from "next/navigation";
import { socialService, RelationshipStatus } from "@/lib/social-service";

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
  const [relationship, setRelationship] = useState<RelationshipStatus | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchRelationship = useCallback(async (targetId: string) => {
    if (!isRegistered || !currentUser?.id || currentUser.id === targetId) {
      setRelationship(null);
      return;
    }
    try {
      const rel = await socialService.getRelationship(currentUser.id, targetId);
      setRelationship(rel);
    } catch (relErr) {
      console.warn("Failed to check relationship in preview modal:", relErr);
      setRelationship(null);
    }
  }, [currentUser?.id, isRegistered]);

  useEffect(() => {
    if (!isOpen || !participant) {
      setProfile(null);
      setRelationship(null);
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
      setRelationship(null);
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
          await fetchRelationship(profileData.id);
        }
      } catch (err) {
        console.error("Failed to load profile in preview modal:", err);
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDetails();
  }, [isOpen, participant, currentUser, isRegistered, fetchRelationship]);

  // Real-time synchronization when social actions occur elsewhere
  useEffect(() => {
    if (!isOpen || !profile?.id) return;
    const handleSocialEvent = () => {
      fetchRelationship(profile.id);
    };
    window.addEventListener("yapclub_social_updated", handleSocialEvent);
    return () => {
      window.removeEventListener("yapclub_social_updated", handleSocialEvent);
    };
  }, [isOpen, profile?.id, fetchRelationship]);

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
        await fetchRelationship(profile.id);
      } else if (res.error) {
        alert(res.error);
      }
    } catch (err: any) {
      alert("Failed to send follow request. Try again.");
    } finally {
      setIsRequesting(false);
    }
  };

  const handleUnfollow = async () => {
    if (!currentUser || !profile) return;
    const confirmed = window.confirm(`Unfollow @${profile.username}?`);
    if (!confirmed) return;

    setIsRequesting(true);
    try {
      const res = await socialService.unfollowUser(currentUser.id, profile.id);
      if (res.success) {
        await fetchRelationship(profile.id);
      } else if (res.error) {
        alert(res.error);
      }
    } catch (e) {
      console.error(e);
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
        await fetchRelationship(profile.id);
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
      const res = await socialService.acceptFollowRequest(
        currentUser.id,
        profile.id,
        relationship?.incomingRequestId
      );
      if (res.success) {
        await fetchRelationship(profile.id);
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
      const res = await socialService.declineFollowRequest(
        currentUser.id,
        profile.id,
        relationship?.incomingRequestId
      );
      if (res.success) {
        await fetchRelationship(profile.id);
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
        await fetchRelationship(profile.id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleStartMessage = async () => {
    if (!currentUser || !profile) return;
    if (relationship?.hasBlockedMe) {
      alert("This account is unavailable.");
      return;
    }
    if (relationship?.isBlockedByMe) {
      alert("You must unblock this user to message them.");
      return;
    }
    if (!relationship?.isAcceptedConnection) {
      alert("Follow request must be accepted before you can message this user.");
      return;
    }

    setIsRequesting(true);
    try {
      const convId = await socialService.ensureDirectConversation(currentUser.id, profile.id);
      onClose();

      // Dispatch in-room messenger trigger
      window.dispatchEvent(
        new CustomEvent("yapclub_open_inroom_dm", {
          detail: { conversationId: convId, partnerId: profile.id },
        })
      );

      // If not in a junction room, navigate to messages page directly
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/junction")) {
        router.push(convId ? `/messages?id=${convId}` : "/messages");
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

                    <p className="text-xs font-semibold text-indigo-300/80 mb-1">
                      @{profile.username}
                    </p>

                    {relationship?.isFollowing && relationship?.followsMe ? (
                      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300 mb-2">
                        <Check size={11} className="text-emerald-400" />
                        <span>Mutual Connection</span>
                      </div>
                    ) : relationship?.followsMe ? (
                      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-[10px] font-semibold text-indigo-300 mb-2">
                        <span>Follows you</span>
                      </div>
                    ) : null}
                    
                    <p className="text-sm text-slate-400 line-clamp-2 mb-5 px-4">
                      {profile.bio || "No bio yet."}
                    </p>

                {/* Interaction Buttons */}
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
                    ) : relationship?.hasBlockedMe ? (
                      <div className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 text-slate-400 font-medium text-sm border border-white/10 cursor-not-allowed">
                        <ShieldAlert size={16} />
                        Account Unavailable
                      </div>
                    ) : relationship?.isBlockedByMe ? (
                      <button 
                        onClick={handleUnblock}
                        disabled={isRequesting}
                        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-sm transition-colors shadow-lg shadow-rose-600/20 active:scale-95 cursor-pointer"
                      >
                        {isRequesting ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
                        Unblock User
                      </button>
                    ) : relationship?.hasPendingRequestFromThem ? (
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
                    ) : relationship?.hasPendingRequestFromMe ? (
                      <div className="flex items-center gap-2 w-full">
                        <button
                          onClick={handleCancelRequest}
                          disabled={isRequesting}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-200 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 font-medium text-xs sm:text-sm transition-colors active:scale-95 cursor-pointer"
                          title="Click to cancel follow request"
                        >
                          {isRequesting ? <Loader2 size={15} className="animate-spin" /> : <Clock size={15} className="text-amber-400" />}
                          Requested (Cancel)
                        </button>
                        <button
                          disabled
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 border border-white/5 text-slate-500 font-medium text-xs sm:text-sm cursor-not-allowed opacity-60"
                          title="Messaging is locked until the follow request is accepted"
                        >
                          <Lock size={14} />
                          Message
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 w-full">
                        {relationship?.isFollowing ? (
                          <button
                            onClick={handleUnfollow}
                            disabled={isRequesting}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/10 hover:bg-rose-500/20 text-white hover:text-rose-300 border border-white/10 hover:border-rose-500/30 text-xs sm:text-sm font-semibold transition-all shadow-md active:scale-95 cursor-pointer"
                            title="Click to unfollow"
                          >
                            {isRequesting ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <>
                                <UserCheck size={15} className="text-emerald-400" />
                                <span>Following</span>
                              </>
                            )}
                          </button>
                        ) : relationship?.followsMe ? (
                          <button
                            onClick={handleFollow}
                            disabled={isRequesting}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs sm:text-sm font-semibold transition-all shadow-lg shadow-indigo-600/25 active:scale-95 cursor-pointer"
                            title="Follow back to connect mutually"
                          >
                            {isRequesting ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <>
                                <UserPlus size={15} />
                                <span>Follow Back</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={handleFollow}
                            disabled={isRequesting}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold transition-colors shadow-lg shadow-indigo-600/20 active:scale-95 cursor-pointer"
                          >
                            {isRequesting ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <>
                                <UserPlus size={15} />
                                <span>Follow</span>
                              </>
                            )}
                          </button>
                        )}

                        <button
                          onClick={relationship?.isAcceptedConnection ? handleStartMessage : undefined}
                          disabled={isRequesting || !relationship?.isAcceptedConnection}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow-md ${
                            relationship?.isAcceptedConnection
                              ? "bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 active:scale-95 cursor-pointer"
                              : "bg-white/5 border border-white/5 text-slate-500 cursor-not-allowed opacity-60"
                          }`}
                          title={relationship?.isAcceptedConnection ? "Send direct message" : "Follow request must be accepted before you can message this user"}
                        >
                          {isRequesting ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : !relationship?.isAcceptedConnection ? (
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
