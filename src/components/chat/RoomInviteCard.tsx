"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Radio, Users, ArrowRight, Check } from "lucide-react";
import { RoomInviteData } from "@/lib/chat-utils";
import { useActiveJunction } from "@/components/providers/ActiveJunctionContext";

interface RoomInviteCardProps {
  invite: RoomInviteData;
  isMe?: boolean;
}

export function RoomInviteCard({ invite, isMe }: RoomInviteCardProps) {
  const router = useRouter();
  const { activeJunctionId, setActiveJunctionId, setIsMinimized } = useActiveJunction();

  const isCurrentRoom = activeJunctionId === invite.junctionId;

  const handleJoin = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeJunctionId !== invite.junctionId) {
      setActiveJunctionId(invite.junctionId);
    }
    setIsMinimized(false);
    router.push(`/junction/${invite.junctionId}`);
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-3.5 sm:p-4 border transition-all duration-300 select-none max-w-sm w-full ${
        isMe
          ? "bg-gradient-to-br from-indigo-950/80 via-slate-900 to-[#12131A] border-indigo-500/30 shadow-indigo-950/30"
          : "bg-gradient-to-br from-[#12141F] via-[#0E1017] to-black border-white/10 shadow-2xl"
      } shadow-lg`}
    >
      {/* Ambient background glow */}
      <div className="absolute -top-10 -right-10 w-28 h-28 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none" />

      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2 mb-2 relative z-10">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-[10px] font-bold text-rose-300 shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
          VOICE HANGOUT
        </span>

        <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
          <Users size={12} className="opacity-75" />
          <span>
            {invite.participantCount || 1}/{invite.maxParticipants || 10}
          </span>
        </span>
      </div>

      {/* Room Details */}
      <div className="relative z-10">
        <h4 className="font-extrabold text-sm sm:text-base text-white tracking-tight leading-snug truncate">
          {invite.junctionName}
        </h4>
        <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5 line-clamp-2 leading-relaxed opacity-90">
          {invite.description || "Jump into the voice hangout and chat!"}
        </p>
      </div>

      {/* Join Action Button */}
      <div className="mt-3 relative z-10">
        <button
          type="button"
          onClick={handleJoin}
          className={`w-full py-2 px-3.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-98 cursor-pointer flex items-center justify-center gap-1.5 ${
            isCurrentRoom
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40"
              : "bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-950/40"
          }`}
        >
          {isCurrentRoom ? (
            <>
              <Check size={14} />
              <span>Return to Hangout</span>
            </>
          ) : (
            <>
              <Radio size={14} className="text-white shrink-0" />
              <span>Join Voice Hangout</span>
              <ArrowRight size={13} className="ml-0.5 opacity-80" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
