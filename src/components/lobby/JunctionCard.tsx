"use client";

import { useState } from "react";
import { Junction } from "@/lib/types";
import { UserAvatar } from "../ui/UserAvatar";
import { Users, Gamepad2, Cpu, Coffee, Music, Sparkles, Languages, Dices, Mic, ArrowRight, Lock, Trash2, Loader2, MapPin } from "lucide-react";
import Link from "next/link";
import { useGuestUser } from "@/hooks/useGuestUser";

interface JunctionCardProps {
  junction: Junction;
  onDelete?: (id: string) => void;
}

const CATEGORY_ICONS: Record<string, any> = {
  gaming: Gamepad2,
  tech: Cpu,
  chill: Coffee,
  music: Music,
  philosophy: Sparkles,
  languages: Languages,
  casual: Dices,
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  gaming: { bg: "bg-emerald-600/10", text: "text-emerald-400", border: "border-emerald-500/30" },
  tech: { bg: "bg-cyan-600/10", text: "text-cyan-400", border: "border-cyan-500/30" },
  chill: { bg: "bg-purple-600/10", text: "text-purple-400", border: "border-purple-500/30" },
  music: { bg: "bg-pink-600/10", text: "text-pink-400", border: "border-pink-500/30" },
  philosophy: { bg: "bg-indigo-600/10", text: "text-indigo-400", border: "border-indigo-500/30" },
  languages: { bg: "bg-amber-600/10", text: "text-amber-400", border: "border-amber-500/30" },
  casual: { bg: "bg-rose-600/10", text: "text-rose-400", border: "border-rose-500/30" },
};

const CITY_FAMOUS_MAP: Record<string, string> = {
  "Hyderabad": "Famous for Biryani, Charminar & Global IT Tech Hub",
  "Secunderabad": "Famous for Twin City heritage, Railway Hub & Hussain Sagar Lake",
  "Visakhapatnam": "Famous for RK Beach, Eastern Naval Command & Araku Valley",
  "Vijayawada": "Famous for Kanaka Durga Temple, Prakasam Barrage & Commerce",
  "Bengaluru": "Famous for Silicon Valley of India, Garden City & Pub Capital",
  "Mysuru": "Famous for Mysuru Palace, Silk Sarees & Grand Dasara Festival",
  "Chennai": "Famous for Marina Beach, Kollywood Cinema & Classical Music",
  "Coimbatore": "Famous for Manchester of South India, Textiles & Marudhamalai",
  "Mumbai": "Famous for City of Dreams, Bollywood & Gateway of India",
  "Pune": "Famous for Cultural Capital of MH, Shaniwar Wada & IT Parks",
  "Kochi": "Famous for Queen of Arabian Sea, Chinese Nets & Backwaters",
  "Thiruvananthapuram": "Famous for Padmanabhaswamy Temple & Kovalam Beach",
  "Ahmedabad": "Famous for Sabarmati Ashram, Textiles & Gujarati Street Food",
  "Surat": "Famous for Diamond Cutting Capital, Silk Textiles & Ghari Sweets",
  "Jaipur": "Famous for The Pink City, Hawa Mahal & Royal Rajput Forts",
  "Udaipur": "Famous for City of Lakes, Lake Palace & Regal Heritage",
  "Lucknow": "Famous for City of Nawabs, Tunday Kababs & Chikankari Embroidery",
  "Varanasi": "Famous for Spiritual Capital of India, Kashi Vishwanath & Ganga Ghats",
  "Kolkata": "Famous for City of Joy, Howrah Bridge, Durga Puja & Rosogolla",
  "Darjeeling": "Famous for World-famous Tea Gardens, Toy Train & Kanchenjunga Views",
  "Amritsar": "Famous for Golden Temple, Wagah Border & Amritsari Kulchas",
  "Ludhiana": "Famous for Industrial Hub of Punjab & Authentic Punjabi Cuisine",
  "Indore": "Famous for Cleanest City in India, Sarafa Night Market & Poha",
  "Bhopal": "Famous for City of Lakes, Upper Lake & Royal Begum Heritage",
  "New Delhi": "Famous for Capital of India, India Gate, Red Fort & Power Hub",
  "Old Delhi": "Famous for Chandni Chowk, Jama Masjid & Paranthe Wali Gali"
};

import React from "react";

export const JunctionCard = React.memo(
  function JunctionCard({ junction, onDelete }: JunctionCardProps) {
    const { guest } = useGuestUser();
    const [isDeleting, setIsDeleting] = useState(false);

  const isPublic = !junction.isCustom && !junction.creatorId && (!junction.id.startsWith("junc_"));
  const IconComponent = isPublic ? MapPin : (CATEGORY_ICONS[junction.category] || Mic);
  const colorScheme = CATEGORY_COLORS[junction.category] || CATEGORY_COLORS.casual;
  const displayLabel = isPublic 
    ? (["North", "South", "East", "West", "Central"].find(r => junction.tags?.includes(r)) || "Public")
    : junction.category;
  const displayDescription = isPublic 
    ? (CITY_FAMOUS_MAP[junction.name] || junction.description)
    : junction.description;
  const participantCount = junction.participants?.length ?? junction.currentCount;
  const maxCapacity = junction.maxParticipants || 7;
  const isFull = participantCount >= maxCapacity;
  const isLocked = junction.isLocked;
  const seats = Array.from({ length: maxCapacity });
  const isCreator = guest?.name === junction.creatorId;

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); // prevent navigation if wrapped in Link
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this room?")) return;
    try {
      setIsDeleting(true);
      await fetch(`/api/junctions/${junction.id}?creatorId=${encodeURIComponent(guest?.name || "")}`, {
        method: "DELETE",
      });
      if (onDelete) {
        onDelete(junction.id);
      }
    } catch (err) {
      console.error(err);
      setIsDeleting(false);
    }
  };

  return (
    <div className={`group relative rounded-3xl bg-[#12131A]/60 backdrop-blur-xl hover:bg-[#12131A]/80 border border-white/5 hover:border-indigo-500/50 p-4 sm:p-5 flex flex-col justify-between transition-all duration-300 shadow-xl hover:shadow-indigo-500/10 ${isDeleting ? "opacity-50 pointer-events-none" : ""}`}>
      <div>
        {/* Top Header: Category & Occupancy Badge */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider border ${colorScheme.bg} ${colorScheme.text} ${colorScheme.border}`}>
            <IconComponent size={12} />
            <span>{displayLabel}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {isLocked && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-400 font-medium">
                <Lock size={10} />
                <span>Locked</span>
              </div>
            )}
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 border border-white/10 text-xs font-medium">
              <Users size={12} className={isFull ? "text-rose-400" : "text-emerald-400"} />
              <span className={isFull ? "text-rose-400 font-bold" : "text-slate-300 font-semibold"}>
                {participantCount}/{maxCapacity}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-3.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight group-hover:text-indigo-300 transition-colors line-clamp-1">
              {junction.name}
            </h3>
            {isCreator && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="p-1.5 rounded-md text-slate-500 hover:bg-rose-500/20 hover:text-rose-400 transition-colors z-10 shrink-0 disabled:opacity-50"
                title="Delete Room"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin text-rose-400" /> : <Trash2 size={14} />}
              </button>
            )}
          </div>

          {displayDescription && (
            <p className="text-xs text-slate-400 font-light leading-relaxed line-clamp-2 mt-1 tracking-wide">
              {displayDescription}
            </p>
          )}
        </div>

        {/* Dynamic Seat Strip */}
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-1.5 justify-start">
            {seats.map((_, index) => {
              const participant = junction.participants[index];
              const isMod = participant?.role === "moderator";
              if (participant) {
                return (
                  <div
                    key={participant.id || index}
                    className="relative transform hover:scale-110 transition-transform"
                    title={`${participant.name}${isMod ? ' (Moderator)' : ''}${participant.isSpeaking ? ' (Speaking)' : ''}`}
                  >
                    <UserAvatar
                      avatar={participant.avatar}
                      color={participant.color}
                      size="sm"
                      isSpeaking={participant.isSpeaking}
                    />
                    {isMod && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border border-slate-900" />
                    )}
                  </div>
                );
              }
              return (
                <div
                  key={`empty-${index}`}
                  className="w-7 h-7 rounded-full border border-solid border-white/10 flex items-center justify-center text-[10px] font-medium text-slate-500"
                  title={`Seat #${index + 1} (Available)`}
                >
                  {index + 1}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div>
        {isLocked ? (
          <button
            disabled
            className="w-full py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-rose-400/80 font-medium text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
          >
            <Lock size={13} />
            <span>Room Locked by Mod</span>
          </button>
        ) : isFull ? (
          <button
            disabled
            className="w-full py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-slate-500 font-medium text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
          >
            <Lock size={13} />
            <span>Room Full ({maxCapacity}/{maxCapacity})</span>
          </button>
        ) : (
          <Link
            href={`/junction/${junction.id}`}
            className="w-full py-3 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[13px] flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all active:scale-95"
          >
            <Mic size={14} />
            <span>Join Room</span>
            <ArrowRight size={14} className="opacity-70 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return JSON.stringify(prevProps.junction) === JSON.stringify(nextProps.junction);
});
