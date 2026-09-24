"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { GuestUser } from "@/lib/types";
import { UserAvatar } from "../ui/UserAvatar";
import { GuestProfileModal } from "../lobby/GuestProfileModal";
import { Radio, Users, LogOut, Edit3 } from "lucide-react";
import { useState } from "react";

interface NavbarProps {
  guest: GuestUser | null;
  onUpdateGuest?: (updates: Partial<GuestUser>) => void;
  onClearProfile?: () => void;
  totalOnline?: number;
}

export function Navbar({ guest, onUpdateGuest, onClearProfile, totalOnline = 24 }: NavbarProps) {
  const router = useRouter();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const handleClearProfile = () => {
    if (onClearProfile) {
      onClearProfile();
    }
    router.push("/");
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/junctions" className="flex items-center gap-2.5 group opacity-90 hover:opacity-100 transition-opacity">
          <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" strokeWidth={1.5} />
          <span className="font-semibold text-base sm:text-lg tracking-wide text-white">
            yap<span className="text-slate-400 font-normal">club</span>
          </span>
        </Link>

        {/* Right Action Menu */}
        <div className="flex items-center gap-2">
          {/* Live Count Indicator */}
          <div className="flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-full bg-white/5 border border-white/10 shadow-sm text-xs text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
            <Users size={12} className="text-emerald-400 hidden xs:inline" />
            <span className="font-semibold text-white">{totalOnline}</span>
            <span className="text-slate-400 text-[11px] hidden sm:inline">live</span>
          </div>

          {/* Fixed Guest Profile Badge (Stored in LocalStorage) */}
          {guest && (
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center sm:justify-start gap-2 w-9 h-9 sm:w-auto sm:pl-1 sm:pr-4 rounded-full bg-white/5 border border-white/10 shadow-sm select-none shrink-0"
                title={`Logged in as ${guest.name}`}
              >
                <UserAvatar avatar={guest.avatar} color={guest.color} size="sm" className="!rounded-full shrink-0" />
                <span className="hidden sm:inline text-xs font-medium text-slate-200 max-w-[90px] truncate">
                  {guest.name}
                </span>
              </div>

              {/* Edit Profile Button */}
              <button
                onClick={() => setIsProfileModalOpen(true)}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all cursor-pointer active:scale-95 shadow-sm shrink-0"
                title="Edit Profile"
              >
                <Edit3 size={14} />
              </button>

              {/* Reset Identity Button */}
              <button
                onClick={handleClearProfile}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/10 transition-all cursor-pointer active:scale-95 shadow-sm shrink-0"
                title="Forget me & start fresh"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
        </div>
      </header>

      {guest && (
        <GuestProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          guest={guest}
          onUpdate={(updates) => {
            if (onUpdateGuest) onUpdateGuest(updates);
          }}
        />
      )}
    </>
  );
}
