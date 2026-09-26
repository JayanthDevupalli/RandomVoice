"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserAvatar } from "../ui/UserAvatar";
import { Radio, Users, Bell, MessageSquare } from "lucide-react";
import { useState } from "react";
import { useUser } from "@/hooks/useUser";
import { AuthModal } from "../auth/AuthModal";

import { NotificationsDropdown } from "./NotificationsDropdown";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";

interface NavbarProps {
  totalOnline?: number;
}

export function Navbar({ totalOnline = 24 }: NavbarProps) {
  const router = useRouter();
  const { user, isRegistered, isLoaded } = useUser();
  const { unreadCount } = useUnreadMessages();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/50 backdrop-blur-xl shrink-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <Link href="/junctions" className="flex items-center gap-2.5 group opacity-90 hover:opacity-100 transition-opacity">
            <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" strokeWidth={1.5} />
            <span className="font-semibold text-base sm:text-lg tracking-wide text-white">
              yap<span className="text-slate-400 font-normal">club</span>
            </span>
          </Link>

          {/* Right Action Menu */}
          <div className="flex items-center gap-3">
            {/* Live Count Indicator */}
            <div className="flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-full bg-white/5 border border-white/10 shadow-sm text-xs text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
              <Users size={12} className="text-emerald-400 hidden xs:inline" />
              <span className="font-semibold text-white">{totalOnline}</span>
              <span className="text-slate-400 text-[11px] hidden sm:inline">live</span>
            </div>

            {isLoaded && user && (
              <div className="flex items-center gap-3">
                {isRegistered ? (
                  <>
                    <Link
                      href="/messages"
                      className="relative flex items-center justify-center w-9 h-9 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer shadow-sm shrink-0"
                      title="Messages"
                    >
                      <MessageSquare size={15} />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#090A0F] shadow-sm animate-pulse">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                    </Link>

                    <NotificationsDropdown />
                    
                    {/* Profile Button */}
                    <button
                      onClick={() => router.push(`/profile/me`)}
                      className="flex items-center justify-center sm:justify-start gap-2 w-9 h-9 sm:w-auto sm:pl-1 sm:pr-4 rounded-full bg-white/5 border border-white/10 shadow-sm select-none shrink-0 hover:bg-white/10 transition-colors"
                      title={`Profile: ${user.name}`}
                    >
                      {/* Avatar might be a URL or an emoji string depending on if it's from Storage or Guest */}
                      {user.avatar.includes("http") ? (
                        <img src={user.avatar} alt="avatar" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <UserAvatar avatar={user.avatar} color="#6366F1" size="sm" className="!rounded-full shrink-0" />
                      )}
                      <span className="hidden sm:inline text-xs font-medium text-slate-200 max-w-[90px] truncate">
                        {user.name}
                      </span>
                    </button>
                  </>
                ) : (
                  /* Sign Up / Log In Button for Guests */
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-full transition-colors shadow-sm"
                  >
                    Log In
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </>
  );
}
