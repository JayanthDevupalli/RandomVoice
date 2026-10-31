"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useDMVoiceCall } from "@/components/providers/DMVoiceCallContext";
import { useUser } from "@/hooks/useUser";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Minimize2, 
  Maximize2,
  Radio,
  Wifi,
  Loader2
} from "lucide-react";
import { 
  LiveKitRoom, 
  useTracks, 
  useLocalParticipant, 
  useRoomContext, 
  AudioTrack, 
  StartAudio 
} from "@livekit/components-react";
import { Track, RoomEvent } from "livekit-client";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";

interface DMVoiceCallPipelineProps {
  isMuted: boolean;
  isDeafened: boolean;
  onPeerStateChange: (state: { isPeerMuted: boolean; isPeerSpeaking: boolean; isSelfSpeaking: boolean }) => void;
}

function DMVoiceCallPipeline({
  isMuted,
  isDeafened,
  onPeerStateChange,
}: DMVoiceCallPipelineProps) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  // STRICTLY filter out local participant so own voice is NEVER looped back to oneself
  const audioTracks = useTracks(
    [Track.Source.Microphone],
    { onlySubscribed: true }
  ).filter((trackRef) => !trackRef.participant.isLocal && trackRef.publication?.kind === Track.Kind.Audio);

  // 1. LiveKit Microphone Mute / Unmute Sync
  useEffect(() => {
    if (localParticipant) {
      const shouldEnable = !isMuted && !isDeafened;
      localParticipant
        .setMicrophoneEnabled(shouldEnable, {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        })
        .catch((err) => {
          console.warn("LiveKit DM setMicrophoneEnabled warning:", err);
        });
    }
  }, [localParticipant, isMuted, isDeafened]);

  // 2. Speaker Off (Deafen) Volume & Mute Sync on all remote tracks
  useEffect(() => {
    if (!room) return;

    try {
      const safeVolume = isDeafened ? 0 : 1;
      room.remoteParticipants.forEach((remoteParticipant) => {
        // Direct remote participant volume API
        try {
          if (typeof remoteParticipant.setVolume === "function") {
            remoteParticipant.setVolume(safeVolume, Track.Source.Microphone);
          }
        } catch (e) {}

        // Track publications and attached media elements
        remoteParticipant.audioTrackPublications.forEach((pub) => {
          const track = pub.track;
          if (track) {
            try {
              if (typeof (track as any).setVolume === "function") {
                (track as any).setVolume(safeVolume);
              }
            } catch (e) {}

            try {
              const attached = (track as any).attachedElements;
              if (attached) {
                const els = Array.isArray(attached) ? attached : Array.from(attached);
                for (const el of els as HTMLMediaElement[]) {
                  if (el) {
                    el.volume = safeVolume;
                    el.muted = isDeafened;
                  }
                }
              }
            } catch (e) {}
          }
        });
      });
    } catch (err) {
      console.warn("LiveKit DM volume sync warning:", err);
    }
  }, [room, isDeafened, audioTracks]);

  // 3. Speaking and Mute State Tracking
  useEffect(() => {
    if (!room) return;

    const checkPeerMuted = () => {
      let peerMuted = false;
      room.remoteParticipants.forEach((p) => {
        const micPub = p.getTrackPublication(Track.Source.Microphone);
        if (micPub) {
          peerMuted = micPub.isMuted || !micPub.isEnabled;
        }
      });
      return peerMuted;
    };

    const handleActiveSpeakers = (speakers: any[]) => {
      const speakerIdentities = new Set(
        speakers.map((s) => s.identity?.toLowerCase())
      );
      const localId = localParticipant?.identity?.toLowerCase();
      const isSelfSpeaking = Boolean(localId && speakerIdentities.has(localId));
      let isPeerSpeaking = false;
      for (const s of speakers) {
        if (s.identity?.toLowerCase() !== localId) {
          isPeerSpeaking = true;
          break;
        }
      }
      onPeerStateChange({
        isPeerMuted: checkPeerMuted(),
        isPeerSpeaking,
        isSelfSpeaking,
      });
    };

    const handleTrackStateChanged = () => {
      onPeerStateChange({
        isPeerMuted: checkPeerMuted(),
        isPeerSpeaking: false,
        isSelfSpeaking: false,
      });
    };

    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
    room.on(RoomEvent.TrackMuted, handleTrackStateChanged);
    room.on(RoomEvent.TrackUnmuted, handleTrackStateChanged);

    // Initial check
    onPeerStateChange({
      isPeerMuted: checkPeerMuted(),
      isPeerSpeaking: false,
      isSelfSpeaking: false,
    });

    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
      room.off(RoomEvent.TrackMuted, handleTrackStateChanged);
      room.off(RoomEvent.TrackUnmuted, handleTrackStateChanged);
    };
  }, [room, localParticipant, onPeerStateChange]);

  return (
    <div style={{ display: "none" }} aria-hidden="true">
      <StartAudio label="Click to allow audio" />
      {audioTracks.map((trackRef) => {
        const id = trackRef.participant.identity;
        const safeVolume = isDeafened ? 0 : 1;
        return (
          <AudioTrack
            key={trackRef.publication?.trackSid || `${id}_${trackRef.source}`}
            trackRef={trackRef}
            volume={safeVolume}
            muted={isDeafened}
            ref={(element) => {
              if (element) {
                element.volume = safeVolume;
                element.muted = isDeafened;
              }
            }}
          />
        );
      })}
    </div>
  );
}

export function DMVoiceCallOverlay() {
  const { user } = useUser();
  const {
    callState,
    activeCall,
    isMuted,
    isDeafened,
    callDuration,
    isMinimized,
    setIsMinimized,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleDeafen,
  } = useDMVoiceCall();

  // Prevent device screen from sleeping during active call
  useScreenWakeLock(callState === "connected");

  const [liveKitToken, setLiveKitToken] = useState<string | null>(null);
  const [liveKitUrl, setLiveKitUrl] = useState<string | null>(null);
  const [peerState, setPeerState] = useState({
    isPeerMuted: false,
    isPeerSpeaking: false,
    isSelfSpeaking: false,
  });

  const handlePeerStateChange = useCallback(
    (state: { isPeerMuted: boolean; isPeerSpeaking: boolean; isSelfSpeaking: boolean }) => {
      setPeerState(state);
    },
    []
  );

  // Format seconds to mm:ss
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Fetch LiveKit token when call is connected
  useEffect(() => {
    if (callState === "connected" && activeCall && user) {
      const roomName = `dm_call_${activeCall.conversationId}`;
      const uniqueIdentity = user.username || user.id;
      const displayLabel = user.name || user.username || "User";
      fetch(
        `/api/token?room=${encodeURIComponent(roomName)}&username=${encodeURIComponent(
          uniqueIdentity
        )}&displayName=${encodeURIComponent(displayLabel)}&avatar=${encodeURIComponent(user.avatar || "zap")}`
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.token) {
            setLiveKitToken(data.token);
            setLiveKitUrl(data.serverUrl);
          }
        })
        .catch((err) => console.error("Error fetching DM call LiveKit token:", err));
    } else {
      setLiveKitToken(null);
      setLiveKitUrl(null);
      setPeerState({
        isPeerMuted: false,
        isPeerSpeaking: false,
        isSelfSpeaking: false,
      });
    }
  }, [callState, activeCall?.conversationId, user?.id, user?.username, user?.name, user?.avatar]);

  if (callState === "idle" || !activeCall) return null;

  const peer = activeCall.peerUser;

  // --- 1. INCOMING CALL MODAL ---
  if (callState === "ringing" && !activeCall.isCaller) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
        <div className="relative w-full max-w-sm rounded-3xl bg-[#0d0e15]/90 border border-white/10 p-6 shadow-2xl flex flex-col items-center text-center overflow-hidden">
          {/* Animated Background Ring Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-indigo-600/20 rounded-full blur-2xl animate-pulse pointer-events-none" />

          <div className="relative mb-6">
            {/* Pulsing Avatar Wave */}
            <div className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping duration-1000 scale-125" />
            <div className="relative w-24 h-24 rounded-full bg-slate-800 border-2 border-emerald-400 overflow-hidden shadow-xl flex items-center justify-center">
              {peer.avatar?.includes("http") ? (
                <img src={peer.avatar} alt={peer.username} className="w-full h-full object-cover" />
              ) : (
                <UserAvatar avatar={peer.avatar} size="lg" className="!w-full !h-full" />
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-2 animate-pulse">
            <Radio size={14} className="animate-spin" />
            <span>Incoming Voice Call</span>
          </div>

          <h3 className="text-xl font-bold text-white mb-1 truncate max-w-[240px]">
            {peer.username}
          </h3>
          <p className="text-xs text-slate-400 mb-8">is calling you on Direct Message...</p>

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-6 w-full z-10">
            {/* Decline */}
            <button
              onClick={declineCall}
              className="flex-1 py-3.5 px-4 rounded-2xl bg-rose-600/20 hover:bg-rose-600 border border-rose-500/30 text-rose-300 hover:text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg group"
            >
              <div className="w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                <PhoneOff size={16} />
              </div>
              <span>Decline</span>
            </button>

            {/* Accept */}
            <button
              onClick={acceptCall}
              className="flex-1 py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-emerald-600/30 group animate-bounce"
            >
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                <Phone size={16} />
              </div>
              <span>Accept</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- 2. OUTGOING CALL MODAL ---
  if (callState === "calling" && activeCall.isCaller) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
        <div className="relative w-full max-w-sm rounded-3xl bg-[#0d0e15]/90 border border-white/10 p-6 shadow-2xl flex flex-col items-center text-center overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-indigo-600/20 rounded-full blur-2xl animate-pulse pointer-events-none" />

          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-full bg-indigo-500/30 animate-ping duration-1000 scale-125" />
            <div className="relative w-24 h-24 rounded-full bg-slate-800 border-2 border-indigo-500 overflow-hidden shadow-xl flex items-center justify-center">
              {peer.avatar?.includes("http") ? (
                <img src={peer.avatar} alt={peer.username} className="w-full h-full object-cover" />
              ) : (
                <UserAvatar avatar={peer.avatar} size="lg" className="!w-full !h-full" />
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-2">
            <Wifi size={14} className="animate-pulse" />
            <span>Calling...</span>
          </div>

          <h3 className="text-xl font-bold text-white mb-1 truncate max-w-[240px]">
            {peer.username}
          </h3>
          <p className="text-xs text-slate-400 mb-8">Ringing contact...</p>

          <button
            onClick={endCall}
            className="w-full py-3.5 px-4 rounded-2xl bg-rose-600/20 hover:bg-rose-600 border border-rose-500/30 text-rose-300 hover:text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg group"
          >
            <div className="w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
              <PhoneOff size={16} />
            </div>
            <span>Cancel Call</span>
          </button>
        </div>
      </div>
    );
  }

  // --- 3. CONNECTED VOICE CALL OVERLAY ---
  if (callState === "connected") {
    return (
      <>
        {/* LiveKit audio room connection with custom audio pipeline */}
        {liveKitToken && liveKitUrl && (
          <LiveKitRoom
            token={liveKitToken}
            serverUrl={liveKitUrl}
            connect={true}
            audio={!isMuted && !isDeafened}
            video={false}
            options={{
              audioCaptureDefaults: {
                noiseSuppression: true,
                echoCancellation: true,
                autoGainControl: true,
              },
            }}
            style={{ display: "none" }}
          >
            <DMVoiceCallPipeline
              isMuted={isMuted}
              isDeafened={isDeafened}
              onPeerStateChange={handlePeerStateChange}
            />
          </LiveKitRoom>
        )}

        {/* MINIMIZED FLOATING CALL PILL */}
        {isMinimized ? (
          <div className="fixed top-20 right-4 z-[90] flex items-center gap-3 p-2.5 px-4 rounded-full bg-[#12131C]/95 border border-indigo-500/30 shadow-2xl backdrop-blur-xl animate-in slide-in-from-top-4 duration-200">
            <div className="flex items-center gap-2">
              <div className="relative w-8 h-8 rounded-full bg-slate-800 border border-emerald-400 overflow-hidden shrink-0">
                {peer.avatar?.includes("http") ? (
                  <img src={peer.avatar} alt={peer.username} className="w-full h-full object-cover" />
                ) : (
                  <UserAvatar avatar={peer.avatar} size="sm" className="!w-full !h-full" />
                )}
                {peerState.isPeerSpeaking && (
                  <span className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping" />
                )}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-black" />
              </div>

              <div className="flex flex-col">
                <span className="text-xs font-bold text-white leading-tight truncate max-w-[100px]">
                  {peer.username}
                </span>
                <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {formatTime(callDuration)}
                </span>
              </div>
            </div>

            <div className="h-4 w-px bg-white/10" />

            {/* Pill Controls */}
            <div className="flex items-center gap-1.5">
              {/* Mute Mic Toggle */}
              <button
                onClick={toggleMute}
                className={`p-2 rounded-full text-xs transition-colors active:scale-95 ${
                  isMuted || isDeafened
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    : "text-slate-300 hover:text-white hover:bg-white/10"
                }`}
                title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
              >
                {isMuted || isDeafened ? <MicOff size={14} /> : <Mic size={14} />}
              </button>

              {/* Speaker Toggle (Deafen) */}
              <button
                onClick={toggleDeafen}
                className={`p-2 rounded-full text-xs transition-colors active:scale-95 ${
                  isDeafened
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "text-slate-300 hover:text-white hover:bg-white/10"
                }`}
                title={isDeafened ? "Turn Speaker On" : "Turn Speaker Off"}
              >
                {isDeafened ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>

              {/* Expand Modal */}
              <button
                onClick={() => setIsMinimized(false)}
                className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-colors active:scale-95"
                title="Expand Call"
              >
                <Maximize2 size={14} />
              </button>

              {/* End Call */}
              <button
                onClick={endCall}
                className="p-2 rounded-full bg-rose-600 text-white hover:bg-rose-500 transition-colors ml-0.5 active:scale-95"
                title="End Call"
              >
                <PhoneOff size={14} />
              </button>
            </div>
          </div>
        ) : (
          /* FULL EXPANDED VOICE CALL MODAL */
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in zoom-in-95 duration-200">
            <div className="relative w-full max-w-md rounded-3xl bg-[#0a0b12]/95 border border-indigo-500/20 p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center overflow-hidden">
              {/* Header Bar */}
              <div className="w-full flex items-center justify-between mb-8 pb-4 border-b border-white/5 z-10">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${liveKitToken ? "bg-emerald-400 animate-pulse" : "bg-amber-400 animate-ping"}`} />
                  <span className="text-xs font-semibold text-emerald-400 tracking-wide uppercase">
                    {liveKitToken ? "Voice Call Connected" : "Connecting Voice..."}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-white bg-white/5 border border-white/10 px-3 py-1 rounded-full">
                    {formatTime(callDuration)}
                  </span>
                  <button
                    onClick={() => setIsMinimized(true)}
                    className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    title="Minimize Call"
                  >
                    <Minimize2 size={18} />
                  </button>
                </div>
              </div>

              {/* Call Participants Visual Display */}
              <div className="relative flex items-center justify-center gap-8 mb-10 w-full z-10">
                {/* Peer / Friend */}
                <div className="flex flex-col items-center gap-2.5">
                  <div className="relative">
                    {peerState.isPeerSpeaking && (
                      <div className="absolute -inset-2 rounded-full bg-emerald-500/30 animate-ping blur-sm" />
                    )}
                    <div className="absolute -inset-2 rounded-full bg-indigo-500/20 animate-pulse blur-md" />
                    {peerState.isPeerMuted && (
                      <div 
                        className="absolute -top-1 -right-1 z-20 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center border-2 border-[#0a0b12] shadow"
                        title="Friend is muted"
                      >
                        <MicOff size={12} />
                      </div>
                    )}
                    <div className={`relative w-20 h-20 rounded-full bg-slate-800 border-2 overflow-hidden shadow-xl flex items-center justify-center transition-all ${
                      peerState.isPeerSpeaking ? "border-emerald-400 ring-4 ring-emerald-500/20" : "border-indigo-500"
                    }`}>
                      {peer.avatar?.includes("http") ? (
                        <img src={peer.avatar} alt={peer.username} className="w-full h-full object-cover" />
                      ) : (
                        <UserAvatar avatar={peer.avatar} size="lg" className="!w-full !h-full" />
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-white truncate max-w-[120px]">
                    {peer.username}
                  </span>
                  <span className={`text-[11px] font-medium transition-colors ${
                    peerState.isPeerSpeaking 
                      ? "text-emerald-400 font-semibold" 
                      : peerState.isPeerMuted 
                      ? "text-rose-400" 
                      : "text-emerald-400"
                  }`}>
                    {peerState.isPeerSpeaking ? "Speaking..." : peerState.isPeerMuted ? "Muted" : "Connected"}
                  </span>
                </div>

                {/* Animated Waveform Divider */}
                <div className="flex items-center gap-1 text-indigo-400 px-2">
                  <span 
                    className={`w-1 rounded-full transition-all duration-150 ${
                      peerState.isPeerSpeaking || peerState.isSelfSpeaking 
                        ? "h-8 bg-emerald-400 animate-pulse" 
                        : "h-5 bg-indigo-500 animate-pulse"
                    }`} 
                    style={{ animationDelay: "0ms" }} 
                  />
                  <span 
                    className={`w-1 rounded-full transition-all duration-150 ${
                      peerState.isPeerSpeaking || peerState.isSelfSpeaking 
                        ? "h-11 bg-emerald-300 animate-pulse" 
                        : "h-8 bg-indigo-400 animate-pulse"
                    }`} 
                    style={{ animationDelay: "150ms" }} 
                  />
                  <span 
                    className={`w-1 rounded-full transition-all duration-150 ${
                      peerState.isPeerSpeaking || peerState.isSelfSpeaking 
                        ? "h-6 bg-emerald-500 animate-pulse" 
                        : "h-3 bg-indigo-600 animate-pulse"
                    }`} 
                    style={{ animationDelay: "300ms" }} 
                  />
                  <span 
                    className={`w-1 rounded-full transition-all duration-150 ${
                      peerState.isPeerSpeaking || peerState.isSelfSpeaking 
                        ? "h-10 bg-emerald-400 animate-pulse" 
                        : "h-7 bg-indigo-500 animate-pulse"
                    }`} 
                    style={{ animationDelay: "450ms" }} 
                  />
                </div>

                {/* User (Self) */}
                <div className="flex flex-col items-center gap-2.5">
                  <div className="relative">
                    {peerState.isSelfSpeaking && !isMuted && !isDeafened && (
                      <div className="absolute -inset-2 rounded-full bg-emerald-500/30 animate-ping blur-sm" />
                    )}
                    {(isMuted || isDeafened) && (
                      <div 
                        className="absolute -top-1 -right-1 z-20 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center border-2 border-[#0a0b12] shadow"
                        title={isDeafened ? "Microphone & Speaker Off" : "Microphone Muted"}
                      >
                        <MicOff size={12} />
                      </div>
                    )}
                    <div className={`relative w-20 h-20 rounded-full bg-slate-800 border-2 overflow-hidden shadow-xl flex items-center justify-center transition-all ${
                      peerState.isSelfSpeaking && !isMuted && !isDeafened
                        ? "border-emerald-400 ring-4 ring-emerald-500/20"
                        : isMuted || isDeafened
                        ? "border-rose-500/50"
                        : "border-white/20"
                    }`}>
                      {user?.avatar?.includes("http") ? (
                        <img src={user.avatar} alt={user.name || "You"} className="w-full h-full object-cover" />
                      ) : (
                        <UserAvatar avatar={user?.avatar} size="lg" className="!w-full !h-full" />
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-white truncate max-w-[120px]">
                    You
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {isDeafened 
                      ? "Speaker Off" 
                      : isMuted 
                      ? "Muted" 
                      : peerState.isSelfSpeaking 
                      ? "Speaking..." 
                      : "Microphone On"}
                  </span>
                </div>
              </div>

              {/* Call Controls Toolbar */}
              <div className="flex items-center justify-center gap-5 w-full pt-4 border-t border-white/5 z-10">
                {/* Mute Mic */}
                <button
                  onClick={toggleMute}
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-semibold transition-all active:scale-95 shadow-lg ${
                    isMuted || isDeafened
                      ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30 ring-2 ring-rose-400/30"
                      : "bg-white/10 hover:bg-white/20 border border-white/10"
                  }`}
                  title={isMuted || isDeafened ? "Unmute Microphone" : "Mute Microphone"}
                >
                  {isMuted || isDeafened ? <MicOff size={22} /> : <Mic size={22} />}
                </button>

                {/* Speaker Off (Deafen Audio) */}
                <button
                  onClick={toggleDeafen}
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-semibold transition-all active:scale-95 shadow-lg ${
                    isDeafened
                      ? "bg-amber-600 hover:bg-amber-500 shadow-amber-600/30 ring-2 ring-amber-400/30"
                      : "bg-white/10 hover:bg-white/20 border border-white/10"
                  }`}
                  title={isDeafened ? "Turn Speaker On (Undeafen)" : "Turn Speaker Off (Deafen)"}
                >
                  {isDeafened ? <VolumeX size={22} /> : <Volume2 size={22} />}
                </button>

                {/* End Call */}
                <button
                  onClick={endCall}
                  className="w-16 h-14 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-rose-600/40"
                  title="End Voice Call"
                >
                  <PhoneOff size={24} />
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}