"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Search, UserPlus, Check, Loader2, Copy, Radio, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { socialService } from "@/lib/social-service";
import { serializeRoomInvite } from "@/lib/chat-utils";
import { UserAvatar } from "@/components/ui/UserAvatar";

interface InviteContact {
  id: string;
  username: string;
  avatar?: string;
  bio?: string;
  relationshipTag: string;
}

interface InviteFriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  junctionId: string;
  junctionName: string;
  description?: string;
  participantCount?: number;
  maxParticipants?: number;
  currentUserId?: string;
  currentUsername?: string;
}

export function InviteFriendsModal({
  isOpen,
  onClose,
  junctionId,
  junctionName,
  description,
  participantCount = 1,
  maxParticipants = 10,
  currentUserId,
  currentUsername,
}: InviteFriendsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [contacts, setContacts] = useState<InviteContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !currentUserId) return;

    let isMounted = true;

    async function loadContacts() {
      setIsLoading(true);
      try {
        // 1. Fetch blocked users to exclude
        const { blockedByMeIds, blockedMeIds } = await socialService.getBlockLists(currentUserId!);
        const blockedSet = new Set([...blockedByMeIds, ...blockedMeIds]);

        // 2. Fetch people following me
        const { data: followers } = await supabase
          .from("connections")
          .select(`
            requester:profiles!connections_requester_id_fkey(id, username, avatar, bio)
          `)
          .eq("receiver_id", currentUserId)
          .eq("status", "accepted");

        // 3. Fetch people I follow
        const { data: following } = await supabase
          .from("connections")
          .select(`
            receiver:profiles!connections_receiver_id_fkey(id, username, avatar, bio)
          `)
          .eq("requester_id", currentUserId)
          .eq("status", "accepted");

        // 4. Fetch recent direct conversations
        const { data: myConvs } = await supabase
          .from("conversation_members")
          .select("conversation_id, conversations!inner(type)")
          .eq("user_id", currentUserId)
          .eq("conversations.type", "direct");

        let convUserMap = new Map<string, any>();
        if (myConvs && myConvs.length > 0) {
          const convIds = myConvs.map((c: any) => c.conversation_id);
          const { data: otherMembers } = await supabase
            .from("conversation_members")
            .select(`
              user_id,
              profiles:profiles!conversation_members_user_id_fkey(id, username, avatar, bio)
            `)
            .in("conversation_id", convIds)
            .neq("user_id", currentUserId);

          if (otherMembers) {
            otherMembers.forEach((m: any) => {
              const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
              if (p && !blockedSet.has(p.id)) {
                convUserMap.set(p.id, p);
              }
            });
          }
        }

        const map = new Map<string, InviteContact>();

        // Add following
        if (following) {
          following.forEach((f: any) => {
            const p = Array.isArray(f.receiver) ? f.receiver[0] : f.receiver;
            if (p && !blockedSet.has(p.id)) {
              map.set(p.id, {
                id: p.id,
                username: p.username,
                avatar: p.avatar,
                bio: p.bio,
                relationshipTag: "Following",
              });
            }
          });
        }

        // Add followers
        if (followers) {
          followers.forEach((f: any) => {
            const p = Array.isArray(f.requester) ? f.requester[0] : f.requester;
            if (p && !blockedSet.has(p.id)) {
              if (map.has(p.id)) {
                map.set(p.id, {
                  ...map.get(p.id)!,
                  relationshipTag: "Mutual",
                });
              } else {
                map.set(p.id, {
                  id: p.id,
                  username: p.username,
                  avatar: p.avatar,
                  bio: p.bio,
                  relationshipTag: "Follower",
                });
              }
            }
          });
        }

        // Add recent DM contacts
        convUserMap.forEach((p, id) => {
          if (!map.has(id)) {
            map.set(id, {
              id: p.id,
              username: p.username,
              avatar: p.avatar,
              bio: p.bio,
              relationshipTag: "Recent Chat",
            });
          }
        });

        if (isMounted) {
          setContacts(Array.from(map.values()));
        }
      } catch (err) {
        console.error("Failed to load invite contacts:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadContacts();

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentUserId]);

  const handleCopyLink = () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/junction/${junctionId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSendInvite = async (targetUserId: string) => {
    if (!currentUserId || sendingIds.has(targetUserId) || sentIds.has(targetUserId)) return;

    setSendingIds((prev) => new Set(prev).add(targetUserId));

    try {
      // 1. Find existing direct conversation with target user
      const { data: myConvs } = await supabase
        .from("conversation_members")
        .select("conversation_id, conversations!inner(type)")
        .eq("user_id", currentUserId)
        .eq("conversations.type", "direct");

      let convId: string | null = null;

      if (myConvs && myConvs.length > 0) {
        const convIds = myConvs.map((c: any) => c.conversation_id);
        const { data: shared } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", targetUserId)
          .in("conversation_id", convIds);

        if (shared && shared.length > 0) {
          convId = shared[0].conversation_id;
        }
      }

      // 2. If no conversation exists, create one
      if (!convId) {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({ type: "direct" })
          .select("id")
          .single();

        if (newConv) {
          await supabase.from("conversation_members").insert([
            { conversation_id: newConv.id, user_id: currentUserId, role: "member" },
            { conversation_id: newConv.id, user_id: targetUserId, role: "member" },
          ]);
          convId = newConv.id;
        }
      }

      if (convId) {
        // 3. Serialize and insert room invite message
        const content = serializeRoomInvite({
          junctionId,
          junctionName,
          description,
          participantCount,
          maxParticipants,
          inviterName: currentUsername || "Your friend",
        });

        await supabase.from("messages").insert({
          conversation_id: convId,
          sender_id: currentUserId,
          content,
        });

        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", convId);

        setSentIds((prev) => new Set(prev).add(targetUserId));

        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("yapclub_social_updated"));
        }
      }
    } catch (err) {
      console.error("Failed to send room invite:", err);
      alert("Failed to send invite. Please try again.");
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(targetUserId);
        return next;
      });
    }
  };

  if (!mounted || !isOpen) return null;

  const filteredContacts = contacts.filter((c) =>
    c.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Dimmed Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md bg-[#12131A] border-t sm:border border-white/10 rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl overflow-hidden p-5 sm:p-6 flex flex-col max-h-[85dvh] sm:max-h-[80vh] z-10 animate-in zoom-in-95 duration-200">
        {/* Mobile Drag Pill */}
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0">
              <UserPlus size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Invite to Hangout</h3>
              <p className="text-[11px] text-slate-400 truncate max-w-[220px] sm:max-w-[260px]">
                {junctionName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-colors cursor-pointer"
          >
            <X size={17} />
          </button>
        </div>

        {/* Quick Link Copy Bar */}
        <div className="mb-3.5 p-2.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0 pl-1">
            <Radio size={14} className="text-indigo-400 shrink-0" />
            <span className="text-xs text-slate-300 font-mono truncate">
              {typeof window !== "undefined" ? `${window.location.host}/junction/${junctionId}` : ""}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopyLink}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1 shrink-0 ${
              copiedLink
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white/10 hover:bg-white/15 text-white"
            }`}
          >
            {copiedLink ? (
              <>
                <Check size={13} />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>Copy Link</span>
              </>
            )}
          </button>
        </div>

        {/* Search Input */}
        <div className="relative mb-3.5 shrink-0">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search friends & followers..."
            className="w-full pl-10 pr-4 py-2 bg-black/50 border border-white/10 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Contacts List */}
        <div className="flex-1 overflow-y-auto pr-0.5 space-y-2">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="animate-spin text-indigo-500 w-7 h-7" />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="py-12 text-center space-y-1.5">
              <p className="text-sm font-semibold text-slate-300">
                {searchQuery ? "No matching contacts found" : "No followers or recent chats yet"}
              </p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                {searchQuery
                  ? "Try searching for a different username or copy the room link above."
                  : "Follow other users or chat with people to invite them directly!"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredContacts.map((contact) => {
                const isSending = sendingIds.has(contact.id);
                const isSent = sentIds.has(contact.id);

                return (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between p-2.5 sm:p-3 rounded-2xl bg-white/[0.02] hover:bg-white/5 border border-white/5 transition-colors"
                  >
                    {/* User Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden flex items-center justify-center shrink-0 border border-white/10">
                        {contact.avatar?.includes("http") ? (
                          <img
                            src={contact.avatar}
                            alt={contact.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <UserAvatar avatar={contact.avatar} size="sm" className="!w-full !h-full" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-bold text-white truncate">
                            {contact.username}
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-white/5 text-slate-400 border border-white/5">
                            {contact.relationshipTag}
                          </span>
                        </div>
                        {contact.bio && (
                          <p className="text-[11px] text-slate-400 truncate max-w-[200px] sm:max-w-[240px]">
                            {contact.bio}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="shrink-0 ml-2">
                      {isSent ? (
                        <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1 shadow-xs">
                          <Check size={13} />
                          <span>Sent</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSendInvite(contact.id)}
                          disabled={isSending}
                          className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md active:scale-95 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                        >
                          {isSending ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              <span>Sending...</span>
                            </>
                          ) : (
                            <>
                              <UserPlus size={13} />
                              <span>Invite</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
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
