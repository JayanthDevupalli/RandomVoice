"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { GuestUser } from "@/lib/types";
import { COLOR_PALETTES, generateRandomNickname } from "@/lib/guest-utils";
import { AVAILABLE_AVATARS, UserAvatar } from "@/components/ui/UserAvatar";
import { X, Dices, Check, Sparkles } from "lucide-react";

interface GuestProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  guest: GuestUser | null;
  onUpdate: (updates: Partial<GuestUser>) => void;
}

export function GuestProfileModal({ isOpen, onClose, guest, onUpdate }: GuestProfileModalProps) {
  const [name, setName] = useState(guest?.name || "");
  const [selectedAvatar, setSelectedAvatar] = useState(guest?.avatar || "zap");
  const [selectedColor, setSelectedColor] = useState(guest?.color || "#6366F1");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !guest || !mounted) return null;

  const changesLeft = guest.profileChangesLeft ?? 3;
  const canEdit = changesLeft > 0;

  const handleRandomize = () => {
    if (!canEdit) return;
    const newName = generateRandomNickname();
    setName(newName);
  };

  const handleSave = () => {
    if (!canEdit) return;
    const didChange = name.trim() !== guest.name || selectedAvatar !== guest.avatar || selectedColor !== guest.color;

    onUpdate({
      name: name.trim() || guest.name,
      avatar: selectedAvatar,
      color: selectedColor,
      ...(didChange ? { profileChangesLeft: changesLeft - 1 } : {}),
    });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md p-5 sm:p-6 rounded-2xl bg-card border border-slate-300 dark:border-slate-700/80 shadow-2xl text-slate-900 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-500 dark:text-slate-400 hover:text-white rounded-lg hover:bg-slate-200 dark:bg-slate-800 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 mb-5">
          <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Guest Profile</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Anonymous & instant — no password needed</p>
          </div>
        </div>

        {/* Live Preview Avatar */}
        <div className="flex flex-col items-center justify-center mb-6">
          <UserAvatar avatar={selectedAvatar} color={selectedColor} size="lg" />
          <span className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
            {name || "Anonymous Guest"}
          </span>
        </div>

        {/* Nickname Input & Randomize */}
        <div className="mb-5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Your Nickname
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
              placeholder="Enter your voice handle"
              maxLength={20}
              className={`flex-1 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-sm ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            <button
              type="button"
              onClick={handleRandomize}
              disabled={!canEdit}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition-all ${!canEdit ? 'opacity-50 cursor-not-allowed hover:bg-indigo-600/20' : ''}`}
              title="Generate fun random handle"
            >
              <Dices size={16} />
              <span>Random</span>
            </button>
          </div>
        </div>

        {/* Vector Avatar Selector Grid */}
        <div className="mb-5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Choose Vector Icon Avatar
          </label>
          <div className="grid grid-cols-6 gap-2">
            {AVAILABLE_AVATARS.map((p) => {
              const Icon = p.icon;
              const isSelected = selectedAvatar === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => canEdit && setSelectedAvatar(p.id)}
                  disabled={!canEdit}
                  className={`p-2.5 rounded-xl transition-all flex items-center justify-center border ${
                    isSelected
                      ? "bg-indigo-600/20 border-indigo-500 text-indigo-400"
                      : "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-white"
                  } ${!canEdit ? 'opacity-50 cursor-not-allowed hover:border-slate-200 dark:hover:border-slate-800' : ''}`}
                  title={p.label}
                >
                  <Icon size={18} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Color Palette Selector */}
        <div className="mb-6">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Accent Aura
          </label>
          <div className="flex gap-2.5">
            {COLOR_PALETTES.map((c) => {
              const isSelected = selectedColor === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => canEdit && setSelectedColor(c)}
                  disabled={!canEdit}
                  style={{ backgroundColor: c }}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform ${
                    isSelected ? "scale-125 ring-2 ring-white shadow-lg" : canEdit ? "hover:scale-110 opacity-80" : "opacity-50 cursor-not-allowed"
                  }`}
                >
                  {isSelected && <Check size={14} className="text-white drop-shadow" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:bg-slate-800 font-medium text-sm transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canEdit}
            className={`flex-1 py-2.5 rounded-xl text-white font-semibold text-sm shadow-md transition-all ${canEdit ? "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20 cursor-pointer" : "bg-slate-600 cursor-not-allowed opacity-50"}`}
          >
            {canEdit ? `Save Profile (${changesLeft} left)` : "No changes left"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
