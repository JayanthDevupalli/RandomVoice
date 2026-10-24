"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  X,
  Users,
  Shield,
  ShieldCheck,
  UserPlus,
  LogOut,
  MoreVertical,
  MessageSquare,
  Edit2,
  Check,
  Search,
  Loader2,
  Trash2,
  Crown,
} from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { createPortal } from "react-dom";
import { AddGroupMemberModal } from "./AddGroupMemberModal";

export interface GroupMemberItem {
  userId: string;
  role: "admin" | "member";
  joinedAt: string;
  username: string;
  avatar?: string;
  bio?: string;
}

interface GroupInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  groupName: string;
  currentUser: any;
  onlineUserIds: Set<string>;
  onUpdateGroupName?: (newName: string) => void;
  onLeaveGroup?: () => void;
  onOpenDirectMessage?: (userId: string) => void;
  onMembersChange?: () => void;
}

export function GroupInfoModal({
  isOpen,
  onClose,
  conversationId,
  groupName,
  currentUser,
  onlineUserIds,
  onUpdateGroupName,
  onLeaveGroup,
  onOpenDirectMessage,
  onMembersChange,
}: GroupInfoModalProps) {
  const [members, setMembers] = useState<GroupMemberItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchMember, setSearchMember] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(groupName);
  const [isSavingName, setIsSavingName] = useState(false);
  const [activeMenuUserId, setActiveMenuUserId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ userId: string; username: string } | null>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setEditedName(groupName);
  }, [groupName]);

  const loadGroupMembers = async () => {
    if (!conversationId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("conversation_members")
        .select(`
          user_id,
          role,
          joined_at,
          profiles:profiles!conversation_members_user_id_fkey(id, username, avatar, bio)
        `)
        .eq("conversation_id", conversationId)
        .order("joined_at", { ascending: true });

      if (data) {
        const parsed: GroupMemberItem[] = data.map((d: any) => {
          const p = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
          return {
            userId: d.user_id,
            role: d.role === "admin" ? "admin" : "member",
            joinedAt: d.joined_at,
            username: p?.username || "Unknown",
            avatar: p?.avatar,
            bio: p?.bio,
          };
        });

        // Sort admins first, then current user, then alphabetical
        parsed.sort((a, b) => {
          if (a.role === "admin" && b.role !== "admin") return -1;
          if (b.role === "admin" && a.role !== "admin") return 1;
          if (a.userId === currentUser?.id) return -1;
          if (b.userId === currentUser?.id) return 1;
          return a.username.localeCompare(b.username);
        });

        setMembers(parsed);
      }
    } catch (e) {
      console.error("Error loading group members:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && conversationId) {
      loadGroupMembers();
      setActiveMenuUserId(null);
    }
  }, [isOpen, conversationId]);

  const currentMember = members.find((m) => m.userId === currentUser?.id);
  const isCurrentAdmin = currentMember?.role === "admin";

  const handleSaveName = async () => {
    if (!editedName.trim() || editedName === groupName) {
      setIsEditingName(false);
      return;
    }
    setIsSavingName(true);
    try {
      const { error } = await supabase
        .from("conversations")
        .update({ name: editedName.trim() })
        .eq("id", conversationId);

      if (!error) {
        onUpdateGroupName?.(editedName.trim());
        setIsEditingName(false);
      } else {
        alert("Failed to update group name: " + error.message);
      }
    } catch (e: any) {
      alert("Error updating group name: " + e.message);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleToggleAdmin = async (targetUserId: string, currentRole: "admin" | "member") => {
    if (!isCurrentAdmin) return;
    const newRole = currentRole === "admin" ? "member" : "admin";
    setActiveMenuUserId(null);

    // Optimistic UI update
    setMembers((prev) =>
      prev.map((m) => (m.userId === targetUserId ? { ...m, role: newRole } : m))
    );

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/conversations/members", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          conversationId,
          targetUserId,
          newRole,
          callerUserId: currentUser?.id,
        }),
      });

      if (!res.ok) {
        // Fallback directly via Supabase client
        await supabase
          .from("conversation_members")
          .update({ role: newRole })
          .eq("conversation_id", conversationId)
          .eq("user_id", targetUserId);
      }
      onMembersChange?.();
    } catch (e) {
      console.error("Error toggling admin role:", e);
    }
  };

  const handleExecuteRemoveMember = async () => {
    if (!memberToRemove || !isCurrentAdmin) return;
    setIsRemovingMember(true);
    const targetUserId = memberToRemove.userId;

    // Optimistic update
    setMembers((prev) => prev.filter((m) => m.userId !== targetUserId));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/conversations/members", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          conversationId,
          targetUserId,
          callerUserId: currentUser?.id,
        }),
      });

      if (!res.ok) {
        // Fallback to direct client
        await supabase
          .from("conversation_members")
          .delete()
          .eq("conversation_id", conversationId)
          .eq("user_id", targetUserId);
      }
      onMembersChange?.();
    } catch (e) {
      console.error("Error removing member:", e);
    } finally {
      setIsRemovingMember(false);
      setMemberToRemove(null);
    }
  };

  const handleExecuteLeaveGroup = async () => {
    if (!currentUser?.id || !conversationId) return;
    setIsLeaving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/conversations/members", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          conversationId,
          targetUserId: currentUser.id,
          callerUserId: currentUser.id,
        }),
      });

      if (!res.ok) {
        // Fallback direct delete
        await supabase
          .from("conversation_members")
          .delete()
          .eq("conversation_id", conversationId)
          .eq("user_id", currentUser.id);
      }

      // Close modal and notify parent view immediately
      onClose();
      onLeaveGroup?.();
    } catch (e) {
      console.error("Error leaving group:", e);
      // Fallback direct delete attempt
      try {
        await supabase
          .from("conversation_members")
          .delete()
          .eq("conversation_id", conversationId)
          .eq("user_id", currentUser.id);
      } catch {}
      onClose();
      onLeaveGroup?.();
    } finally {
      setIsLeaving(false);
      setConfirmingLeave(false);
    }
  };

  const filteredMembers = members.filter((m) =>
    !searchMember.trim() ||
    m.username.toLowerCase().includes(searchMember.trim().toLowerCase())
  );

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#12131D] border-t sm:border border-white/10 rounded-t-[2.25rem] sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[85vh]">
        {/* Mobile Drag Indicator */}
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />

        {/* Top Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Group Info</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-white/5">
          {/* Hero Section */}
          <div className="p-5 flex flex-col items-center text-center bg-gradient-to-b from-indigo-950/20 to-transparent">
            <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-xl shadow-indigo-600/20 mb-3 border border-white/15">
              <Users size={36} />
              <div className="absolute -bottom-1 -right-1 px-2 py-0.5 rounded-full bg-[#12131D] border border-white/10 text-[10px] font-bold text-indigo-300">
                {members.length}
              </div>
            </div>

            {/* Editable Group Name */}
            {isEditingName ? (
              <div className="flex items-center gap-2 w-full max-w-xs mt-1">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-black/40 border border-indigo-500/50 rounded-xl text-sm font-bold text-white text-center focus:outline-none"
                  autoFocus
                  maxLength={40}
                />
                <button
                  onClick={handleSaveName}
                  disabled={isSavingName}
                  className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all"
                >
                  {isSavingName ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                </button>
                <button
                  onClick={() => {
                    setEditedName(groupName);
                    setIsEditingName(false);
                  }}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <h2 className="text-lg font-bold text-white tracking-tight">{groupName}</h2>
                {isCurrentAdmin && (
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    title="Edit group name"
                  >
                    <Edit2 size={13} />
                  </button>
                )}
              </div>
            )}

            <p className="text-xs text-slate-400 mt-1">
              Group • {members.length} participant{members.length === 1 ? "" : "s"}
            </p>

            {/* Quick Actions Bar */}
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-all active:scale-95 shadow-sm"
              >
                <UserPlus size={14} />
                <span>Add Members</span>
              </button>

              <button
                onClick={() => setConfirmingLeave(true)}
                disabled={isLeaving}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
              >
                <LogOut size={14} />
                <span>Leave Group</span>
              </button>
            </div>
          </div>

          {/* Members List Section */}
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {members.length} Participants
                </span>
              </div>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <UserPlus size={13} />
                <span>Add</span>
              </button>
            </div>

            {/* Search within group */}
            {members.length > 4 && (
              <div className="relative mb-3">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchMember}
                  onChange={(e) => setSearchMember(e.target.value)}
                  placeholder="Search participants..."
                  className="w-full pl-8 pr-3 py-1.5 bg-black/30 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
            )}

            <div className="divide-y divide-white/5 border border-white/5 rounded-2xl bg-black/20 relative">
              {isLoading ? (
                <div className="p-8 flex justify-center">
                  <Loader2 className="animate-spin text-indigo-500 w-5 h-5" />
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">No participants found</div>
              ) : (
                filteredMembers.map((member, index) => {
                  const isMe = member.userId === currentUser?.id;
                  const isOnline = onlineUserIds.has(member.userId);
                  const isMenuOpen = activeMenuUserId === member.userId;
                  const isNearBottom = index >= Math.max(1, filteredMembers.length - 2);

                  return (
                    <div
                      key={member.userId}
                      className="p-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors relative first:rounded-t-2xl last:rounded-b-2xl"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Avatar with Online Dot */}
                        <div className="relative w-10 h-10 rounded-full overflow-hidden bg-slate-800 border border-white/10 shrink-0">
                          {member.avatar?.includes("http") ? (
                            <img src={member.avatar} alt={member.username} className="w-full h-full object-cover" />
                          ) : (
                            <UserAvatar avatar={member.avatar} size="sm" className="!w-full !h-full" />
                          )}
                          {isOnline && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#12131D]" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-white truncate">
                              {member.username}
                            </span>
                            {isMe && (
                              <span className="text-[10px] text-slate-400 font-normal">(You)</span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 truncate">
                            {member.bio || (isOnline ? "Online" : "Offline")}
                          </p>
                        </div>
                      </div>

                      {/* Right Badges & Options */}
                      <div className="flex items-center gap-2 shrink-0">
                        {member.role === "admin" && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center gap-1">
                            <Crown size={10} />
                            <span>Admin</span>
                          </span>
                        )}

                        {/* Member Options Menu Button */}
                        {!isMe && (
                          <div className="relative">
                            <button
                              onClick={() =>
                                setActiveMenuUserId(isMenuOpen ? null : member.userId)
                              }
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                              title="Member actions"
                            >
                              <MoreVertical size={15} />
                            </button>

                            {/* Options Dropdown */}
                            {isMenuOpen && (
                              <>
                                <div
                                  className="fixed inset-0 z-50"
                                  onClick={() => setActiveMenuUserId(null)}
                                />
                                <div
                                  className={`absolute right-0 ${
                                    isNearBottom ? "bottom-full mb-2" : "top-full mt-2"
                                  } w-48 bg-[#181926] border border-white/15 rounded-xl shadow-2xl p-1 z-[70] flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md`}
                                >
                                  {onOpenDirectMessage && (
                                    <button
                                      onClick={() => {
                                        setActiveMenuUserId(null);
                                        onClose();
                                        onOpenDirectMessage(member.userId);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left whitespace-nowrap cursor-pointer"
                                    >
                                      <MessageSquare size={13} className="text-indigo-400 shrink-0" />
                                      <span>Message Privately</span>
                                    </button>
                                  )}

                                  {isCurrentAdmin && (
                                    <>
                                      <button
                                        onClick={() =>
                                          handleToggleAdmin(member.userId, member.role)
                                        }
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left whitespace-nowrap cursor-pointer"
                                      >
                                        <Crown size={13} className="text-amber-400 shrink-0" />
                                        <span>
                                          {member.role === "admin"
                                            ? "Dismiss as Admin"
                                            : "Make Group Admin"}
                                        </span>
                                      </button>

                                      <div className="h-px bg-white/5 my-0.5" />

                                      <button
                                        onClick={() => {
                                          setActiveMenuUserId(null);
                                          setMemberToRemove({ userId: member.userId, username: member.username });
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors text-left whitespace-nowrap cursor-pointer"
                                      >
                                        <Trash2 size={13} className="shrink-0" />
                                        <span>Remove from Group</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Exit Group Footer Button & Confirmation (Pinned to bottom) */}
        <div className="p-4 bg-[#12131D] border-t border-white/10 shrink-0">
          {confirmingLeave ? (
            <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/30 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2 text-rose-300 font-semibold text-xs">
                <LogOut size={15} className="shrink-0 text-rose-400" />
                <span>Leave &quot;{groupName}&quot;?</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                You will no longer receive updates or messages in this group chat.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setConfirmingLeave(false)}
                  disabled={isLeaving}
                  className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteLeaveGroup}
                  disabled={isLeaving}
                  className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30 cursor-pointer"
                >
                  {isLeaving ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <LogOut size={13} />
                  )}
                  <span>{isLeaving ? "Leaving..." : "Yes, Leave Group"}</span>
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingLeave(true)}
              disabled={isLeaving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              <LogOut size={15} />
              <span>Exit Group</span>
            </button>
          )}
        </div>
      </div>

      {/* Remove Member Confirmation Overlay */}
      {memberToRemove && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-xs bg-[#161722] border border-white/15 rounded-2xl p-4 shadow-2xl flex flex-col gap-3">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <Trash2 size={16} />
              <span>Remove Member</span>
            </div>
            <p className="text-xs text-slate-300">
              Are you sure you want to remove <span className="font-semibold text-white">@{memberToRemove.username}</span> from this group?
            </p>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setMemberToRemove(null)}
                disabled={isRemovingMember}
                className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteRemoveMember}
                disabled={isRemovingMember}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isRemovingMember ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                <span>{isRemovingMember ? "Removing..." : "Remove"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Nested Modal */}
      <AddGroupMemberModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        conversationId={conversationId}
        existingMemberIds={members.map((m) => m.userId)}
        currentUser={currentUser}
        onMembersAdded={() => {
          loadGroupMembers();
          onMembersChange?.();
        }}
      />
    </div>,
    document.body
  );
}
