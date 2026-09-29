"use client";

import React, { useEffect, useState, useRef } from "react";
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
  Sparkles,
  Wifi,
  PhoneCall
} from "lucide-react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";

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

  const [liveKitToken, setLiveKitToken] = useState<string | null>(null);
  const [liveKitUrl, setLiveKitUrl] = useState<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

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
      fetch(
        `/api/token?room=${encodeURIComponent(roomName)}&username=${encodeURIComponent(
          user.name || "User"
        )}&avatar=${encodeURIComponent(user.avatar || "zap")}`
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
    }
  }, [callState, activeCall?.conversationId, user?.name, user?.avatar]);

  // Fallback direct microphone track capture for browser audio when connected
  useEffect(() => {
    if (callState === "connected") {
      if (navigator.mediaDevices?.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            localStreamRef.current = stream;
            // Apply initial mute state
            stream.getAudioTracks().forEach((track) => {
              track.enabled = !isMuted;
            });
          })
          .catch((err) => {
            console.log("Local audio stream warning:", err.message);
          });
      }
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    }

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    };
  }, [callState]);

  // Handle Mute toggle on fallback stream
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted && !isDeafened;
      });
    }
  }, [isMuted, isDeafened]);

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
        {/* Hidden LiveKit audio room connection */}
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
            <RoomAudioRenderer />
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
            <div className="flex items-center gap-1">
              <button
                onClick={toggleMute}
                className={`p-1.5 rounded-full text-xs transition-colors ${
                  isMuted ? "bg-rose-500/20 text-rose-400" : "text-slate-300 hover:text-white"
                }`}
                title={isMuted ? "Unmute Mic" : "Mute Mic"}
              >
                {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
              </button>

              <button
                onClick={() => setIsMinimized(false)}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                title="Expand Call"
              >
                <Maximize2 size={14} />
              </button>

              <button
                onClick={endCall}
                className="p-1.5 rounded-full bg-rose-600 text-white hover:bg-rose-500 transition-colors ml-1"
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
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold text-emerald-400 tracking-wide uppercase">
                    Voice Call Connected
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
                {/* Caller / Peer */}
                <div className="flex flex-col items-center gap-2.5">
                  <div className="relative">
                    <div className="absolute -inset-2 rounded-full bg-indigo-500/20 animate-pulse blur-md" />
                    <div className="relative w-20 h-20 rounded-full bg-slate-800 border-2 border-indigo-500 overflow-hidden shadow-xl flex items-center justify-center">
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
                  <span className="text-[11px] text-emerald-400 font-medium">Connected</span>
                </div>

                {/* Animated Waveform Divider */}
                <div className="flex items-center gap-1 text-indigo-400 px-2">
                  <span className="w-1 h-6 rounded-full bg-indigo-500 animate-pulse" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-9 rounded-full bg-indigo-400 animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 h-4 rounded-full bg-indigo-600 animate-pulse" style={{ animationDelay: "300ms" }} />
                  <span className="w-1 h-8 rounded-full bg-indigo-500 animate-pulse" style={{ animationDelay: "450ms" }} />
                </div>

                {/* User (Self) */}
                <div className="flex flex-col items-center gap-2.5">
                  <div className="relative">
                    {isMuted && (
                      <div className="absolute -top-1 -right-1 z-20 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center border-2 border-[#0a0b12] shadow">
                        <MicOff size={12} />
                      </div>
                    )}
                    <div className="relative w-20 h-20 rounded-full bg-slate-800 border-2 border-white/20 overflow-hidden shadow-xl flex items-center justify-center">
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
                    {isMuted ? "Muted" : "Microphone On"}
                  </span>
                </div>
              </div>

              {/* Call Controls Toolbar */}
              <div className="flex items-center justify-center gap-4 w-full pt-4 border-t border-white/5 z-10">
                {/* Mute Mic */}
                <button
                  onClick={toggleMute}
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-semibold transition-all active:scale-95 shadow-lg ${
                    isMuted
                      ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30"
                      : "bg-white/10 hover:bg-white/20 border border-white/10"
                  }`}
                  title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
                >
                  {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                </button>

                {/* Deafen Audio */}
                <button
                  onClick={toggleDeafen}
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-semibold transition-all active:scale-95 shadow-lg ${
                    isDeafened
                      ? "bg-amber-600 hover:bg-amber-500 shadow-amber-600/30"
                      : "bg-white/10 hover:bg-white/20 border border-white/10"
                  }`}
                  title={isDeafened ? "Undeafen Audio" : "Deafen Audio"}
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
