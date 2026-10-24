"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { X, UserPlus, Loader2, Check, Search } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { createPortal } from "react-dom";
import { socialService } from "@/lib/social-service";

interface AddGroupMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  existingMemberIds: string[];
  currentUser: any;
  onMembersAdded: () => void;
}

export function AddGroupMemberModal({
  isOpen,
  onClose,
  conversationId,
  existingMemberIds,
  currentUser,
  onMembersAdded,
}: AddGroupMemberModalProps) {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !currentUser) return;
    setSelectedIds([]);
    setSearchQuery("");

    const fetchAvailableFriends = async () => {
      setIsLoading(true);
      try {
        let blockedSet = new Set<string>();
        if (currentUser.id) {
          try {
            const { blockedByMeIds, blockedMeIds } = await socialService.getBlockLists(currentUser.id);
            blockedSet = new Set([...(blockedByMeIds || []), ...(blockedMeIds || [])]);
          } catch (e) {
            console.warn("Could not fetch blocked list:", e);
          }
        }

        const existingSet = new Set(existingMemberIds);

        // Fetch accepted connections
        const { data } = await supabase
          .from("connections")
          .select(`
            requester_id,
            receiver_id,
            requester:profiles!connections_requester_id_fkey(id, username, avatar),
            receiver:profiles!connections_receiver_id_fkey(id, username, avatar)
          `)
          .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
          .eq("status", "accepted");

        if (data) {
          const uniqueMap = new Map<string, any>();
          for (const conn of data) {
            const req = Array.isArray(conn.requester) ? conn.requester[0] : conn.requester;
            const rec = Array.isArray(conn.receiver) ? conn.receiver[0] : conn.receiver;
            const other = conn.requester_id === currentUser.id ? rec : req;

            if (
              other &&
              other.id &&
              other.id !== currentUser.id &&
              !existingSet.has(other.id) &&
              !blockedSet.has(other.id)
            ) {
              if (!uniqueMap.has(other.id)) {
                uniqueMap.set(other.id, other);
              }
            }
          }

          const sorted = Array.from(uniqueMap.values()).sort((a, b) =>
            (a.username || "").localeCompare(b.username || "")
          );
          setCandidates(sorted);
        }
      } catch (err) {
        console.error("Error loading candidates to add to group:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAvailableFriends();
  }, [isOpen, currentUser, existingMemberIds]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAdd = async () => {
    if (selectedIds.length === 0 || !conversationId) return;

    setIsAdding(true);
    try {
      const rows = selectedIds.map((id) => ({
        conversation_id: conversationId,
        user_id: id,
        role: "member",
      }));

      const { error } = await supabase.from("conversation_members").insert(rows);
      if (error) {
        console.error("Error adding members:", error);
        alert("Failed to add members: " + error.message);
      } else {
        onMembersAdded();
        onClose();
      }
    } catch (err: any) {
      console.error("Error adding members to group:", err);
      alert(err.message || "Failed to add members");
    } finally {
      setIsAdding(false);
    }
  };

  const filteredCandidates = candidates.filter((c) =>
    !searchQuery.trim() ||
    (c.username || "").toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#12131D] border-t sm:border border-white/10 rounded-t-[2.25rem] sm:rounded-[2rem] shadow-2xl overflow-hidden p-5 sm:p-6 flex flex-col max-h-[85dvh]">
        {/* Mobile Drag Indicator */}
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

        <div className="flex items-center justify-between mb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
              <UserPlus size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Add Participants</h3>
              <p className="text-[11px] text-slate-400">Choose from your connections</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Input */}
        {candidates.length > 3 && (
          <div className="relative my-2 shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search connections..."
              className="w-full pl-9 pr-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/60 transition-colors"
            />
          </div>
        )}

        {/* Candidates List */}
        <div className="flex-1 overflow-y-auto max-h-60 border border-white/10 rounded-xl bg-black/20 divide-y divide-white/5 my-2">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="animate-spin text-indigo-500 w-6 h-6" />
            </div>
          ) : candidates.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              All your connections are already members of this group chat!
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No connections found matching &quot;{searchQuery}&quot;
            </div>
          ) : (
            filteredCandidates.map((candidate) => {
              const isSelected = selectedIds.includes(candidate.id);
              return (
                <button
                  key={candidate.id}
                  onClick={() => toggleSelect(candidate.id)}
                  className={`w-full flex items-center justify-between p-3 transition-colors active:bg-white/10 ${
                    isSelected ? "bg-indigo-500/10" : "hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-800 border border-white/10 shrink-0">
                      {candidate.avatar?.includes("http") ? (
                        <img src={candidate.avatar} className="w-full h-full object-cover" />
                      ) : (
                        <UserAvatar avatar={candidate.avatar} size="sm" className="!w-full !h-full" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-white truncate">{candidate.username}</span>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
                      isSelected
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "border-slate-600"
                    }`}
                  >
                    {isSelected && <Check size={12} />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Action Button */}
        <div className="pt-3 border-t border-white/5 shrink-0">
          <button
            onClick={handleAdd}
            disabled={selectedIds.length === 0 || isAdding}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold transition-all shadow-lg text-sm cursor-pointer disabled:cursor-not-allowed"
          >
            {isAdding ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              `Add to Group (${selectedIds.length})`
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
