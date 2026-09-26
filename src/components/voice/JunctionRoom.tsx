"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GuestUser, Junction, JunctionParticipant, RoomChatMessage } from "@/lib/types";
import { useAudioVisualizer } from "@/hooks/useAudioVisualizer";
import { AudioSettingsModal } from "./AudioSettingsModal";
import { ModeratorControlModal } from "./ModeratorControlModal";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ProfilePreviewModal } from "@/components/profile/ProfilePreviewModal";
import confetti from "canvas-confetti";
import { LiveKitRoom, useTracks, useLocalParticipant, useRoomContext, useConnectionState } from "@livekit/components-react";
import { Track, RoomEvent, ConnectionState } from "livekit-client";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PhoneOff,
  Sliders,
  MessageSquare,
  Smile,
  Users,
  Share2,
  AlertCircle,
  Radio,
  Send,
  X,
  Volume1,
  UserPlus,
  Flame,
  Rocket,
  Heart,
  Sparkles,
  Crown,
  Shield,
  ThumbsUp,
  Activity,
  MoreVertical
} from "lucide-react";

interface JunctionRoomProps {
  junctionId: string;
  guest: GuestUser;
}

interface VectorReaction {
  id: string;
  iconName: string;
  label: string;
  senderName: string;
  color: string;
  x: number;
}

const EMOJI_REACTIONS = [
  { id: "heart", label: "Love", emoji: "❤️", color: "#EC4899" },
  { id: "fire", label: "Fire", emoji: "🔥", color: "#F59E0B" },
  { id: "rocket", label: "Rocket", emoji: "🚀", color: "#8B5CF6" },
  { id: "laugh", label: "Haha", emoji: "😂", color: "#EAB308" },
  { id: "clap", label: "Clap", emoji: "👏", color: "#10B981" },
  { id: "100", label: "100", emoji: "💯", color: "#EF4444" },
  { id: "party", label: "Party", emoji: "🎉", color: "#3B82F6" },
];

function ParticipantAudio({ identity, volume, isDeafened }: { identity: string; volume: number; isDeafened: boolean }) {
  const tracks = useTracks([Track.Source.Microphone]);
  const track = tracks.find((t) => t.participant?.identity === identity)?.publication?.track;
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (el && track) {
      track.attach(el);
    }
    return () => {
      if (el && track) {
        track.detach(el);
      }
    };
  }, [track]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isDeafened ? 0 : volume / 100;
    }
  }, [volume, isDeafened]);

  return <audio ref={audioRef} autoPlay playsInline style={{ display: "none" }} />;
}

function LiveKitDataSync({
  onMessage,
  publishRef,
  onSpeakingChange,
  isMuted,
  isMutedByMod,
  isDeafened
}: {
  onMessage: (data: any) => void;
  publishRef: React.MutableRefObject<((data: any) => void) | null>;
  onSpeakingChange: (speakingIdentities: string[]) => void;
  isMuted: boolean;
  isMutedByMod: boolean;
  isDeafened: boolean;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (!room) return;
    const handleData = (
      payload: Uint8Array,
      participant?: any,
      kind?: any,
      topic?: string
    ) => {
      try {
        const strData = new TextDecoder().decode(payload);
        const parsed = JSON.parse(strData);
        onMessage(parsed);
      } catch (err) { }
    };
    room.on(RoomEvent.DataReceived, handleData);

    const handleActiveSpeakers = (speakers: any[]) => {
      onSpeakingChange(speakers.map(s => s.identity));
    };
    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);

    return () => {
      room.off(RoomEvent.DataReceived, handleData);
      room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
    };
  }, [room, onMessage, onSpeakingChange]);

  useEffect(() => {
    if (localParticipant) {
      publishRef.current = async (data: any) => {
        try {
          const strData = JSON.stringify(data);
          const encoded = new TextEncoder().encode(strData);
          await localParticipant.publishData(encoded, { reliable: true });
        } catch (err) {
          console.error("Failed to publish LiveKit data", err);
        }
      };
    }
    return () => {
      publishRef.current = null;
    };
  }, [localParticipant, publishRef]);

  useEffect(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(!(isMuted || isMutedByMod || isDeafened)).catch(console.error);
    }
  }, [localParticipant, isMuted, isMutedByMod, isDeafened]);

  return null;
}

function RoomConnectionOverlay() {
  const connectionState = useConnectionState();
  if (connectionState === ConnectionState.Reconnecting || connectionState === ConnectionState.Connecting) {
    return (
      <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center animate-fadeIn text-white pointer-events-auto">
        <Activity size={32} className="animate-pulse text-indigo-400 mb-4" />
        <h2 className="text-xl font-bold mb-2 tracking-tight">Reconnecting...</h2>
        <p className="text-sm text-slate-400 font-light">Restoring your secure audio connection</p>
      </div>
    );
  }
  return null;
}

export function JunctionRoom({ junctionId, guest }: JunctionRoomProps) {
  const router = useRouter();

  // Room & participants state
  const [junction, setJunction] = useState<Junction | null>(null);
  const [participants, setParticipants] = useState<JunctionParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kickedNotice, setKickedNotice] = useState<string | null>(null);

  // Audio state
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isMutedByMod, setIsMutedByMod] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [isAudioSettingsOpen, setIsAudioSettingsOpen] = useState(false);
  const [participantVolumes, setParticipantVolumes] = useState<Record<string, number>>({});
  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([]);

  // LiveKit state
  const [liveKitToken, setLiveKitToken] = useState<string | null>(null);
  const [liveKitUrl, setLiveKitUrl] = useState<string | null>(null);

  // Moderation state
  const [isModDeckOpen, setIsModDeckOpen] = useState(false);
  const [activeModMenuParticipant, setActiveModMenuParticipant] = useState<string | null>(null);

  // Chat & Reactions state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [privateRecipient, setPrivateRecipient] = useState<string>("all");
  const [reactions, setReactions] = useState<VectorReaction[]>([]);
  const [isReactionsOpen, setIsReactionsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // LiveKit Data Publish Ref
  const liveKitPublishRef = useRef<((data: any) => void) | null>(null);

  // Profile Preview Modal State
  const [previewParticipant, setPreviewParticipant] = useState<JunctionParticipant | null>(null);

  // Web Audio Visualizer for local mic
  const isCurrentModerator = junction?.participants.some(p => p.identity === guest.name && p.role === "moderator") || false;

  // We no longer manually request getUserMedia here because LiveKitRoom with audio={true}
  // will capture the microphone automatically. Double capturing causes ducking and conflicts.
  useEffect(() => {
    // MediaStream is disabled to prevent WebRTC half-duplex conflicts with LiveKit.
    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [mediaStream]);



  const onRoomMessage = useCallback((data: any) => {
    try {
      if (!data) return;
      const { type, payload } = data;

      if (type === "chat_message" && payload) {
        if (payload.targetIdentity && payload.targetIdentity !== guest.name && payload.senderName !== guest.name) {
          return;
        }
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === payload.id)) return prev;
          return [...prev, payload];
        });
      } else if (type === "reaction" && payload) {
        setReactions((prev) => [...prev, payload]);
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== payload.id));
        }, 2800);
      } else if (type === "clear_chat") {
        setChatMessages([]);
      } else if (type === "moderation_event" && payload) {
        const { targetIdentity, action } = payload;
        if (targetIdentity === guest.name) {
          if (action === "mute") {
            setIsMutedByMod(true);
            setIsMuted(true);
          } else if (action === "unmute") {
            setIsMutedByMod(false);
          } else if (action === "kick" || action === "ban") {
            setKickedNotice(
              action === "ban"
                ? "You have been banned from this junction by the moderator."
                : "You were kicked from this junction by the moderator."
            );
          }
        }
      } else if (type === "room_ended") {
        setKickedNotice("This junction was ended by the moderator.");
      }
    } catch (err) {
      console.error("Error processing room message", err);
    }
  }, [guest.name]);

  // Refs to avoid re-triggering the main effect on polling state changes
  const kickedNoticeRef = useRef(kickedNotice);
  kickedNoticeRef.current = kickedNotice;
  const isMutedByModRef = useRef(isMutedByMod);
  isMutedByModRef.current = isMutedByMod;

  const isRealUnmount = useRef(false);

  // 3. Fetch Junction Details & Join Room
  useEffect(() => {
    let isMounted = true;
    isRealUnmount.current = false;

    async function loadAndJoinJunction() {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/junctions/${junctionId}`);
        const data = await res.json();

        if (!res.ok || !data.junction) {
          throw new Error(data.error || "Junction not found");
        }

        if (!isMounted) return false;
        setJunction(data.junction);

        // Join the junction via API
        const joinRes = await fetch(`/api/junctions/${junctionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "join",
            participant: {
              id: guest.id,
              identity: guest.name,
              name: guest.name,
              avatar: guest.avatar || "zap",
              color: guest.color || "#6366F1",
              role: "speaker", // Backend will override if user should be moderator
              isMuted: false,
              isMutedByMod: false,
              isSpeaking: false,
              connectionQuality: "excellent",
            },
          }),
        });

        const joinData = await joinRes.json();
        if (joinRes.ok && joinData.junction) {
          setJunction(joinData.junction);
          setParticipants(joinData.junction.participants || []);
        } else {
          if (joinData.error) {
            setError(joinData.error);
          }
        }

        setChatMessages([
          {
            id: "system-1",
            senderId: "system",
            senderName: "Junction Bot",
            senderAvatar: "bot",
            senderColor: "#6366F1",
            text: `Welcome ${guest.name} to the ${data.junction.maxParticipants}-seat voice junction! Room audio is 100% isolated & secure.`,
            timestamp: Date.now(),
          },
        ]);

        // Fetch LiveKit Token
        try {
          // Find actual role assigned by the server
          const myParticipant = joinData.junction?.participants.find((p: any) => p.identity === guest.name);
          const role = myParticipant?.role || "speaker";
          const lkRes = await fetch(
            `/api/token?room=${junctionId}&username=${encodeURIComponent(
              guest.name
            )}&avatar=${encodeURIComponent(guest.avatar || "zap")}&color=${encodeURIComponent(
              guest.color || "#6366F1"
            )}&role=${encodeURIComponent(role)}`
          );
          const lkData = await lkRes.json();
          if (lkRes.ok && lkData.token) {
            setLiveKitToken(lkData.token);
            setLiveKitUrl(lkData.serverUrl);
          }
        } catch (e) {
          console.error("Failed to fetch LiveKit token", e);
        }

        return true;
      } catch (err: any) {
        if (isMounted) setError(err.message);
        return false;
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    // Auto-sync polling every 3.5s for junction updates
    let abortController: AbortController | null = null;
    let pollTimeoutId: NodeJS.Timeout;

    const pollJunction = async () => {
      if (abortController) abortController.abort();
      abortController = new AbortController();

      try {
        const pollRes = await fetch(`/api/junctions/${junctionId}`, { signal: abortController.signal });
        if (!pollRes.ok) {
          if (pollRes.status === 404 && isMounted) {
            setKickedNotice("This junction room has ended.");
          }
          return;
        }
        const pollData = await pollRes.json();
        if (pollData.junction && isMounted) {
          setJunction((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(pollData.junction)) return prev;
            return pollData.junction;
          });
          setParticipants((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(pollData.junction.participants)) return prev;
            return pollData.junction.participants || [];
          });

          // Check if user was removed/kicked
          const amIParticipant = pollData.junction.participants.some(
            (p: JunctionParticipant) => p.identity === guest.name
          );
          if (!amIParticipant && !kickedNoticeRef.current) {
            setKickedNotice("You are no longer in this junction.");
          }

          // Check if user is mod-muted
          const myParticipant = pollData.junction.participants.find(
            (p: JunctionParticipant) => p.identity === guest.name
          );
          if (myParticipant?.isMutedByMod && !isMutedByModRef.current) {
            setIsMutedByMod(true);
            setIsMuted(true);
          } else if (myParticipant && !myParticipant.isMutedByMod && isMutedByModRef.current) {
            setIsMutedByMod(false);
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.warn("Polling error:", err);
        }
      } finally {
        if (isMounted) {
          pollTimeoutId = setTimeout(pollJunction, 15000);
        }
      }
    };

    loadAndJoinJunction().then((success) => {
      if (success && isMounted) {
        pollTimeoutId = setTimeout(pollJunction, 15000);
      }
    });

    const handleBeforeUnload = () => {
      fetch(`/api/junctions/${junctionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave", identity: guest.name }),
        keepalive: true,
      }).catch(() => { });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      isMounted = false;
      isRealUnmount.current = true;
      if (abortController) abortController.abort();
      clearTimeout(pollTimeoutId);
      window.removeEventListener("beforeunload", handleBeforeUnload);

      // Delay leave fetch slightly to bypass React Strict Mode's double unmount/mount cycle
      setTimeout(() => {
        if (isRealUnmount.current) {
          fetch(`/api/junctions/${junctionId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "leave", identity: guest.name }),
            keepalive: true,
          }).catch(() => { });
        }
      }, 200);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [junctionId, guest.name, guest.avatar, guest.color, guest.id]);

  // Sync local speaking state is no longer needed since LiveKit tracks speaking for all participants including local.

  // Handle Moderator Operations
  const handleModerateParticipant = async (
    targetIdentity: string,
    modAction: "mute" | "unmute" | "kick" | "ban" | "promote_mod" | "demote_mod"
  ) => {
    if (!isCurrentModerator) return;

    const res = await fetch(`/api/junctions/${junctionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "moderate",
        moderatorIdentity: guest.name,
        targetIdentity,
        modAction,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Moderation action failed");
    }

    if (data.junction) {
      setJunction(data.junction);
      setParticipants(data.junction.participants || []);
    }

    // Broadcast isolated moderation event
    liveKitPublishRef.current?.({
      type: "moderation_event",
      payload: { targetIdentity, action: modAction },
    });

    setActiveModMenuParticipant(null);
  };

  const handleReportParticipant = async (targetIdentity: string) => {
    setActiveModMenuParticipant(null);
    try {
      const res = await fetch(`/api/junctions/${junctionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "report",
          identity: guest.name,
          targetIdentity,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        console.error(data.error || "Failed to report user");
        alert(data.error || "Failed to report user");
      } else {
        alert("User has been reported.");
        if (data.banned) {
          liveKitPublishRef.current?.({
            type: "moderation_event",
            payload: { targetIdentity, action: "ban" },
          });
        }
      }
    } catch (err) {
      console.error("Report error:", err);
    }
  };


  const handleClearChat = () => {
    setChatMessages([]);
    liveKitPublishRef.current?.({ type: "clear_chat" });
  };

  const handleUpdateJunctionDetails = async (updates: { name?: string; maxParticipants?: number }) => {
    try {
      const res = await fetch(`/api/junctions/${junctionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_details",
          moderatorIdentity: guest.name,
          updates,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJunction(data.junction);
      if (liveKitPublishRef.current) {
        liveKitPublishRef.current({ type: "JUNCTION_UPDATE", updates });
      }
    } catch (err: any) {
      throw new Error(err.message);
    }
  };

  const handleToggleRoomLock = async (isLocked: boolean) => {
    if (!isCurrentModerator) return;
    const res = await fetch(`/api/junctions/${junctionId}/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moderatorIdentity: guest.name,
        isLocked,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to toggle room lock");
    }
    if (data.junction) {
      setJunction(data.junction);
    }
    // Optionally we can broadcast a lock event if we want a global toast, but it's not strictly necessary.
  };

  const handleEndJunction = async () => {
    if (guest.name !== junction?.creatorId) return;

    await fetch(`/api/junctions/${junctionId}?creatorId=${encodeURIComponent(guest.name)}`, {
      method: "DELETE",
    });

    liveKitPublishRef.current?.({ type: "room_ended" });
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }
    router.push("/junctions");
  };

  // Send Chat Message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const newMsg: RoomChatMessage = {
      id: "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      senderId: guest.id,
      senderName: guest.name,
      senderAvatar: guest.avatar || "zap",
      senderColor: guest.color || "#6366F1",
      text: inputMessage.trim(),
      timestamp: Date.now(),
      isModerator: isCurrentModerator,
      targetIdentity: privateRecipient !== "all" ? privateRecipient : undefined,
    };

    setChatMessages((prev) => [...prev, newMsg]);
    liveKitPublishRef.current?.({ type: "chat_message", payload: newMsg });
    setInputMessage("");
  };

  // Send Floating Vector Icon Reaction
  const handleSendReaction = (iconName: string, label: string, color: string) => {
    const newReaction: VectorReaction = {
      id: "react_" + Date.now() + Math.random(),
      iconName,
      label,
      color,
      senderName: guest.name,
      x: Math.floor(Math.random() * 60) + 20,
    };

    setReactions((prev) => [...prev, newReaction]);
    liveKitPublishRef.current?.({ type: "reaction", payload: newReaction });

    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
    }, 2800);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleLeave = async () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }

    // Explicitly call leave before navigating away to ensure immediate DB removal
    try {
      await fetch(`/api/junctions/${junctionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave", identity: guest.name }),
      });
    } catch (e) {
      console.error("Failed to leave junction", e);
    }

    router.push("/junctions");
  };

  const handleVolumeChange = (identity: string, vol: number) => {
    setParticipantVolumes((prev) => ({ ...prev, [identity]: vol }));
  };

  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center bg-background px-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center animate-pulse shadow-md mb-3">
          <Radio className="w-6 h-6 sm:w-7 sm:h-7" />
        </div>
        <h2 className="text-lg sm:text-xl font-bold text-white mb-1">Connecting to Junction...</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Allocating encrypted secure audio stream</p>
      </div>
    );
  }

  // Kicked / Banned / Ended Modal
  if (kickedNotice) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-background">
        <div className="p-6 rounded-3xl bg-card max-w-md w-full text-center border border-rose-500/40 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-600/20 text-rose-400 flex items-center justify-center mx-auto mb-3 border border-rose-500/30">
            <Shield size={28} />
          </div>
          <h2 className="text-lg font-bold text-white mb-1">Junction Notice</h2>
          <p className="text-xs text-rose-300 mb-6">{kickedNotice}</p>
          <button
            onClick={() => {
              if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
              router.push("/junctions");
            }}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all cursor-pointer shadow-lg"
          >
            Return to Junctions Hub
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-background">
        <div className="p-6 rounded-2xl bg-card max-w-md w-full text-center border border-rose-500/30">
          <div className="w-12 h-12 rounded-full bg-rose-600/20 text-rose-400 flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-lg font-bold text-white mb-1">Cannot Join Junction</h2>
          <p className="text-xs text-rose-300 mb-6">{error}</p>
          <button
            onClick={() => router.push("/junctions")}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all cursor-pointer"
          >
            Back to Junctions Hub
          </button>
        </div>
      </div>
    );
  }

  const SEAT_SLOTS = Array.from({ length: junction?.maxParticipants || 7 });

  return (
    <div className="relative h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] flex flex-col lg:flex-row overflow-hidden bg-background">
      {/* LiveKit Hidden Audio Manager */}
      {liveKitToken && liveKitUrl && (
        <LiveKitRoom
          token={liveKitToken}
          serverUrl={liveKitUrl}
          connect={true}
          audio={!isMuted && !isMutedByMod}
          video={false}
          style={{ display: 'contents' }}
        >
          <RoomConnectionOverlay />
          <LiveKitDataSync onMessage={onRoomMessage} publishRef={liveKitPublishRef} onSpeakingChange={setActiveSpeakers} isMuted={isMuted} isMutedByMod={isMutedByMod} isDeafened={isDeafened} />
          {participants
            .filter((p) => p.identity !== guest.name)
            .map((p) => (
              <ParticipantAudio
                key={p.identity}
                identity={p.identity}
                volume={participantVolumes[p.identity] ?? 100}
                isDeafened={isDeafened}
              />
            ))}
        </LiveKitRoom>
      )}

      {/* Mod Mute Alert Banner */}
      {isMutedByMod && (
        <div className="bg-rose-900/90 text-rose-200 border-b border-rose-700/60 px-4 py-2 text-center text-xs font-semibold flex items-center justify-center gap-2 animate-fadeIn z-30">
          <AlertCircle size={15} className="text-rose-300 shrink-0" />
          <span>You have been force-muted by the Junction Moderator.</span>
        </div>
      )}

      {/* Floating Emoji Reactions Overlay */}
      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
        {reactions.map((r) => {
          const emoji = EMOJI_REACTIONS.find((er) => er.id === r.iconName)?.emoji || "❤️";

          return (
            <div
              key={r.id}
              style={{ left: `${r.x}%` }}
              className="absolute bottom-28 transform -translate-x-1/2 flex flex-col items-center animate-floatUp drop-shadow-2xl"
            >
              <div className="text-4xl sm:text-5xl drop-shadow-lg">
                {emoji}
              </div>
              <span
                className="text-[10px] sm:text-xs font-bold text-white px-2.5 py-0.5 rounded-full mt-1 bg-black/60 backdrop-blur-md"
                style={{ color: r.color }}
              >
                {r.senderName}
              </span>
            </div>
          );
        })}
      </div>

      {/* Main Left Content Area */}
      <div className={`flex-1 flex flex-col pb-24 lg:pb-0 overflow-y-auto overflow-x-hidden transition-all duration-300`}>
        {/* Top Room Banner - Minimalist */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-4">
          <div className="min-w-0 flex flex-col items-start pr-2">
            {/* Yapclub Brand Logo / Back Button */}
            <button
              onClick={() => router.push('/junctions')}
              className="flex items-center gap-1 mb-1 hover:opacity-80 transition-opacity cursor-pointer group"
            >
              <Radio size={12} className="text-indigo-500 group-hover:text-indigo-400 transition-colors" />
              <span className="text-[10px] font-black tracking-widest text-slate-400 group-hover:text-white transition-colors uppercase">
                yap<span className="text-indigo-500 group-hover:text-indigo-400">club</span>
              </span>
            </button>
            <h1 className="text-base sm:text-lg font-bold text-white truncate w-full drop-shadow-md leading-tight">
              {junction?.name || "Junction Room"}
            </h1>
            <p className="text-[10px] sm:text-[11px] text-slate-400 truncate w-full mt-0.5 drop-shadow-sm">
              {junction?.description || "Voice Hangout"}
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-1.5 sm:gap-2 shrink-0 pt-1 sm:pt-0 max-w-[140px] sm:max-w-none">
            {/* Moderator Deck Trigger */}
            {isCurrentModerator && (
              <button
                onClick={() => setIsModDeckOpen(true)}
                className="flex items-center justify-center p-2 sm:px-3 sm:py-1.5 rounded-full sm:rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95 border border-amber-500/30 shrink-0"
                title="Mod Deck"
              >
                <Shield size={14} className="sm:w-3.5 sm:h-3.5 shrink-0" />
                <span className="hidden sm:inline ml-1.5">Mod Deck</span>
              </button>
            )}

            <div className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full sm:rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-[10px] sm:text-xs font-semibold text-white shadow-sm shrink-0">
              <Users size={12} className="opacity-80 shrink-0" />
              <span>{participants.length}/{junction?.maxParticipants || 7}</span>
            </div>

            <button
              onClick={handleCopyLink}
              className="flex items-center justify-center p-2 sm:px-3 sm:py-1.5 rounded-full sm:rounded-xl bg-black/40 backdrop-blur-md border border-white/10 hover:bg-white/10 text-white transition-colors cursor-pointer shadow-sm shrink-0"
              title="Copy Room Link"
            >
              <Share2 size={13} className="sm:w-3.5 sm:h-3.5 shrink-0" />
              <span className="hidden sm:inline ml-1.5 text-xs font-medium">{isCopied ? "Copied" : "Invite"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Seat Stage Grid */}
      <div className={`w-full mx-auto px-3 sm:px-6 my-auto py-3 sm:py-6 ${
        SEAT_SLOTS.length <= 2 ? "max-w-3xl" : 
        SEAT_SLOTS.length <= 4 ? "max-w-4xl" : 
        SEAT_SLOTS.length <= 6 ? "max-w-5xl" : 
        "max-w-6xl"
      }`}>
        <div className={`grid gap-3 sm:gap-5 justify-center mx-auto ${
          SEAT_SLOTS.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : 
          SEAT_SLOTS.length <= 4 ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-2" : 
          SEAT_SLOTS.length <= 6 ? "grid-cols-2 sm:grid-cols-3" : 
          "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
        }`}>
          {SEAT_SLOTS.map((_, index) => {
            const participant = participants[index];
            const isLocal = participant?.identity === guest.name;
            const isParticipantMod = participant?.role === "moderator";
            const volume = participant ? participantVolumes[participant.identity] ?? 100 : 100;
            const isMenuOpen = activeModMenuParticipant === participant?.identity;

            if (participant) {
              const speaking = activeSpeakers.includes(participant.identity);
              const muted = participant.isMuted || participant.isMutedByMod || (isLocal && (isMuted || isMutedByMod));

              return (
                <div
                  key={participant.id || participant.identity || index}
                  style={!isParticipantMod ? { borderColor: `${participant.color}40`, backgroundColor: `${participant.color}08` } : {}}
                  className={`relative p-3 sm:p-5 rounded-[1.5rem] flex flex-col justify-between items-center text-center transition-all duration-300 ${
                    SEAT_SLOTS.length <= 2 ? "min-h-[180px] sm:min-h-[300px]" :
                    SEAT_SLOTS.length <= 4 ? "min-h-[160px] sm:min-h-[260px]" :
                    "min-h-[140px] sm:min-h-[215px]"
                  } ${
                    isParticipantMod
                      ? "border border-amber-500/30 bg-[#12131A]/80 backdrop-blur-md"
                      : "border border-white/5 bg-[#12131A]/40 backdrop-blur-md"
                  }`}
                >
                  {/* Top Card Header */}
                  <div className="w-full flex items-start sm:items-center justify-between gap-1">
                    <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] sm:text-[10px] font-mono font-semibold text-slate-400 shrink-0">
                      SEAT #{index + 1}
                    </span>

                    <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                      {isParticipantMod && (
                        <span className="flex items-center justify-center p-0.5 sm:p-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm shrink-0" title="Moderator">
                          <Crown size={10} className="fill-amber-400 sm:w-3 sm:h-3" />
                        </span>
                      )}
                      {isLocal && (
                        <span className="px-1 sm:px-1.5 py-0.5 rounded-md bg-indigo-600/25 text-indigo-300 text-[8px] sm:text-[9px] font-bold border border-indigo-500/40 shrink-0">
                          YOU
                        </span>
                      )}

                      {/* Action Trigger for Participants */}
                      {!isLocal && (
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveModMenuParticipant(isMenuOpen ? null : participant.identity);
                            }}
                            className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-white hover:bg-slate-200 dark:bg-slate-800 transition-colors cursor-pointer"
                            title="Participant Actions"
                          >
                            <MoreVertical size={13} />
                          </button>

                          {/* Action Dropdown */}
                          {isMenuOpen && (
                            <div className="absolute top-6 right-0 w-36 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-2xl p-1 z-30 flex flex-col gap-0.5 text-left animate-fadeIn">
                              {isCurrentModerator && (
                                <>
                                  <button
                                    onClick={() =>
                                      handleModerateParticipant(
                                        participant.identity,
                                        participant.isMutedByMod ? "unmute" : "mute"
                                      )
                                    }
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                                  >
                                    {participant.isMutedByMod ? <Mic size={12} /> : <MicOff size={12} className="text-rose-400" />}
                                    <span>{participant.isMutedByMod ? "Unmute" : "Force Mute"}</span>
                                  </button>
                                  <button
                                    onClick={() => handleModerateParticipant(participant.identity, "kick")}
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-rose-400 hover:bg-rose-950/60 flex items-center gap-1.5 transition-colors cursor-pointer"
                                  >
                                    <PhoneOff size={12} />
                                    <span>Kick User</span>
                                  </button>
                                  {participant.role === "moderator" ? (
                                    <button
                                      onClick={() => handleModerateParticipant(participant.identity, "demote_mod")}
                                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-rose-400 hover:bg-rose-950/60 flex items-center gap-1.5 transition-colors cursor-pointer"
                                    >
                                      <Shield size={12} />
                                      <span>Remove Mod</span>
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleModerateParticipant(participant.identity, "promote_mod")}
                                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-amber-400 hover:bg-amber-950/60 flex items-center gap-1.5 transition-colors cursor-pointer"
                                    >
                                      <Crown size={12} />
                                      <span>Make Co-Mod</span>
                                    </button>
                                  )}
                                </>
                              )}
                              <button
                                onClick={() => handleReportParticipant(participant.identity)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-rose-500 hover:bg-rose-950/60 flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <AlertCircle size={12} />
                                <span>Report User</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Center Vector Avatar */}
                  <div 
                    className="relative my-2 cursor-pointer transition-transform hover:scale-105 active:scale-95"
                    onClick={() => setPreviewParticipant(participant)}
                  >
                    <UserAvatar
                      avatar={participant.avatar}
                      color={participant.color}
                      size="lg"
                      isSpeaking={speaking}
                    />

                    {/* Mute Badge Overlay */}
                    {muted && (
                      <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-rose-600 border-2 border-[#111622] text-white shadow-sm">
                        <MicOff size={11} />
                      </div>
                    )}
                  </div>

                  {/* Name & Audio Wave Status */}
                  <div className="w-full flex flex-col items-center gap-1">
                    <div className="font-bold text-xs sm:text-sm text-white truncate max-w-[110px] sm:max-w-[140px]">
                      {participant.name}
                    </div>

                    {/* Fixed Height Soundwave Bar or Status */}
                    <div className="h-5 flex items-center justify-center">
                      {speaking ? (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40">
                          <div className="flex items-center gap-0.5 h-3">
                            <span className="w-0.5 bg-emerald-400 rounded-full soundwave-bar-1" />
                            <span className="w-0.5 bg-emerald-400 rounded-full soundwave-bar-2" />
                            <span className="w-0.5 bg-emerald-400 rounded-full soundwave-bar-3" />
                            <span className="w-0.5 bg-emerald-400 rounded-full soundwave-bar-4" />
                          </div>
                          <span className="text-[10px] text-emerald-400 font-semibold leading-none">
                            Speaking
                          </span>
                        </div>
                      ) : participant.isMutedByMod ? (
                        <span className="text-[10px] text-rose-400 font-semibold">Mod Muted</span>
                      ) : muted ? (
                        <span className="text-[10px] text-rose-400/80 font-medium">Muted</span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-medium">Listening</span>
                      )}
                    </div>

                    {/* Volume Slider for Remote Participants */}
                    {!isLocal && (
                      <div className="w-full mt-1 pt-1.5 border-t border-slate-200 dark:border-slate-800/80 flex items-center gap-1.5">
                        <Volume1 size={11} className="text-slate-500" />
                        <input
                          type="range"
                          min="0"
                          max="150"
                          value={volume}
                          onChange={(e) =>
                            handleVolumeChange(participant.identity, Number(e.target.value))
                          }
                          className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded appearance-none cursor-pointer accent-indigo-500"
                          title={`Volume for ${participant.name}`}
                        />
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono w-5 text-right">
                          {volume}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            // Vacant Seat Slot
            return (
              <div
                key={`vacant-${index}`}
                onClick={handleCopyLink}
                className={`relative p-3 sm:p-5 rounded-[1.5rem] border border-dashed border-white/20 hover:border-indigo-500/50 bg-white/5 hover:bg-white/10 backdrop-blur-md flex flex-col justify-between items-center text-center group cursor-pointer transition-all active:scale-95 ${
                  SEAT_SLOTS.length <= 2 ? "min-h-[180px] sm:min-h-[300px]" :
                  SEAT_SLOTS.length <= 4 ? "min-h-[160px] sm:min-h-[260px]" :
                  "min-h-[140px] sm:min-h-[215px]"
                }`}
              >
                {/* Top Header */}
                <div className="w-full flex items-center justify-between">
                  <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] sm:text-[10px] font-mono font-semibold text-slate-400">
                    SEAT #{index + 1}
                  </span>
                  <span className="text-[8px] sm:text-[9px] text-slate-500 font-medium uppercase">
                    Vacant
                  </span>
                </div>

                {/* Center Icon */}
                <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl border border-dashed border-white/20 group-hover:border-indigo-500/50 group-hover:bg-indigo-600/10 flex items-center justify-center text-slate-500 group-hover:text-indigo-400 transition-all my-1 sm:my-2">
                  <UserPlus size={18} className="sm:w-5 sm:h-5" />
                </div>

                {/* Bottom Prompt */}
                <div className="flex flex-col items-center">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-indigo-300 transition-colors">
                    Open Seat
                  </span>
                  <span className="text-[9px] text-slate-600 group-hover:text-slate-500 dark:text-slate-400 transition-colors">
                    Tap to invite
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Slide-out In-Room Whisper Chat Drawer / Right Sidebar */}
      <div 
        className={`
          fixed inset-x-0 bottom-20 top-14 sm:inset-x-auto sm:right-0 sm:top-16 sm:bottom-24 z-40 bg-[#0B0C10]/95 backdrop-blur-3xl border-t sm:border-t-0 sm:border-l border-white/5 flex flex-col shadow-2xl transition-all duration-300
          ${isChatOpen ? "translate-y-0 translate-x-0 opacity-100" : "translate-y-[150%] sm:translate-y-0 sm:translate-x-full opacity-0 pointer-events-none"}
          lg:relative lg:inset-auto lg:z-10 lg:w-[380px] xl:w-[420px] lg:bg-white/[0.02] lg:border-l lg:border-white/5 lg:shadow-none lg:transform-none lg:transition-none lg:opacity-100 lg:pointer-events-auto
          ${!isChatOpen && 'lg:hidden'}
        `}
      >
        <div className="p-3 sm:p-4 border-b border-white/5 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                <MessageSquare size={16} />
              </div>
              <span className="font-bold text-sm text-white tracking-tight">Whisper Chat</span>
            </div>
            <button
              onClick={() => setIsChatOpen(false)}
              className="p-2 rounded-full text-slate-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
          
          {/* Private Message Recipient Selector */}
          <div className="flex items-center gap-2 bg-black/20 rounded-xl p-1 border border-white/5 shadow-inner">
            <span className="text-[10px] font-bold text-slate-500 pl-2 uppercase tracking-wider">To:</span>
            <select
              value={privateRecipient}
              onChange={(e) => setPrivateRecipient(e.target.value)}
              className="flex-1 bg-transparent text-[11px] text-slate-200 font-semibold focus:outline-none py-1.5 px-1 cursor-pointer appearance-none [&>option]:bg-slate-900"
            >
              <option value="all">Everyone in Room</option>
              {participants
                .filter(p => p.identity !== guest.name)
                .map(p => (
                  <option key={p.identity} value={p.identity}>{p.name} (Whisper)</option>
                ))
              }
            </select>
          </div>
        </div>

        {/* Chat Messages Log */}
        <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-3 scroll-smooth">
          {chatMessages.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 opacity-60">
               <MessageSquare size={32} />
               <span className="text-xs font-medium">Say hello to the room!</span>
             </div>
          ) : chatMessages.map((msg) => {
            const isMe = msg.senderName === guest.name;
            const isPrivate = msg.targetIdentity !== undefined;

            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                  <div className="flex items-center gap-1.5 mb-1 pl-1">
                    <span className="text-[10px] font-semibold text-slate-400">{msg.senderName}</span>
                    {msg.isModerator && (
                      <Crown size={10} className="text-amber-400" />
                    )}
                  </div>
                )}
                
                <div className={`
                  relative max-w-[85%] px-4 py-2.5 text-[13px] sm:text-sm shadow-md backdrop-blur-md leading-relaxed tracking-wide
                  ${isMe 
                    ? (isPrivate ? 'rounded-[1.5rem] rounded-br-[4px] text-white bg-gradient-to-br from-fuchsia-600 to-purple-600 shadow-purple-500/20' : 'rounded-[1.5rem] rounded-br-[4px] text-white bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20')
                    : (isPrivate ? 'rounded-[1.5rem] rounded-bl-[4px] border border-white/5 bg-[#2A1635]/90 text-purple-100 border-purple-500/30' : 'rounded-[1.5rem] rounded-bl-[4px] border border-white/5 bg-[#25262B]/90 text-slate-100')
                  }
                `}>
                  {isPrivate && (
                     <div className={`text-[9px] font-black uppercase tracking-widest mb-1 flex items-center gap-1 opacity-80 ${isMe ? 'text-purple-200' : 'text-purple-300'}`}>
                       <Shield size={10} /> Whisper
                     </div>
                  )}
                  {msg.text}
                </div>
                <span className="text-[9px] text-slate-600 mt-1 px-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })}
        </div>

        {/* Chat Input */}
        <form onSubmit={handleSendMessage} className="p-3 sm:p-4 border-t border-white/5 bg-[#0B0C10]/40 shrink-0">
          <div className="relative flex items-center bg-white/5 border border-white/10 rounded-full p-1 focus-within:border-blue-500/50 focus-within:bg-white/10 transition-all shadow-inner">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={privateRecipient !== "all" ? "Send a secret whisper..." : "iMessage room..."}
              maxLength={200}
              className="flex-1 bg-transparent px-4 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim()}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-500 text-white disabled:opacity-0 disabled:scale-75 hover:bg-blue-400 transition-all duration-300 cursor-pointer shadow-lg shadow-blue-500/20"
            >
              <Send size={14} className={inputMessage.trim() ? "translate-x-0.5 -translate-y-0.5 transition-transform" : ""} />
            </button>
          </div>
        </form>
      </div>

      {/* Floating Bottom Audio Dock Controls */}
      <div className="fixed bottom-3 sm:bottom-4 inset-x-0 z-50 flex justify-center px-3 pointer-events-none">
        <div className="pointer-events-auto p-2 rounded-2xl bg-[#12131A]/80 backdrop-blur-2xl border border-white/10 shadow-2xl flex items-center gap-1.5 sm:gap-2.5">
          {/* Mute / Unmute Mic */}
          <button
            onClick={() => {
              if (isMutedByMod) return;
              setIsMuted(!isMuted);
            }}
            disabled={isMutedByMod}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs transition-all shadow-sm cursor-pointer active:scale-95 ${isMutedByMod
                ? "bg-rose-950 text-rose-400 border border-rose-800 cursor-not-allowed"
                : isMuted
                  ? "bg-rose-600 hover:bg-rose-500 text-white"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
            title={isMutedByMod ? "Muted by Moderator" : isMuted ? "Unmute Mic" : "Mute Mic"}
          >
            {isMuted || isMutedByMod ? <MicOff size={15} /> : <Mic size={15} />}
            <span className="hidden xs:inline">
              {isMutedByMod ? "Mod Muted" : isMuted ? "Unmute" : "Mute"}
            </span>
          </button>

          {/* Deafen / Listen */}
          <button
            onClick={() => setIsDeafened(!isDeafened)}
            className={`p-2 sm:p-2.5 rounded-xl text-xs transition-colors cursor-pointer active:scale-95 ${isDeafened
                ? "bg-rose-600 text-white border border-rose-500"
                : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10"
              }`}
            title={isDeafened ? "Undeafen Audio" : "Deafen Audio"}
          >
            {isDeafened ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          <div className="h-5 w-px bg-white/10 mx-0.5" />

          {/* Reactions */}
          <div className="relative">
            <button
              onClick={() => setIsReactionsOpen(!isReactionsOpen)}
              className={`p-2 sm:p-2.5 rounded-xl text-xs transition-colors cursor-pointer active:scale-95 ${isReactionsOpen
                  ? "bg-indigo-600 text-white border border-indigo-500"
                  : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10"
                }`}
              title="Reactions"
            >
              <Smile size={15} />
            </button>

            {isReactionsOpen && (
              <div className="absolute bottom-12 sm:bottom-14 left-1/2 -translate-x-1/2 p-1.5 sm:p-2 rounded-full bg-[#12131A]/90 backdrop-blur-xl border border-white/10 shadow-2xl flex items-center gap-0.5 sm:gap-1.5 animate-fadeIn max-w-[90vw] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {EMOJI_REACTIONS.map((r) => {
                  return (
                    <button
                      key={r.id}
                      onClick={() => handleSendReaction(r.id, r.label, r.color)}
                      className="p-1 sm:p-1.5 text-[22px] sm:text-2xl hover:scale-125 transition-transform flex items-center justify-center cursor-pointer active:scale-90 shrink-0"
                      title={r.label}
                    >
                      {r.emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chat Toggle Button */}
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`relative p-2 sm:p-2.5 rounded-xl text-xs transition-colors cursor-pointer active:scale-95 ${isChatOpen
                ? "bg-indigo-600 text-white border border-indigo-500"
                : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10"
              }`}
            title="Room Chat"
          >
            <MessageSquare size={15} />
            {chatMessages.length > 1 && !isChatOpen && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
            )}
          </button>

          {/* Audio Settings Modal Trigger */}
          <button
            onClick={() => setIsAudioSettingsOpen(true)}
            className="p-2 sm:p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs transition-colors cursor-pointer active:scale-95"
            title="Settings"
          >
            <Sliders size={15} />
          </button>

          <div className="h-5 w-px bg-white/10 mx-0.5" />

          {/* Disconnect & Leave Junction Button */}
          <button
            onClick={handleLeave}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95"
            title="Leave Junction"
          >
            <PhoneOff size={14} />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </div>

      {/* Audio Settings Modal */}
      <AudioSettingsModal
        isOpen={isAudioSettingsOpen}
        onClose={() => setIsAudioSettingsOpen(false)}
        micVolume={100}
      />

      {/* Moderator Control Modal */}
      {junction && isCurrentModerator && (
        <ModeratorControlModal
          isOpen={isModDeckOpen}
          onClose={() => setIsModDeckOpen(false)}
          junction={junction}
          currentModerator={guest.name}
          onModerateParticipant={handleModerateParticipant}
          onClearChat={handleClearChat}
          onEndJunction={handleEndJunction}
          onToggleRoomLock={handleToggleRoomLock}
          onUpdateJunctionDetails={handleUpdateJunctionDetails}
        />
      )}

      {/* Profile Preview Popover */}
      <ProfilePreviewModal 
        isOpen={previewParticipant !== null}
        onClose={() => setPreviewParticipant(null)}
        participant={previewParticipant}
      />
    </div>
  );
}
