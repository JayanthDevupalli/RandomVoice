"use client";

import React, { useState, useRef, useEffect } from "react";
import { Smile, Plus, X } from "lucide-react";
import { MessageReaction, GroupedReaction, groupReactions } from "@/lib/chat-utils";

export const QUICK_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🙏", "🔥", "🎉"];
export const EXTENDED_EMOJIS = [
  "❤️", "👍", "😂", "😮", "😢", "🙏", "🔥", "🎉",
  "👏", "💯", "🚀", "😍", "🤔", "💀", "🤩", "👀",
  "🤝", "✨", "🙌", "🥳", "😎", "💪", "💔", "🫡"
];

interface QuickReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  className?: string;
  isMe?: boolean;
}

export function QuickReactionPicker({
  onSelect,
  onClose,
  className = "",
  isMe = false,
}: QuickReactionPickerProps) {
  const [showExtended, setShowExtended] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className={`relative z-30 select-none animate-in fade-in zoom-in-95 duration-150 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 p-1 bg-[#12131D]/95 backdrop-blur-xl border border-white/15 rounded-full shadow-2xl">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onSelect(emoji);
              onClose?.();
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg hover:bg-white/15 hover:scale-125 active:scale-95 transition-all cursor-pointer"
            title={emoji}
          >
            {emoji}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setShowExtended(!showExtended)}
          className={`w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer ${
            showExtended ? "bg-white/15 text-white" : ""
          }`}
          title="More reactions"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Extended Emoji Grid Popover */}
      {showExtended && (
        <div
          className={`absolute bottom-full mb-2 ${
            isMe ? "right-0" : "left-0"
          } p-2.5 bg-[#12131D]/98 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl z-40 grid grid-cols-6 gap-1 w-64 animate-in fade-in slide-in-from-bottom-2 duration-150`}
        >
          <div className="col-span-6 flex items-center justify-between pb-1.5 mb-1 border-b border-white/10 px-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Reactions
            </span>
            <button
              onClick={() => setShowExtended(false)}
              className="p-0.5 rounded text-slate-400 hover:text-white"
            >
              <X size={12} />
            </button>
          </div>
          {EXTENDED_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSelect(emoji);
                setShowExtended(false);
                onClose?.();
              }}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg hover:bg-white/15 hover:scale-125 active:scale-95 transition-all cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ReactionBadgesProps {
  reactions?: MessageReaction[];
  currentUserId?: string;
  onToggleReaction: (emoji: string) => void;
  onOpenPicker?: () => void;
  isMe?: boolean;
}

export function ReactionBadges({
  reactions,
  currentUserId,
  onToggleReaction,
  onOpenPicker,
  isMe = false,
}: ReactionBadgesProps) {
  const grouped = groupReactions(reactions, currentUserId);
  const [activeTooltipEmoji, setActiveTooltipEmoji] = useState<string | null>(null);

  if (!grouped || grouped.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-1 mt-1 z-10 ${
        isMe ? "justify-end" : "justify-start"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {grouped.map((group) => {
        const userNames = group.users
          .map((u) => (u.userId === currentUserId ? "You" : u.displayName || u.username || "Someone"))
          .join(", ");

        const isTooltipOpen = activeTooltipEmoji === group.emoji;

        return (
          <div key={group.emoji} className="relative group/pill">
            <button
              type="button"
              onClick={() => onToggleReaction(group.emoji)}
              onMouseEnter={() => setActiveTooltipEmoji(group.emoji)}
              onMouseLeave={() => setActiveTooltipEmoji(null)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all active:scale-90 cursor-pointer border select-none ${
                group.hasReacted
                  ? "bg-indigo-600/30 border-indigo-500/60 text-indigo-200 ring-1 ring-indigo-500/40 shadow-sm shadow-indigo-500/20"
                  : "bg-[#181926]/90 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20"
              }`}
              title={userNames}
            >
              <span className="text-[13px] leading-none">{group.emoji}</span>
              <span
                className={`text-[10px] font-bold ${
                  group.hasReacted ? "text-indigo-200" : "text-slate-400"
                }`}
              >
                {group.count}
              </span>
            </button>

            {/* Custom Tooltip on Hover/Tap */}
            {isTooltipOpen && (
              <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/90 text-white text-[10px] font-medium rounded-lg shadow-xl border border-white/10 whitespace-nowrap z-30 pointer-events-none animate-in fade-in duration-100">
                <span className="font-bold text-indigo-300 mr-1">{group.emoji}</span>
                <span>{userNames}</span>
              </div>
            )}
          </div>
        );
      })}

      {/* Quick "+" reaction button to add another emoji */}
      {onOpenPicker && (
        <button
          type="button"
          onClick={onOpenPicker}
          className="w-5 h-5 rounded-full bg-white/5 border border-white/10 hover:bg-white/15 text-slate-400 hover:text-white flex items-center justify-center text-xs active:scale-90 transition-all cursor-pointer"
          title="Add reaction"
        >
          <Plus size={10} />
        </button>
      )}
    </div>
  );
}

