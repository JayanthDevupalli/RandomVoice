"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Bell, Check, X, User } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useUser } from "@/hooks/useUser";

export function NotificationsDropdown() {
  const { user, isRegistered } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isRegistered || !user) return;

    // Fetch initial pending requests
    const fetchRequests = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("connections")
        .select(`
          id,
          created_at,
          requester:profiles!connections_requester_id_fkey (
            id,
            username,
            avatar
          )
        `)
        .eq("receiver_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching notifications:", error);
      }
      if (data) setRequests(data);
      setIsLoading(false);
    };

    fetchRequests();

    // Subscribe to new and updated requests in real time
    const channelId = `notifications_${user.id}_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "connections",
        },
        (payload: any) => {
          const rec = payload.new || payload.old;
          if (!rec || rec.receiver_id === user.id || rec.requester_id === user.id) {
            fetchRequests();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isRegistered, user]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleUpdateStatus = async (connectionId: string, status: "accepted" | "blocked") => {
    // Find the request details before optimistic update
    const requestDetails = requests.find(r => r.id === connectionId);
    
    // Optimistic UI update
    setRequests(prev => prev.filter(req => req.id !== connectionId));
    
    await supabase
      .from("connections")
      .update({ status })
      .eq("id", connectionId);

    // If accepted, create a direct conversation so they can start chatting
    if (status === "accepted" && requestDetails) {
      // 1. Create the conversation
      const { data: convData } = await supabase
        .from("conversations")
        .insert({ type: "direct" })
        .select("id")
        .single();
        
      if (convData) {
        // 2. Add both members
        await supabase
          .from("conversation_members")
          .insert([
            { conversation_id: convData.id, user_id: requestDetails.requester.id, role: "member" },
            { conversation_id: convData.id, user_id: user?.id, role: "member" }
          ]);
      }
    }
  };

  if (!isRegistered) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center w-9 h-9 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer shadow-sm shrink-0"
        title="Notifications"
      >
        <Bell size={16} />
        {requests.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#090A0F] shadow-sm animate-pulse">
            {requests.length > 99 ? "99+" : requests.length}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="fixed sm:absolute top-[3.5rem] sm:top-12 left-4 right-4 sm:left-auto sm:right-0 sm:w-80 bg-[#12131A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-fadeIn">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Notifications</h3>
            {requests.length > 0 && (
              <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full font-medium">
                {requests.length} New
              </span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-slate-500 text-sm">Loading...</div>
            ) : requests.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                  <Bell size={20} className="text-slate-600" />
                </div>
                <p className="text-sm text-slate-400">No new notifications</p>
                <p className="text-xs text-slate-500 mt-1">You're all caught up!</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {requests.map((req) => (
                  <div key={req.id} className="p-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors flex gap-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-slate-800 flex items-center justify-center">
                      {req.requester?.avatar?.includes("http") ? (
                        <img src={req.requester.avatar} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <UserAvatar avatar={req.requester?.avatar} color="#6366F1" size="sm" className="!w-full !h-full" />
                      )}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-300 leading-snug">
                        <span className="font-semibold text-white">{req.requester?.username}</span> wants to follow you.
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => handleUpdateStatus(req.id, "accepted")}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors shadow-sm"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(req.id, "blocked")}
                          className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium py-1.5 rounded-lg transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
