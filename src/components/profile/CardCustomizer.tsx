"use client";

import { useState } from "react";
import { PRESET_COLORS, getCardThemeStyle } from "@/lib/card-themes";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Crown, MicOff, Check, Palette, Sparkles, Loader2 } from "lucide-react";

interface CardCustomizerProps {
  username: string;
  avatar: string;
  initialColor?: string;
  onSave: (color: string) => Promise<void> | void;
  isSaving?: boolean;
}

export function CardCustomizer({
  username,
  avatar,
  initialColor = "#465B73",
  onSave,
  isSaving = false,
}: CardCustomizerProps) {
  const [selectedColor, setSelectedColor] = useState(initialColor);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [colorCategory, setColorCategory] = useState<"gradient" | "solid">("gradient");

  const cardStyle = getCardThemeStyle(selectedColor);

  const handleSave = async () => {
    await onSave(selectedColor);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const gradientColors = PRESET_COLORS.filter((c) => c.category === "gradient");
  const solidColors = PRESET_COLORS.filter((c) => c.category === "solid");
  const activeColors = colorCategory === "gradient" ? gradientColors : solidColors;

  const isCurrentGradient = selectedColor.includes("gradient") || selectedColor.includes("linear") || selectedColor.includes("radial");
  const matchedPreset = PRESET_COLORS.find((p) => p.hex === selectedColor);

  return (
    <div className="bg-[#12131A]/95 border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden space-y-6 sm:space-y-7">
      {/* Ambient Glow */}
      <div
        className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-20 transition-all duration-500"
        style={{ backgroundColor: isCurrentGradient ? "#6366F1" : selectedColor }}
      />

      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 pb-4 sm:pb-5 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shadow-inner shrink-0">
            <Palette size={18} className="sm:w-5.5 sm:h-5.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-xl font-bold text-white tracking-tight truncate">Voice Card Theme</h2>
            <p className="text-[11px] sm:text-sm text-slate-400 truncate">Personalize seat card background in voice rooms</p>
          </div>
        </div>

        {/* Universal Save Button */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50 shrink-0"
        >
          {isSaving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : savedSuccess ? (
            <Check size={15} className="text-emerald-400" />
          ) : (
            <Sparkles size={15} />
          )}
          <span>{savedSuccess ? "Saved!" : "Save Theme"}</span>
        </button>
      </div>

      {/* Live Seat Card Preview Box */}
      <div className="flex flex-col items-center justify-center p-4 sm:p-8 rounded-2xl bg-black/40 border border-white/5 relative">
        <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 sm:mb-4 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          Live Voice Room Card Preview
        </div>

        <div className="w-full max-w-xs relative">
          {/* Ambient Card Backlight Glow */}
          <div
            className="absolute -inset-2 rounded-[2rem] blur-2xl opacity-40 transition-all duration-300 pointer-events-none"
            style={{ backgroundColor: isCurrentGradient ? "#6366F1" : selectedColor }}
          />

          <div
            style={cardStyle}
            className="relative p-4 sm:p-6 rounded-[1.5rem] border flex flex-col justify-between items-center text-center shadow-2xl transition-all duration-300 min-h-[220px] sm:min-h-[230px] overflow-hidden border-white/20"
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
                <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-amber-500/30 via-amber-400/20 to-amber-500/10 text-amber-300 border border-amber-500/40 shadow-sm backdrop-blur-md text-[9px] font-bold tracking-wider">
                  <Crown size={11} className="fill-amber-400" />
                  <span>HOST</span>
                </span>
                <span className="px-2 py-1 rounded-full bg-indigo-600/40 text-indigo-200 text-[9px] font-extrabold border border-indigo-400/50 backdrop-blur-md shadow-sm">
                  YOU
                </span>
              </div>
            </div>

            {/* Avatar with Mute Overlay */}
            <div className="relative my-2 sm:my-3 rounded-2xl ring-1 ring-white/20 shadow-xl">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-black/40 flex items-center justify-center">
                {avatar?.includes("http") ? (
                  <img src={avatar} alt={username} className="w-full h-full object-cover" />
                ) : (
                  <UserAvatar avatar={avatar || "zap"} color="#6366F1" size="lg" className="!rounded-2xl !w-full !h-full" />
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 p-1 sm:p-1.5 rounded-full bg-gradient-to-br from-rose-500 to-rose-700 border-2 border-[#12131A] text-white shadow-lg">
                <MicOff size={11} className="sm:w-3 sm:h-3" />
              </div>
            </div>

            {/* User Details */}
            <div className="flex flex-col items-center gap-0.5 z-10">
              <span className="font-extrabold text-xs sm:text-base text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] tracking-tight">
                {username}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-black/40 border border-white/10 text-[9px] sm:text-[10px] text-rose-300 font-medium backdrop-blur-md">
                Muted
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Color Section */}
      <div className="space-y-4">
        {/* Category Selector Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300">
            Background Color
          </label>

          <div className="p-1 bg-black/50 border border-white/10 rounded-xl flex items-center gap-1 shadow-inner">
            <button
              type="button"
              onClick={() => setColorCategory("gradient")}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                colorCategory === "gradient"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Luxury Gradients ({gradientColors.length})
            </button>
            <button
              type="button"
              onClick={() => setColorCategory("solid")}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                colorCategory === "solid"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Solid Tones ({solidColors.length})
            </button>
          </div>
        </div>

        {/* Selected Color Status Bar */}
        <div className="flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-black/40 border border-white/10 hover:border-white/20 transition-colors gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <label className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden border border-white/20 shadow-md cursor-pointer shrink-0 block">
              <input
                type="color"
                value={isCurrentGradient ? "#465B73" : selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer scale-150"
              />
              <div
                className="w-full h-full rounded-xl"
                style={isCurrentGradient ? { background: selectedColor } : { backgroundColor: selectedColor }}
              />
            </label>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-white truncate">
                {isCurrentGradient ? (matchedPreset ? matchedPreset.name : "Custom Gradient") : (matchedPreset ? matchedPreset.name : "Custom Solid")}
              </div>
              <div className="text-[11px] font-mono text-slate-400 truncate">
                {isCurrentGradient ? "Theme Gradient Preset" : selectedColor.toUpperCase()}
              </div>
            </div>
          </div>

          {isCurrentGradient ? (
            <span className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[11px] font-semibold shrink-0">
              Preset Theme
            </span>
          ) : (
            <input
              type="text"
              value={selectedColor}
              onChange={(e) => {
                if (e.target.value.startsWith("#") || e.target.value.length <= 7) {
                  setSelectedColor(e.target.value);
                }
              }}
              maxLength={7}
              className="w-22 sm:w-28 px-2 py-1.5 sm:py-2 bg-white/5 border border-white/10 rounded-xl text-xs sm:text-sm font-mono text-center text-white focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all shrink-0"
            />
          )}
        </div>

        {/* Touch-Optimized Category Color Grid */}
        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-2.5">
          {activeColors.map((preset) => {
            const isSelected = selectedColor === preset.hex;
            const isGrad = preset.hex.includes("gradient");

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelectedColor(preset.hex)}
                style={isGrad ? { background: preset.hex } : { backgroundColor: preset.hex }}
                className={`h-11 sm:h-11 rounded-xl flex items-center justify-center px-2 text-[11px] sm:text-xs font-bold text-white shadow-md transition-all relative overflow-hidden cursor-pointer active:scale-95 ${
                  isSelected
                    ? "ring-2 ring-cyan-400 border-2 border-cyan-400 scale-[1.02] shadow-[0_0_16px_rgba(34,211,238,0.45)] z-10"
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

    </div>
  );
}

