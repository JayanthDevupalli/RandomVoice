"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Disc3,
  Headphones,
  Maximize2,
  Minimize2,
  Share2,
  Radio,
  Sparkles,
  UserCheck,
  X,
  ChevronDown,
  ChevronUp,
  Sliders,
  ExternalLink,
  ListMusic,
  Square,
  Plus,
} from "lucide-react";
import { MusicTrack, RoomMusicState } from "@/lib/music-types";
import { JunctionParticipant } from "@/lib/types";
import { extractYouTubeId } from "@/lib/curated-stations";

interface MusicDeckProps {
  musicState: RoomMusicState;
  participants?: JunctionParticipant[];
  currentIdentity: string;
  currentName: string;
  canModerateAux?: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpenMusicModal: (tab?: "youtube" | "queue") => void;
  onTogglePlayback: (isPlaying: boolean, currentSeek: number) => void;
  onSeek: (seekTime: number) => void;
  onReleaseAux: () => void;
  onClaimAux: () => void;
  onStopMusic: () => void;
  onHeartbeatSync?: (liveSeek: number) => void;
  onAutoAdvanceQueue?: () => void;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: any;
  }
}

export function MusicDeck({
  musicState,
  participants = [],
  currentIdentity,
  currentName,
  canModerateAux = false,
  isExpanded,
  onToggleExpand,
  onOpenMusicModal,
  onTogglePlayback,
  onSeek,
  onReleaseAux,
  onClaimAux,
  onStopMusic,
  onHeartbeatSync,
  onAutoAdvanceQueue,
}: MusicDeckProps) {
  // Local volume control (0-100) and mute
  const [localVolume, setLocalVolume] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("yapclub_music_volume");
      return stored ? Number(stored) : 75;
    }
    return 75;
  });
  const [isLocalMuted, setIsLocalMuted] = useState<boolean>(false);
  const [isVolumeSliderOpen, setIsVolumeSliderOpen] = useState(false);

  // YouTube player state
  const playerRef = useRef<any>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const onTogglePlaybackRef = useRef(onTogglePlayback);
  onTogglePlaybackRef.current = onTogglePlayback;
  const onHeartbeatSyncRef = useRef(onHeartbeatSync);
  onHeartbeatSyncRef.current = onHeartbeatSync;
  const onAutoAdvanceQueueRef = useRef(onAutoAdvanceQueue);
  onAutoAdvanceQueueRef.current = onAutoAdvanceQueue;
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const isAuxHolder =
    Boolean(musicState.auxHolderIdentity) &&
    musicState.auxHolderIdentity?.toLowerCase().trim() === currentIdentity.toLowerCase().trim();

  // Verify if the recorded AUX holder is actually present in the room
  const isHolderPresent = useMemo(() => {
    if (!musicState.auxHolderIdentity && !musicState.auxHolderName) return false;
    if (isAuxHolder) return true;
    const cleanHolderId = (musicState.auxHolderIdentity || "").toLowerCase().trim();
    const cleanHolderName = (musicState.auxHolderName || "").toLowerCase().trim();

    return (participants || []).some((p) => {
      const pIdent = (p.identity || "").toLowerCase().trim();
      const pId = (p.id || "").toLowerCase().trim();
      const pName = (p.name || p.displayName || "").toLowerCase().trim();
      return (
        (cleanHolderId && (pIdent === cleanHolderId || pId === cleanHolderId)) ||
        (cleanHolderName && (pName === cleanHolderName || pIdent === cleanHolderName))
      );
    });
  }, [musicState.auxHolderIdentity, musicState.auxHolderName, isAuxHolder, participants]);

  // If nobody holds the AUX or the person who held it left the room, AUX is free
  const isAuxFree = !musicState.auxHolderIdentity || !isHolderPresent;
  // STRICT RULE: Only the person who grabbed the AUX cord can control playback!
  const canControlPlayback = isAuxHolder;

  // Persist volume in local storage
  const handleVolumeChange = (newVol: number) => {
    setLocalVolume(newVol);
    if (isLocalMuted && newVol > 0) setIsLocalMuted(false);
    try {
      localStorage.setItem("yapclub_music_volume", String(newVol));
    } catch {}
  };

  const toggleMute = () => {
    setIsLocalMuted((prev) => !prev);
  };

  // Sync volume to YouTube Player
  useEffect(() => {
    if (playerRef.current && isPlayerReady) {
      try {
        if (typeof playerRef.current.setVolume === "function") {
          playerRef.current.setVolume(isLocalMuted ? 0 : localVolume);
        }
        if (typeof playerRef.current.isMuted === "function") {
          if (isLocalMuted) {
            playerRef.current.mute();
          } else {
            playerRef.current.unMute();
          }
        }
      } catch (e) {}
    }
  }, [localVolume, isLocalMuted, isPlayerReady]);

  // Load YouTube IFrame API script once
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  const videoId = musicState.currentTrack?.id || "";

  // Initialize or update YouTube Player
  useEffect(() => {
    if (!videoId) return;

    let destroyed = false;

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(initPlayer, 200);
        return;
      }

      const container = document.getElementById("yapclub_yt_player_host");
      if (!container || destroyed) return;

      try {
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {}
        }

        playerRef.current = new window.YT.Player("yapclub_yt_player_host", {
          videoId,
          playerVars: {
            autoplay: 1,
            controls: isAuxHolder ? 1 : 0, // only AUX holder has native controls if interactive
            disablekb: isAuxHolder ? 0 : 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              if (destroyed) return;
              setIsPlayerReady(true);
              const target = event.target;
              target.setVolume(isLocalMuted ? 0 : localVolume);
              if (isLocalMuted) target.mute();

              const isLive = Boolean(musicState.currentTrack?.isLive);

              if (isLive) {
                // Live streams: Snap directly to the live broadcast head
                try {
                  const dur = target.getDuration?.() || 0;
                  if (dur > 0) {
                    target.seekTo(dur, true);
                  }
                } catch {}
              } else {
                // Recorded videos/tracks: Calculate expected playback time from room state
                const now = Date.now();
                const elapsed = musicState.isPlaying
                  ? (now - (musicState.lastSyncTime || now)) / 1000
                  : 0;
                const expectedTime = Math.max(0, (musicState.seekTime || 0) + elapsed);
                target.seekTo(expectedTime, true);
              }

              if (musicState.isPlaying) {
                target.playVideo();
              } else {
                target.pauseVideo();
              }

              try {
                setDuration(target.getDuration() || 0);
              } catch {}
            },
            onStateChange: (event: any) => {
              if (!isAuxHolder) return;
              // YT.PlayerState: 0=ENDED, 1=PLAYING, 2=PAUSED
              const state = event.data;
              const target = event.target;
              const currentPos = target?.getCurrentTime?.() || 0;

              if (state === 0) {
                // Track finished! Auto-advance to next song in queue if available
                if (onAutoAdvanceQueueRef.current) {
                  onAutoAdvanceQueueRef.current();
                } else {
                  onTogglePlaybackRef.current(false, 0);
                }
              } else if (state === 1 && !musicState.isPlaying) {
                // AUX holder started playback via YouTube native controls
                onTogglePlaybackRef.current(true, currentPos);
              } else if (state === 2 && musicState.isPlaying) {
                // AUX holder paused playback via YouTube native controls
                onTogglePlaybackRef.current(false, currentPos);
              }
            },
          },
        });
      } catch (err) {
        console.warn("Error initializing YouTube Player:", err);
      }
    };

    initPlayer();

    return () => {
      destroyed = true;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
      }
      setIsPlayerReady(false);
    };
  }, [videoId, isAuxHolder]);

  // Synchronize playback state changes from room
  useEffect(() => {
    if (!playerRef.current || !isPlayerReady) return;

    try {
      if (musicState.isPlaying) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }

      // Only adjust seeking for listeners to keep them locked to the AUX holder
      if (!isAuxHolder && !musicState.currentTrack?.isLive) {
        const now = Date.now();
        const elapsed = musicState.isPlaying
          ? (now - (musicState.lastSyncTime || now)) / 1000
          : 0;
        const expectedTime = Math.max(0, (musicState.seekTime || 0) + elapsed);
        const actualTime = playerRef.current.getCurrentTime?.() || 0;

        // If drift is over 1.2s, gently snap to expectedTime
        if (Math.abs(actualTime - expectedTime) > 1.2) {
          playerRef.current.seekTo(expectedTime, true);
        }
      }
    } catch (e) {}
  }, [musicState.isPlaying, musicState.seekTime, musicState.lastSyncTime, isPlayerReady, isAuxHolder, musicState.currentTrack?.isLive]);

  // Periodic heartbeat broadcast from AUX holder to all peers (every 3 seconds)
  useEffect(() => {
    if (!isAuxHolder || !musicState.isPlaying || !isPlayerReady) return;

    const heartbeatTimer = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
        try {
          const liveSec = playerRef.current.getCurrentTime() || 0;
          onHeartbeatSyncRef.current?.(liveSec);
        } catch {}
      }
    }, 3000);

    return () => clearInterval(heartbeatTimer);
  }, [isAuxHolder, musicState.isPlaying, isPlayerReady]);

  // Track progress ticker & continuous listener drift correction (every 500ms)
  useEffect(() => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

    if (musicState.isPlaying && isPlayerReady) {
      progressIntervalRef.current = setInterval(() => {
        if (!playerRef.current) return;
        try {
          const current = playerRef.current.getCurrentTime?.() || 0;
          const dur = playerRef.current.getDuration?.() || 0;
          setCurrentTime(current);
          if (dur > 0) setDuration(dur);

          // Listeners: Check drift to stay in lock-step
          if (!isAuxHolder) {
            const isLive = Boolean(musicState.currentTrack?.isLive);
            if (isLive) {
              // Live streams: snap if listener falls behind the live edge by > 4s
              if (dur > 0 && dur - current > 4) {
                playerRef.current.seekTo(dur, true);
              }
            } else {
              // Recorded videos: snap if listener drifts by > 1.2s
              const now = Date.now();
              const elapsed = (now - (musicState.lastSyncTime || now)) / 1000;
              const expectedTime = Math.max(0, (musicState.seekTime || 0) + elapsed);
              if (Math.abs(current - expectedTime) > 1.2) {
                playerRef.current.seekTo(expectedTime, true);
              }
            }
          }
        } catch {}
      }, 500);
    }

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [musicState.isPlaying, musicState.lastSyncTime, musicState.seekTime, musicState.currentTrack?.isLive, isPlayerReady, isAuxHolder]);

  const formatSeconds = (sec: number) => {
    if (!sec || isNaN(sec) || sec <= 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSeek = Number(e.target.value);
    setCurrentTime(newSeek);
    if (canControlPlayback) {
      if (playerRef.current?.seekTo) {
        playerRef.current.seekTo(newSeek, true);
      }
      onSeek(newSeek);
    }
  };

  const handleTogglePlay = () => {
    if (!canControlPlayback) return;
    const nextPlay = !musicState.isPlaying;
    const current = playerRef.current?.getCurrentTime() || currentTime;
    onTogglePlayback(nextPlay, current);
  };

  if (!musicState.isActive || !musicState.currentTrack) {
    return null;
  }

  const track = musicState.currentTrack;

  return (
    <div className="w-full transition-all duration-300 relative z-30">
      {/* ─── SINGLE STABLE YOUTUBE PLAYER CONTAINER ─── */}
      {/* Kept permanently mounted in DOM to prevent React removeChild collision with YouTube Iframe API */}
      <div
        className={
          isExpanded
            ? "relative z-30 w-full max-w-4xl mx-auto px-2 sm:px-4 mt-2 sm:mt-4 mb-2.5 sm:mb-3 block"
            : "w-0 h-0 overflow-hidden opacity-0 pointer-events-none absolute -z-50"
        }
      >
        <div className="bg-[#0B0C12]/95 border border-indigo-500/25 rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_12px_45px_rgba(0,0,0,0.7)] backdrop-blur-2xl">
          {/* Expanded Theatre Header — Clean & Uncrowded */}
          <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-white/[0.03] border-b border-white/5 flex items-center justify-between gap-2">
            {/* Left: DJ Status Pill */}
            <div className="flex items-center gap-2 min-w-0">
              {isAuxHolder ? (
                <button
                  type="button"
                  onClick={onReleaseAux}
                  className="px-2.5 py-1 rounded-full bg-indigo-500/20 hover:bg-rose-500/20 border border-indigo-500/35 hover:border-rose-500/40 text-indigo-300 hover:text-rose-300 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0 group/dj"
                  title="You are the DJ — Tap to step down"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span>You (DJ)</span>
                  <X size={12} className="text-indigo-400/70 group-hover/dj:text-rose-300 shrink-0" />
                </button>
              ) : isAuxFree ? (
                <button
                  type="button"
                  onClick={onClaimAux}
                  className="px-2.5 py-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs shrink-0"
                  title="Become DJ to control music"
                >
                  <Sparkles size={12} className="shrink-0 text-emerald-400" />
                  <span>Become DJ</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-slate-300 truncate">
                  <span className="text-slate-500 shrink-0 font-medium">DJ:</span>
                  <span className="text-amber-300 font-semibold truncate max-w-[130px] sm:max-w-none">
                    {musicState.auxHolderName || "Room"}
                  </span>
                </div>
              )}
            </div>

            {/* Right: Personal Volume & Minimize Stage (Only 2 small controls, never overflowing) */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Personal Volume Dropdown */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setIsVolumeSliderOpen(!isVolumeSliderOpen)}
                  className="h-7.5 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-white/5"
                  title="My Music Volume"
                >
                  {isLocalMuted || localVolume === 0 ? (
                    <VolumeX size={13} className="text-rose-400 shrink-0" />
                  ) : (
                    <Volume2 size={13} className="text-indigo-400 shrink-0" />
                  )}
                  <span className="text-[11px] font-mono text-slate-400">{isLocalMuted ? "0%" : `${localVolume}%`}</span>
                </button>

                {isVolumeSliderOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsVolumeSliderOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 z-50 p-3 bg-[#11131C] border border-white/10 rounded-2xl shadow-xl w-48 animate-in fade-in zoom-in-95">
                      <div className="flex items-center justify-between text-[11px] mb-2 text-slate-300">
                        <span>Personal Volume</span>
                        <button
                          type="button"
                          onClick={toggleMute}
                          className="text-[10px] text-indigo-400 hover:underline"
                        >
                          {isLocalMuted ? "Unmute" : "Mute"}
                        </button>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={isLocalMuted ? 0 : localVolume}
                        onChange={(e) => handleVolumeChange(Number(e.target.value))}
                        className="w-full accent-indigo-500 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Minimize Stage */}
              <button
                type="button"
                onClick={onToggleExpand}
                className="w-7.5 h-7.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0 border border-white/5"
                title="Minimize to Audio Bar"
              >
                <Minimize2 size={13} />
              </button>
            </div>
          </div>

          {/* Video Viewport: THE SINGLE PERMANENT HOST DIV */}
          <div className="relative aspect-video w-full bg-black/95 flex items-center justify-center overflow-hidden">
            <div id="yapclub_yt_player_host" className="w-full h-full" />
          </div>

          {/* Scrub / Progress Bar (Interactive for DJ, visual sync for listeners) */}
          {!track.isLive && duration > 0 && (
            <div className="w-full px-3 sm:px-4 pt-2.5 pb-1 bg-[#0E1017] flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-mono w-8 sm:w-9 text-right shrink-0">
                {formatSeconds(currentTime)}
              </span>
              <input
                type="range"
                min="0"
                max={duration}
                value={currentTime}
                onChange={handleSeekChange}
                disabled={!isAuxHolder}
                className={`w-full h-1.5 rounded-lg accent-indigo-500 bg-white/10 ${
                  isAuxHolder ? "cursor-pointer" : "cursor-default opacity-80"
                }`}
              />
              <span className="text-[10px] text-slate-400 font-mono w-8 sm:w-9 shrink-0">
                {formatSeconds(duration)}
              </span>
            </div>
          )}

          {/* Expanded Theatre Track Info Row */}
          <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-[#0E1017] border-t border-white/5 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
              {canControlPlayback ? (
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-all shadow-md shadow-indigo-600/30 active:scale-95 shrink-0 cursor-pointer"
                  title={musicState.isPlaying ? "Pause" : "Play"}
                >
                  {musicState.isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                </button>
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-400 shrink-0">
                  <Disc3 size={16} className={musicState.isPlaying ? "animate-spin [animation-duration:4s] text-indigo-400" : ""} />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <h4 className="text-xs sm:text-sm font-semibold text-white truncate" title={track.title}>
                  {track.title}
                </h4>
                <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                  {track.artist || "Shared Media"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                {track.isLive ? "LIVE" : "SYNC"}
              </span>
              {track.url && (
                <a
                  href={track.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                  title="Open on YouTube"
                >
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>

          {/* Stage Action Bar — Queue, Add Song, and End Music */}
          <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-[#090A0E] border-t border-white/5 flex items-center gap-2">
            {/* Queue Button */}
            <button
              type="button"
              onClick={() => onOpenMusicModal("queue")}
              className="flex-1 sm:flex-initial h-8 sm:h-9 px-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/35 text-indigo-200 border border-indigo-500/30 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
              title="View Song Queue"
            >
              <ListMusic size={14} className="text-indigo-400 shrink-0" />
              <span>Queue</span>
              {Boolean(musicState.queue?.length) && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500 text-white font-bold ml-0.5">
                  {musicState.queue?.length}
                </span>
              )}
            </button>

            {/* Add / Change Song Button */}
            <button
              type="button"
              onClick={() => onOpenMusicModal("youtube")}
              className="flex-1 sm:flex-initial h-8 sm:h-9 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/10 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
              title="Add YouTube track to queue or play now"
            >
              <Plus size={14} className="text-emerald-400 shrink-0" />
              <span>{isAuxHolder ? "Change Song" : "+ Add Song"}</span>
            </button>

            {/* End Music Button */}
            {(isAuxHolder || canModerateAux || isAuxFree) && (
              <button
                type="button"
                onClick={onStopMusic}
                className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0"
                title="Turn off music player for the room"
              >
                <Square size={11} className="fill-current text-rose-400 shrink-0" />
                <span className="hidden xs:inline">End Music</span>
              </button>
            )}
          </div>


        </div>
      </div>

      {/* ─── COMPACT MINI-BAR / ADAPTIVE AUDIO DECK ─── */}
      {/* Visible only when isExpanded is FALSE */}
      {!isExpanded && (
        <div className="relative z-30 w-full max-w-7xl mx-auto px-2 sm:px-6 mt-2.5 sm:mt-4 mb-2">
          <div className="relative z-30 bg-[#0E1017]/95 backdrop-blur-2xl border border-white/10 rounded-2xl sm:rounded-full px-2 py-1.5 sm:px-4 sm:py-2 shadow-[0_8px_30px_rgba(0,0,0,0.6)] flex items-center justify-between gap-1.5 sm:gap-3">
            {/* Track Info (Clickable to open Music Modal) */}
            <div
              onClick={() => onOpenMusicModal?.("youtube")}
              className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer group/track"
              title="Click to view queue or add YouTube songs"
            >
              {/* Thumbnail / Animated Equalizer Bars */}
              <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl sm:rounded-full overflow-hidden shrink-0 bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-center">
                {track.thumbnail ? (
                  <img
                    src={track.thumbnail}
                    alt={track.title}
                    className="w-full h-full object-cover group-hover/track:scale-105 transition-transform"
                  />
                ) : (
                  <Headphones size={15} className="text-indigo-400" />
                )}
                {musicState.isPlaying && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[0.5px] flex items-center justify-center gap-0.5">
                    <span className="w-0.5 h-3 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-0.5 h-4 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-0.5 h-2 bg-emerald-400 rounded-full animate-bounce" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h4 className="text-xs font-semibold text-white truncate group-hover/track:text-indigo-300 transition-colors">
                    {track.title}
                  </h4>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 shrink-0 hidden sm:inline">
                    {track.isLive ? "LIVE" : "SYNC"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5 min-w-0">
                  <span className="shrink-0 text-slate-500">DJ:</span>
                  <span className="text-amber-300 font-medium truncate max-w-[75px] xs:max-w-[120px] sm:max-w-none shrink-0">
                    {isAuxHolder ? "You 🎧" : isAuxFree ? "Open" : musicState.auxHolderName || "Room"}
                  </span>
                  {!track.isLive && duration > 0 && (
                    <>
                      <span className="hidden sm:inline text-slate-600">•</span>
                      <span className="font-mono text-slate-500 hidden sm:inline text-[9px]">
                        {formatSeconds(currentTime)} / {formatSeconds(duration)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* Queue Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenMusicModal("queue");
                }}
                className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/35 text-indigo-300 text-[10px] font-semibold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shrink-0"
                title="View Song Queue"
              >
                <ListMusic size={11} className="shrink-0" />
                <span className="hidden xs:inline">Queue</span>
                {Boolean(musicState.queue?.length) && (
                  <span className="font-bold">({musicState.queue.length})</span>
                )}
              </button>

              {/* Become DJ Quick Action (when DJ is free) */}
              {isAuxFree && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClaimAux();
                  }}
                  className="px-2 py-0.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shrink-0 shadow-xs shadow-emerald-500/20"
                  title="Become DJ to control music"
                >
                  <Sparkles size={10} className="shrink-0 text-emerald-400" />
                  <span className="hidden xs:inline">Become DJ</span>
                  <span className="xs:hidden">DJ</span>
                </button>
              )}

              {/* Play/Pause (only AUX holder can play/pause) */}
              {canControlPlayback && (
                <button
                  onClick={handleTogglePlay}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-all active:scale-95 shadow-md shadow-indigo-600/30 shrink-0 cursor-pointer"
                  title={musicState.isPlaying ? "Pause" : "Play"}
                >
                  {musicState.isPlaying ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
                </button>
              )}

              {/* Personal Volume Dropdown */}
              <div className="relative z-40">
                <button
                  onClick={() => setIsVolumeSliderOpen(!isVolumeSliderOpen)}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all flex items-center justify-center shrink-0 cursor-pointer"
                  title="My Music Volume"
                >
                  {isLocalMuted || localVolume === 0 ? (
                    <VolumeX size={14} className="text-rose-400" />
                  ) : (
                    <Volume2 size={14} className="text-indigo-400" />
                  )}
                </button>

                {isVolumeSliderOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsVolumeSliderOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-2.5 z-50 p-3 bg-[#11131C] border border-white/10 rounded-2xl shadow-2xl w-48 animate-in fade-in zoom-in-95">
                      <div className="flex items-center justify-between text-[11px] mb-2 text-slate-300">
                        <span>My Music Volume</span>
                        <button
                          onClick={toggleMute}
                          className="text-[10px] text-indigo-400 hover:underline cursor-pointer font-medium"
                        >
                          {isLocalMuted ? "Unmute" : "Mute"}
                        </button>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={isLocalMuted ? 0 : localVolume}
                        onChange={(e) => handleVolumeChange(Number(e.target.value))}
                        className="w-full accent-indigo-500 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                      />
                      <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-mono">
                        <span>0%</span>
                        <span className="text-indigo-300 font-semibold">{isLocalMuted ? "Muted" : `${localVolume}%`}</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Expand to Video Stage */}
              <button
                onClick={onToggleExpand}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all flex items-center justify-center shrink-0 cursor-pointer"
                title="Expand Theatre Video"
              >
                <Maximize2 size={14} />
              </button>

              {/* End Music Button */}
              {(isAuxHolder || canModerateAux || isAuxFree) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onStopMusic();
                  }}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 hover:text-rose-200 transition-all flex items-center justify-center shrink-0 cursor-pointer"
                  title="End Music (Turn Off Player)"
                >
                  <Square size={11} className="fill-current" />
                </button>
              )}

              {/* Browse Tracks / Queue Modal Button (Desktop/Tablet) */}
              <button
                onClick={() => onOpenMusicModal?.("youtube")}
                className="hidden sm:flex w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 hover:text-white items-center justify-center transition-all shrink-0 cursor-pointer"
                title="Open Music Modal & Queue"
              >
                <Headphones size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
