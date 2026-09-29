"use client";

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { callSoundManager } from "@/lib/call-sound";

export interface DMCallPeer {
  id: string;
  username: string;
  avatar?: string;
}

export interface ActiveDMCall {
  callId: string;
  conversationId: string;
  peerUser: DMCallPeer;
  isCaller: boolean;
  startTime?: number;
}

export type DMCallState = "idle" | "calling" | "ringing" | "connected";

interface DMVoiceCallContextType {
  callState: DMCallState;
  activeCall: ActiveDMCall | null;
  isMuted: boolean;
  isDeafened: boolean;
  callDuration: number;
  isMinimized: boolean;
  setIsMinimized: (val: boolean) => void;
  startCall: (conversationId: string, peerUser: DMCallPeer) => Promise<boolean>;
  acceptCall: () => void;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
}

const DMVoiceCallContext = createContext<DMVoiceCallContextType>({
  callState: "idle",
  activeCall: null,
  isMuted: false,
  isDeafened: false,
  callDuration: 0,
  isMinimized: false,
  setIsMinimized: () => {},
  startCall: async () => false,
  acceptCall: () => {},
  declineCall: () => {},
  endCall: () => {},
  toggleMute: () => {},
  toggleDeafen: () => {},
});

export function DMVoiceCallProvider({ children }: { children: React.ReactNode }) {
  const { user, isRegistered } = useUser();
  const [callState, setCallState] = useState<DMCallState>("idle");
  const [activeCall, setActiveCall] = useState<ActiveDMCall | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);

  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const userSignalChannelRef = useRef<any>(null);
  const activeCallRef = useRef<ActiveDMCall | null>(null);
  const callStateRef = useRef<DMCallState>("idle");

  // Keep refs in sync for event listeners
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Handle call duration timer
  useEffect(() => {
    if (callState === "connected") {
      setCallDuration(0);
      durationTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      setCallDuration(0);
    }

    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    };
  }, [callState]);

  // Format call duration helper
  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  // Log call message to Supabase chat
  const logCallSummaryMessage = async (conversationId: string, text: string) => {
    if (!user?.id || !conversationId) return;
    try {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: text,
      });

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);
    } catch (e) {
      console.error("Failed to log call summary message:", e);
    }
  };

  // Helper to send signal to peer
  const sendSignalToPeer = async (peerId: string, event: string, payload: any) => {
    try {
      const channel = supabase.channel(`user_call_signal_${peerId}`);
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.send({
            type: "broadcast",
            event,
            payload,
          });
          setTimeout(() => {
            supabase.removeChannel(channel);
          }, 2000);
        }
      });
    } catch (err) {
      console.error("Failed to send call signal to peer:", err);
    }
  };

  // Clean up current call local state
  const resetCallState = useCallback(() => {
    callSoundManager.stopAll();
    setCallState("idle");
    setActiveCall(null);
    setIsMuted(false);
    setIsDeafened(false);
    setIsMinimized(false);
  }, []);

  // Listen for incoming call signals on current user's personal channel
  useEffect(() => {
    if (!user?.id || !isRegistered) return;

    const channelName = `user_call_signal_${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: "DM_CALL_INITIATE" }, ({ payload }) => {
        // If already in a call, notify caller that line is busy
        if (callStateRef.current !== "idle") {
          sendSignalToPeer(payload.caller.id, "DM_CALL_BUSY", {
            callId: payload.callId,
            reason: "User is currently on another call.",
          });
          return;
        }

        // Setup incoming call state
        const incomingCall: ActiveDMCall = {
          callId: payload.callId,
          conversationId: payload.conversationId,
          peerUser: payload.caller,
          isCaller: false,
        };

        setActiveCall(incomingCall);
        setCallState("ringing");
        callSoundManager.startIncomingRingtone();
      })
      .on("broadcast", { event: "DM_CALL_ACCEPTED" }, ({ payload }) => {
        if (activeCallRef.current?.callId === payload.callId) {
          callSoundManager.stopAll();
          setCallState("connected");
          setActiveCall((prev) => (prev ? { ...prev, startTime: Date.now() } : null));
        }
      })
      .on("broadcast", { event: "DM_CALL_DECLINED" }, ({ payload }) => {
        if (activeCallRef.current?.callId === payload.callId) {
          callSoundManager.stopAll();
          callSoundManager.playCallEndBeep();
          const convId = activeCallRef.current?.conversationId;
          resetCallState();
          if (convId) {
            logCallSummaryMessage(convId, "📞 Call declined");
          }
        }
      })
      .on("broadcast", { event: "DM_CALL_CANCELLED" }, ({ payload }) => {
        if (activeCallRef.current?.callId === payload.callId) {
          callSoundManager.stopAll();
          callSoundManager.playCallEndBeep();
          const convId = activeCallRef.current?.conversationId;
          resetCallState();
          if (convId) {
            logCallSummaryMessage(convId, "📞 Missed voice call");
          }
        }
      })
      .on("broadcast", { event: "DM_CALL_BUSY" }, ({ payload }) => {
        if (activeCallRef.current?.callId === payload.callId) {
          callSoundManager.stopAll();
          callSoundManager.playCallEndBeep();
          const convId = activeCallRef.current?.conversationId;
          resetCallState();
          if (convId) {
            logCallSummaryMessage(convId, "📞 User is busy on another call");
          }
        }
      })
      .on("broadcast", { event: "DM_CALL_ENDED" }, ({ payload }) => {
        if (activeCallRef.current?.callId === payload.callId) {
          callSoundManager.stopAll();
          callSoundManager.playCallEndBeep();
          resetCallState();
        }
      })
      .subscribe();

    userSignalChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isRegistered, resetCallState]);

  // Actions
  const startCall = async (conversationId: string, peerUser: DMCallPeer): Promise<boolean> => {
    if (!user || callState !== "idle") return false;

    const newCallId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newCall: ActiveDMCall = {
      callId: newCallId,
      conversationId,
      peerUser,
      isCaller: true,
    };

    setActiveCall(newCall);
    setCallState("calling");
    callSoundManager.startOutgoingRingback();

    // Broadcast call initiate to peer
    const callerData = {
      id: user.id,
      username: user.name || "Anonymous",
      avatar: user.avatar,
    };

    await sendSignalToPeer(peerUser.id, "DM_CALL_INITIATE", {
      callId: newCallId,
      conversationId,
      caller: callerData,
    });

    return true;
  };

  const acceptCall = () => {
    if (!activeCall || callState !== "ringing" || !user) return;

    callSoundManager.stopAll();
    setCallState("connected");
    setActiveCall((prev) => (prev ? { ...prev, startTime: Date.now() } : null));

    // Send accept signal to caller
    sendSignalToPeer(activeCall.peerUser.id, "DM_CALL_ACCEPTED", {
      callId: activeCall.callId,
      conversationId: activeCall.conversationId,
      acceptorId: user.id,
    });
  };

  const declineCall = () => {
    if (!activeCall || !user) return;

    callSoundManager.stopAll();
    callSoundManager.playCallEndBeep();

    const peerId = activeCall.peerUser.id;
    const callId = activeCall.callId;
    const convId = activeCall.conversationId;

    sendSignalToPeer(peerId, "DM_CALL_DECLINED", {
      callId,
      conversationId: convId,
      declinerId: user.id,
    });

    resetCallState();
    logCallSummaryMessage(convId, "📞 Call declined");
  };

  const endCall = () => {
    if (!activeCall) return;

    callSoundManager.stopAll();
    callSoundManager.playCallEndBeep();

    const peerId = activeCall.peerUser.id;
    const callId = activeCall.callId;
    const convId = activeCall.conversationId;
    const currentState = callState;
    const duration = callDuration;

    if (currentState === "calling") {
      // Caller cancelled before receiver answered
      sendSignalToPeer(peerId, "DM_CALL_CANCELLED", { callId, conversationId: convId });
      logCallSummaryMessage(convId, "📞 Cancelled call");
    } else if (currentState === "connected") {
      // End ongoing active call
      sendSignalToPeer(peerId, "DM_CALL_ENDED", { callId, conversationId: convId });
      const durationStr = formatDuration(duration);
      logCallSummaryMessage(convId, `📞 Voice call ended • ${durationStr}`);
    } else if (currentState === "ringing") {
      // Declined
      sendSignalToPeer(peerId, "DM_CALL_DECLINED", { callId, conversationId: convId });
    }

    resetCallState();
  };

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  const toggleDeafen = () => {
    setIsDeafened((prev) => {
      const next = !prev;
      if (next) setIsMuted(true);
      return next;
    });
  };

  return (
    <DMVoiceCallContext.Provider
      value={{
        callState,
        activeCall,
        isMuted,
        isDeafened,
        callDuration,
        isMinimized,
        setIsMinimized,
        startCall,
        acceptCall,
        declineCall,
        endCall,
        toggleMute,
        toggleDeafen,
      }}
    >
      {children}
    </DMVoiceCallContext.Provider>
  );
}

export function useDMVoiceCall() {
  return useContext(DMVoiceCallContext);
}
