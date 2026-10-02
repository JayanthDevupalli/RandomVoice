"use client";

import { useState } from "react";
import { PRESET_COLORS, PRESET_PATTERNS, getCardThemeStyle } from "@/lib/card-themes";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Crown, MicOff, Check, Palette, Sparkles, Loader2 } from "lucide-react";

interface CardCustomizerProps {
  username: string;
  avatar: string;
  initialColor?: string;
  initialPattern?: string;
  onSave: (color: string, pattern: string) => Promise<void> | void;
  isSaving?: boolean;
}

export function CardCustomizer({
  username,
  avatar,
  initialColor = "#465B73",
  initialPattern = "none",
  onSave,
  isSaving = false,
}: CardCustomizerProps) {
  const [selectedColor, setSelectedColor] = useState(initialColor);
  const [selectedPattern, setSelectedPattern] = useState(initialPattern);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const cardStyle = getCardThemeStyle(selectedColor, selectedPattern);

  const handleSave = async () => {
    await onSave(selectedColor, selectedPattern);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="bg-[#12131A]/95 border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden space-y-7">
      {/* Ambient Glow */}
      <div
        className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-20 transition-all duration-500"
        style={{ backgroundColor: selectedColor }}
      />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/10">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shadow-inner shrink-0">
            <Palette size={22} />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Voice Card Theme</h2>
            <p className="text-xs sm:text-sm text-slate-400">Personalize your seat background in voice rooms</p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="self-start sm:self-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : savedSuccess ? (
            <Check size={16} className="text-emerald-400" />
          ) : (
            <Sparkles size={16} />
          )}
          <span>{savedSuccess ? "Theme Saved!" : "Save Theme"}</span>
        </button>
      </div>

      {/* Live Seat Card Preview Box (Centered & Spacious) */}
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl bg-black/40 border border-white/5 relative">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          Live Voice Room Card Preview
        </div>

        <div className="w-full max-w-xs relative">
          {/* Ambient Card Backlight Glow */}
          <div
            className="absolute -inset-2 rounded-[2rem] blur-2xl opacity-40 transition-all duration-300 pointer-events-none"
            style={{ backgroundColor: selectedColor }}
          />

          <div
            style={cardStyle}
            className="relative p-5 sm:p-6 rounded-[1.5rem] border flex flex-col justify-between items-center text-center shadow-2xl transition-all duration-300 min-h-[230px]"
          >
            {/* Top Card Header */}
            <div className="w-full flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-md bg-black/40 border border-white/10 text-[10px] font-mono font-semibold text-slate-300">
                SEAT #1
              </span>
              <div className="flex items-center gap-1.5">
                <span className="p-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm" title="Moderator">
                  <Crown size={12} className="fill-amber-400" />
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-indigo-600/40 text-indigo-200 text-[9px] font-bold border border-indigo-400/50">
                  YOU
                </span>
              </div>
            </div>

            {/* Avatar with Mute Overlay */}
            <div className="relative my-3">
              <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-white/20 bg-black/40 flex items-center justify-center shadow-xl">
                {avatar?.includes("http") ? (
                  <img src={avatar} alt={username} className="w-full h-full object-cover" />
                ) : (
                  <UserAvatar avatar={avatar || "zap"} color="#6366F1" size="lg" className="!rounded-2xl !w-full !h-full" />
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-rose-600 border-2 border-[#111622] text-white shadow-md">
                <MicOff size={12} />
              </div>
            </div>

            {/* User Details */}
            <div className="flex flex-col items-center">
              <span className="font-bold text-sm sm:text-base text-white drop-shadow">
                {username}
              </span>
              <span className="text-[11px] font-medium text-rose-300/90 mt-0.5">
                Muted
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Color Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300">
            Background Color
          </label>
        </div>

        {/* Custom Color Input Bar */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-black/40 border border-white/10 hover:border-white/20 transition-colors">
          <div className="flex items-center gap-3.5">
            <label className="relative w-10 h-10 rounded-xl overflow-hidden border border-white/20 shadow-md cursor-pointer shrink-0 block">
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer scale-150"
              />
              <div
                className="w-full h-full rounded-xl"
                style={{ backgroundColor: selectedColor }}
              />
            </label>
            <div>
              <div className="text-xs sm:text-sm font-bold text-white">Custom Color</div>
              <div className="text-xs font-mono text-slate-400 uppercase">{selectedColor}</div>
            </div>
          </div>

          <input
            type="text"
            value={selectedColor}
            onChange={(e) => {
              if (e.target.value.startsWith("#") || e.target.value.length <= 7) {
                setSelectedColor(e.target.value);
              }
            }}
            maxLength={7}
            className="w-28 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs sm:text-sm font-mono text-center text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
          />
        </div>

        {/* 24 Preset Colors Grid (6 columns desktop, 4 columns tablet, 2 columns mobile) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {PRESET_COLORS.map((preset) => {
            const isSelected = selectedColor.toLowerCase() === preset.hex.toLowerCase();
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelectedColor(preset.hex)}
                style={{ backgroundColor: preset.hex }}
                className={`h-11 rounded-xl flex items-center justify-center px-2 text-xs font-semibold text-white shadow-md transition-all relative overflow-hidden cursor-pointer ${
                  isSelected
                    ? "ring-2 ring-cyan-400 border-2 border-cyan-400 scale-[1.03] shadow-cyan-500/30 z-10"
                    : "hover:scale-[1.02] hover:opacity-90 border border-white/10"
                }`}
              >
                <span className="drop-shadow-md text-center truncate w-full px-1">{preset.name}</span>
                {isSelected && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-cyan-400 shadow-sm" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pattern Overlay Section */}
      <div className="space-y-4 pt-2">
        <label className="block text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300">
          Pattern Overlay
        </label>

        {/* 9 Pattern Presets Grid (5 columns desktop, 3 columns mobile) */}
        <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
          {PRESET_PATTERNS.map((pattern) => {
            const isSelected = selectedPattern === pattern.id;
            const previewStyle = getCardThemeStyle(selectedColor, pattern.id);

            return (
              <button
                key={pattern.id}
                type="button"
                onClick={() => setSelectedPattern(pattern.id)}
                style={previewStyle}
                className={`h-12 rounded-xl flex items-center justify-center p-2 text-xs font-semibold text-white shadow-md transition-all relative cursor-pointer ${
                  isSelected
                    ? "ring-2 ring-cyan-400 border-2 border-cyan-400 scale-[1.03] shadow-cyan-500/30 z-10"
                    : "hover:scale-[1.02] hover:opacity-90 border border-white/10"
                }`}
              >
                <span className="bg-black/60 backdrop-blur-xs px-2 py-1 rounded-md text-xs font-bold text-white drop-shadow truncate">
                  {pattern.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
