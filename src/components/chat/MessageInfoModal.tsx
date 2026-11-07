"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, CheckCheck, Check, Info, Clock, Users } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { VoiceNotePlayer } from "./VoiceNotePlayer";
import { RoomInviteCard } from "./RoomInviteCard";
import { ParsedMessage, getProfileDisplayName, formatChatDateDivider } from "@/lib/chat-utils";

export interface GroupMemberReadInfo {
  id: string;
  username: string;
  name?: string;
  displayName?: string;
  avatar?: string;
  readAt?: string;
}

interface MessageInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: {
    id: string;
    content: string;
    created_at: string;
    sender_id: string;
  } | null;
  parsedMessage: ParsedMessage | null;
  readMembers: GroupMemberReadInfo[];
  unreadMembers: GroupMemberReadInfo[];
  onlineUserIds: Set<string>;
}

export function MessageInfoModal({
  isOpen,
  onClose,
  message,
  parsedMessage,
  readMembers,
  unreadMembers,
  onlineUserIds,
}: MessageInfoModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen || !message) return null;

  const totalRecipients = readMembers.length + unreadMembers.length;
  const isAllSeen = totalRecipients > 0 && readMembers.length === totalRecipients;

  const formatReadTime = (isoString?: string) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    const dayLabel = formatChatDateDivider(isoString);
    const timeLabel = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${dayLabel} at ${timeLabel}`;
  };

  const sentTimeStr = formatReadTime(message.created_at);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md bg-[#11121B] border-t sm:border border-white/10 rounded-t-[2.25rem] sm:rounded-[2rem] shadow-2xl overflow-hidden p-5 sm:p-6 flex flex-col max-h-[88dvh] z-10">
        {/* Mobile Drag Indicator */}
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Info size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Message Info</h3>
              <p className="text-[11px] text-slate-400">Read receipts & group delivery status</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 py-3 space-y-4 pr-0.5">
          {/* Message Preview Bubble Card */}
          <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Your Message
            </span>
            <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-600/90 to-indigo-500/90 text-white text-xs leading-relaxed shadow-sm break-words">
              {parsedMessage?.type === "voice" ? (
                <VoiceNotePlayer
                  audioUrl={parsedMessage.audioUrl || ""}
                  duration={parsedMessage.duration}
                  isMe={true}
                />
              ) : parsedMessage?.type === "gif" && parsedMessage.gifUrl ? (
                <div className="max-w-[180px] rounded-lg overflow-hidden">
                  <img
                    src={parsedMessage.gifUrl}
                    alt={parsedMessage.gifTitle || "GIF"}
                    className="w-full h-auto object-cover rounded-lg"
                  />
                </div>
              ) : parsedMessage?.type === "room_invite" && parsedMessage.roomInvite ? (
                <RoomInviteCard invite={parsedMessage.roomInvite} isMe={true} />
              ) : (
                <p className="whitespace-pre-wrap">{parsedMessage?.text || message.content}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <Clock size={11} className="text-slate-500 shrink-0" />
              <span>Sent {sentTimeStr}</span>
            </div>
          </div>

          {/* Seen Summary Pill */}
          <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-indigo-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-white">
                  Seen by {readMembers.length} of {totalRecipients} participant{totalRecipients === 1 ? "" : "s"}
                </p>
                <p className="text-[10px] text-slate-400">
                  {isAllSeen ? "Read by everyone in the group 🎉" : `${unreadMembers.length} member${unreadMembers.length === 1 ? "" : "s"} yet to read`}
                </p>
              </div>
            </div>
            {isAllSeen && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                All Read
              </span>
            )}
          </div>

          {/* Section 1: Read by */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400 uppercase tracking-wide">
                <CheckCheck size={14} className="stroke-[2.5]" />
                <span>Read by ({readMembers.length})</span>
              </div>
            </div>

            {readMembers.length === 0 ? (
              <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] text-center text-xs text-slate-500">
                No one has opened this message yet
              </div>
            ) : (
              <div className="divide-y divide-white/5 border border-white/5 rounded-2xl bg-black/20 overflow-hidden">
                {readMembers.map((member) => {
                  const isOnline = onlineUserIds.has(member.id);
                  const dName = getProfileDisplayName(member, member.username);
                  return (
                    <div
                      key={member.id}
                      className="p-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative w-8 h-8 rounded-full overflow-hidden bg-slate-800 border border-white/10 shrink-0">
                          {member.avatar?.includes("http") ? (
                            <img src={member.avatar} alt={dName} className="w-full h-full object-cover" />
                          ) : (
                            <UserAvatar avatar={member.avatar} size="sm" className="!w-full !h-full" />
                          )}
                          {isOnline && (
                            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-[#11121B]" />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-white truncate">{dName}</span>
                          <span className="text-[10px] text-slate-400 truncate">{isOnline ? "Online" : "Offline"}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-sky-300 font-mono flex items-center gap-1 justify-end">
                          <CheckCheck size={11} className="stroke-[2.5] text-sky-400" />
                          <span>{formatReadTime(member.readAt)}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Delivered to */}
          {unreadMembers.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wide">
                  <Check size={14} className="stroke-[2]" />
                  <span>Delivered to ({unreadMembers.length})</span>
                </div>
              </div>

              <div className="divide-y divide-white/5 border border-white/5 rounded-2xl bg-black/20 overflow-hidden">
                {unreadMembers.map((member) => {
                  const isOnline = onlineUserIds.has(member.id);
                  const dName = getProfileDisplayName(member, member.username);
                  return (
                    <div
                      key={member.id}
                      className="p-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative w-8 h-8 rounded-full overflow-hidden bg-slate-800 border border-white/10 shrink-0">
                          {member.avatar?.includes("http") ? (
                            <img src={member.avatar} alt={dName} className="w-full h-full object-cover" />
                          ) : (
                            <UserAvatar avatar={member.avatar} size="sm" className="!w-full !h-full" />
                          )}
                          {isOnline && (
                            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-[#11121B]" />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-white truncate">{dName}</span>
                          <span className="text-[10px] text-slate-400 truncate">{isOnline ? "Online" : "Offline"}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-500 flex items-center gap-1 justify-end">
                          {isOnline ? (
                            <span className="text-emerald-400 font-medium">Online</span>
                          ) : (
                            <span>Delivered</span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

