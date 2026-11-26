"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Upload, Check, Sparkles, Loader2, ShieldCheck } from "lucide-react";
import { AVAILABLE_AVATARS, UserAvatar } from "@/components/ui/UserAvatar";
import { isImageAvatarUrl } from "@/lib/profile-constants";

interface AvatarSelectorModalProps {
  isOpen: boolean;
  currentAvatar: string;
  isSaving?: boolean;
  onClose: () => void;
  onSelectVectorAvatar: (avatarId: string) => Promise<void> | void;
  onUploadPhotoClick: () => void;
}

export function AvatarSelectorModal({
  isOpen,
  currentAvatar,
  isSaving = false,
  onClose,
  onSelectVectorAvatar,
  onUploadPhotoClick,
}: AvatarSelectorModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<string>(
    isImageAvatarUrl(currentAvatar) ? "sparkles" : currentAvatar || "sparkles"
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen && !isImageAvatarUrl(currentAvatar)) {
      setSelectedIcon(currentAvatar || "sparkles");
    }
  }, [isOpen, currentAvatar]);

  if (!mounted || !isOpen) return null;

  const isCurrentlyImage = isImageAvatarUrl(currentAvatar);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#12131A] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl z-10 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto sm:hidden" />

        <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Customize Avatar</h3>
              <p className="text-[11px] text-slate-400">Upload a custom photo or pick a vector badge</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close avatar modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Upload Custom Photo CTA */}
        <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {isCurrentlyImage ? (
                <img
                  src={currentAvatar}
                  alt="Current profile photo"
                  className="w-12 h-12 rounded-full object-cover border-2 border-indigo-400/50 shrink-0"
                />
              ) : (
                <UserAvatar avatar={selectedIcon} color="#6366F1" size="md" className="!rounded-full shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-white">Upload Custom Photo</p>
                <p className="text-[11px] text-slate-400">Crop, zoom & auto-strip EXIF metadata</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onUploadPhotoClick();
              }}
              disabled={isSaving}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-indigo-600/25 transition-all cursor-pointer shrink-0"
            >
              <Upload size={14} />
              <span>Choose File</span>
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/90 font-medium">
            <ShieldCheck size={12} className="shrink-0" />
            <span>Privacy Safe: GPS, camera & device metadata are automatically stripped.</span>
          </div>
        </div>

        {/* Built-in Vector Icon Avatars */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Or Choose Vector Icon
            </span>
            {isCurrentlyImage && (
              <span className="text-[10px] text-slate-400">Replaces uploaded photo</span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {AVAILABLE_AVATARS.map((item) => {
              const Icon = item.icon;
              const isSelected = !isCurrentlyImage && currentAvatar === item.id;
              const isPicked = selectedIcon === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedIcon(item.id)}
                  className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                    isPicked
                      ? "bg-indigo-600/25 border-indigo-400 text-white shadow-md shadow-indigo-500/20"
                      : "bg-black/40 border-white/10 text-slate-400 hover:text-white hover:border-white/20"
                  }`}
                >
                  <Icon size={20} className={isPicked ? "text-indigo-300" : ""} />
                  <span className="text-[10px] font-semibold flex items-center gap-1">
                    {item.label}
                    {isSelected && <Check size={10} className="text-emerald-400" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => onSelectVectorAvatar(selectedIcon)}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-emerald-600/20"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            <span>Use Vector Icon</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
