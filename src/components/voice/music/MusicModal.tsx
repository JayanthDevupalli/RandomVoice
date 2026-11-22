"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Headphones,
  Search,
  Loader2,
  ExternalLink,
  ListMusic,
  Plus,
  Play,
  Trash2,
  Sparkles,
  AlertCircle,
  ArrowLeft,
  Disc3,
  Check,
  Square,
  Clock,
} from "lucide-react";
import { MusicTrack, RoomMusicState, QueuedTrack, extractYouTubeId } from "@/lib/music-types";
import { JunctionParticipant } from "@/lib/types";

export interface MusicModalProps {
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
  onAddToQueue: (track: MusicTrack) => void;
  onRemoveFromQueue: (queueId: string) => void;
  onPlayQueuedTrack: (queueId: string) => void;
  initialTab?: "youtube" | "queue" | "pass_dj";
}

const QUICK_SEARCH_TAGS = [
  "Chill Lofi",
  "Synthwave",
  "Top Hits",
  "Acoustic Pop",
  "Piano Chill",
  "Gaming OST",
];

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
  onAddToQueue,
  onRemoveFromQueue,
  onPlayQueuedTrack,
  initialTab = "youtube",
}: MusicModalProps) {
  const [activeTab, setActiveTab] = useState<"youtube" | "queue" | "pass_dj">(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [searchResults, setSearchResults] = useState<MusicTrack[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const isDJ =
    Boolean(musicState.auxHolderIdentity) &&
    musicState.auxHolderIdentity?.toLowerCase().trim() === currentIdentity.toLowerCase().trim();

  // Verify if the active DJ is currently present in this room
  const isHolderInRoom = useMemo(() => {
    if (!musicState.auxHolderIdentity && !musicState.auxHolderName) return false;
    if (isDJ) return true;
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
  }, [musicState.auxHolderIdentity, musicState.auxHolderName, isDJ, participants]);

  // If nobody holds DJ or the person who claimed it is no longer in the room, DJ control is open!
  const isDJFree = !musicState.auxHolderIdentity || !isHolderInRoom;
  const canControlMusic = isDJ || isDJFree || canModerateAux;

  // Filter other participants for passing DJ
  const otherParticipants = participants.filter(
    (p) =>
      p.identity &&
      p.identity.toLowerCase().trim() !== currentIdentity.toLowerCase().trim()
  );

  const queue: QueuedTrack[] = musicState.queue || [];
  const userQueuedSongs = queue.filter(
    (q) => q.addedByIdentity?.toLowerCase().trim() === currentIdentity.toLowerCase().trim()
  );
  const userQueuedCount = userQueuedSongs.length;
  // Non-DJ users are restricted to maximum 2 songs in queue at a time
  const isQueueLimitReached = !isDJ && userQueuedCount >= 2;

  const detectedVideoId = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return extractYouTubeId(searchQuery.trim());
  }, [searchQuery]);

  const performSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    if (extractYouTubeId(trimmed)) {
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        throw new Error(`Search failed with status ${res.status}`);
      }
      const data = await res.json();
      setSearchResults(data.results || []);
      setHasSearched(true);
    } catch (err: any) {
      console.error("Music search error:", err);
      setSearchError("Failed to search. You can also paste a direct YouTube video URL.");
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleQueryChange = (val: string) => {
    setSearchQuery(val);
    setInputError(null);
    setSearchError(null);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const trimmed = val.trim();
    if (trimmed.length >= 2 && !extractYouTubeId(trimmed)) {
      searchDebounceRef.current = setTimeout(() => {
        performSearch(trimmed);
      }, 450);
    } else if (!trimmed) {
      setSearchResults([]);
      setHasSearched(false);
    }
  };

  const handleSelectQuickTag = (tag: string) => {
    setSearchQuery(tag);
    performSearch(tag);
  };

  const handlePlayTrack = (track: MusicTrack) => {
    if (!isDJ && isDJFree) {
      onClaimAux();
    }
    onSelectTrack(track);
    setToastMessage(`Now playing: ${track.title}`);
    setTimeout(() => setToastMessage(null), 3000);
    onClose();
  };

  const handleQueueTrack = (track: MusicTrack) => {
    if (isQueueLimitReached) {
      setInputError("Queue limit reached! You can have at most 2 songs in the queue at a time.");
      return;
    }
    onAddToQueue(track);
    setToastMessage(`Added "${track.title}" to queue!`);
    setTimeout(() => setToastMessage(null), 3000);
    setActiveTab("queue");
  };

  const handlePlayDirect = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setInputError(null);

    const videoId = detectedVideoId || extractYouTubeId(searchQuery);
    if (!videoId) {
      setInputError("Please enter a valid YouTube video or song link");
      return;
    }

    if (!isDJ && isDJFree) {
      onClaimAux();
    }

    const title = customTitle.trim() || `YouTube Track (${videoId.substring(0, 6)}...)`;
    const newTrack: MusicTrack = {
      id: videoId,
      source: "youtube",
      url: searchQuery.trim(),
      title,
      artist: `Started by ${currentName}`,
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      isLive: false,
    };

    onSelectTrack(newTrack);
    setSearchQuery("");
    setCustomTitle("");
    onClose();
  };

  const handleQueueDirect = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setInputError(null);

    const videoId = detectedVideoId || extractYouTubeId(searchQuery);
    if (!videoId) {
      setInputError("Please enter a valid YouTube video or song link");
      return;
    }

    if (isQueueLimitReached) {
      setInputError("Queue limit reached! You can have at most 2 songs in the queue at a time.");
      return;
    }

    const title = customTitle.trim() || `YouTube Track (${videoId.substring(0, 6)}...)`;
    const newTrack: MusicTrack = {
      id: videoId,
      source: "youtube",
      url: searchQuery.trim(),
      title,
      artist: `Requested by ${currentName}`,
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      isLive: false,
    };

    onAddToQueue(newTrack);
    setSearchQuery("");
    setCustomTitle("");
    setToastMessage("Added to queue!");
    setTimeout(() => setToastMessage(null), 3000);
    setActiveTab("queue");
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
          className="relative w-full sm:max-w-xl bg-[#0E1017] border border-white/10 rounded-t-[2rem] sm:rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col max-h-[90vh] pb-3 sm:pb-0"
        >
          {/* Mobile Drag Indicator */}
          <div className="sm:hidden w-12 h-1 rounded-full bg-white/20 mx-auto mt-2.5 mb-1" />

          {/* Header */}
          <div className="px-4 sm:px-5 py-3 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Headphones size={17} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Music & Media Player
                </h3>
                <p className="text-[11px] text-slate-400">
                  Synchronized room audio & video
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

          {/* Toast Notice */}
          {toastMessage && (
            <div className="px-4 py-2 bg-emerald-500/20 border-b border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <Check size={14} className="text-emerald-400" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* DJ Status Banner */}
          <div className="px-4 sm:px-5 py-2.5 bg-indigo-950/20 border-b border-indigo-500/20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm shrink-0">🎧</span>
              <div className="text-xs truncate">
                {isDJFree ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    DJ is free — anyone can play or queue music
                  </span>
                ) : isDJ ? (
                  <span className="text-indigo-300 font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    You are the DJ 🎧
                  </span>
                ) : (
                  <span className="text-slate-300 flex items-center gap-1.5">
                    DJ: <strong className="text-white font-semibold">{musicState.auxHolderName || "Room"}</strong>
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isDJFree ? (
                <button
                  type="button"
                  onClick={onClaimAux}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] transition-all active:scale-95 flex items-center gap-1 cursor-pointer shadow-xs shadow-emerald-500/20"
                >
                  <Sparkles size={11} />
                  Become DJ
                </button>
              ) : isDJ ? (
                <>
                  {otherParticipants.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab(activeTab === "pass_dj" ? "youtube" : "pass_dj")}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer border ${
                        activeTab === "pass_dj"
                          ? "bg-indigo-600 text-white border-indigo-400"
                          : "bg-indigo-500/20 hover:bg-indigo-500/30 border-indigo-500/40 text-indigo-300"
                      }`}
                    >
                      Pass DJ
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onReleaseAux}
                    className="px-2 py-0.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[10px] font-semibold transition-all cursor-pointer"
                  >
                    Step Down
                  </button>
                </>
              ) : canModerateAux ? (
                <button
                  type="button"
                  onClick={onClaimAux}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[11px] font-semibold transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                  title="Moderator Takeover"
                >
                  Take DJ
                </button>
              ) : null}

              {/* End Music Player Button */}
              {musicState.isActive && (isDJ || canModerateAux || isDJFree) && (
                <button
                  type="button"
                  onClick={() => {
                    onStopMusic();
                    onClose();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 hover:text-white text-[11px] font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs ml-1"
                  title="Turn off the music player for everyone"
                >
                  <Square size={10} className="fill-current text-rose-400" />
                  <span>End Music</span>
                </button>
              )}
            </div>
          </div>

          {/* Segmented Tabs (Search & Add | Queue) */}
          <div className="flex items-center justify-between p-1 bg-white/[0.02] border-b border-white/5 px-4 sm:px-5">
            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveTab("youtube")}
                className={`py-1.5 px-3 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  activeTab === "youtube"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Search size={13} />
                <span>Search & Add</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("queue")}
                className={`py-1.5 px-3 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 relative ${
                  activeTab === "queue"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <ListMusic size={13} />
                <span>Queue</span>
                {queue.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      activeTab === "queue"
                        ? "bg-white text-indigo-700"
                        : "bg-indigo-500/30 text-indigo-300"
                    }`}
                  >
                    {queue.length}
                  </span>
                )}
              </button>
            </div>

            {/* Listener personal queue indicator */}
            {!isDJ && (
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded-md border shrink-0 ${
                  userQueuedCount >= 2
                    ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                    : "bg-white/5 border-white/10 text-slate-400"
                }`}
                title="Non-DJ listeners can keep up to 2 songs in the queue"
              >
                Queue: <strong className="text-white">{userQueuedCount}/2</strong>
              </span>
            )}
          </div>

          {/* Tab Content */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-3 min-h-[280px]">
            {/* 1. Search & Direct YouTube Tab */}
            {activeTab === "youtube" && (
              <div className="space-y-3.5 animate-in fade-in duration-150">
                {/* Search / URL input bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (searchDebounceRef.current) {
                      clearTimeout(searchDebounceRef.current);
                    }
                    if (detectedVideoId) {
                      if (isDJ || isDJFree) {
                        handlePlayDirect(e);
                      } else {
                        handleQueueDirect(e);
                      }
                    } else if (searchQuery.trim().length >= 2) {
                      performSearch(searchQuery.trim());
                    }
                  }}
                  className="space-y-3"
                >
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      {isSearching ? (
                        <Loader2 size={16} className="animate-spin text-indigo-400" />
                      ) : (
                        <Search size={16} />
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="Search songs, artists, or paste YouTube link..."
                      value={searchQuery}
                      onChange={(e) => handleQueryChange(e.target.value)}
                      className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 transition-colors"
                      autoFocus
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                          setSearchResults([]);
                          setHasSearched(false);
                          setInputError(null);
                          setSearchError(null);
                        }}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white cursor-pointer"
                        title="Clear"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Direct YouTube Video Preview Card */}
                  {detectedVideoId && (
                    <div className="space-y-3 animate-in fade-in duration-150">
                      <div className="p-3 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 flex items-center gap-3">
                        <div className="relative w-20 h-14 rounded-lg overflow-hidden bg-black shrink-0 border border-white/10">
                          <img
                            src={`https://img.youtube.com/vi/${detectedVideoId}/hqdefault.jpg`}
                            alt="YouTube Preview"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                            <Play size={16} className="text-white drop-shadow" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">
                            {customTitle.trim() || `YouTube Track (${detectedVideoId.substring(0, 8)})`}
                          </p>
                          <p className="text-[10px] text-emerald-400 mt-0.5">
                            ✓ Direct YouTube Video Detected
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Song Title <span className="text-slate-500 font-normal">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Enter a friendly title for the room..."
                          value={customTitle}
                          onChange={(e) => setCustomTitle(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>

                      {/* Action buttons for Direct Link */}
                      <div className="flex items-center gap-2 pt-1">
                        {(isDJ || isDJFree) && (
                          <button
                            type="button"
                            onClick={handlePlayDirect}
                            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                          >
                            <Play size={14} />
                            <span>Play Now</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleQueueDirect}
                          disabled={isQueueLimitReached}
                          className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 ${
                            isQueueLimitReached
                              ? "bg-amber-500/10 border-amber-500/25 text-amber-300 opacity-60 cursor-not-allowed"
                              : isDJ || isDJFree
                                ? "bg-white/5 hover:bg-white/10 border-white/10 text-white"
                                : "bg-indigo-600 hover:bg-indigo-500 border-indigo-500/40 text-white shadow-md shadow-indigo-600/30"
                          }`}
                        >
                          <Plus size={14} />
                          <span>{isQueueLimitReached ? "Queue Full (2/2)" : "Add to Queue"}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </form>

                {inputError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0 text-rose-400" />
                    <span>{inputError}</span>
                  </div>
                )}

                {searchError && (
                  <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0 text-amber-400" />
                    <span>{searchError}</span>
                  </div>
                )}

                {/* Search Results List (when not in direct URL mode) */}
                {!detectedVideoId && (
                  <div className="space-y-2">
                    {/* Searching Loader Skeletons */}
                    {isSearching && (
                      <div className="space-y-2">
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="p-2.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center gap-3 animate-pulse"
                          >
                            <div className="w-16 h-11 rounded-xl bg-white/10 shrink-0" />
                            <div className="flex-1 space-y-1.5 min-w-0">
                              <div className="h-3 bg-white/10 rounded-md w-3/4" />
                              <div className="h-2.5 bg-white/5 rounded-md w-1/3" />
                            </div>
                            <div className="w-16 h-8 bg-white/10 rounded-xl shrink-0" />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Results Available */}
                    {!isSearching && searchResults.length > 0 && (
                      <div className="space-y-2 max-h-[310px] overflow-y-auto pr-1">
                        <div className="flex items-center justify-between pb-1">
                          <span className="text-[11px] font-semibold text-slate-400">
                            Search Results ({searchResults.length})
                          </span>
                          <span className="text-[10px] text-slate-500">
                            1-click play or queue
                          </span>
                        </div>

                        {searchResults.map((track) => (
                          <div
                            key={track.id}
                            className="p-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 flex items-center justify-between gap-3 transition-colors group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className="relative w-14 h-10 sm:w-16 sm:h-11 rounded-xl overflow-hidden bg-black shrink-0 border border-white/10">
                                <img
                                  src={track.thumbnail || `https://img.youtube.com/vi/${track.id}/hqdefault.jpg`}
                                  alt={track.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                                {track.durationFormatted && (
                                  <span
                                    className={`absolute bottom-1 right-1 px-1 py-0.2 rounded text-[9px] font-mono font-bold leading-none ${
                                      track.isLive ? "bg-rose-600 text-white" : "bg-black/80 text-slate-200"
                                    }`}
                                  >
                                    {track.durationFormatted}
                                  </span>
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <h5 className="text-xs font-bold text-white truncate group-hover:text-indigo-300 transition-colors leading-tight">
                                  {track.title}
                                </h5>
                                <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                  {track.artist || "YouTube Track"}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {(isDJ || isDJFree) && (
                                <button
                                  type="button"
                                  onClick={() => handlePlayTrack(track)}
                                  className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                                  title="Play Now"
                                >
                                  <Play size={12} className="ml-0.5" />
                                  <span>Play</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleQueueTrack(track)}
                                disabled={isQueueLimitReached}
                                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all flex items-center gap-1 active:scale-95 cursor-pointer ${
                                  isQueueLimitReached
                                    ? "bg-white/5 text-slate-500 border-white/5 cursor-not-allowed"
                                    : isDJ || isDJFree
                                      ? "bg-white/5 hover:bg-white/10 text-slate-200 border-white/10"
                                      : "bg-indigo-600 hover:bg-indigo-500 border-indigo-500/40 text-white shadow-sm"
                                }`}
                                title="Add to upcoming songs queue"
                              >
                                <Plus size={12} />
                                <span>{isQueueLimitReached ? "Limit (2/2)" : "Queue"}</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* No Results Empty State */}
                    {!isSearching && hasSearched && searchResults.length === 0 && (
                      <div className="text-center py-8 px-4 bg-white/[0.02] rounded-2xl border border-white/5">
                        <Search size={24} className="mx-auto text-slate-500 mb-2" />
                        <p className="text-xs font-semibold text-slate-300">
                          No songs found for &ldquo;{searchQuery}&rdquo;
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto">
                          Try searching by artist name, or paste a direct YouTube video link.
                        </p>
                      </div>
                    )}

                    {/* Quick Inspiration Tags (when query is empty) */}
                    {!searchQuery && !hasSearched && (
                      <div className="pt-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 mb-2">
                          <Sparkles size={12} className="text-amber-400" />
                          <span>Popular quick searches:</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {QUICK_SEARCH_TAGS.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => handleSelectQuickTag(tag)}
                              className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/40 text-[11px] text-slate-300 hover:text-white transition-all cursor-pointer active:scale-95 flex items-center gap-1"
                            >
                              <Search size={10} className="text-indigo-400" />
                              <span>{tag}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 3. Queue Tab */}
            {activeTab === "queue" && (
              <div className="space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-1 border-b border-white/5">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ListMusic size={14} className="text-indigo-400" />
                    <span>Upcoming Songs ({queue.length})</span>
                  </span>

                  {!isDJ && (
                    <span className="text-[10px] text-slate-400">
                      Your songs: <strong className="text-indigo-300">{userQueuedCount}/2</strong>
                    </span>
                  )}
                </div>

                {queue.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-2.5 shadow-inner">
                      <ListMusic size={22} />
                    </div>
                    <h4 className="text-xs font-bold text-white">Queue is Empty</h4>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                      Search for any song or paste a YouTube link to queue music for the room!
                    </p>
                    <div className="flex items-center gap-2 mt-3.5">
                      <button
                        type="button"
                        onClick={() => setActiveTab("youtube")}
                        className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-indigo-600/30"
                      >
                        <Search size={13} />
                        <span>Search & Add Songs</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-0.5">
                    {queue.map((track, index) => {
                      const isOwner =
                        track.addedByIdentity?.toLowerCase().trim() ===
                        currentIdentity.toLowerCase().trim();

                      return (
                        <div
                          key={track.queueId || `q-${index}`}
                          className="p-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 flex items-center justify-between gap-3 transition-colors group"
                        >
                          {/* Left: Index + Thumbnail + Title */}
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span className="w-5 text-center text-xs font-mono font-bold text-slate-500 shrink-0">
                              #{index + 1}
                            </span>

                            <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-black shrink-0 border border-white/10">
                              {track.thumbnail ? (
                                <img
                                  src={track.thumbnail}
                                  alt={track.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-500">
                                  <Disc3 size={16} />
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <h5 className="text-xs font-bold text-white truncate leading-tight">
                                {track.title}
                              </h5>
                              <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                {isOwner ? (
                                  <span className="text-indigo-300 font-semibold">Added by you</span>
                                ) : (
                                  <span>Added by {track.addedByName || "Guest"}</span>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Right: DJ Play Button & Remove Controls */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Play button: for DJ or anyone when DJ is free */}
                            {(isDJ || isDJFree) && (
                              <button
                                type="button"
                                onClick={() => onPlayQueuedTrack(track.queueId)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-sm active:scale-95"
                                title="Play this song now"
                              >
                                <Play size={12} />
                                <span>Play</span>
                              </button>
                            )}

                            {/* Remove button: DJ can remove any track; users can remove their own */}
                            {(isDJ || isOwner || canModerateAux || isDJFree) && (
                              <button
                                type="button"
                                onClick={() => onRemoveFromQueue(track.queueId)}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/5 hover:border-rose-500/30 transition-all cursor-pointer"
                                title={isOwner ? "Cancel your song" : "Remove from queue"}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 3. Pass DJ Sub-View */}
            {activeTab === "pass_dj" && isDJ && (
              <div className="space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("youtube")}
                    className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <h4 className="text-xs font-bold text-white">
                    Pass DJ Controls to a Friend
                  </h4>
                </div>

                <p className="text-[11px] text-slate-400">
                  Select a participant in this room to hand over DJ control:
                </p>

                <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                  {otherParticipants.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No other participants currently in the room.
                    </div>
                  ) : (
                    otherParticipants.map((p) => (
                      <button
                        key={p.identity || p.id}
                        type="button"
                        onClick={() => {
                          onPassAux(p.identity || p.id, p.name || p.displayName || "Guest");
                          setActiveTab("youtube");
                        }}
                        className="w-full p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 flex items-center justify-between text-left transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span className="text-xs font-bold text-white truncate">
                            {p.name || p.displayName}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold text-indigo-400 group-hover:text-indigo-300">
                          Make DJ →
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
