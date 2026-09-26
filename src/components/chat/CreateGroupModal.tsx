"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { X, Users, Loader2, Check } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { createPortal } from "react-dom";

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  onGroupCreated: (conversationId: string) => void;
}

export function CreateGroupModal({ isOpen, onClose, currentUser, onGroupCreated }: CreateGroupModalProps) {
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !currentUser) return;

    const fetchFriends = async () => {
      setIsLoading(true);
      // Friends are where status='accepted' and user is requester OR receiver
      const { data, error } = await supabase
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
        // Extract the "other" profile
        const friendProfiles = data.map((conn: any) => {
          const req = Array.isArray(conn.requester) ? conn.requester[0] : conn.requester;
          const rec = Array.isArray(conn.receiver) ? conn.receiver[0] : conn.receiver;
          return conn.requester_id === currentUser.id ? rec : req;
        });
        setFriends(friendProfiles);
      }
      setIsLoading(false);
    };

    fetchFriends();
  }, [isOpen, currentUser]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selectedIds.length === 0) return;
    
    setIsCreating(true);
    
    // 1. Create Conversation
    const { data: convData, error: convErr } = await supabase
      .from("conversations")
      .insert({
        type: "group",
        name: groupName.trim()
      })
      .select("id")
      .single();

    if (convData) {
      // 2. Add members
      const membersToInsert = [
        { conversation_id: convData.id, user_id: currentUser.id, role: "admin" },
        ...selectedIds.map(id => ({ conversation_id: convData.id, user_id: id, role: "member" }))
      ];

      const { error: membersErr } = await supabase.from("conversation_members").insert(membersToInsert);
      if (membersErr) {
        console.error("Error adding members to group:", membersErr);
      }
      
      onGroupCreated(convData.id);
      onClose();
    } else {
      console.error("Failed to create conversation:", convErr);
      alert(convErr?.message || "Failed to create group");
    }
    
    setIsCreating(false);
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-[#12131A] border-t sm:border border-white/10 rounded-t-[2.25rem] sm:rounded-[2rem] shadow-2xl overflow-hidden p-5 sm:p-6 flex flex-col max-h-[90dvh] sm:max-h-[85vh]">
        {/* Mobile Drag Indicator */}
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Users size={18} />
            </div>
            <span>Create Group Chat</span>
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Group Name</label>
            <input
              type="text"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="e.g. Late Night Gamers"
              className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-base sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors shadow-inner"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Select Members
              </label>
              {selectedIds.length > 0 && (
                <span className="text-xs font-semibold text-indigo-400">
                  {selectedIds.length} selected
                </span>
              )}
            </div>

            <div className="max-h-56 sm:max-h-60 overflow-y-auto border border-white/10 rounded-xl bg-black/20 divide-y divide-white/5">
              {isLoading ? (
                <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-indigo-500 w-6 h-6" /></div>
              ) : friends.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  You don't have any connections yet. Connect with someone in a room first!
                </div>
              ) : (
                friends.map(friend => {
                  const isSelected = selectedIds.includes(friend.id);
                  return (
                    <button
                      key={friend.id}
                      onClick={() => toggleSelect(friend.id)}
                      className={`w-full flex items-center justify-between p-3.5 transition-colors active:bg-white/10 ${isSelected ? 'bg-indigo-500/10' : 'hover:bg-white/5'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-800 border border-white/10 shrink-0">
                          {friend.avatar?.includes("http") ? (
                            <img src={friend.avatar} className="w-full h-full object-cover" />
                          ) : (
                            <UserAvatar avatar={friend.avatar} size="sm" className="!w-full !h-full" />
                          )}
                        </div>
                        <span className="text-sm font-medium text-white">{friend.username}</span>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-600'}`}>
                        {isSelected && <Check size={12} />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="pt-4 mt-2 border-t border-white/5 shrink-0">
          <button
            onClick={handleCreate}
            disabled={!groupName.trim() || selectedIds.length === 0 || isCreating}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold transition-all shadow-lg text-sm sm:text-base"
          >
            {isCreating ? <Loader2 size={18} className="animate-spin" /> : `Create Group (${selectedIds.length})`}
          </button>
        </div>
      </div>
    </div>
  , document.body);
}
