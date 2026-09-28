"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause } from "lucide-react";

interface VoiceNotePlayerProps {
  audioUrl: string;
  duration?: number;
  isMe: boolean;
}

const WAVEFORM_HEIGHTS = [
  35, 60, 45, 80, 50, 70, 90, 40, 65, 85, 55, 75, 95, 60, 40, 70, 85, 50, 65, 45, 80, 60, 40
];

export function VoiceNotePlayer({ audioUrl, duration: initialDuration = 0, isMe }: VoiceNotePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(initialDuration);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setTotalDuration(Math.round(audio.duration));
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handlePauseOthers = (e: Event) => {
      const custom = e as CustomEvent<{ audioUrl: string }>;
      if (custom.detail?.audioUrl !== audioUrl) {
        audio.pause();
        setIsPlaying(false);
      }
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    window.addEventListener("yapclub_pause_other_audio", handlePauseOthers);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      window.removeEventListener("yapclub_pause_other_audio", handlePauseOthers);
      audioRef.current = null;
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("yapclub_pause_other_audio", { detail: { audioUrl } })
        );
      }
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.error("Playback error:", e);
      });
    }
  };

  const handleSpeedToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !totalDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * totalDuration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (secs: number) => {
    const s = Math.floor(secs || 0);
    const m = Math.floor(s / 60);
    const remainder = s % 60;
    return `${m}:${remainder < 10 ? "0" : ""}${remainder}`;
  };

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 py-1 px-1 min-w-[220px] sm:min-w-[260px] select-none">
      {/* Play / Pause Circular Button */}
      <button
        type="button"
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-md transition-all active:scale-95 cursor-pointer ${
          isMe
            ? "bg-white text-indigo-600 hover:bg-slate-100"
            : "bg-indigo-600 text-white hover:bg-indigo-500"
        }`}
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
      >
        {isPlaying ? (
          <Pause size={18} className="fill-current" />
        ) : (
          <Play size={18} className="fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform and Timer */}
      <div className="flex-1 flex flex-col justify-center min-w-0">
        {/* Interactive Waveform Bar Container */}
        <div
          onClick={handleSeek}
          className="h-7 flex items-center gap-[2.5px] cursor-pointer group py-1"
          title="Click to seek"
        >
          {WAVEFORM_HEIGHTS.map((heightPercent, idx) => {
            const barPercent = (idx / WAVEFORM_HEIGHTS.length) * 100;
            const isFilled = barPercent <= progressPercent;

            return (
              <div
                key={idx}
                style={{ height: `${heightPercent}%` }}
                className={`w-[3px] rounded-full transition-all duration-150 ${
                  isMe
                    ? isFilled
                      ? "bg-white"
                      : "bg-indigo-300/40 group-hover:bg-indigo-300/60"
                    : isFilled
                    ? "bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.5)]"
                    : "bg-white/20 group-hover:bg-white/30"
                }`}
              />
            );
          })}
        </div>

        {/* Timers & Speed */}
        <div className="flex items-center justify-between text-[10px] mt-0.5 font-mono">
          <span className={isMe ? "text-indigo-100/90 font-medium" : "text-slate-400 font-medium"}>
            {isPlaying ? formatTime(currentTime) : formatTime(totalDuration)}
          </span>

          <button
            type="button"
            onClick={handleSpeedToggle}
            className={`px-1.5 py-0.2 rounded-md font-semibold text-[9px] transition-colors cursor-pointer ${
              isMe
                ? "bg-indigo-700/60 text-indigo-100 hover:bg-indigo-700"
                : "bg-white/10 text-slate-300 hover:bg-white/20"
            }`}
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
}
