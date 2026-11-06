"use client";

import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Music,
  Radio,
  Search,
  Sparkles,
  Disc3,
  Headphones,
  Lock,
  Coffee,
  CloudRain,
  Gamepad2,
  ExternalLink,
  UserCheck,
  Check,
  ArrowRight,
  Play,
  Volume2,
} from "lucide-react";
import { CuratedStation, MusicTrack, RoomMusicState } from "@/lib/music-types";
import { CURATED_STATIONS, extractYouTubeId } from "@/lib/curated-stations";
import { JunctionParticipant } from "@/lib/types";
import { UserAvatar } from "@/components/ui/UserAvatar";

const ICON_MAP: Record<string, React.ElementType> = {
  Coffee,
  Radio,
  Music,
  CloudRain,
  Gamepad2,
};

interface MusicModalProps {
  isOpen: boolean;
  onClose: () => void;
  musicState: RoomMusicState;
  participants: JunctionParticipant[];
  currentIdentity: string;
  currentName: string;
  canModerateAux?: boolean;
  onClaimAux: () => void;
  onReleaseAux: () => void;
  onPassAux: (targetIdentity: string, targetName: string) => void;
  onSelectTrack: (track: MusicTrack) => void;
  onStopMusic: () => void;
}

export function MusicModal({
  isOpen,
  onClose,
  musicState,
  participants,
  currentIdentity,
  currentName,
  canModerateAux = false,
  onClaimAux,
  onReleaseAux,
  onPassAux,
  onSelectTrack,
  onStopMusic,
}: MusicModalProps) {
  const [activeTab, setActiveTab] = useState<"stations" | "youtube" | "pass_aux">("stations");
  const [customUrl, setCustomUrl] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  const isAuxHolder =
    Boolean(musicState.auxHolderIdentity) &&
    musicState.auxHolderIdentity?.toLowerCase().trim() === currentIdentity.toLowerCase().trim();

  // Verify if the AUX holder is currently present in this room
  const isHolderInRoom = useMemo(() => {
    if (!musicState.auxHolderIdentity && !musicState.auxHolderName) return false;
    if (isAuxHolder) return true;
    const cleanHolderId = (musicState.auxHolderIdentity || "").toLowerCase().trim();
    const cleanHolderName = (musicState.auxHolderName || "").toLowerCase().trim();

    return participants.some((p) => {
      const pIdent = (p.identity || "").toLowerCase().trim();
      const pId = (p.id || "").toLowerCase().trim();
      const pName = (p.name || p.displayName || "").toLowerCase().trim();
      return (
        (cleanHolderId && (pIdent === cleanHolderId || pId === cleanHolderId)) ||
        (cleanHolderName && (pName === cleanHolderName || pIdent === cleanHolderName))
      );
    });
  }, [musicState.auxHolderIdentity, musicState.auxHolderName, isAuxHolder, participants]);

  // If nobody holds the AUX or the person who claimed it is no longer in the room, the AUX is free!
  const isAuxFree = !musicState.auxHolderIdentity || !isHolderInRoom;
  // When AUX is free, or held by self, or user has moderator permissions, music can be controlled.
  const canControlMusic = isAuxFree || isAuxHolder || Boolean(canModerateAux);

  // Filter other participants for passing the AUX
  const otherParticipants = participants.filter(
    (p) =>
      p.identity &&
      p.identity.toLowerCase().trim() !== currentIdentity.toLowerCase().trim()
  );

  const handleSelectStation = (station: CuratedStation) => {
    if (!canControlMusic) return;

    if (isAuxFree) {
      onClaimAux();
    }
    onSelectTrack(station.track);
    onClose();
  };

  const handleAddYouTube = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canControlMusic) return;

    setInputError(null);

    const videoId = extractYouTubeId(customUrl);
    if (!videoId) {
      setInputError("Please enter a valid YouTube video or stream link");
      return;
    }

    if (isAuxFree) {
      onClaimAux();
    }

    const title =
      customTitle.trim() ||
      `YouTube Media (${videoId.substring(0, 6)}...)`;

    const newTrack: MusicTrack = {
      id: videoId,
      source: "youtube",
      url: customUrl.trim(),
      title,
      artist: `Queued by ${currentName}`,
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      isLive: false,
    };

    onSelectTrack(newTrack);
    setCustomUrl("");
    setCustomTitle("");
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.98 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full sm:max-w-lg bg-[#0E1017] border border-white/10 rounded-t-[2rem] sm:rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col max-h-[88vh] pb-3 sm:pb-0"
        >
          {/* Mobile Grab Handle Indicator */}
          <div className="sm:hidden w-12 h-1 rounded-full bg-white/20 mx-auto mt-2.5 mb-1" />

          {/* Header */}
          <div className="px-4 sm:px-5 py-3 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Headphones size={17} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Music & Media
                </h3>
                <p className="text-[11px] text-slate-400">
                  Direct stereo streaming • Synced for room
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* AUX Cord Status Strip */}
          <div className="px-4 sm:px-5 py-2 bg-indigo-950/25 border-b border-indigo-500/20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm shrink-0">🔌</span>
              <div className="text-xs truncate">
                {isAuxFree ? (
                  <span className="text-emerald-400 font-medium">
                    AUX is free — pick a track to play!
                  </span>
                ) : isAuxHolder ? (
                  <span className="text-indigo-300 font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    You hold the AUX Cord — DJ Mode
                  </span>
                ) : (
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <Lock size={12} className="text-amber-400 shrink-0" />
                    AUX held by <span className="text-amber-300 font-semibold">{musicState.auxHolderName || "Room"}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isAuxFree ? (
                <button
                  onClick={onClaimAux}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold transition-all active:scale-95 flex items-center gap-1"
                >
                  <Sparkles size={11} />
                  Grab AUX
                </button>
              ) : isAuxHolder ? (
                <>
                  <button
                    onClick={() => setActiveTab("pass_aux")}
                    className="px-2 py-0.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-[10px] font-semibold transition-all"
                  >
                    Pass
                  </button>
                  <button
                    onClick={onReleaseAux}
                    className="px-2 py-0.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[10px] font-semibold transition-all"
                  >
                    Drop
                  </button>
                </>
              ) : canModerateAux ? (
                <button
                  onClick={onClaimAux}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[11px] font-semibold transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                  title="Moderator Override: Take AUX cord"
                >
                  <Sparkles size={11} />
                  Take AUX
                </button>
              ) : (
                <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-semibold flex items-center gap-1">
                  <Lock size={10} />
                  Locked
                </span>
              )}
            </div>
          </div>

          {/* Segmented Tab Controls */}
          <div className="flex items-center gap-1.5 p-1 bg-white/[0.02] border-b border-white/5 px-4 sm:px-5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab("stations")}
              className={`py-1.5 px-3 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === "stations"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Radio size={13} />
              Stations
            </button>

            <button
              onClick={() => setActiveTab("youtube")}
              className={`py-1.5 px-3 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === "youtube"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <ExternalLink size={13} />
              YouTube Link
            </button>

            {isAuxHolder && (
              <button
                onClick={() => setActiveTab("pass_aux")}
                className={`py-1.5 px-3 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  activeTab === "pass_aux"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <UserCheck size={13} />
                Pass AUX ({otherParticipants.length})
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div className="p-3.5 sm:p-5 overflow-y-auto space-y-3 min-h-[220px]">
            {/* 1. Curated Stations Tab */}
            {activeTab === "stations" && (
              <div className="space-y-1.5">
                {!canControlMusic && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2 text-[11px] text-amber-300 mb-2">
                    <Lock size={13} className="shrink-0 text-amber-400" />
                    <span>
                      <strong className="text-white">{musicState.auxHolderName || "Participant"}</strong> holds the AUX cord. Only they can change stations.
                    </span>
                  </div>
                )}

                {CURATED_STATIONS.map((station) => {
                  const IconComp = ICON_MAP[station.icon] || Radio;
                  const isSelected = musicState.currentTrack?.id === station.track.id;

                  return (
                    <div
                      key={station.id}
                      onClick={() => {
                        if (canControlMusic) {
                          handleSelectStation(station);
                        }
                      }}
                      className={`p-2.5 sm:p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        !canControlMusic
                          ? "opacity-55 cursor-not-allowed bg-white/[0.01] border-white/5"
                          : isSelected
                            ? "bg-indigo-600/20 border-indigo-500/60 shadow-[0_0_15px_rgba(99,102,241,0.2)] cursor-pointer group"
                            : "bg-white/[0.02] hover:bg-white/[0.06] border-white/5 hover:border-white/10 cursor-pointer group"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 border"
                          style={{
                            backgroundColor: `${station.accentColor}18`,
                            borderColor: `${station.accentColor}35`,
                            color: station.accentColor,
                          }}
                        >
                          <IconComp size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs sm:text-sm font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                              {station.name}
                            </h4>
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-semibold border shrink-0"
                              style={{
                                backgroundColor: `${station.accentColor}12`,
                                borderColor: `${station.accentColor}30`,
                                color: station.accentColor,
                              }}
                            >
                              {station.category}
                            </span>
                          </div>
                          <p className="text-[10px] sm:text-[11px] text-slate-400 truncate mt-0.5 font-light">
                            {station.description}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isSelected ? (
                          <span className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                            Playing
                          </span>
                        ) : !canControlMusic ? (
                          <div className="w-8 h-8 rounded-full bg-white/5 text-slate-500 flex items-center justify-center">
                            <Lock size={12} />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-white/5 group-hover:bg-indigo-600 text-slate-400 group-hover:text-white flex items-center justify-center transition-all">
                            <Play size={13} className="ml-0.5" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 2. YouTube Search / URL Tab */}
            {activeTab === "youtube" && (
              <form onSubmit={handleAddYouTube} className="space-y-3">
                {!canControlMusic && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2 text-[11px] text-amber-300 mb-2">
                    <Lock size={13} className="shrink-0 text-amber-400" />
                    <span>
                      <strong className="text-white">{musicState.auxHolderName || "Participant"}</strong> holds the AUX cord. Only they can play YouTube videos.
                    </span>
                  </div>
                )}

                <div className="text-[11px] text-slate-400">
                  Paste any YouTube music video, stream, or song URL:
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-slate-300 uppercase tracking-wider">
                    YouTube URL
                  </label>
                  <input
                    type="text"
                    value={customUrl}
                    onChange={(e) => {
                      setCustomUrl(e.target.value);
                      if (inputError) setInputError(null);
                    }}
                    disabled={!canControlMusic}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                  {inputError && (
                    <p className="text-[10px] text-rose-400 mt-1">{inputError}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-slate-300 uppercase tracking-wider">
                    Custom Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    disabled={!canControlMusic}
                    placeholder="e.g. My Favorite Chill Song"
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canControlMusic || !customUrl.trim()}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs transition-all shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
                >
                  {!canControlMusic ? (
                    <>
                      <Lock size={14} />
                      AUX Locked to {musicState.auxHolderName || "DJ"}
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      Play in Room
                    </>
                  )}
                </button>
              </form>
            )}

            {/* 3. Pass AUX Tab */}
            {activeTab === "pass_aux" && isAuxHolder && (
              <div className="space-y-2">
                <div className="text-[11px] text-slate-400">
                  Select a participant to hand over the room AUX cord:
                </div>

                {otherParticipants.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No other participants currently in the room to pass to.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                    {otherParticipants.map((p) => (
                      <div
                        key={p.identity}
                        className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 flex items-center justify-between group transition-all gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <UserAvatar
                            avatar={p.avatar}
                            color={p.color}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-white truncate">
                              {p.name}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              @{p.username || p.identity}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            onPassAux(p.identity, p.name);
                            onClose();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 text-[11px] font-semibold transition-all active:scale-95 flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          Pass
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer controls if music is active */}
          {musicState.isActive && (
            <div className="px-4 sm:px-5 py-2.5 border-t border-white/5 bg-white/[0.01] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-xs text-slate-300 truncate font-medium">
                  {musicState.currentTrack?.title || "Playing Audio"}
                </span>
              </div>

              {(isAuxHolder || isAuxFree || canModerateAux) && (
                <button
                  onClick={() => {
                    onStopMusic();
                    onClose();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] font-semibold transition-all shrink-0 active:scale-95 cursor-pointer"
                >
                  Stop Music
                </button>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
