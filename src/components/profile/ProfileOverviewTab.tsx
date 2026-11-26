"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Check,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Mic,
  MicOff,
  Palette,
  Radio,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { getCardThemeStyle } from "@/lib/card-themes";
import {
  ProfileRecord,
  VOICE_INTEREST_OPTIONS,
  VIBE_PRESETS,
  isImageAvatarUrl,
} from "@/lib/profile-constants";

interface ProfileOverviewTabProps {
  profile: ProfileRecord;
  isOwner: boolean;
  isRegisteredOwner: boolean;
  isOnline: boolean;
  showOnline: boolean;
  onToggleShowOnline: (val: boolean) => Promise<void> | void;
  onSaveVoiceIdentity: (updates: { interests: string[]; vibeStatus: string }) => Promise<boolean>;
  onSwitchTab: (tab: "profile" | "theme" | "security") => void;
  onLogout: () => void;
  onOpenDeleteModal: () => void;
}

export function ProfileOverviewTab({
  profile,
  isOwner,
  isRegisteredOwner,
  isOnline,
  showOnline,
  onToggleShowOnline,
  onSaveVoiceIdentity,
  onSwitchTab,
  onLogout,
  onOpenDeleteModal,
}: ProfileOverviewTabProps) {
  const savedInterestsKey = Array.isArray(profile.social_links?.interests)
    ? profile.social_links.interests.join(",")
    : "";
  const savedInterests = useMemo(
    () => (savedInterestsKey ? savedInterestsKey.split(",") : []),
    [savedInterestsKey]
  );
  const savedVibe = profile.social_links?.vibe_status || "";

  const [isEditingIdentity, setIsEditingIdentity] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(savedInterests);
  const [vibeInput, setVibeInput] = useState(savedVibe);
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);
  const [isPreviewSpeaking, setIsPreviewSpeaking] = useState(true);

  useEffect(() => {
    if (!isEditingIdentity) {
      setSelectedInterests(savedInterests);
      setVibeInput(savedVibe);
    }
  }, [savedInterests, savedVibe, isEditingIdentity]);

  const toggleInterest = (id: string) => {
    setSelectedInterests((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  const handleSaveIdentity = async () => {
    setIsSavingIdentity(true);
    const ok = await onSaveVoiceIdentity({
      interests: selectedInterests,
      vibeStatus: vibeInput.trim(),
    });
    setIsSavingIdentity(false);
    if (ok) {
      setIsEditingIdentity(false);
    }
  };

  const cardColor = profile.card_bg_color || profile.social_links?.card_bg_color || "#465B73";
  const themeStyle = getCardThemeStyle(cardColor);
  const hasRecoveryCode = Boolean(profile.recovery_code || profile.social_links?.recovery_code);
  const isProfileGuest = Boolean(profile.isGuestProfile || profile.id?.startsWith("guest_"));

  // Compute lightweight profile completeness for owner
  const checklist = [
    Boolean(isImageAvatarUrl(profile.avatar) || (profile.avatar && profile.avatar !== "zap")),
    Boolean(profile.bio && profile.bio.trim().length > 0),
    savedInterests.length > 0,
    cardColor !== "#465B73",
    ...(isRegisteredOwner ? [hasRecoveryCode] : []),
  ];
  const completedCount = checklist.filter(Boolean).length;
  const completenessPercent = Math.round((completedCount / checklist.length) * 100);

  return (
    <div className="space-y-6">
      {/* 1. Voice Identity, Topics & Vibe Card */}
      <div className="bg-[#12131A]/90 border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-7 shadow-2xl backdrop-blur-xl space-y-5">
        <div className="flex items-center justify-between pb-4 border-b border-white/10 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shadow-inner shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                Voice Identity &amp; Topics
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                {isOwner
                  ? "Let rooms know your favorite topics and current vibe"
                  : `What @${profile.username} likes to talk about`}
              </p>
            </div>
          </div>

          {isOwner && !isEditingIdentity && (
            <button
              type="button"
              onClick={() => setIsEditingIdentity(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-white transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <Edit3 size={13} className="text-indigo-400" />
              <span>Customize</span>
            </button>
          )}
        </div>

        {isEditingIdentity && isOwner ? (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Vibe Status Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Current Vibe Status
                </label>
                <span className="text-[10px] font-mono text-slate-500">{vibeInput.length}/48</span>
              </div>
              <input
                type="text"
                value={vibeInput}
                onChange={(e) => setVibeInput(e.target.value)}
                maxLength={48}
                placeholder="e.g. Down to yap or listening to lo-fi..."
                className="w-full px-3.5 py-2.5 bg-black/50 border border-white/10 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <div className="flex flex-wrap gap-1.5">
                {VIBE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setVibeInput(preset)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all cursor-pointer ${
                      vibeInput === preset
                        ? "bg-indigo-600/25 border-indigo-400 text-indigo-200"
                        : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Topic Chips Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Favorite Room Topics
                </label>
                <span className="text-[11px] text-slate-400">{selectedInterests.length}/5 selected</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {VOICE_INTEREST_OPTIONS.map((topic) => {
                  const active = selectedInterests.includes(topic.id);
                  const disabled = !active && selectedInterests.length >= 5;
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleInterest(topic.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all ${
                        active
                          ? "bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/25 cursor-pointer"
                          : disabled
                          ? "bg-black/30 border-white/5 text-slate-600 cursor-not-allowed"
                          : "bg-black/40 border-white/10 text-slate-300 hover:border-white/25 hover:text-white cursor-pointer"
                      }`}
                    >
                      <span>{topic.emoji}</span>
                      <span>{topic.label}</span>
                      {active && <Check size={12} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setIsEditingIdentity(false);
                  setSelectedInterests(savedInterests);
                  setVibeInput(savedVibe);
                }}
                disabled={isSavingIdentity}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveIdentity}
                disabled={isSavingIdentity}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-60"
              >
                {isSavingIdentity ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                <span>Save Voice Identity</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Vibe Display */}
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Radio size={15} className="text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Current Vibe
                  </div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-200 truncate">
                    {savedVibe || (
                      <span className="text-slate-500 italic">No vibe status set</span>
                    )}
                  </div>
                </div>
              </div>
              <span
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border shrink-0 flex items-center gap-1.5 ${
                  isOnline
                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                    : "bg-white/5 border-white/10 text-slate-400"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isOnline ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                  }`}
                />
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>

            {/* Interests Display */}
            {savedInterests.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {savedInterests.map((interestId) => {
                  const topic = VOICE_INTEREST_OPTIONS.find((t) => t.id === interestId);
                  if (!topic) return null;
                  return (
                    <span
                      key={topic.id}
                      className="px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <span>{topic.emoji}</span>
                      <span>{topic.label}</span>
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-black/30 border border-dashed border-white/10 text-center">
                <p className="text-xs text-slate-400">
                  {isOwner
                    ? "No voice topics selected yet. Click Customize to add what you enjoy!"
                    : `@${profile.username} hasn't added voice topics yet.`}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Interactive Seat Card Preview */}
      <div className="bg-[#12131A]/90 border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-7 shadow-2xl backdrop-blur-xl space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <Palette size={17} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">Voice Room Seat Preview</h3>
              <p className="text-[11px] text-slate-400">How this card appears inside live rooms</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPreviewSpeaking((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border flex items-center gap-1.5 transition-all cursor-pointer ${
                isPreviewSpeaking
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
              }`}
            >
              {isPreviewSpeaking ? <Mic size={12} /> : <MicOff size={12} />}
              <span>{isPreviewSpeaking ? "Speaking" : "Muted"}</span>
            </button>

            {isOwner && (
              <button
                type="button"
                onClick={() => onSwitchTab("theme")}
                className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-xs text-indigo-300 font-semibold cursor-pointer transition-colors"
              >
                Customize →
              </button>
            )}
          </div>
        </div>

        <div
          style={themeStyle}
          className="p-4 sm:p-5 rounded-2xl border flex items-center justify-between gap-4 text-white shadow-xl transition-all border-white/10 relative overflow-hidden"
        >
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
          <div className="flex items-center gap-3.5 z-10 min-w-0">
            <div
              className={`w-12 h-12 rounded-2xl overflow-hidden bg-black/40 shrink-0 transition-all ${
                isPreviewSpeaking ? "speaking-ring" : "ring-1 ring-white/20"
              }`}
            >
              {isImageAvatarUrl(profile.avatar) ? (
                <img
                  src={profile.avatar}
                  alt={profile.display_name || profile.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserAvatar
                  avatar={profile.avatar || "sparkles"}
                  color="#6366F1"
                  size="md"
                  isSpeaking={isPreviewSpeaking}
                  className="!rounded-2xl !w-full !h-full"
                />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate">
                {profile.display_name || profile.username}
              </div>
              <div className="text-[11px] text-slate-300/80 font-medium truncate">
                @{profile.username}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 z-10 shrink-0">
            {isPreviewSpeaking ? (
              <div className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-emerald-300 text-[10px] font-bold flex items-center gap-1.5">
                <span className="flex items-end gap-0.5 h-3">
                  <span className="w-0.5 bg-emerald-400 rounded-full soundwave-bar-1" />
                  <span className="w-0.5 bg-emerald-400 rounded-full soundwave-bar-2" />
                  <span className="w-0.5 bg-emerald-400 rounded-full soundwave-bar-3" />
                </span>
                <span>LIVE</span>
              </div>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-black/40 border border-white/10 text-slate-300 text-[10px] font-mono flex items-center gap-1">
                <MicOff size={10} className="text-rose-400" />
                <span>MUTED</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Owner Controls: Presence Privacy, Profile Readiness & Account Management */}
      {isOwner ? (
        <div className="bg-[#12131A]/90 border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-7 shadow-2xl backdrop-blur-xl space-y-5">
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-indigo-400 flex items-center justify-center">
                <User size={17} />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">Dashboard &amp; Controls</h3>
                <p className="text-[11px] text-slate-400">
                  {!isProfileGuest ? "Registered Member" : "Anonymous Guest"} · Profile {completenessPercent}% complete
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-24 h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${completenessPercent}%` }}
                />
              </div>
              <span className="text-[11px] font-mono text-slate-300">{completenessPercent}%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Online Presence Toggle */}
            {isRegisteredOwner && (
              <button
                type="button"
                onClick={() => onToggleShowOnline(!showOnline)}
                className="p-3.5 rounded-2xl bg-black/40 hover:bg-black/55 border border-white/10 flex items-center justify-between gap-3 transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {showOnline ? (
                    <Eye size={16} className="text-emerald-400 shrink-0" />
                  ) : (
                    <EyeOff size={16} className="text-slate-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">Online Status</div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {showOnline ? "Visible to friends" : "Hidden (Appear Offline)"}
                    </div>
                  </div>
                </div>
                <span
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
                    showOnline ? "bg-emerald-500" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      showOnline ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </span>
              </button>
            )}

            {/* Security / Recovery Code Shortcut */}
            {isRegisteredOwner && (
              <button
                type="button"
                onClick={() => onSwitchTab("security")}
                className="p-3.5 rounded-2xl bg-black/40 hover:bg-black/55 border border-white/10 flex items-center justify-between gap-3 transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {hasRecoveryCode ? (
                    <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                  ) : (
                    <KeyRound size={16} className="text-amber-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">Recovery Code</div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {hasRecoveryCode ? "Backup code active" : "Not generated yet"}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-indigo-400 shrink-0">
                  Manage →
                </span>
              </button>
            )}
          </div>

          {/* Account Management Actions */}
          <div className="pt-2 border-t border-white/10 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Account Management
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 hover:text-white font-semibold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                <LogOut size={16} />
                <span>Log Out of Account</span>
              </button>
              <button
                type="button"
                onClick={onOpenDeleteModal}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 font-semibold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                <Trash2 size={16} />
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
