"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { X, Loader2, MessageSquare } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

interface ConnectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  mode: "followers" | "following" | "requests";
  onModeChange?: (mode: "followers" | "following" | "requests") => void;
}

export function ConnectionsModal({ isOpen, onClose, currentUser, mode, onModeChange }: ConnectionsModalProps) {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchConnections = async () => {
    if (!isOpen || !currentUser) return;
    setIsLoading(true);
    
    if (mode === "requests") {
      const { data, error } = await supabase
        .from("connections")
        .select(`
          id,
          requester:profiles!connections_requester_id_fkey(id, username, avatar)
        `)
        .eq("receiver_id", currentUser.id)
        .eq("status", "pending");

      if (data) {
        const profiles = data.map((conn: any) => {
          const req = Array.isArray(conn.requester) ? conn.requester[0] : conn.requester;
          return { connectionId: conn.id, ...req };
        });
        setUsers(profiles);
      }
    } else {
      const filterCol = mode === "followers" ? "receiver_id" : "requester_id";
      
      const { data, error } = await supabase
        .from("connections")
        .select(`
          id,
          requester:profiles!connections_requester_id_fkey(id, username, avatar),
          receiver:profiles!connections_receiver_id_fkey(id, username, avatar)
        `)
        .eq(filterCol, currentUser.id)
        .eq("status", "accepted");

      if (data) {
        const profiles = data.map((conn: any) => {
          const req = Array.isArray(conn.requester) ? conn.requester[0] : conn.requester;
          const rec = Array.isArray(conn.receiver) ? conn.receiver[0] : conn.receiver;
          return mode === "followers" ? req : rec;
        });
        setUsers(profiles);
      } else {
        console.error("Error fetching connections:", error);
      }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchConnections();
  }, [isOpen, currentUser, mode]);

  const handleAcceptRequest = async (connectionId: string, requesterId: string) => {
    setProcessingId(requesterId);
    try {
      await supabase
        .from("connections")
        .update({ status: "accepted" })
        .eq("id", connectionId);

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
          .eq('user_id', requesterId)
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
            { conversation_id: newConv.id, user_id: requesterId }
          ]);
        }
      }

      fetchConnections();
    } catch (err) {
      console.error("Error accepting request:", err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineRequest = async (connectionId: string, requesterId: string) => {
    setProcessingId(requesterId);
    try {
      await supabase
        .from("connections")
        .delete()
        .eq("id", connectionId);
      fetchConnections();
    } catch (err) {
      console.error("Error declining request:", err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleStartMessage = async (profileId: string) => {
    if (!currentUser) return;
    setProcessingId(profileId);
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
          .eq('user_id', profileId)
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
            { conversation_id: newConv.id, user_id: profileId }
          ]);
          existingConvId = newConv.id;
        }
      }

      router.push(`/messages?id=${existingConvId}`);
      onClose();
    } catch (e) {
      console.error(e);
    }
    setProcessingId(null);
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-[#12131A] border-t sm:border border-white/10 rounded-t-[2.25rem] sm:rounded-[2rem] shadow-2xl overflow-hidden p-5 sm:p-6 flex flex-col max-h-[85dvh] sm:max-h-[80vh]">
        {/* Mobile Drag Indicator */}
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onModeChange?.("followers")}
              className={`text-xs sm:text-sm font-bold px-3 py-1.5 rounded-xl transition-all ${
                mode === "followers" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Followers
            </button>
            <button
              onClick={() => onModeChange?.("following")}
              className={`text-xs sm:text-sm font-bold px-3 py-1.5 rounded-xl transition-all ${
                mode === "following" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Following
            </button>
            <button
              onClick={() => onModeChange?.("requests")}
              className={`text-xs sm:text-sm font-bold px-3 py-1.5 rounded-xl transition-all ${
                mode === "requests" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Requests
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-0.5">
          {isLoading ? (
            <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-indigo-500 w-8 h-8" /></div>
          ) : users.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">
              No {mode} found yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] hover:bg-white/5 border border-white/5 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-slate-800 overflow-hidden flex items-center justify-center shrink-0 border border-white/10">
                      {u?.avatar?.includes("http") ? (
                        <img src={u.avatar} className="w-full h-full object-cover" />
                      ) : (
                        <UserAvatar avatar={u?.avatar} size="sm" className="!w-full !h-full" />
                      )}
                    </div>
                    <span className="text-sm font-semibold text-white truncate">{u?.username}</span>
                  </div>
                  
                  {mode === "requests" ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAcceptRequest(u.connectionId, u.id)}
                        disabled={processingId === u.id}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md active:scale-95 transition-all disabled:opacity-50"
                      >
                        {processingId === u.id ? <Loader2 size={14} className="animate-spin" /> : "Accept"}
                      </button>
                      <button
                        onClick={() => handleDeclineRequest(u.connectionId, u.id)}
                        disabled={processingId === u.id}
                        className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium active:scale-95 transition-all disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleStartMessage(u.id)}
                      disabled={processingId !== null}
                      className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white transition-all shadow-md disabled:opacity-50 shrink-0"
                      title="Send Message"
                      aria-label={`Message ${u?.username}`}
                    >
                      {processingId === u.id ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  , document.body);
}

