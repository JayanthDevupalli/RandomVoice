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
            className="relative p-5 sm:p-6 rounded-[1.5rem] border flex flex-col justify-between items-center text-center shadow-2xl transition-all duration-300 min-h-[230px] overflow-hidden border-white/20"
          >
            {/* Glass Reflective Top Highlight */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/12 via-transparent to-black/40 pointer-events-none rounded-[1.5rem]" />

            {/* Top Card Header */}
            <div className="w-full flex items-center justify-between z-10">
              <span className="px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-[10px] font-mono font-bold text-slate-200 shadow-inner flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                SEAT #1
              </span>
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-amber-500/30 via-amber-400/20 to-amber-500/10 text-amber-300 border border-amber-500/40 shadow-sm backdrop-blur-md text-[9px] font-bold tracking-wider" title="Moderator">
                  <Crown size={11} className="fill-amber-400" />
                  <span>HOST</span>
                </span>
                <span className="px-2 py-1 rounded-full bg-indigo-600/40 text-indigo-200 text-[9px] font-extrabold border border-indigo-400/50 backdrop-blur-md shadow-sm">
                  YOU
                </span>
              </div>
            </div>

            {/* Avatar with Mute Overlay */}
            <div className="relative my-3 rounded-2xl ring-1 ring-white/20 shadow-xl">
              <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-black/40 flex items-center justify-center">
                {avatar?.includes("http") ? (
                  <img src={avatar} alt={username} className="w-full h-full object-cover" />
                ) : (
                  <UserAvatar avatar={avatar || "zap"} color="#6366F1" size="lg" className="!rounded-2xl !w-full !h-full" />
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-gradient-to-br from-rose-500 to-rose-700 border-2 border-[#12131A] text-white shadow-lg backdrop-blur-xs">
                <MicOff size={12} />
              </div>
            </div>

            {/* User Details */}
            <div className="flex flex-col items-center gap-1 z-10">
              <span className="font-extrabold text-sm sm:text-base text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] tracking-tight">
                {username}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-black/40 border border-white/10 text-[10px] text-rose-300 font-medium backdrop-blur-md shadow-xs">
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

        {/* Preset Colors Grid (6 columns desktop, 4 columns tablet, 2 columns mobile) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {PRESET_COLORS.map((preset) => {
            const isSelected = selectedColor === preset.hex;
            const isGradient = preset.hex.includes("gradient");

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelectedColor(preset.hex)}
                style={isGradient ? { background: preset.hex } : { backgroundColor: preset.hex }}
                className={`h-11 rounded-xl flex items-center justify-center px-2 text-xs font-bold text-white shadow-md transition-all relative overflow-hidden cursor-pointer ${
                  isSelected
                    ? "ring-2 ring-cyan-400 border-2 border-cyan-400 scale-[1.03] shadow-[0_0_18px_rgba(34,211,238,0.45)] z-10"
                    : "hover:scale-[1.02] hover:opacity-90 border border-white/15"
                }`}
              >
                <span className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] text-center truncate w-full px-1">
                  {preset.name}
                </span>
                {isSelected && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-cyan-400 border border-black/40 shadow-md animate-pulse" />
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
