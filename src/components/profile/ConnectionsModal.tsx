"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { X, Loader2, Search, UserCheck, UserPlus, Trash2, Check, Clock } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { socialService } from "@/lib/social-service";

interface ConnectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: string;
  targetUsername: string;
  currentUserId?: string;
  initialMode?: "followers" | "following" | "requests";
  onCountsChanged?: () => void;
}

export function ConnectionsModal({
  isOpen,
  onClose,
  targetUserId,
  targetUsername,
  currentUserId,
  initialMode = "followers",
  onCountsChanged,
}: ConnectionsModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"followers" | "following" | "requests">(initialMode);
  const [followers, setFollowers] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [myFollowingSet, setMyFollowingSet] = useState<Set<string>>(new Set());
  const [myFollowersSet, setMyFollowersSet] = useState<Set<string>>(new Set());
  const [myPendingSet, setMyPendingSet] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const isMyOwnProfile = Boolean(currentUserId && targetUserId === currentUserId);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setActiveTab(initialMode);
  }, [initialMode]);

  const loadData = async (isInitial = false) => {
    if (!isOpen || !targetUserId) return;
    if (isInitial) setIsLoading(true);

    try {
      // 1. Fetch blocked user IDs to filter out of lists (Instagram Architecture)
      let blockedSet = new Set<string>();
      if (currentUserId) {
        const { blockedByMeIds, blockedMeIds } = await socialService.getBlockLists(currentUserId);
        blockedSet = new Set([...blockedByMeIds, ...blockedMeIds]);

        // 2. Fetch logged-in user's active follows & followers for instant Follow/Following state
        const [myFollowingRes, myFollowersRes, myPendingRes] = await Promise.all([
          supabase
            .from("connections")
            .select("receiver_id")
            .eq("requester_id", currentUserId)
            .eq("status", "accepted"),
          supabase
            .from("connections")
            .select("requester_id")
            .eq("receiver_id", currentUserId)
            .eq("status", "accepted"),
          supabase
            .from("connections")
            .select("receiver_id")
            .eq("requester_id", currentUserId)
            .eq("status", "pending"),
        ]);

        if (myFollowingRes.data) {
          setMyFollowingSet(new Set(myFollowingRes.data.map((d: any) => d.receiver_id)));
        }
        if (myFollowersRes.data) {
          setMyFollowersSet(new Set(myFollowersRes.data.map((d: any) => d.requester_id)));
        }
        if (myPendingRes.data) {
          setMyPendingSet(new Set(myPendingRes.data.map((d: any) => d.receiver_id)));
        }

        // If viewing own profile, also load incoming pending follow requests
        if (isMyOwnProfile) {
          const pendingRequests = await socialService.getPendingIncomingRequests(currentUserId);
          setRequests(pendingRequests.filter((r) => r.requester && !blockedSet.has(r.requester.id)));
        }
      }

      // 3. Fetch target user's Followers (who follows targetUserId)
      const { data: followersData } = await supabase
        .from("connections")
        .select(`
          id,
          requester:profiles!connections_requester_id_fkey(id, username, avatar, bio)
        `)
        .eq("receiver_id", targetUserId)
        .eq("status", "accepted");

      if (followersData) {
        const parsed = followersData
          .map((c: any) => {
            const p = Array.isArray(c.requester) ? c.requester[0] : c.requester;
            return p ? { connectionId: c.id, ...p } : null;
          })
          .filter((p: any) => p && !blockedSet.has(p.id));
        setFollowers(parsed);
      }

      // 4. Fetch target user's Following (who targetUserId follows)
      const { data: followingData } = await supabase
        .from("connections")
        .select(`
          id,
          receiver:profiles!connections_receiver_id_fkey(id, username, avatar, bio)
        `)
        .eq("requester_id", targetUserId)
        .eq("status", "accepted");

      if (followingData) {
        const parsed = followingData
          .map((c: any) => {
            const p = Array.isArray(c.receiver) ? c.receiver[0] : c.receiver;
            return p ? { connectionId: c.id, ...p } : null;
          })
          .filter((p: any) => p && !blockedSet.has(p.id));
        setFollowing(parsed);
      }
    } catch (err) {
      console.error("Error loading connections:", err);
    } finally {
      if (isInitial) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData(true);
    }

    const handleUpdate = () => {
      loadData(false);
    };
    window.addEventListener("yapclub_social_updated", handleUpdate);
    return () => window.removeEventListener("yapclub_social_updated", handleUpdate);
  }, [isOpen, targetUserId, currentUserId]);

  const handleFollow = async (userToFollowId: string) => {
    if (!currentUserId) {
      router.push("/login");
      return;
    }
    setProcessingId(userToFollowId);
    try {
      const res = await socialService.followUser(currentUserId, userToFollowId);
      if (res.success) {
        setMyPendingSet((prev) => new Set(prev).add(userToFollowId));
        onCountsChanged?.();
      } else if (res.error) {
        alert(res.error);
      }
    } catch (e) {
      console.error("Failed to follow:", e);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelRequest = async (userToCancelId: string) => {
    if (!currentUserId) return;
    setProcessingId(userToCancelId);
    try {
      const res = await socialService.cancelFollowRequest(currentUserId, userToCancelId);
      if (res.success) {
        setMyPendingSet((prev) => {
          const next = new Set(prev);
          next.delete(userToCancelId);
          return next;
        });
        onCountsChanged?.();
      } else if (res.error) {
        alert(res.error);
      }
    } catch (e) {
      console.error("Failed to cancel request:", e);
    } finally {
      setProcessingId(null);
    }
  };

  const handleAcceptRequest = async (requesterId: string, connId?: string) => {
    if (!currentUserId) return;
    setProcessingId(requesterId);
    try {
      const res = await socialService.acceptFollowRequest(currentUserId, requesterId, connId);
      if (res.success) {
        setRequests((prev) => prev.filter((r) => r.requester.id !== requesterId));
        setMyFollowersSet((prev) => new Set(prev).add(requesterId));
        onCountsChanged?.();
      } else if (res.error) {
        alert(res.error);
      }
    } catch (e) {
      console.error("Failed to accept request:", e);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineRequest = async (requesterId: string, connId?: string) => {
    if (!currentUserId) return;
    setProcessingId(requesterId);
    try {
      const res = await socialService.declineFollowRequest(currentUserId, requesterId, connId);
      if (res.success) {
        setRequests((prev) => prev.filter((r) => r.requester.id !== requesterId));
        onCountsChanged?.();
      } else if (res.error) {
        alert(res.error);
      }
    } catch (e) {
      console.error("Failed to decline request:", e);
    } finally {
      setProcessingId(null);
    }
  };

  const handleUnfollow = async (userToUnfollowId: string) => {
    if (!currentUserId) return;
    setProcessingId(userToUnfollowId);
    try {
      const res = await socialService.unfollowUser(currentUserId, userToUnfollowId);
      if (res.success) {
        setMyFollowingSet((prev) => {
          const next = new Set(prev);
          next.delete(userToUnfollowId);
          return next;
        });

        // If currently viewing logged in user's Following tab, remove them from list as well
        if (targetUserId === currentUserId && activeTab === "following") {
          setFollowing((prev) => prev.filter((u) => u.id !== userToUnfollowId));
        }

        onCountsChanged?.();
      }
    } catch (e) {
      console.error("Failed to unfollow:", e);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRemoveFollower = async (followerId: string) => {
    if (!currentUserId || targetUserId !== currentUserId) return;
    setProcessingId(followerId);
    try {
      const res = await socialService.removeFollower(currentUserId, followerId);
      if (res.success) {
        setFollowers((prev) => prev.filter((u) => u.id !== followerId));
        setMyFollowersSet((prev) => {
          const next = new Set(prev);
          next.delete(followerId);
          return next;
        });
        onCountsChanged?.();
      }
    } catch (e) {
      console.error("Failed to remove follower:", e);
    } finally {
      setProcessingId(null);
    }
  };

  const handleUserNavigate = (userId: string) => {
    onClose();
    router.push(`/profile/${userId}`);
  };

  if (!mounted || !isOpen) return null;

  const currentList = activeTab === "followers" 
    ? followers 
    : activeTab === "following" 
    ? following 
    : requests.map((r) => ({ ...r.requester, connectionId: r.id, created_at: r.created_at }));

  const filteredUsers = currentList.filter((u) =>
    u?.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Overlay Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative w-full max-w-md bg-[#12131A] border-t sm:border border-white/10 rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl overflow-hidden p-4 sm:p-6 flex flex-col max-h-[85dvh] sm:max-h-[80vh] z-10">
        {/* Mobile Drag Pill */}
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

        {/* Modal Header Tabs */}
        <div className="flex items-center justify-between gap-3 mb-4 shrink-0 pb-3 border-b border-white/10">
          <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab("followers")}
              className={`text-xs sm:text-sm font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "followers"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Followers <span className="text-[11px] opacity-75 font-mono ml-1">({followers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("following")}
              className={`text-xs sm:text-sm font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "following"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Following <span className="text-[11px] opacity-75 font-mono ml-1">({following.length})</span>
            </button>
            {isMyOwnProfile && (
              <button
                type="button"
                onClick={() => setActiveTab("requests")}
                className={`text-xs sm:text-sm font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === "requests"
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>Requests</span>
                <span className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full ${
                  requests.length > 0 ? "bg-rose-500 text-white font-bold animate-pulse" : "opacity-75"
                }`}>
                  {requests.length}
                </span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4 shrink-0">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="w-full pl-10 pr-4 py-2 bg-black/50 border border-white/10 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Users List Container */}
        <div className="flex-1 overflow-y-auto pr-0.5 space-y-2">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="animate-spin text-indigo-500 w-7 h-7" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center space-y-1">
              <p className="text-sm font-semibold text-slate-300">
                {searchQuery ? "No matching users found" : `No ${activeTab} yet`}
              </p>
              <p className="text-xs text-slate-500">
                {activeTab === "followers"
                  ? `${targetUsername} has no followers yet.`
                  : activeTab === "following"
                  ? `${targetUsername} is not following anyone yet.`
                  : "You have no pending follow requests."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredUsers.map((u) => {
                const isMe = currentUserId === u.id;
                const isFollowingThem = myFollowingSet.has(u.id);
                const isTheyFollowMe = myFollowersSet.has(u.id);
                const isPendingRequested = myPendingSet.has(u.id);

                return (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-2.5 sm:p-3 rounded-2xl bg-white/[0.02] hover:bg-white/5 border border-white/5 transition-colors group"
                  >
                    {/* User Info (Clickable) */}
                    <div
                      onClick={() => handleUserNavigate(u.id)}
                      className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                    >
                      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-slate-800 overflow-hidden flex items-center justify-center shrink-0 border border-white/10 group-hover:border-indigo-500/50 transition-colors">
                        {u?.avatar?.includes("http") ? (
                          <img src={u.avatar} alt={u.username} className="w-full h-full object-cover" />
                        ) : (
                          <UserAvatar avatar={u?.avatar} size="sm" className="!w-full !h-full" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-bold text-white group-hover:text-indigo-300 transition-colors truncate">
                            {u?.username}
                          </span>
                          {isMe && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              You
                            </span>
                          )}
                        </div>
                        {u?.bio && (
                          <p className="text-[11px] text-slate-400 truncate max-w-[200px] sm:max-w-[240px]">
                            {u.bio}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {activeTab === "requests" ? (
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <button
                          type="button"
                          onClick={() => handleAcceptRequest(u.id, u.connectionId)}
                          disabled={processingId === u.id}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md active:scale-95 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1"
                        >
                          {processingId === u.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          <span>Accept</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeclineRequest(u.id, u.connectionId)}
                          disabled={processingId === u.id}
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/10 text-xs font-semibold active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {isMe ? null : (
                          <>
                            {isFollowingThem ? (
                              <button
                                type="button"
                                onClick={() => handleUnfollow(u.id)}
                                disabled={processingId === u.id}
                                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-200 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1"
                              >
                                {processingId === u.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <>
                                    <UserCheck size={13} className="text-emerald-400" />
                                    <span>Following</span>
                                  </>
                                )}
                              </button>
                            ) : isPendingRequested ? (
                              <button
                                type="button"
                                onClick={() => handleCancelRequest(u.id)}
                                disabled={processingId === u.id}
                                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/10 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1"
                                title="Click to cancel request"
                              >
                                {processingId === u.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <>
                                    <Clock size={13} className="text-amber-400" />
                                    <span>Requested</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleFollow(u.id)}
                                disabled={processingId === u.id}
                                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md active:scale-95 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1"
                              >
                                {processingId === u.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <>
                                    <UserPlus size={13} />
                                    <span>{isTheyFollowMe ? "Follow Back" : "Follow"}</span>
                                  </>
                                )}
                              </button>
                            )}

                          {/* Remove button if viewing own followers tab */}
                          {isMyOwnProfile && activeTab === "followers" && (
                            <button
                              type="button"
                              onClick={() => handleRemoveFollower(u.id)}
                              disabled={processingId === u.id}
                              className="p-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-white/5 transition-all cursor-pointer"
                              title="Remove Follower"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
