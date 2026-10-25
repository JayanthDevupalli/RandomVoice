"use client";

import React, { useState } from "react";
import { Junction } from "@/lib/types";
import { UserAvatar } from "../ui/UserAvatar";
import {
  Gamepad2,
  Cpu,
  Coffee,
  Music,
  Sparkles,
  Languages,
  Dices,
  Mic,
  ArrowRight,
  Lock,
  Trash2,
  Loader2,
  MapPin,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { useGuestUser } from "@/hooks/useGuestUser";
import { useUser } from "@/hooks/useUser";

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

const CITY_FAMOUS_MAP: Record<string, string> = {
  "Hyderabad": "Biryani, Charminar & Global IT Tech Hub",
  "Secunderabad": "Twin City heritage, Railway Hub & Hussain Sagar",
  "Visakhapatnam": "RK Beach, Eastern Naval Command & Araku Valley",
  "Vijayawada": "Kanaka Durga Temple, Prakasam Barrage & Trade",
  "Bengaluru": "Silicon Valley of India, Garden City & Pubs",
  "Mysuru": "Mysuru Palace, Silk Sarees & Grand Dasara",
  "Chennai": "Marina Beach, Kollywood Cinema & Classical Music",
  "Coimbatore": "Manchester of South India, Textiles & Foothills",
  "Mumbai": "City of Dreams, Bollywood & Gateway of India",
  "Pune": "Cultural Capital of MH, Shaniwar Wada & IT Hub",
  "Kochi": "Queen of Arabian Sea, Chinese Nets & Backwaters",
  "Thiruvananthapuram": "Padmanabhaswamy Temple & Kovalam Coast",
  "Ahmedabad": "Sabarmati Ashram, Textiles & Vibrant Street Food",
  "Surat": "Diamond Cutting Capital & Silk Textiles",
  "Jaipur": "The Pink City, Hawa Mahal & Regal Rajput Forts",
  "Udaipur": "City of Lakes, Lake Palace & Regal Heritage",
  "Lucknow": "City of Nawabs, Tunday Kababs & Chikankari",
  "Varanasi": "Spiritual Capital, Kashi Vishwanath & Ganga Ghats",
  "Kolkata": "City of Joy, Howrah Bridge, Durga Puja & Sweets",
  "Darjeeling": "Himalayan Tea Gardens, Toy Train & Kanchenjunga",
  "Amritsar": "Golden Temple, Wagah Border & Punjabi Kulchas",
  "Ludhiana": "Industrial Hub of Punjab & Authentic Food",
  "Indore": "Cleanest City in India, Sarafa Night Market & Poha",
  "Bhopal": "City of Lakes, Upper Lake & Royal Heritage",
  "New Delhi": "Capital of India, India Gate & Power Hub",
  "Old Delhi": "Chandni Chowk, Jama Masjid & Historic Food"
};

export const JunctionCard = React.memo(
  function JunctionCard({ junction, onDelete }: JunctionCardProps) {
    const { guest } = useGuestUser();
    const { user } = useUser();
    const [isDeleting, setIsDeleting] = useState(false);

    const isPublic = !junction.isCustom && !junction.creatorId && (!junction.id.startsWith("junc_"));
    const region = isPublic ? ["North", "South", "East", "West", "Central"].find(r => junction.tags?.includes(r)) : undefined;
    const state = isPublic ? junction.tags?.find(t => t !== region && t !== "Public") : undefined;

    const IconComponent = isPublic ? MapPin : (CATEGORY_ICONS[junction.category] || Mic);
    const categoryLabel = isPublic
      ? (region && state ? `${region} • ${state}` : region || "Public Hub")
      : junction.category;

    const rawDescription = isPublic
      ? (CITY_FAMOUS_MAP[junction.name] || junction.description?.replace(/^Famous for /i, ""))
      : junction.description;

    const participantCount = junction.participants?.length ?? junction.currentCount;
    const maxCapacity = junction.maxParticipants || 10;
    const isFull = participantCount >= maxCapacity;
    const isLocked = junction.isLocked;
    const isCreator = guest?.name === junction.creatorId;
    const firstParticipant = junction.participants?.[0];

    const handleDelete = async (e: React.MouseEvent) => {
      e.preventDefault();
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
      <div
        className={`group relative rounded-2xl bg-[#12131A]/75 hover:bg-[#151722]/90 backdrop-blur-md border border-white/[0.08] hover:border-indigo-500/40 p-4 flex flex-col justify-between transition-all duration-200 shadow-[0_2px_12px_rgba(0,0,0,0.25)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.45)] hover:-translate-y-0.5 overflow-hidden ${
          isDeleting ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        {/* Top subtle hairline highlight */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/[0.12] to-transparent pointer-events-none" />

        {/* Card link overlay for effortless click-to-join */}
        {!user?.isBanned && !isLocked && !isFull && (
          <Link
            href={`/junction/${junction.id}`}
            aria-label={`Join ${junction.name}`}
            className="absolute inset-0 z-0 cursor-pointer"
          />
        )}

        <div className="relative z-10 pointer-events-none">
          {/* Row 1: Header Meta (Category/Region badge + Live pill) */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10.5px] font-medium uppercase tracking-wider text-slate-300 truncate">
                <IconComponent size={11} className="text-indigo-400 shrink-0" />
                <span className="truncate">{categoryLabel}</span>
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0 pointer-events-auto">
              {isLocked && (
                <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 font-medium">
                  <Lock size={10} />
                  <span>Locked</span>
                </span>
              )}

              {/* Live Count */}
              {participantCount > 0 ? (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-300">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                  </span>
                  <span className="font-bold">{participantCount}</span>
                  <span className="text-emerald-400/70 text-[11px]">/{maxCapacity}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.03] text-xs font-medium text-slate-400">
                  <span>0/{maxCapacity}</span>
                </div>
              )}

              {isCreator && (
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0 disabled:opacity-50 ml-0.5"
                  title="Delete Room"
                >
                  {isDeleting ? <Loader2 size={12} className="animate-spin text-rose-400" /> : <Trash2 size={12} />}
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Room Name & Subtitle */}
          <div className="mb-3">
            <h3 className="text-[15.5px] font-semibold text-white tracking-tight group-hover:text-indigo-200 transition-colors truncate">
              {junction.name}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed truncate mt-0.5">
              {rawDescription || "Drop in to join the conversation"}
            </p>
          </div>
        </div>

        {/* Row 3: Bottom Stage Presence & Quick Action */}
        <div className="relative z-10 pt-2.5 border-t border-white/[0.05] flex items-center justify-between gap-2">
          {/* Left: Active Facepile or Clean Open Stage */}
          <div className="flex items-center min-w-0 pointer-events-none">
            {participantCount > 0 ? (
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center -space-x-1.5 shrink-0">
                  {junction.participants.slice(0, 3).map((p, idx) => {
                    const isMod = p.role === "moderator";
                    const userRole = p.userRole;
                    const badgeRole = userRole && userRole !== "user" ? userRole : isMod ? "moderator" : undefined;
                    return (
                      <div
                        key={p.id || idx}
                        className="relative rounded-full ring-2 ring-[#12131A] shrink-0"
                        title={`${p.name}${isMod ? " (Host)" : ""}${p.isSpeaking ? " (Speaking)" : ""}`}
                      >
                        <UserAvatar
                          avatar={p.avatar}
                          color={p.color}
                          size="sm"
                          badgeRole={badgeRole}
                          isSpeaking={p.isSpeaking}
                        />
                      </div>
                    );
                  })}
                  {junction.participants.length > 3 && (
                    <div className="w-6 h-6 rounded-full bg-white/[0.08] text-[9px] font-bold text-slate-300 flex items-center justify-center ring-2 ring-[#12131A] shrink-0">
                      +{junction.participants.length - 3}
                    </div>
                  )}
                </div>

                <div className="flex items-baseline gap-1.5 min-w-0 truncate">
                  <span className="text-xs font-medium text-slate-200 truncate max-w-[85px]">
                    {firstParticipant?.name}
                  </span>
                  <span className="text-[10.5px] text-slate-400 shrink-0">
                    {firstParticipant?.role === "moderator" ? "Host" : "Speaker"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                <span>Stage open</span>
              </div>
            )}
          </div>

          {/* Right: Clean Join Button */}
          <div className="shrink-0 pointer-events-auto">
            {user?.isBanned ? (
              <button
                disabled
                className="py-1.5 px-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 font-medium text-xs flex items-center gap-1 cursor-not-allowed"
              >
                <Shield size={11} />
                <span>Suspended</span>
              </button>
            ) : isLocked ? (
              <button
                disabled
                className="py-1.5 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-rose-400/90 font-medium text-xs flex items-center gap-1 cursor-not-allowed"
              >
                <Lock size={11} />
                <span>Locked</span>
              </button>
            ) : isFull ? (
              <button
                disabled
                className="py-1.5 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-slate-400 font-medium text-xs flex items-center gap-1 cursor-not-allowed"
              >
                <Lock size={11} />
                <span>Full</span>
              </button>
            ) : (
              <Link
                href={`/junction/${junction.id}`}
                className="group/btn relative py-1.5 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm shadow-indigo-600/30 active:scale-95 transition-all"
              >
                <Mic size={11} className="text-indigo-200 group-hover/btn:text-white transition-colors" />
                <span>Join</span>
                <ArrowRight size={11} className="text-white/80 group-hover/btn:translate-x-0.5 transition-transform" />
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return JSON.stringify(prevProps.junction) === JSON.stringify(nextProps.junction);
  }
);
