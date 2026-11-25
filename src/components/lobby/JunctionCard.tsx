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
  Unlock,
  Trash2,
  Loader2,
  MapPin,
  Shield,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useGuestUser } from "@/hooks/useGuestUser";
import { useUser } from "@/hooks/useUser";
import { useActiveJunction } from "@/components/providers/ActiveJunctionContext";

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

function formatDurationRemaining(expiresAt?: number | null, durationType?: string): string | null {
  if (durationType === "permanent") return "Permanent ♾️";
  if (!expiresAt) {
    if (durationType) return durationType;
    return null;
  }
  const diff = expiresAt - Date.now();
  if (diff <= 0) return "Ended";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m left` : `${hours}h left`;
}

export const JunctionCard = React.memo(
  function JunctionCard({ junction, onDelete }: JunctionCardProps) {
    const { guest } = useGuestUser();
    const { user } = useUser();
    const { activeJunctionId, setActiveJunctionId, setIsMinimized } = useActiveJunction();
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

    const participantCount = typeof junction.currentCount === "number" ? junction.currentCount : (junction.participants?.length || 0);
    const displayedParticipants = participantCount === 0 ? [] : (junction.participants || []);
    const maxCapacity = junction.maxParticipants || (isPublic ? 10 : 2);
    const isFull = participantCount >= maxCapacity;
    const isLocked = junction.isLocked;
    const isPrivate = !isPublic;
    const isSuperAdmin = user?.role === "super_admin";
    const isRoomCreator = Boolean(
      (junction.creatorId || junction.moderatorIdentity) && [
        user?.username,
        user?.displayName,
        user?.name,
        user?.id,
        guest?.name,
        guest?.displayName,
        guest?.username,
        guest?.id,
      ].some((alias) => {
        const clean = alias?.trim().toLowerCase();
        return clean && (
          clean === junction.creatorId?.trim().toLowerCase() ||
          clean === junction.moderatorIdentity?.trim().toLowerCase()
        );
      })
    );

    const [isUnlocking, setIsUnlocking] = useState(false);

    const handleUnlockRoom = async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isUnlocking) return;
      try {
        setIsUnlocking(true);
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            headers["Authorization"] = `Bearer ${session.access_token}`;
          }
        } catch {}

        const myIdentity = (user?.username || user?.displayName || user?.name || guest?.name || "User").trim();
        const res = await fetch(`/api/junctions/${junction.id}`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "lock",
            moderatorIdentity: myIdentity,
            moderatorUserId: user?.id,
            requesterRole: user?.role || "user",
            isLocked: false,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to unlock room");
        }
        window.dispatchEvent(new CustomEvent("yapclub_room_unlocked", { detail: { junctionId: junction.id } }));
      } catch (err: any) {
        console.error("Failed to unlock room:", err);
        alert(err.message || "Failed to unlock room");
      } finally {
        setIsUnlocking(false);
      }
    };

    // Only Super Admin can delete public Junctions.
    // In private rooms, can delete by room creator or Super Admin.
    const canDelete = isPrivate ? (isSuperAdmin || isRoomCreator) : isSuperAdmin;
    const firstParticipant = displayedParticipants[0];
    const durationLabel = isPrivate ? formatDurationRemaining(junction.expiresAt, junction.durationType) : null;
    const isUrgent = Boolean(isPrivate && junction.expiresAt && junction.expiresAt - Date.now() < 10 * 60 * 1000);

    const handleDelete = async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm("Are you sure you want to delete this room?")) return;
      try {
        setIsDeleting(true);
        const creatorParam = user?.username || user?.displayName || user?.name || guest?.name || "";
        const roleParam = user?.role || "user";

        const headers: Record<string, string> = {};
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            headers["Authorization"] = `Bearer ${session.access_token}`;
          }
        } catch {}

        const res = await fetch(
          `/api/junctions/${junction.id}?creatorId=${encodeURIComponent(creatorParam)}&callerRole=${encodeURIComponent(roleParam)}`,
          {
            method: "DELETE",
            headers,
          }
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to delete room");
        }
        if (onDelete) {
          onDelete(junction.id);
        }
      } catch (err: any) {
        console.error("Failed to delete junction:", err);
        alert(err.message || "Failed to delete room");
        setIsDeleting(false);
      }
    };

    const isActive = participantCount > 0;
    const isAnyoneSpeaking = displayedParticipants.some((p) => p.isSpeaking);

    return (
      <div
        className={`junction-card-perf group relative rounded-2xl p-4 flex flex-col justify-between transition-[transform,border-color,background-color,box-shadow] duration-150 hover:-translate-y-0.5 overflow-hidden ${
          isActive
            ? "bg-[#131722] hover:bg-[#171C2B] border border-emerald-500/25 hover:border-emerald-400/50 shadow-[0_4px_20px_rgba(0,0,0,0.35),0_0_24px_rgba(16,185,129,0.06)] hover:shadow-[0_10px_28px_rgba(0,0,0,0.5),0_0_28px_rgba(16,185,129,0.1)]"
            : "bg-[#11131B] hover:bg-[#151824] border border-white/[0.07] hover:border-indigo-500/40 shadow-[0_2px_12px_rgba(0,0,0,0.28)] hover:shadow-[0_10px_26px_rgba(0,0,0,0.45)]"
        } ${isDeleting ? "opacity-50 pointer-events-none" : ""}`}
      >
        {/* Top subtle hairline highlight */}
        <div
          className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent to-transparent pointer-events-none ${
            isActive ? "via-emerald-400/45" : "via-white/[0.12] group-hover:via-indigo-400/40"
          }`}
        />

        {/* Card link overlay for effortless click-to-join */}
        {!user?.isBanned && (!isLocked || isRoomCreator || isSuperAdmin) && !isFull && (
          <Link
            href={`/junction/${junction.id}`}
            onClick={() => {
              if (activeJunctionId !== junction.id) {
                setActiveJunctionId(junction.id);
                setIsMinimized(false);
              }
            }}
            aria-label={`Join ${junction.name}`}
            className="absolute inset-0 z-0 cursor-pointer"
          />
        )}

        <div className="relative z-10 pointer-events-none">
          {/* Row 1: Header Meta (Category/Region badge + Live pill) */}
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10.5px] font-medium uppercase tracking-wider truncate ${
                  isActive
                    ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-200"
                    : "bg-white/[0.04] border-white/[0.06] text-slate-300"
                }`}
              >
                <IconComponent size={11} className="text-indigo-400 shrink-0" />
                <span className="truncate">{categoryLabel}</span>
              </span>
              {durationLabel && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border truncate ${
                  durationLabel === "Permanent ♾️"
                    ? "bg-purple-500/10 border-purple-500/20 text-purple-300"
                    : isUrgent
                    ? "bg-amber-500/15 border-amber-500/30 text-amber-300 animate-pulse"
                    : "bg-white/[0.04] border-white/[0.06] text-slate-300"
                }`}>
                  <Clock size={9} className={durationLabel === "Permanent ♾️" ? "text-purple-400" : isUrgent ? "text-amber-400" : "text-slate-400"} />
                  <span>{durationLabel}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0 pointer-events-auto">
              {isLocked && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                  isRoomCreator ? "text-amber-300" : isSuperAdmin ? "text-indigo-300" : "text-rose-400"
                }`}>
                  <Lock size={10} />
                  <span>{isRoomCreator ? "Yours" : isSuperAdmin ? "Admin" : "Locked"}</span>
                </span>
              )}

              {/* Live Count */}
              {participantCount > 0 ? (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/25 text-xs font-medium text-emerald-300">
                  {isAnyoneSpeaking ? (
                    <span className="flex items-end gap-[2px] h-2.5" aria-hidden="true">
                      <span className="w-[2px] bg-emerald-400 rounded-full soundwave-bar-1" />
                      <span className="w-[2px] bg-emerald-400 rounded-full soundwave-bar-2" />
                      <span className="w-[2px] bg-emerald-400 rounded-full soundwave-bar-3" />
                    </span>
                  ) : (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                    </span>
                  )}
                  <span className="font-bold tabular-nums">{participantCount}</span>
                  <span className="text-emerald-400/70 text-[11px] tabular-nums">/{maxCapacity}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.05] text-[11px] font-medium text-slate-400 tabular-nums">
                  <span>0/{maxCapacity}</span>
                </div>
              )}

              {canDelete && (
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0 disabled:opacity-50"
                  title={isPrivate ? "Delete Voice Room" : "Delete Junction (Super Admin)"}
                >
                  {isDeleting ? <Loader2 size={12} className="animate-spin text-rose-400" /> : <Trash2 size={12} />}
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Room Name & Subtitle */}
          <div className="mb-3.5">
            <h3 className="text-[15.5px] font-semibold text-white tracking-tight group-hover:text-indigo-200 transition-colors truncate">
              {junction.name}
            </h3>
            <p className="text-xs text-slate-400/90 leading-relaxed truncate mt-0.5">
              {rawDescription || "Drop in to join the conversation"}
            </p>
          </div>
        </div>

        {/* Row 3: Bottom Stage Presence & Quick Action */}
        <div className="relative z-10 pt-2.5 border-t border-white/[0.06] flex items-center justify-between gap-2">
          {/* Left: Active Facepile or Clean Open Stage */}
          <div className="flex items-center min-w-0 pointer-events-none">
            {participantCount > 0 && displayedParticipants.length > 0 ? (
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center -space-x-1.5 shrink-0">
                  {displayedParticipants.slice(0, 3).map((p, idx) => {
                    const userRole = p.userRole;
                    const badgeRole = userRole && userRole !== "user" ? userRole : undefined;
                    return (
                      <div
                        key={p.id || idx}
                        className="relative rounded-full ring-2 ring-[#131722] shrink-0"
                        title={`${p.name}${p.isSpeaking ? " (Speaking)" : ""}`}
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
                  {displayedParticipants.length > 3 && (
                    <div className="w-7 h-7 rounded-lg bg-white/[0.08] text-[10px] font-bold text-slate-300 flex items-center justify-center ring-2 ring-[#131722] shrink-0">
                      +{displayedParticipants.length - 3}
                    </div>
                  )}
                </div>

                <div className="flex items-baseline gap-1 min-w-0 truncate">
                  <span className="text-xs font-medium text-slate-200 truncate max-w-[90px]">
                    {firstParticipant?.name}
                  </span>
                  <span className="text-[10.5px] text-slate-400 shrink-0">
                    {displayedParticipants.length > 1
                      ? `+${displayedParticipants.length - 1}`
                      : firstParticipant?.userRole === "super_admin"
                      ? "Founder"
                      : firstParticipant?.userRole === "admin"
                      ? "Admin"
                      : firstParticipant?.userRole === "manager"
                      ? "Manager"
                      : "on stage"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-slate-400/90 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600 group-hover:bg-indigo-400/70 transition-colors" />
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
            ) : isFull ? (
              <button
                disabled
                className="py-1.5 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-slate-400 font-medium text-xs flex items-center gap-1 cursor-not-allowed"
              >
                <Lock size={11} />
                <span>Full</span>
              </button>
            ) : isLocked ? (
              isSuperAdmin || isRoomCreator ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleUnlockRoom}
                    disabled={isUnlocking}
                    className="py-1.5 px-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer shadow-sm active:scale-95"
                    title={isSuperAdmin ? "Unlock this room as Super Admin" : "Unlock your room"}
                  >
                    <Unlock size={11} />
                    <span>{isUnlocking ? "..." : "Unlock"}</span>
                  </button>
                  <Link
                    href={`/junction/${junction.id}`}
                    className="group/btn relative py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1 shadow-sm shadow-indigo-600/30 active:scale-95 transition-colors"
                  >
                    <Mic size={11} className="text-indigo-200 group-hover/btn:text-white transition-colors" />
                    <span>{isRoomCreator ? "Re-enter" : "Enter"}</span>
                  </Link>
                </div>
              ) : (
                <button
                  disabled
                  className="py-1.5 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-rose-400/90 font-medium text-xs flex items-center gap-1 cursor-not-allowed"
                >
                  <Lock size={11} />
                  <span>Locked</span>
                </button>
              )
            ) : (
              <Link
                href={`/junction/${junction.id}`}
                className={`group/btn relative py-1.5 px-3.5 rounded-lg text-white font-medium text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-colors ${
                  isActive
                    ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/25"
                    : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/25"
                }`}
              >
                <Mic size={11} className={isActive ? "text-emerald-100" : "text-indigo-200 group-hover/btn:text-white transition-colors"} />
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
    const a = prevProps.junction;
    const b = nextProps.junction;
    if (a === b) return true;
    if (
      a.id !== b.id ||
      a.name !== b.name ||
      a.description !== b.description ||
      a.currentCount !== b.currentCount ||
      a.maxParticipants !== b.maxParticipants ||
      a.isLocked !== b.isLocked ||
      a.expiresAt !== b.expiresAt ||
      a.category !== b.category ||
      a.durationType !== b.durationType ||
      a.moderatorIdentity !== b.moderatorIdentity
    ) {
      return false;
    }
    const ap = a.participants || [];
    const bp = b.participants || [];
    if (ap.length !== bp.length) return false;
    for (let i = 0; i < ap.length; i++) {
      if (
        ap[i].id !== bp[i].id ||
        ap[i].name !== bp[i].name ||
        ap[i].isSpeaking !== bp[i].isSpeaking ||
        ap[i].avatar !== bp[i].avatar ||
        ap[i].color !== bp[i].color ||
        ap[i].userRole !== bp[i].userRole
      ) {
        return false;
      }
    }
    return true;
  }
);
