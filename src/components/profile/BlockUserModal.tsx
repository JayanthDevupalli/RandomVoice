"use client";

import { Ban, Loader2 } from "lucide-react";

interface BlockUserModalProps {
  isOpen: boolean;
  username: string;
  isBlocking: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function BlockUserModal({
  isOpen,
  username,
  isBlocking,
  onClose,
  onConfirm,
}: BlockUserModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[#12131A] border border-white/10 rounded-3xl p-6 shadow-2xl z-10 text-center space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto">
          <Ban size={22} />
        </div>
        <div>
          <h3 className="text-base font-bold text-white mb-1">Block @{username}?</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            They won&apos;t be able to message you, view your profile, or see your activity in voice rooms. YapClub won&apos;t notify them that you blocked them.
          </p>
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBlocking}
            className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold transition-all shadow-lg shadow-rose-600/30 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {isBlocking ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
            <span>Block User</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isBlocking}
            className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
