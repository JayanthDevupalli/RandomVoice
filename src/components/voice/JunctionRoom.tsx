"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GuestUser, Junction, JunctionParticipant, RoomChatMessage, UserRole } from "@/lib/types";
import { useAudioVisualizer } from "@/hooks/useAudioVisualizer";
import { useUser } from "@/hooks/useUser";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { ModeratorControlModal } from "./ModeratorControlModal";
import { UserAvatar, AVATAR_ICON_MAP } from "@/components/ui/UserAvatar";
import { ProfilePreviewModal } from "@/components/profile/ProfilePreviewModal";
import { InRoomMessenger } from "./InRoomMessenger";
import { InviteFriendsModal } from "./InviteFriendsModal";
import confetti from "canvas-confetti";
import { getCardThemeStyle } from "@/lib/card-themes";
import { supabase } from "@/lib/supabase";
import { LiveKitRoom, useTracks, useLocalParticipant, useRoomContext, useConnectionState, AudioTrack, StartAudio } from "@livekit/components-react";
import { Track, RoomEvent, ConnectionState } from "livekit-client";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PhoneOff,
  MessageSquare,
  MessageCircle,
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
  MoreVertical,
  Reply,
  Edit2,
  Trash2,
  ChevronDown,
  Lock,
  Check,
  Compass,
  LogIn,
  RotateCw,
  Search,
  Bell,
  BellOff,
  Eye,
  EyeOff,
  Minimize2,
  Maximize2,
  Ban,
  ShieldCheck,
  Zap,
  UserX,
  UserMinus,
  ChevronLeft
} from "lucide-react";
import { RoleBadge, RoleAvatarDot } from "@/components/ui/RoleBadge";

interface JunctionRoomProps {
  junctionId: string;
  guest: GuestUser;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onLeave?: () => void;
}

interface InRoomPopupMessage {
  id: string;
  senderName: string;
  avatar?: string;
  color?: string;
  text: string;
  isWhisper: boolean;
  targetIdentity?: string;
  timestamp: number;
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

function RemoteAudioPipeline({
  participantVolumes,
  isDeafened,
}: {
  participantVolumes: Record<string, number>;
  isDeafened: boolean;
}) {
  const room = useRoomContext();

  // STRICTLY filter out local participant so own voice is NEVER looped back to oneself
  const audioTracks = useTracks(
    [Track.Source.Microphone, Track.Source.ScreenShareAudio],
    { onlySubscribed: true }
  ).filter((trackRef) => !trackRef.participant.isLocal && trackRef.publication?.kind === Track.Kind.Audio);

  const getSafeVolume = (identity?: string, name?: string) => {
    if (isDeafened) return 0;
    const cleanId = (identity || "").trim();
    const cleanName = (name || "").trim();
    let vol = 100;
    if (cleanId && participantVolumes[cleanId] !== undefined) {
      vol = participantVolumes[cleanId];
    } else if (cleanId && participantVolumes[cleanId.toLowerCase()] !== undefined) {
      vol = participantVolumes[cleanId.toLowerCase()];
    } else if (cleanName && participantVolumes[cleanName] !== undefined) {
      vol = participantVolumes[cleanName];
    } else if (cleanName && participantVolumes[cleanName.toLowerCase()] !== undefined) {
      vol = participantVolumes[cleanName.toLowerCase()];
    }
    return Math.min(1, Math.max(0, vol / 100));
  };

  // Sync LiveKit native volume controller across all remote participants and tracks
  useEffect(() => {
    if (!room) return;

    try {
      room.remoteParticipants.forEach((remoteParticipant) => {
        const safeVolume = getSafeVolume(remoteParticipant.identity, remoteParticipant.name);

        // 1. Direct LiveKit RemoteParticipant setVolume API (Microphone & ScreenShare)
        try {
          if (typeof remoteParticipant.setVolume === "function") {
            remoteParticipant.setVolume(safeVolume, Track.Source.Microphone);
            remoteParticipant.setVolume(safeVolume, Track.Source.ScreenShareAudio);
          }
        } catch (e) {}

        // 2. Set on each track publication and any attached media elements
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
                    el.muted = isDeafened || safeVolume === 0;
                  }
                }
              }
            } catch (e) {}
          }
        });
      });
    } catch (err) {
      console.warn("LiveKit native volume sync error:", err);
    }
  }, [room, participantVolumes, isDeafened, audioTracks]);

  return (
    <div style={{ display: "none" }} aria-hidden="true">
      {audioTracks.map((trackRef) => {
        const id = trackRef.participant.identity;
        const name = trackRef.participant.name;
        const safeVolume = getSafeVolume(id, name);
        return (
          <AudioTrack
            key={trackRef.publication?.trackSid || `${id}_${trackRef.source}`}
            trackRef={trackRef}
            volume={safeVolume}
            muted={isDeafened || safeVolume === 0}
            ref={(element) => {
              if (element) {
                element.volume = safeVolume;
                element.muted = isDeafened || safeVolume === 0;
              }
            }}
          />
        );
      })}
      <StartAudio label="Tap to enable room audio" />
    </div>
  );
}

function LiveKitDataSync({
  onMessage,
  publishRef,
  onSpeakingChange,
  onParticipantSync,
  isMuted,
  isMutedByMod,
  isDeafened
}: {
  onMessage: (data: any) => void;
  publishRef: React.MutableRefObject<((data: any) => void) | null>;
  onSpeakingChange: (speakingIdentities: string[]) => void;
  onParticipantSync?: () => void;
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

    const handleParticipantChange = () => {
      onParticipantSync?.();
      if (room && room.state === ConnectionState.Connected) {
        publishRef.current?.({ type: "room_participants_updated" });
      }
    };
    room.on(RoomEvent.Connected, handleParticipantChange);
    room.on(RoomEvent.ParticipantConnected, handleParticipantChange);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantChange);

    return () => {
      room.off(RoomEvent.DataReceived, handleData);
      room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
      room.off(RoomEvent.Connected, handleParticipantChange);
      room.off(RoomEvent.ParticipantConnected, handleParticipantChange);
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantChange);
    };
  }, [room, onMessage, onSpeakingChange, onParticipantSync, publishRef]);

  useEffect(() => {
    if (localParticipant) {
      publishRef.current = async (data: any) => {
        try {
          if (!room || room.state !== ConnectionState.Connected) return;
          const strData = JSON.stringify(data);
          const encoded = new TextEncoder().encode(strData);
          await localParticipant.publishData(encoded, { reliable: true });
        } catch (err: any) {
          if (
            err?.message?.includes("PC manager is closed") ||
            err?.message?.includes("closed") ||
            err?.name === "UnexpectedConnectionState"
          ) {
            return;
          }
          console.warn("LiveKit publish notice:", err);
        }
      };

      // Broadcast join update immediately over WebRTC ONLY if room connection is open & connected
      if (room && room.state === ConnectionState.Connected) {
        localParticipant
          .publishData(new TextEncoder().encode(JSON.stringify({ type: "room_participants_updated" })), {
            reliable: true,
          })
          .catch(() => {});
      }

      onParticipantSync?.();
    }
    return () => {
      publishRef.current = null;
    };
  }, [room, localParticipant, publishRef, onParticipantSync]);

  useEffect(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(
        !(isMuted || isMutedByMod || isDeafened),
        {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        }
      ).catch(console.error);
    }
  }, [localParticipant, isMuted, isMutedByMod, isDeafened]);

  return null;
}

function RoomLifecycleListener({
  onRoomInstance,
  onConnected,
}: {
  onRoomInstance: (room: any) => void;
  onConnected: () => void;
}) {
  const room = useRoomContext();
  const connectionState = useConnectionState();

  useEffect(() => {
    if (room) {
      onRoomInstance(room);
    }
  }, [room, onRoomInstance]);

  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      onConnected();
    }
  }, [connectionState, onConnected]);

  return null;
}

function RoomConnectionOverlay() {
  const connectionState = useConnectionState();
  if (connectionState === ConnectionState.Reconnecting) {
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

export function JunctionRoom({
  junctionId,
  guest,
  isMinimized = false,
  onMinimize,
  onMaximize,
  onLeave,
}: JunctionRoomProps) {
  const router = useRouter();

  // Secure connection staging & clean exit state
  const [isConnectingOverlayOpen, setIsConnectingOverlayOpen] = useState(true);
  const [connectionStep, setConnectionStep] = useState<"auth" | "allocating" | "handshaking" | "connected">("auth");
  const [connectionProgress, setConnectionProgress] = useState<number>(25);
  const [isLeaving, setIsLeaving] = useState(false);
  const [exitStep, setExitStep] = useState<"disconnecting" | "ended">("disconnecting");
  const liveKitRoomRef = useRef<any>(null);
  const isLiveKitConnectedRef = useRef(false);

  // Room & participants state with instant cache retrieval
  const [junction, setJunction] = useState<Junction | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("yapclub_cached_junctions");
        if (cached) {
          const list: Junction[] = JSON.parse(cached);
          const found = list.find((j) => j.id === junctionId);
          if (found) return found;
        }
      } catch {}
    }
    return null;
  });
  const [participants, setParticipants] = useState<JunctionParticipant[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("yapclub_cached_junctions");
        if (cached) {
          const list: Junction[] = JSON.parse(cached);
          const found = list.find((j) => j.id === junctionId);
          if (found?.participants) return found.participants;
        }
      } catch {}
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("yapclub_cached_junctions");
        if (cached) {
          const list: Junction[] = JSON.parse(cached);
          if (list.some((j) => j.id === junctionId)) return false;
        }
      } catch {}
    }
    return true;
  });
  const [error, setError] = useState<string | null>(null);
  const [kickedNotice, setKickedNotice] = useState<string | null>(null);

  // Audio state - initial join is ALWAYS MUTED by default
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isMutedByMod, setIsMutedByMod] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(`junction_mod_muted_${junctionId}`) === "true";
    }
    return false;
  });
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const { user, isRegistered, refreshUser } = useUser();
  const { unreadCount } = useUnreadMessages();

  const myIdentity = (isRegistered && user?.username) || guest?.username || guest?.name || "Guest";
  const myDisplayName = user?.displayName || user?.name || guest?.displayName || guest?.name || myIdentity;

  const [localRoleOverride, setLocalRoleOverride] = useState<UserRole | null>(null);
  const localRoleOverrideRef = useRef<UserRole | null>(null);
  localRoleOverrideRef.current = localRoleOverride;

  const isLocalIdentity = useCallback((target?: string | null) => {
    if (!target) return false;
    const clean = target.trim().toLowerCase();
    const myIdClean = (myIdentity || "").trim().toLowerCase();
    const guestNameClean = (guest?.name || "").trim().toLowerCase();
    const guestUsernameClean = (guest?.username || "").trim().toLowerCase();
    const userNameClean = (user?.username || "").trim().toLowerCase();
    const userDisplayNameClean = (user?.name || "").trim().toLowerCase();
    const userDisplayPropClean = (user?.displayName || "").trim().toLowerCase();

    return Boolean(
      (myIdClean && clean === myIdClean) ||
      (guestNameClean && clean === guestNameClean) ||
      (guestUsernameClean && clean === guestUsernameClean) ||
      (userNameClean && clean === userNameClean) ||
      (userDisplayNameClean && clean === userDisplayNameClean) ||
      (userDisplayPropClean && clean === userDisplayPropClean)
    );
  }, [myIdentity, guest?.name, guest?.username, user?.username, user?.name, user?.displayName]);

  const isLocalParticipant = useCallback((p?: { id?: string; identity?: string; name?: string; username?: string; displayName?: string } | null) => {
    if (!p) return false;
    if (isLocalIdentity(p.identity)) return true;
    if (isLocalIdentity(p.username)) return true;
    if (isLocalIdentity(p.name)) return true;
    if (isLocalIdentity(p.displayName)) return true;
    if (p.id && (p.id === guest?.id || (user?.id && p.id === user.id))) return true;
    return false;
  }, [isLocalIdentity, guest?.id, user?.id]);

  const joinedJunctionIdRef = useRef<string | null>(null);
  const isJoiningRef = useRef<boolean>(false);
  const hasJoinedSuccessfullyRef = useRef<boolean>(false);

  // User platform clearance & identity - seamlessly inherits promoted role instantly
  const myParticipant = participants.find((p) => isLocalParticipant(p));
  const myEffectiveRole: UserRole =
    localRoleOverride ||
    (myParticipant?.userRole && myParticipant.userRole !== "user" ? myParticipant.userRole : null) ||
    user?.role ||
    (myIdentity?.trim().toLowerCase() === "jayanthadmin" || myIdentity?.trim().toLowerCase() === "jayanth"
      ? "super_admin"
      : "user");

  const myPlatformRole = myEffectiveRole;
  const isSuperAdmin = myEffectiveRole === "super_admin";
  const isAdmin = isSuperAdmin || myEffectiveRole === "admin";
  const isManager = isAdmin || myEffectiveRole === "manager";
  const isStaff = isManager;

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
    } catch (e) {
      console.warn("Failed to retrieve supabase session in JunctionRoom:", e);
    }
    const callerUser = user?.username || myIdentity;
    if (callerUser) {
      headers["x-requester-username"] = callerUser;
    }
    if (myPlatformRole) {
      headers["x-requester-role"] = myPlatformRole;
    }
    return headers;
  }, [user?.username, myIdentity, myPlatformRole]);

  // Prefetch junctions hub so minimize transition is instantaneous
  useEffect(() => {
    router.prefetch("/junctions");
  }, [router]);

  const [isDirectMessengerOpen, setIsDirectMessengerOpen] = useState(false);
  const [participantVolumes, setParticipantVolumes] = useState<Record<string, number>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("yapclub_participant_volumes");
        if (stored) return JSON.parse(stored);
      } catch (e) {}
    }
    return {};
  });

  useEffect(() => {
    try {
      localStorage.setItem("yapclub_participant_volumes", JSON.stringify(participantVolumes));
    } catch (e) {}
  }, [participantVolumes]);

  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([]);

  useEffect(() => {
    const handleOpenInRoomDm = () => {
      setIsDirectMessengerOpen(true);
    };
    window.addEventListener("yapclub_open_inroom_dm", handleOpenInRoomDm);
    return () => window.removeEventListener("yapclub_open_inroom_dm", handleOpenInRoomDm);
  }, []);

  // Instant platform suspension guard
  useEffect(() => {
    if (user?.isBanned || (guest as any)?.isBanned) {
      setKickedNotice("Your account has been suspended by YapClub moderation.");
      if (onLeave) onLeave();
    }
  }, [user?.isBanned, guest, onLeave]);

  // LiveKit state
  const [liveKitToken, setLiveKitToken] = useState<string | null>(null);
  const [liveKitUrl, setLiveKitUrl] = useState<string | null>(null);

  // Moderation state
  const [isModDeckOpen, setIsModDeckOpen] = useState(false);
  const [activeModMenuParticipant, setActiveModMenuParticipant] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    participantIdentity: string;
  } | null>(null);

  // Close participant moderation dropdown on Escape key or window resize
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuAnchor(null);
        setActiveModMenuParticipant(null);
      }
    };
    const handleDismiss = () => {
      setMenuAnchor(null);
      setActiveModMenuParticipant(null);
    };

    if (menuAnchor) {
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("resize", handleDismiss);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("resize", handleDismiss);
      };
    }
  }, [menuAnchor]);

  // 3-Minute Moderator Claim Timer State
  const [claimTimerSeconds, setClaimTimerSeconds] = useState<number>(180);
  const [canClaimMod, setCanClaimMod] = useState<boolean>(false);
  const [isClaimingMod, setIsClaimingMod] = useState<boolean>(false);
  const [modNoticeToast, setModNoticeToast] = useState<string | null>(null);

  // Chat & Reactions state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<"chat" | "junctions">("chat");
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [privateRecipient, setPrivateRecipient] = useState<string>("all");
  const [reactions, setReactions] = useState<VectorReaction[]>([]);
  const [isReactionsOpen, setIsReactionsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  // In-Room Whisper Chat: Show msgs / Not show msgs toggle state
  const [showInRoomPopups, setShowInRoomPopups] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("yapclub_show_inroom_popups");
      if (saved !== null) return saved === "true";
    }
    return true; // Default to Show msgs enabled
  });
  const [inRoomPopups, setInRoomPopups] = useState<InRoomPopupMessage[]>([]);

  // Refs for real-time LiveKit handlers to avoid stale closures
  const isChatOpenRef = useRef(isChatOpen);
  isChatOpenRef.current = isChatOpen;
  const rightPanelTabRef = useRef(rightPanelTab);
  rightPanelTabRef.current = rightPanelTab;
  const showInRoomPopupsRef = useRef(showInRoomPopups);
  showInRoomPopupsRef.current = showInRoomPopups;
  const privateRecipientRef = useRef(privateRecipient);
  privateRecipientRef.current = privateRecipient;

  const toggleShowInRoomPopups = useCallback(() => {
    setShowInRoomPopups((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("yapclub_show_inroom_popups", String(next));
      }
      if (!next) {
        setInRoomPopups([]);
      }
      return next;
    });
  }, []);

  // Other Live Junctions Explorer state
  const [otherJunctions, setOtherJunctions] = useState<Junction[]>([]);
  const [isLoadingJunctions, setIsLoadingJunctions] = useState(false);
  const [junctionSearchQuery, setJunctionSearchQuery] = useState("");
  const [isSwitchingRoomId, setIsSwitchingRoomId] = useState<string | null>(null);
  const [switchingRoomName, setSwitchingRoomName] = useState<string | null>(null);

  // Fetch Other Public Junctions
  const fetchOtherJunctions = useCallback(async () => {
    try {
      setIsLoadingJunctions(true);
      const res = await fetch("/api/junctions");
      const data = await res.json();
      if (data?.junctions) {
        const others = (data.junctions as Junction[]).filter(
          (j) =>
            j.id !== junctionId &&
            !j.isLocked &&
            !j.isCustom &&
            !j.creatorId &&
            typeof j.id === "string" &&
            !j.id.startsWith("junc_")
        );
        setOtherJunctions(others);
      }
    } catch (err) {
      console.warn("Failed to fetch other junctions:", err);
    } finally {
      setIsLoadingJunctions(false);
    }
  }, [junctionId]);

  useEffect(() => {
    fetchOtherJunctions();
    const interval = setInterval(fetchOtherJunctions, 15000);
    return () => clearInterval(interval);
  }, [fetchOtherJunctions]);

  // Direct Junction Shifting
  const handleShiftJunction = async (targetJunctionId: string, targetName: string) => {
    if (targetJunctionId === junctionId || isSwitchingRoomId) return;

    setIsSwitchingRoomId(targetJunctionId);
    setSwitchingRoomName(targetName);

    if (typeof window !== "undefined") {
      sessionStorage.removeItem(`junction_mod_muted_${junctionId}`);
      sessionStorage.removeItem(`junction_role_${junctionId}`);
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }

    try {
      await fetch(`/api/junctions/${junctionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "leave",
          identity: myIdentity,
          identities: [
            myIdentity,
            guest.name,
            guest.username,
            user?.username,
            user?.name,
            myDisplayName,
          ].filter(Boolean),
          name: myDisplayName,
          participantId: guest.id,
          userId: user?.id,
        }),
      });
    } catch (e) {
      console.error("Failed to leave current junction before shifting:", e);
    }

    router.push(`/junction/${targetJunctionId}`);
  };

  // Whisper Chat: Reply, Edit & Auto-Scroll state
  const [replyingToMessage, setReplyingToMessage] = useState<RoomChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<RoomChatMessage | null>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // Custom Styled Recipient Dropdown state
  const [isRecipientMenuOpen, setIsRecipientMenuOpen] = useState(false);
  const recipientMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (recipientMenuRef.current && !recipientMenuRef.current.contains(e.target as Node)) {
        setIsRecipientMenuOpen(false);
      }
    };
    if (isRecipientMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isRecipientMenuOpen]);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const [lastReadChatCount, setLastReadChatCount] = useState(0);

  useEffect(() => {
    if (isChatOpen && rightPanelTab === "chat") {
      setLastReadChatCount(chatMessages.length);
    }
  }, [isChatOpen, rightPanelTab, chatMessages.length]);

  useEffect(() => {
    if (isChatOpen) {
      scrollChatToBottom("smooth");
    }
  }, [chatMessages.length, isChatOpen, scrollChatToBottom]);

  // LiveKit Data Publish Ref & Supabase Realtime Channel
  const liveKitPublishRef = useRef<((data: any) => void) | null>(null);
  const supabaseChannelRef = useRef<any>(null);

  // Unified Dual-Channel Broadcaster: publishes across LiveKit WebRTC peer-to-peer AND Supabase Realtime WebSocket in parallel
  const broadcastRoomUpdate = useCallback((eventData: any) => {
    // 1. Peer-to-peer over LiveKit WebRTC Data Channel (<10ms latency)
    try {
      liveKitPublishRef.current?.(eventData);
    } catch (e) {
      console.warn("LiveKit broadcast error", e);
    }

    // 2. High-reliability WebSocket broadcast via Supabase Realtime Channel
    try {
      if (supabaseChannelRef.current) {
        supabaseChannelRef.current.send({
          type: "broadcast",
          event: "room_updated",
          payload: eventData,
        });
      }
    } catch (e) {
      console.warn("Supabase broadcast error", e);
    }
  }, []);

  // Profile Preview Modal State
  const [previewParticipant, setPreviewParticipant] = useState<JunctionParticipant | null>(null);

  // Web Audio Visualizer for local mic
  const isCurrentModerator = (
    participants.some((p) => isLocalParticipant(p) && p.role === "moderator") ||
    junction?.participants.some((p) => isLocalParticipant(p) && p.role === "moderator") ||
    Boolean(junction?.moderatorIdentity && isLocalIdentity(junction.moderatorIdentity)) ||
    (typeof window !== "undefined" && sessionStorage.getItem(`junction_role_${junctionId}`) === "moderator")
  ) || false;

  // 3-Minute Moderator Claim Timer logic
  useEffect(() => {
    if (isCurrentModerator || isStaff) {
      setCanClaimMod(false);
      setClaimTimerSeconds(0);
      return;
    }

    const localP = participants.find((p) => isLocalParticipant(p));
    if (!localP || !localP.joinedAt) return;

    // If there is NO other moderator in the room, allow claiming immediately
    const anyModPresent = participants.some((p) => p.role === "moderator");
    if (!anyModPresent) {
      setClaimTimerSeconds(0);
      setCanClaimMod(true);
      return;
    }

    const updateClaimTimer = () => {
      const elapsed = Date.now() - localP.joinedAt;
      const remainingMs = Math.max(0, 180000 - elapsed);
      const remainingSecs = Math.ceil(remainingMs / 1000);
      setClaimTimerSeconds(remainingSecs);

      if (remainingSecs <= 0) {
        setCanClaimMod(true);
      } else {
        setCanClaimMod(false);
      }
    };

    updateClaimTimer();
    const interval = setInterval(updateClaimTimer, 1000);
    return () => clearInterval(interval);
  }, [isCurrentModerator, isStaff, participants, isLocalParticipant]);

  const handleClaimModerator = async () => {
    if (isClaimingMod || isCurrentModerator) return;
    try {
      setIsClaimingMod(true);
      const res = await fetch(`/api/junctions/${junctionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claim_mod",
          identity: myIdentity,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setModNoticeToast(data.error || "Failed to claim moderator role");
        setTimeout(() => setModNoticeToast(null), 3000);
        return;
      }

      if (typeof window !== "undefined") {
        sessionStorage.setItem(`junction_role_${junctionId}`, "moderator");
      }

      if (data.junction) {
        setJunction(data.junction);
        setParticipants(data.junction.participants || []);
      }

      // Broadcast moderation promotion across all peers in real-time
      broadcastRoomUpdate({
        type: "moderation_event",
        payload: { targetIdentity: myIdentity, action: "promote_mod" },
      });

      setModNoticeToast("👑 You are now a Moderator of this room!");
      setTimeout(() => setModNoticeToast(null), 4000);

      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
    } catch (err: any) {
      console.error("Claim mod error:", err);
      setModNoticeToast(err.message || "Failed to claim moderator");
      setTimeout(() => setModNoticeToast(null), 3000);
    } finally {
      setIsClaimingMod(false);
    }
  };

  const formatTimerMinutes = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

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

  // Refs to avoid re-triggering the main effect on polling state changes
  const kickedNoticeRef = useRef(kickedNotice);
  kickedNoticeRef.current = kickedNotice;
  const isMutedByModRef = useRef(isMutedByMod);
  isMutedByModRef.current = isMutedByMod;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const isRealUnmount = useRef(false);

  // Robust poll junction data from server
  const pollJunction = useCallback(async () => {
    if (isRealUnmount.current) return;
    try {
      const pollRes = await fetch(`/api/junctions/${junctionId}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!pollRes.ok) {
        if (pollRes.status === 404 && !isRealUnmount.current) {
          setKickedNotice("This junction room has ended.");
        }
        return;
      }
      const pollData = await pollRes.json();
      if (pollData.junction && !isRealUnmount.current) {
        setJunction((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(pollData.junction)) return prev;
          return pollData.junction;
        });
        setParticipants((prev) => {
          const serverParticipants = pollData.junction.participants || [];
          const updated = serverParticipants.map((sp: JunctionParticipant) => {
            if (isLocalParticipant(sp)) {
              return {
                ...sp,
                isMuted: isMutedRef.current,
                isMutedByMod: isMutedByModRef.current,
                userRole: localRoleOverrideRef.current || (sp.userRole && sp.userRole !== "user" ? sp.userRole : undefined) || sp.userRole,
              };
            }
            return sp;
          });
          if (JSON.stringify(prev) === JSON.stringify(updated)) return prev;
          return updated;
        });

        // Check if user was removed/kicked only strictly AFTER initial joining has fully completed
        const amIParticipant = pollData.junction.participants?.some(
          (p: JunctionParticipant) => isLocalParticipant(p)
        );
        if (
          hasJoinedSuccessfullyRef.current &&
          joinedJunctionIdRef.current === junctionId &&
          !isJoiningRef.current &&
          pollData.junction.participants?.length > 0 &&
          !amIParticipant &&
          !kickedNoticeRef.current
        ) {
          setKickedNotice("You are no longer in this junction.");
        }

        // Check if user is mod-muted
        const myParticipant = pollData.junction.participants?.find(
          (p: JunctionParticipant) => isLocalParticipant(p)
        );
        if (myParticipant?.isMutedByMod && !isMutedByModRef.current) {
          setIsMutedByMod(true);
          setIsMuted(true);
          if (typeof window !== "undefined") {
            sessionStorage.setItem(`junction_mod_muted_${junctionId}`, "true");
          }
        } else if (myParticipant && !myParticipant.isMutedByMod && isMutedByModRef.current) {
          setIsMutedByMod(false);
          // Only remove force-mute restriction. Do not auto-unmute user's microphone.
          if (typeof window !== "undefined") {
            sessionStorage.removeItem(`junction_mod_muted_${junctionId}`);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.warn("Polling error:", err);
      }
    }
  }, [junctionId, isLocalParticipant]);

  const onRoomMessage = useCallback((data: any) => {
    try {
      if (!data) return;
      const { type, payload } = data;

      if (type === "chat_message" && payload) {
        if (payload.targetIdentity && !isLocalIdentity(payload.targetIdentity) && !isLocalIdentity(payload.senderName)) {
          return;
        }
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === payload.id)) return prev;
          return [...prev, payload];
        });

        // Trigger pop-up message ONLY if:
        // 1. Message is NOT from self
        // 2. Chat drawer is completely closed
        // 3. showInRoomPopups setting is enabled
        const isSelf = isLocalIdentity(payload.senderName) || payload.senderId === guest.id || (user?.id && payload.senderId === user.id);
        if (!isSelf && !isChatOpenRef.current && showInRoomPopupsRef.current) {
          const isWhisper = Boolean(payload.targetIdentity && isLocalIdentity(payload.targetIdentity));
          const newPopup: InRoomPopupMessage = {
            id: payload.id || `popup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            senderName: payload.senderName || "Room Participant",
            avatar: payload.avatar,
            color: payload.color,
            text: payload.text || "",
            isWhisper,
            targetIdentity: payload.targetIdentity,
            timestamp: Date.now(),
          };

          // Strictly ONE pop-up at a time - never stack or flood the screen
          setInRoomPopups([newPopup]);

          // Auto-dismiss in 4.5s so it gives comfortable time to read clearly
          setTimeout(() => {
            setInRoomPopups((prev) => prev.filter((p) => p.id !== newPopup.id));
          }, 4500);
        }
      } else if (type === "chat_edit" && payload) {
        const { id, text } = payload;
        setChatMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, text, isEdited: true } : m))
        );
      } else if (type === "chat_delete" && payload) {
        const { id } = payload;
        setChatMessages((prev) => prev.filter((m) => m.id !== id));
      } else if (type === "reaction" && payload) {
        setReactions((prev) => [...prev, payload]);
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== payload.id));
        }, 2800);
      } else if (type === "clear_chat") {
        setChatMessages([]);
      } else if (type === "moderation_event" && payload) {
        const { targetIdentity, action } = payload;

        // Immediately reflect in room participants state for all users in parallel
        setParticipants((prev) =>
          prev.map((p) => {
            if (p.identity?.toLowerCase() === targetIdentity?.toLowerCase() || (isLocalIdentity(targetIdentity) && isLocalParticipant(p))) {
              if (action === "mute") {
                return { ...p, isMuted: true, isMutedByMod: true };
              } else if (action === "unmute") {
                return { ...p, isMutedByMod: false };
              } else if (action === "promote_mod") {
                return { ...p, role: "moderator" };
              } else if (action === "demote_mod") {
                return { ...p, role: "speaker" };
              }
            }
            return p;
          })
        );

        if (isLocalIdentity(targetIdentity)) {
          if (action === "mute") {
            setIsMutedByMod(true);
            setIsMuted(true);
            if (typeof window !== "undefined") {
              sessionStorage.setItem(`junction_mod_muted_${junctionId}`, "true");
            }
          } else if (action === "unmute") {
            setIsMutedByMod(false);
            // Lift force-mute restriction. User remains self-muted until they click unmute.
            if (typeof window !== "undefined") {
              sessionStorage.removeItem(`junction_mod_muted_${junctionId}`);
            }
          } else if (action === "promote_mod") {
            if (typeof window !== "undefined") {
              sessionStorage.setItem(`junction_role_${junctionId}`, "moderator");
            }
          } else if (action === "demote_mod") {
            if (typeof window !== "undefined") {
              sessionStorage.setItem(`junction_role_${junctionId}`, "speaker");
            }
          } else if (action === "kick" || action === "ban") {
            if (typeof window !== "undefined") {
              sessionStorage.removeItem(`junction_mod_muted_${junctionId}`);
              sessionStorage.removeItem(`junction_role_${junctionId}`);
            }
            setKickedNotice(
              action === "ban"
                ? "You have been banned by YapClub moderation staff."
                : "You were kicked from this junction by the room moderator."
            );
          }
        }

        // Instant room ejection for all peers with zero lag
        if (action === "kick" || action === "ban") {
          setParticipants((prev) => prev.filter((p) => p.identity?.toLowerCase() !== targetIdentity?.toLowerCase() && !isLocalIdentity(targetIdentity)));
        }

        pollJunction();
      } else if (type === "role_change_event" && payload) {
        const { targetIdentity, targetUsername, targetName, newRole } = payload;
        const cleanTarget = (targetIdentity || "").toLowerCase();
        const cleanUser = (targetUsername || "").toLowerCase();
        const cleanN = (targetName || "").toLowerCase();
        setParticipants((prev) =>
          prev.map((p) =>
            (cleanTarget && p.identity?.toLowerCase() === cleanTarget) ||
            (cleanUser && p.username?.toLowerCase() === cleanUser) ||
            (cleanN && p.name?.toLowerCase() === cleanN) ||
            (cleanTarget && isLocalIdentity(cleanTarget) && isLocalParticipant(p)) ||
            (cleanUser && isLocalIdentity(cleanUser) && isLocalParticipant(p))
              ? { ...p, userRole: newRole }
              : p
          )
        );
        if (
          isLocalIdentity(targetIdentity) ||
          (cleanUser && isLocalIdentity(cleanUser)) ||
          (cleanN && isLocalIdentity(cleanN))
        ) {
          setLocalRoleOverride(newRole);
          localRoleOverrideRef.current = newRole;
          refreshUser?.();
          setModNoticeToast(`🎖️ Your platform role was updated to: ${newRole.toUpperCase()}`);
          setTimeout(() => setModNoticeToast(null), 4000);
        }
        pollJunction();
      } else if (type === "participant_mute_change" && payload) {
        const { identity: targetId, isMuted: targetMute } = payload;
        setParticipants((prev) =>
          prev.map((p) =>
            p.identity?.toLowerCase() === targetId?.toLowerCase() || (isLocalIdentity(targetId) && isLocalParticipant(p))
              ? { ...p, isMuted: targetMute }
              : p
          )
        );
      } else if (type === "room_ended") {
        setKickedNotice("This junction was closed by YapClub administration.");
      } else if (type === "room_participants_updated") {
        pollJunction();
      }
    } catch (err) {
      console.error("Error processing room message", err);
    }
  }, [isLocalIdentity, isLocalParticipant, junctionId, user?.id, guest?.id, refreshUser, pollJunction]);

  const pollJunctionRef = useRef(pollJunction);
  pollJunctionRef.current = pollJunction;
  const onRoomMessageRef = useRef(onRoomMessage);
  onRoomMessageRef.current = onRoomMessage;

  // Continuous Room Sync Effect: 5s background heartbeat & Shared Supabase Realtime channel
  useEffect(() => {
    let isMounted = true;
    let timerId: NodeJS.Timeout;
    let debounceTimer: NodeJS.Timeout | null = null;

    const triggerDebouncedPoll = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isMounted && hasJoinedSuccessfullyRef.current && joinedJunctionIdRef.current === junctionId) {
          pollJunctionRef.current();
        }
      }, 1000);
    };

    const runPoll = async () => {
      if (hasJoinedSuccessfullyRef.current && joinedJunctionIdRef.current === junctionId && !isJoiningRef.current) {
        await pollJunctionRef.current();
      }
      if (isMounted) {
        timerId = setTimeout(runPoll, 5000);
      }
    };

    // Delay initial background poll heartbeat so join sequence establishes cleanly without concurrent fetch collisions
    timerId = setTimeout(runPoll, 5000);

    const roomChannelId = `room_realtime_${junctionId}`;
    const existingRoomCh = supabase.getChannels().find(
      (c) => c.topic === `realtime:${roomChannelId}` || c.topic === roomChannelId
    );
    if (existingRoomCh) {
      supabase.removeChannel(existingRoomCh);
    }
    const roomChannel = supabase
      .channel(roomChannelId)
      .on("broadcast", { event: "room_updated" }, (msg: any) => {
        if (msg?.payload) {
          onRoomMessageRef.current(msg.payload);
        } else {
          triggerDebouncedPoll();
        }
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "junction_participants",
          filter: `junction_id=eq.${junctionId}`,
        },
        () => {
          triggerDebouncedPoll();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "junctions",
          filter: `id=eq.${junctionId}`,
        },
        () => {
          triggerDebouncedPoll();
        }
      )
      .subscribe();

    supabaseChannelRef.current = roomChannel;

    // Listen to global user profile / role updates broadcast from admin actions
    const userUpdatesChannelId = `room_user_updates_${junctionId}`;
    const userUpdatesChannel = supabase
      .channel(userUpdatesChannelId)
      .on("broadcast", { event: "profile_updated" }, (msg: any) => {
        const p = msg?.payload;
        if (!p) return;
        const { targetUsername, newRole } = p;
        if (newRole && targetUsername) {
          const cleanU = targetUsername.toLowerCase();
          setParticipants((prev) =>
            prev.map((part) =>
              part.username?.toLowerCase() === cleanU ||
              part.identity?.toLowerCase() === cleanU ||
              part.name?.toLowerCase() === cleanU
                ? { ...part, userRole: newRole }
                : part
            )
          );
        }
        triggerDebouncedPoll();
      })
      .subscribe();

    return () => {
      isMounted = false;
      clearTimeout(timerId);
      if (debounceTimer) clearTimeout(debounceTimer);
      supabaseChannelRef.current = null;
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(userUpdatesChannel);
    };
  }, [junctionId]);

  // Join Room & LiveKit Connection Effect
  useEffect(() => {
    let isMounted = true;
    isRealUnmount.current = false;

    if (joinedJunctionIdRef.current === junctionId || isJoiningRef.current) {
      return;
    }
    isJoiningRef.current = true;
    hasJoinedSuccessfullyRef.current = false;

    async function loadAndJoinJunction() {
      const startTime = Date.now();
      try {
        setConnectionStep("auth");
        setConnectionProgress(25);
        setIsConnectingOverlayOpen(true);

        // Read stored session flags to survive page reloads
        const storedModMuted = typeof window !== "undefined" && sessionStorage.getItem(`junction_mod_muted_${junctionId}`) === "true";
        const storedRole = typeof window !== "undefined" ? sessionStorage.getItem(`junction_role_${junctionId}`) : null;

        const joinIdentity = (isRegistered && user?.username) || guest?.username || guest?.name || "Guest";
        const joinDisplayName = (isRegistered && (user?.displayName || user?.name)) || guest?.displayName || guest?.name || joinIdentity;
        const participantAvatar = isRegistered && user ? user.avatar : (guest.avatar || "zap");
        const participantColor = isRegistered && user ? user.color : (guest.color || "#6366F1");
        const participantCardBg = isRegistered && user ? user.cardBgColor : (guest.cardBgColor || "#465B73");

        // Stage 1: Auth & credentials check (deliberate 500ms pacing)
        setConnectionStep("auth");
        setConnectionProgress(25);
        setIsConnectingOverlayOpen(true);

        const joinPromise = fetch(`/api/junctions/${junctionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "join",
            participant: {
              id: isRegistered && user ? user.id : guest.id,
              identity: joinIdentity,
              name: joinDisplayName,
              username: joinIdentity,
              displayName: joinDisplayName,
              avatar: participantAvatar,
              color: participantColor,
              cardBgColor: participantCardBg,
              role: storedRole || "speaker",
              isMuted: true, // Always start MUTED by default
              isMutedByMod: storedModMuted,
              isSpeaking: false,
              connectionQuality: "excellent",
            },
          }),
        });

        const tokenPromise = fetch(
          `/api/token?room=${junctionId}&username=${encodeURIComponent(
            joinIdentity
          )}&displayName=${encodeURIComponent(
            joinDisplayName
          )}&avatar=${encodeURIComponent(participantAvatar)}&color=${encodeURIComponent(
            participantColor
          )}&role=${encodeURIComponent(storedRole || "speaker")}`
        );

        // Keep Stage 1 visible for a clear, deliberate 500ms
        await new Promise((r) => setTimeout(r, 500));
        if (!isMounted) return false;

        // Stage 2: Allocating room seat and audio buffers
        setConnectionStep("allocating");
        setConnectionProgress(60);

        // Await responses with guaranteed deliberate pacing (minimum 600ms)
        const [joinRes, lkRes] = await Promise.all([
          joinPromise,
          tokenPromise,
          new Promise((r) => setTimeout(r, 600)),
        ]);
        if (!isMounted) return false;

        const [joinData, lkData] = await Promise.all([joinRes.json(), lkRes.json()]);

        if (!joinRes.ok || !joinData.junction) {
          const errMsg = joinData.error || "Unable to join this junction.";
          setError(errMsg);
          setKickedNotice(errMsg);
          setIsConnectingOverlayOpen(false);
          return false;
        }

        if (!lkRes.ok || !lkData.token) {
          const tokenErr = lkData.error || "Failed to obtain voice credentials.";
          setError(tokenErr);
          setKickedNotice(tokenErr);
          setIsConnectingOverlayOpen(false);
          return false;
        }

        // Stage 3: Handshaking encrypted WebRTC voice tunnel
        setConnectionStep("handshaking");
        setConnectionProgress(85);

        setJunction(joinData.junction);
        setParticipants(joinData.junction.participants || []);
        setLiveKitToken(lkData.token);
        setLiveKitUrl(lkData.serverUrl);
        setKickedNotice(null);
        joinedJunctionIdRef.current = junctionId;
        hasJoinedSuccessfullyRef.current = true;

        // Broadcast room participant update across both channels
        broadcastRoomUpdate({ type: "room_participants_updated" });

        // Sync local state if participant is mod-muted or has specific role in DB or session
        const myParticipant = joinData.junction.participants?.find((p: any) => isLocalParticipant(p));
        if (myParticipant?.isMutedByMod || storedModMuted) {
          setIsMutedByMod(true);
          setIsMuted(true);
          if (typeof window !== "undefined") {
            sessionStorage.setItem(`junction_mod_muted_${junctionId}`, "true");
          }
        }
        if (myParticipant?.role && typeof window !== "undefined") {
          sessionStorage.setItem(`junction_role_${junctionId}`, myParticipant.role);
        }

        setChatMessages([]);

        // Stage 3 deliberate duration: 700ms for encrypted WebRTC tunnel handshake
        await new Promise((r) => setTimeout(r, 700));
        if (!isMounted) return false;

        // Stage 4: 100% Connected confirmation
        setConnectionStep("connected");
        setConnectionProgress(100);

        // Keep 100% Connected confirmation visible for a solid 850ms so user clearly sees 100% verified status!
        await new Promise((r) => setTimeout(r, 850));
        if (isMounted) {
          setIsConnectingOverlayOpen(false);
        }

        return true;
      } catch (err: any) {
        if (isMounted) {
          setError(err.message);
          setIsConnectingOverlayOpen(false);
        }
        return false;
      } finally {
        isJoiningRef.current = false;
        if (isMounted) setIsLoading(false);
      }
    }

    loadAndJoinJunction();

    return () => {
      isMounted = false;
      isRealUnmount.current = true;
      isJoiningRef.current = false;
      hasJoinedSuccessfullyRef.current = false;

      // Emergency hardware & connection release if unmounted without handleLeave
      if (liveKitRoomRef.current) {
        try {
          const local = liveKitRoomRef.current.localParticipant;
          if (local) {
            local.audioTrackPublications?.forEach((pub: any) => {
              try {
                pub.track?.stop();
                pub.audioTrack?.stop();
              } catch {}
            });
          }
          liveKitRoomRef.current.disconnect();
        } catch {}
      }

      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [junctionId]);

  // Clean disconnect on tab close, back button or page hide
  useEffect(() => {
    const handleUnload = () => {
      try {
        const payload = JSON.stringify({
          action: "leave",
          identity: myIdentity,
          identities: [
            myIdentity,
            guest.name,
            guest.username,
            user?.username,
            user?.name,
            myDisplayName,
          ].filter(Boolean),
          name: myDisplayName,
          participantId: guest.id,
          userId: user?.id,
        });
        navigator.sendBeacon(`/api/junctions/${junctionId}`, new Blob([payload], { type: "application/json" }));
      } catch (e) { }
    };

    window.addEventListener("pagehide", handleUnload);
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.removeEventListener("pagehide", handleUnload);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [junctionId, myIdentity, myDisplayName, guest.name, guest.username, guest.id, user?.username, user?.name, user?.id]);

  // Sync local speaking state is no longer needed since LiveKit tracks speaking for all participants including local.

  // Handle Moderator & Staff Operations
  const handleModerateParticipant = async (
    targetIdentity: string,
    modAction: "mute" | "unmute" | "kick" | "ban" | "unban" | "promote_mod" | "demote_mod"
  ) => {
    if (!isCurrentModerator && !isStaff) return;

    // Strict rule: Room hosts / regular users cannot kick fellow participants. Only official Staff can kick.
    if ((modAction === "kick" || modAction === "ban") && !isStaff) {
      alert("Unauthorized: Only official Staff (Managers, Admins, Main Admin) can kick participants.");
      return;
    }

    // Optimistically update participants state case-insensitively
    const cleanTarget = targetIdentity.toLowerCase();
    setParticipants((prev) =>
      modAction === "kick" || modAction === "ban"
        ? prev.filter((p) => p.identity?.toLowerCase() !== cleanTarget && !isLocalIdentity(targetIdentity))
        : prev.map((p) => {
            if (p.identity?.toLowerCase() === cleanTarget || (isLocalIdentity(targetIdentity) && isLocalParticipant(p))) {
              if (modAction === "mute") {
                return { ...p, isMuted: true, isMutedByMod: true };
              } else if (modAction === "unmute") {
                return { ...p, isMutedByMod: false };
              } else if (modAction === "promote_mod") {
                return { ...p, role: "moderator" };
              } else if (modAction === "demote_mod") {
                return { ...p, role: "speaker" };
              }
            }
            return p;
          })
    );

    try {
      const res = await fetch(`/api/junctions/${junctionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "moderate",
          moderatorIdentity: myIdentity,
          moderatorUserId: user?.id,
          moderatorUsername: user?.username || myIdentity,
          requesterRole: myPlatformRole,
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

      // Broadcast moderation event across all peers in parallel
      broadcastRoomUpdate({
        type: "moderation_event",
        payload: { targetIdentity, action: modAction },
      });

      const actionLabels: Record<string, string> = {
        mute: `Muted @${targetIdentity}`,
        unmute: `Unmuted @${targetIdentity}`,
        kick: `Kicked @${targetIdentity} from junction`,
        ban: `Banned @${targetIdentity} from junction`,
        promote_mod: `Promoted @${targetIdentity} to Host`,
        demote_mod: `Removed Host role from @${targetIdentity}`,
      };
      setModNoticeToast(`🛡️ ${actionLabels[modAction] || "Action completed"}`);
      setTimeout(() => setModNoticeToast(null), 3500);
    } catch (err: any) {
      console.error("Moderation error:", err);
      alert(err.message || "Failed to perform action");
    } finally {
      setActiveModMenuParticipant(null);
    }
  };

  // Staff Action: Platform Suspend / Ban Account
  const handlePlatformBanParticipant = async (targetParticipant: JunctionParticipant) => {
    const targetUserClean = (targetParticipant.username || targetParticipant.identity || "").trim().toLowerCase();
    const targetRole = targetParticipant.userRole || (
      targetUserClean === "jayanthadmin" || targetUserClean === "jayanth"
        ? "super_admin"
        : "user"
    );

    if (targetRole === "super_admin") {
      alert("Protected: The Main Admin cannot be banned or suspended.");
      return;
    }
    if (targetRole === "admin" && !isSuperAdmin) {
      alert("Only the Main Admin has authority to suspend an Admin.");
      return;
    }
    if (targetRole === "manager" && !isAdmin) {
      alert("Admin clearance required to suspend a Manager.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to suspend @${targetParticipant.username || targetParticipant.identity}?\nThis will ban their account from YapClub and disconnect them immediately.`
    );
    if (!confirmed) return;

    setActiveModMenuParticipant(null);

    // 1. Instantly remove from room & broadcast kick/ban
    handleModerateParticipant(targetParticipant.identity, "ban");

    const isParticipantUuid = Boolean(
      targetParticipant.id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetParticipant.id)
    );

    try {
      const authHeaders = await getAuthHeaders();
      const targetUser = targetParticipant.username || targetParticipant.identity;
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          action: "toggle_ban",
          targetUserId: isParticipantUuid ? targetParticipant.id : undefined,
          targetUsername: targetUser,
          isBanned: true,
          bannedReason: `Suspended by ${myPlatformRole} @${myIdentity} from room "${junction?.name || ""}"`,
          requesterUsername: user?.username || myIdentity,
          requesterRole: myPlatformRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to suspend account");
      }

      // Broadcast ban event across both LiveKit and Supabase Realtime
      broadcastRoomUpdate({
        type: "moderation_event",
        payload: { targetIdentity: targetParticipant.identity, action: "ban" },
      });

      setModNoticeToast(`🚫 Account @${targetParticipant.username || targetParticipant.identity} has been suspended.`);
      setTimeout(() => setModNoticeToast(null), 4000);
    } catch (err: any) {
      console.error("Ban error:", err);
      alert(err.message || "Failed to suspend account");
    }
  };

  // Staff Action: Role Promotion & Demotion
  const handleSetRoleParticipant = async (
    targetParticipant: JunctionParticipant,
    newRole: "admin" | "manager" | "user"
  ) => {
    const targetUserClean = (targetParticipant.username || targetParticipant.name || targetParticipant.identity || "").trim().toLowerCase();
    const targetRole = targetParticipant.userRole || (
      targetUserClean === "jayanthadmin" || targetUserClean === "jayanth"
        ? "super_admin"
        : "user"
    );

    if (targetRole === "super_admin") {
      alert("Protected: The Main Admin cannot be demoted.");
      return;
    }
    if (newRole === "admin" && !isSuperAdmin) {
      alert("Only the Main Admin can appoint Admins.");
      return;
    }
    if (targetRole === "admin" && !isSuperAdmin) {
      alert("Only the Main Admin can demote an Admin.");
      return;
    }
    if (newRole === "manager" && !isAdmin) {
      alert("Admin clearance required to appoint a Manager.");
      return;
    }
    if (targetRole === "manager" && newRole === "user" && !isAdmin) {
      alert("Admin clearance required to demote a Manager.");
      return;
    }

    const actionLabel = newRole === "user" ? "Demote" : "Promote";
    const confirmed = window.confirm(
      `${actionLabel} @${targetParticipant.username || targetParticipant.name || targetParticipant.identity} to ${newRole.toUpperCase()}?`
    );
    if (!confirmed) return;

    setActiveModMenuParticipant(null);

    // Optimistically update participant role locally (case-insensitive & local-aware)
    const cleanTarget = targetParticipant.identity?.toLowerCase();
    const cleanUsername = targetParticipant.username?.toLowerCase();
    const cleanName = targetParticipant.name?.toLowerCase();
    setParticipants((prev) =>
      prev.map((p) =>
        p.identity?.toLowerCase() === cleanTarget ||
        (cleanUsername && p.username?.toLowerCase() === cleanUsername) ||
        (cleanName && p.name?.toLowerCase() === cleanName) ||
        (isLocalIdentity(targetParticipant.identity) && isLocalParticipant(p))
          ? { ...p, userRole: newRole }
          : p
      )
    );
    if (isLocalIdentity(targetParticipant.identity)) {
      setLocalRoleOverride(newRole);
      localRoleOverrideRef.current = newRole;
      refreshUser?.();
    }

    const isParticipantUuid = Boolean(
      targetParticipant.id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetParticipant.id)
    );

    try {
      const authHeaders = await getAuthHeaders();
      const targetUser = targetParticipant.username || targetParticipant.name || targetParticipant.identity;
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          action: "set_role",
          role: newRole,
          targetUserId: isParticipantUuid ? targetParticipant.id : undefined,
          targetUsername: targetUser,
          requesterUsername: user?.username || myIdentity,
          requesterRole: myPlatformRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update role");
      }

      // Broadcast role change event over both LiveKit and Supabase Realtime in parallel
      broadcastRoomUpdate({
        type: "role_change_event",
        payload: {
          targetIdentity: targetParticipant.identity,
          targetUsername: targetParticipant.username,
          targetName: targetParticipant.name,
          newRole,
        },
      });

      setModNoticeToast(`🎖️ Updated @${targetParticipant.username || targetParticipant.name || targetParticipant.identity} role to ${newRole.toUpperCase()}`);
      setTimeout(() => setModNoticeToast(null), 4000);

      confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
    } catch (err: any) {
      console.error("Set role error:", err);
      alert(err.message || "Failed to update role");
      // Revert optimistic role update on failure
      const cleanTarget = targetParticipant.identity?.toLowerCase();
      const cleanUsername = targetParticipant.username?.toLowerCase();
      const cleanName = targetParticipant.name?.toLowerCase();
      setParticipants((prev) =>
        prev.map((p) =>
          p.identity?.toLowerCase() === cleanTarget ||
          (cleanUsername && p.username?.toLowerCase() === cleanUsername) ||
          (cleanName && p.name?.toLowerCase() === cleanName) ||
          (isLocalIdentity(targetParticipant.identity) && isLocalParticipant(p))
            ? { ...p, userRole: targetParticipant.userRole }
            : p
        )
      );
    }
  };

  // Main Admin Only Action: Permanently Delete Account
  const handleDeleteAccountParticipant = async (targetParticipant: JunctionParticipant) => {
    if (!isSuperAdmin) {
      alert("Only the Main Admin has authority to permanently delete accounts.");
      return;
    }

    const confirmed = window.confirm(
      `⚠️ PERMANENT ACCOUNT DELETION:\nAre you sure you want to permanently delete the account of @${targetParticipant.username || targetParticipant.identity}? This will remove all their profiles, rooms, connections, and login data permanently.`
    );
    if (!confirmed) return;

    setActiveModMenuParticipant(null);

    // Immediately kick from room
    handleModerateParticipant(targetParticipant.identity, "kick");

    const isParticipantUuid = Boolean(
      targetParticipant.id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetParticipant.id)
    );

    try {
      const authHeaders = await getAuthHeaders();
      const targetUser = targetParticipant.username || targetParticipant.identity;
      const res = await fetch(
        `/api/admin/users?${isParticipantUuid ? `targetUserId=${encodeURIComponent(targetParticipant.id)}&` : ""}targetUsername=${encodeURIComponent(targetUser)}&requesterRole=${encodeURIComponent(myPlatformRole)}&requesterUsername=${encodeURIComponent(user?.username || myIdentity)}`,
        {
          method: "DELETE",
          headers: authHeaders,
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete account");
      }

      setModNoticeToast(`🗑️ Account @${targetParticipant.username || targetParticipant.identity} was permanently deleted.`);
      setTimeout(() => setModNoticeToast(null), 4000);
    } catch (err: any) {
      console.error("Delete account error:", err);
      alert(err.message || "Failed to delete account");
    }
  };

  // Admin & Super Admin Action: Terminate / Delete Junction Room
  const handleForceDeleteRoom = async () => {
    if (!isAdmin) return;

    const confirmed = window.confirm(
      `Terminate and delete "${junction?.name || "this room"}" immediately?\nAll participants will be disconnected.`
    );
    if (!confirmed) return;

    try {
      // 1. Broadcast room ended to disconnect all peers across all channels
      broadcastRoomUpdate({ type: "room_ended" });

      // 2. Call delete API with callerRole and auth headers
      const authHeaders = await getAuthHeaders();
      await fetch(`/api/junctions/${junctionId}?callerRole=${myPlatformRole}&moderatorIdentity=${encodeURIComponent(myIdentity)}`, {
        method: "DELETE",
        headers: authHeaders,
      });

      // 3. Clean local storage flags
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(`junction_mod_muted_${junctionId}`);
        sessionStorage.removeItem(`junction_role_${junctionId}`);
      }

      router.push("/junctions");
    } catch (err: any) {
      console.error("Failed to force delete room:", err);
      alert(err.message || "Failed to end room");
    }
  };

  const handleReportParticipant = async (targetIdentity: string) => {
    setActiveModMenuParticipant(null);
    try {
      const res = await fetch(`/api/junctions/${junctionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "report",
          identity: myIdentity,
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
          broadcastRoomUpdate({
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
    broadcastRoomUpdate({ type: "clear_chat" });
  };

  const handleUpdateJunctionDetails = async (updates: { name?: string; maxParticipants?: number }) => {
    try {
      const res = await fetch(`/api/junctions/${junctionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_details",
          moderatorIdentity: myIdentity,
          updates,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJunction(data.junction);
      broadcastRoomUpdate({ type: "JUNCTION_UPDATE", updates });
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
        moderatorIdentity: myIdentity,
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
    if (!isLocalIdentity(junction?.creatorId)) return;

    await fetch(`/api/junctions/${junctionId}?creatorId=${encodeURIComponent(myIdentity)}`, {
      method: "DELETE",
    });

    broadcastRoomUpdate({ type: "room_ended" });
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }
    router.push("/junctions");
  };

  // Send or Edit Chat Message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    if (editingMessage) {
      const updatedText = inputMessage.trim();
      setChatMessages((prev) =>
        prev.map((m) => (m.id === editingMessage.id ? { ...m, text: updatedText, isEdited: true } : m))
      );
      broadcastRoomUpdate({
        type: "chat_edit",
        payload: { id: editingMessage.id, text: updatedText },
      });
      setEditingMessage(null);
      setInputMessage("");
      return;
    }

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
      replyTo: replyingToMessage ? {
        id: replyingToMessage.id,
        senderName: replyingToMessage.senderName,
        text: replyingToMessage.text.slice(0, 100),
      } : undefined,
    };

    setChatMessages((prev) => [...prev, newMsg]);
    broadcastRoomUpdate({ type: "chat_message", payload: newMsg });
    setInputMessage("");
    setReplyingToMessage(null);
  };

  // Delete message (available to ALL participants for community safety/moderation)
  const handleDeleteMessage = (msgId: string) => {
    setChatMessages((prev) => prev.filter((m) => m.id !== msgId));
    broadcastRoomUpdate({
      type: "chat_delete",
      payload: { id: msgId },
    });
    if (editingMessage?.id === msgId) {
      setEditingMessage(null);
      setInputMessage("");
    }
    if (replyingToMessage?.id === msgId) {
      setReplyingToMessage(null);
    }
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
    broadcastRoomUpdate({ type: "reaction", payload: newReaction });

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
    if (isLeaving) return;
    setIsLeaving(true);
    setExitStep("disconnecting");

    // 1. Broadcast departure immediately across both channels so peers update UI right away
    broadcastRoomUpdate({
      type: "room_participants_updated",
      payload: { action: "leave", identity: myIdentity },
    });

    // 2. Hardware mic teardown: disable microphone & stop tracks so mic indicator immediately turns off
    try {
      if (liveKitRoomRef.current) {
        const local = liveKitRoomRef.current.localParticipant;
        if (local) {
          try {
            await local.setMicrophoneEnabled(false);
          } catch {}
          local.audioTrackPublications?.forEach((pub: any) => {
            try {
              pub.track?.stop();
              pub.audioTrack?.stop();
              local.unpublishTrack(pub.track).catch(() => {});
            } catch {}
          });
        }
        await liveKitRoomRef.current.disconnect();
      }
    } catch (e) {
      console.warn("LiveKit disconnect notice:", e);
    }

    // 3. Stop browser MediaStream
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }

    // 4. Remove all session storage keys
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(`junction_mod_muted_${junctionId}`);
      sessionStorage.removeItem(`junction_role_${junctionId}`);
      sessionStorage.removeItem("yapclub_active_junction_id");
    }

    // 5. Update cached lobby state in sessionStorage so leaving user disappears from lobby immediately
    if (typeof window !== "undefined") {
      try {
        const cachedStr = sessionStorage.getItem("yapclub_cached_junctions");
        if (cachedStr) {
          const list: Junction[] = JSON.parse(cachedStr);
          const updatedList = list.map((j) => {
            if (j.id === junctionId) {
              const remaining = j.participants.filter(
                (p) => (p.identity || "").toLowerCase() !== myIdentity.toLowerCase()
              );
              return { ...j, participants: remaining, currentCount: remaining.length };
            }
            return j;
          });
          sessionStorage.setItem("yapclub_cached_junctions", JSON.stringify(updatedList));
        }
      } catch {}
    }

    const leavePayload = {
      action: "leave",
      identity: myIdentity,
      identities: [
        myIdentity,
        guest.name,
        guest.username,
        user?.username,
        user?.name,
        myDisplayName,
      ].filter(Boolean),
      name: myDisplayName,
      participantId: guest.id,
      userId: user?.id,
    };

    // 6. Dispatch database leave request with keepalive guarantee
    try {
      const leavePromise = fetch(`/api/junctions/${junctionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leavePayload),
        keepalive: true,
      });

      // Allow up to 3000ms for database leave response, but do NOT abort keepalive if it takes longer
      // (keepalive ensures the browser finishes freeing the seat safely in the background)
      await Promise.race([
        leavePromise,
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.warn("Notice during leave dispatch:", e);
      }
    }

    // 7. Reassuring confirmation: show Clean End state
    setExitStep("ended");
    await new Promise((r) => setTimeout(r, 600));

    // Clear joined refs so component won't re-join
    joinedJunctionIdRef.current = null;
    hasJoinedSuccessfullyRef.current = false;

    // 8. Complete exit navigation
    if (onLeave) {
      onLeave();
    } else {
      router.replace("/junctions");
    }

    setIsLeaving(false);
  };

  const handleMinimize = () => {
    if (onMinimize) {
      onMinimize();
    } else {
      router.push("/junctions");
    }
  };

  const handleVolumeChange = (targetUser: JunctionParticipant | string, vol: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(vol)));
    const keys: string[] = [];
    if (typeof targetUser === "string") {
      keys.push(targetUser, targetUser.toLowerCase());
    } else if (targetUser) {
      if (targetUser.identity) {
        keys.push(targetUser.identity, targetUser.identity.toLowerCase());
      }
      if (targetUser.username) {
        keys.push(targetUser.username, targetUser.username.toLowerCase());
      }
      if (targetUser.name) {
        keys.push(targetUser.name, targetUser.name.toLowerCase());
      }
      if (targetUser.id) {
        keys.push(targetUser.id, targetUser.id.toLowerCase());
      }
    }

    setParticipantVolumes((prev) => {
      const next = { ...prev };
      for (const k of keys) {
        next[k] = clamped;
      }
      return next;
    });
  };

  const handleToggleMic = () => {
    if (isMutedByMod) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    // Optimistically update local participant in participants array
    setParticipants((prev) =>
      prev.map((p) =>
        isLocalParticipant(p) ? { ...p, isMuted: nextMuted } : p
      )
    );

    // Broadcast mute change immediately across both LiveKit and Supabase Realtime
    broadcastRoomUpdate({
      type: "participant_mute_change",
      payload: { identity: myIdentity, isMuted: nextMuted },
    });

    // Persist to database in background
    fetch(`/api/junctions/${junctionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_participant",
        identity: myIdentity,
        updates: { isMuted: nextMuted },
      }),
    }).catch((err) => console.error("Failed to sync mute state to DB", err));
  };


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
              setKickedNotice(null);
              if (onLeave) onLeave();
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

  // Account Suspension Check
  if (user?.isBanned) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-background">
        <div className="p-8 rounded-3xl bg-[#12131A] max-w-md w-full text-center border border-rose-500/30 shadow-2xl backdrop-blur-xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
            <Ban size={30} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Account Suspended</h2>
          <p className="text-xs text-rose-300 mb-3">
            Your account (@{user.name}) has been suspended by YapClub moderation.
          </p>
          {user.bannedReason && (
            <p className="text-xs text-slate-400 bg-black/40 border border-white/5 rounded-xl p-3 mb-6">
              Reason: &quot;{user.bannedReason}&quot;
            </p>
          )}
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

  const isLocalSpeaking = activeSpeakers.some((s) => isLocalIdentity(s));
  const isSomeoneSpeaking = activeSpeakers.length > 0;
  const speakingParticipant = participants.find((p) => activeSpeakers.some((s) => s.toLowerCase() === p.identity?.toLowerCase())) || participants[0];
  const SEAT_SLOTS = Array.from({ length: junction?.maxParticipants || 10 });

  return (
    <>
      {/* Persistent LiveKit Audio Pipeline - ALWAYS MOUNTED, NEVER UNMOUNTS */}
      {liveKitToken && liveKitUrl && (
        <LiveKitRoom
          token={liveKitToken}
          serverUrl={liveKitUrl}
          connect={true}
          audio={!isMuted && !isMutedByMod && !isDeafened}
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
          <RoomLifecycleListener
            onRoomInstance={(r) => {
              liveKitRoomRef.current = r;
            }}
            onConnected={() => {
              isLiveKitConnectedRef.current = true;
            }}
          />
          <RoomConnectionOverlay />
          <LiveKitDataSync
            onMessage={onRoomMessage}
            publishRef={liveKitPublishRef}
            onSpeakingChange={setActiveSpeakers}
            onParticipantSync={pollJunction}
            isMuted={isMuted}
            isMutedByMod={isMutedByMod}
            isDeafened={isDeafened}
          />
          <RemoteAudioPipeline
            participantVolumes={participantVolumes}
            isDeafened={isDeafened}
          />
        </LiveKitRoom>
      )}

      {/* Simple Clean Progress Bar Connecting Screen (Mobile & Desktop) */}
      {isConnectingOverlayOpen && (
        <div className="fixed inset-0 h-[100dvh] z-[200] bg-[#0A0B10]/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 select-none animate-in fade-in duration-200">
          <div className="relative max-w-xs w-full bg-[#12131D]/90 border border-white/10 rounded-3xl p-6 sm:p-7 shadow-2xl text-center flex flex-col items-center">
            
            {/* Top ambient glow */}
            <div className={`absolute -top-10 inset-x-0 mx-auto w-28 h-28 rounded-full blur-3xl pointer-events-none transition-colors duration-500 ${
              connectionStep === "connected" ? "bg-emerald-500/25" : "bg-indigo-600/20"
            }`} />

            {/* Icon */}
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border mb-4 transition-all duration-300 ${
              connectionStep === "connected"
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.3)]"
                : "bg-indigo-600/15 border-indigo-500/30 text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.25)]"
            }`}>
              {connectionStep === "connected" ? (
                <Check size={28} className="text-emerald-400 animate-in zoom-in-75 duration-200" strokeWidth={3} />
              ) : (
                <Radio size={26} className="text-indigo-400 animate-pulse" />
              )}
            </div>

            {/* Connecting Title */}
            <h3 className="text-lg font-bold text-white tracking-tight mb-1">
              {connectionStep === "connected" ? "Connected" : "Connecting..."}
            </h3>
            
            <p className="text-xs text-slate-400 font-normal mb-5 truncate max-w-full px-2">
              {junction?.name || "Voice Junction"}
            </p>

            {/* Simple Clean Progress Bar */}
            <div className="w-full bg-white/10 rounded-full h-2 p-0.5 overflow-hidden mb-3.5">
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out ${
                  connectionStep === "connected"
                    ? "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_12px_rgba(16,185,129,0.6)]"
                    : "bg-gradient-to-r from-indigo-500 to-purple-500 shadow-[0_0_12px_rgba(99,102,241,0.5)]"
                }`}
                style={{ width: `${connectionProgress}%` }}
              />
            </div>

            {/* Simple Bottom Row */}
            <div className="flex items-center justify-between w-full text-[11px] font-mono px-1">
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  connectionStep === "connected" ? "bg-emerald-400" : "bg-indigo-400 animate-ping"
                }`} />
                <span>{connectionStep === "connected" ? "Secure" : "Connecting..."}</span>
              </span>
              <span className={connectionStep === "connected" ? "text-emerald-400 font-bold" : "text-slate-300"}>
                {connectionProgress}%
              </span>
            </div>

          </div>
        </div>
      )}

      {/* Clean Exit Disconnection Screen (Mobile & Desktop) */}
      {isLeaving && (
        <div className="fixed inset-0 h-[100dvh] z-[200] bg-[#0A0B10]/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 select-none animate-in fade-in duration-200">
          <div className="relative max-w-xs w-full bg-[#12131D]/90 border border-white/10 rounded-3xl p-6 sm:p-7 shadow-2xl text-center flex flex-col items-center">
            
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border mb-4 transition-all duration-300 ${
              exitStep === "ended"
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.25)] animate-in zoom-in-75 duration-200"
                : "bg-rose-500/15 border border-rose-500/30 text-rose-400 shadow-[0_0_25px_rgba(244,63,94,0.25)]"
            }`}>
              {exitStep === "ended" ? (
                <Check size={28} className="text-emerald-400" strokeWidth={3} />
              ) : (
                <PhoneOff size={26} className="animate-pulse" />
              )}
            </div>

            <h3 className="text-lg font-bold text-white tracking-tight mb-1">
              {exitStep === "ended" ? "Disconnected" : "Leaving Junction..."}
            </h3>
            
            <p className="text-xs text-slate-400 font-light mb-5">
              {exitStep === "ended"
                ? "Microphone released & room seat freed safely"
                : "Closing encrypted audio channels & freeing seat"}
            </p>

            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-mono ${
              exitStep === "ended"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-white/5 border-white/10 text-slate-300"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                exitStep === "ended" ? "bg-emerald-400" : "bg-rose-400 animate-ping"
              }`} />
              <span>{exitStep === "ended" ? "100% Safely Ended" : "Disconnecting session..."}</span>
            </div>

          </div>
        </div>
      )}

      {isMinimized ? (
        /* Floating Picture-in-Picture Mini-Player Bar */
        <div className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:right-6 sm:bottom-6 z-[120] pointer-events-auto animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div
            onClick={onMaximize}
            className="group flex items-center justify-between gap-3 sm:gap-4 p-2.5 sm:p-3 bg-[#0B0C12]/95 hover:bg-[#12141F]/95 backdrop-blur-2xl border border-white/10 hover:border-indigo-500/40 rounded-2xl sm:rounded-3xl shadow-[0_12px_45px_rgba(0,0,0,0.85)] cursor-pointer transition-all active:scale-[0.99] select-none max-w-md"
          >
            {/* Left: Speaker Avatar + Halo + Soundwave */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <div
                  className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center overflow-hidden transition-all duration-300 ${
                    isSomeoneSpeaking
                      ? "ring-2 ring-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)] animate-pulse"
                      : "ring-1 ring-white/15"
                  }`}
                  style={{ backgroundColor: speakingParticipant?.color || "#6366F1" }}
                >
                  <UserAvatar
                    avatar={speakingParticipant?.avatar}
                    color={speakingParticipant?.color}
                    size="sm"
                    isSpeaking={isSomeoneSpeaking}
                  />
                </div>

                {/* Live Pill Badge on Avatar */}
                <div className="absolute -top-1 -right-1 px-1 py-0.2 bg-emerald-500 text-[8px] font-black tracking-wider text-slate-950 rounded-full border border-black shadow-xs flex items-center gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-slate-950 animate-ping" />
                  <span>LIVE</span>
                </div>

                {/* Mic Muted indicator on local participant */}
                {isMuted && (
                  <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-rose-600 text-white border border-black shadow-xs">
                    <MicOff size={8} />
                  </div>
                )}
              </div>

              {/* Title & Live Status */}
              <div className="min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs sm:text-sm text-white truncate max-w-[120px] xs:max-w-[150px] sm:max-w-[180px] group-hover:text-indigo-300 transition-colors">
                    {junction?.name || "Voice Room"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] sm:text-xs">
                  {isSomeoneSpeaking ? (
                    <div className="flex items-center gap-1 text-emerald-400 font-medium">
                      <div className="flex items-center gap-0.5 h-2">
                        <span className="w-0.5 bg-emerald-400 rounded-full soundwave-bar-1" />
                        <span className="w-0.5 bg-emerald-400 rounded-full soundwave-bar-2" />
                        <span className="w-0.5 bg-emerald-400 rounded-full soundwave-bar-3" />
                      </div>
                      <span className="truncate max-w-[90px] xs:max-w-[120px]">
                        {isLocalSpeaking ? "You are speaking" : `${speakingParticipant?.name} speaking`}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-400 truncate">
                      {participants.length}/{junction?.maxParticipants || 10} in room
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Quick Controls Dock */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-1">
              {/* Mic Toggle Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleMic();
                }}
                className={`p-2 sm:p-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer flex items-center justify-center ${
                  isMuted || isMutedByMod
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30"
                    : "bg-white/10 text-emerald-300 hover:bg-white/15 border border-white/10"
                }`}
                title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
              >
                {isMuted || isMutedByMod ? <MicOff size={14} /> : <Mic size={14} />}
              </button>

              {/* Deafen Toggle Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDeafened(!isDeafened);
                }}
                className={`p-2 sm:p-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer flex items-center justify-center ${
                  isDeafened
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30"
                    : "bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 border border-white/5"
                }`}
                title={isDeafened ? "Undeafen Audio" : "Deafen Audio"}
              >
                {isDeafened ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>

              {/* Maximize Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMaximize?.();
                }}
                className="p-2 sm:p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center"
                title="Expand to Full Room"
              >
                <Maximize2 size={14} />
              </button>

              {/* Leave Room Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLeave();
                }}
                className="p-2 sm:p-2.5 rounded-xl bg-white/5 hover:bg-rose-600/20 text-slate-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/30 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
                title="Leave Room"
              >
                <PhoneOff size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] flex flex-col lg:flex-row overflow-hidden bg-background">

      {/* Mod Mute Alert Banner - Floating Centered Toast Notification */}
      {isMutedByMod && (
        <div className="fixed top-16 sm:top-20 inset-x-4 max-w-md mx-auto bg-rose-950/95 border border-rose-500/50 text-rose-200 px-4 py-2.5 rounded-2xl text-center text-xs font-semibold flex items-center justify-center gap-2 shadow-2xl backdrop-blur-xl z-50 animate-fadeIn pointer-events-auto">
          <AlertCircle size={16} className="text-rose-400 shrink-0" />
          <span>You have been force-muted by the Junction Moderator.</span>
        </div>
      )}

      {/* Toast notice for Mod claim / info */}
      {modNoticeToast && (
        <div className="fixed top-16 sm:top-20 inset-x-4 max-w-md mx-auto bg-amber-950/95 border border-amber-500/50 text-amber-200 px-4 py-2.5 rounded-2xl text-center text-xs font-semibold flex items-center justify-center gap-2 shadow-2xl backdrop-blur-xl z-50 animate-fadeIn pointer-events-auto">
          <Sparkles size={16} className="text-amber-400 shrink-0" />
          <span>{modNoticeToast}</span>
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
      <div className={`flex-1 flex flex-col pb-20 lg:pb-0 overflow-y-auto overflow-x-hidden transition-all duration-300`}>
        {/* Top Room Header - Lightweight & Fluid */}
        <div className="w-full max-w-7xl mx-auto px-3.5 sm:px-6 pt-3.5 sm:pt-3 pb-2 sm:pb-3">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Left: Back / Title / Occupant Count / Role in one compact, clean row */}
            <div className="min-w-0 flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleMinimize}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all cursor-pointer shrink-0 active:scale-95"
                title="Back / Minimize Room"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="min-w-0 flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
                <h1 className="text-sm sm:text-base font-bold text-white truncate drop-shadow-sm leading-none">
                  {junction?.name || "Junction Room"}
                </h1>

                {/* Participant Count Pill */}
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] sm:text-xs font-semibold text-slate-300 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{participants.length}/{junction?.maxParticipants || 10}</span>
                </div>

                {/* User's Role Badge */}
                {myPlatformRole !== "user" && (
                  <RoleBadge role={myPlatformRole} size="xs" />
                )}

                {/* Optional quiet subtitle on large screens only */}
                {junction?.description && (
                  <span className="text-[11px] text-slate-500 hidden xl:inline truncate max-w-[200px] border-l border-white/10 pl-2">
                    {junction.description}
                  </span>
                )}
              </div>
            </div>

            {/* Right: Clean, Lightweight Controls */}
            <div className="flex items-center justify-end gap-1 sm:gap-1.5 shrink-0">
              {/* Admin Terminate Junction Button */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleForceDeleteRoom}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                  title="Terminate Junction (Admin Clearance)"
                >
                  <Trash2 size={14} className="text-rose-400" />
                </button>
              )}

              {/* Moderator Deck Trigger or 3-Min Claim Timer */}
              {isCurrentModerator ? (
                <button
                  onClick={() => setIsModDeckOpen(true)}
                  className="h-8 sm:h-9 w-8 sm:w-auto px-0 sm:px-3 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5 active:scale-95 shrink-0"
                  title="Mod Deck"
                >
                  <Shield size={14} className="text-amber-400" />
                  <span className="hidden sm:inline text-xs">Mod Deck</span>
                </button>
              ) : !isStaff && claimTimerSeconds > 0 ? (
                <div
                  className="h-8 sm:h-9 px-2.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] sm:text-xs font-semibold flex items-center gap-1.5 shadow-sm shrink-0"
                  title="3-minute timer to get Moderator privileges"
                >
                  <Shield size={13} className="text-amber-400 animate-pulse" />
                  <span className="font-mono text-[10px] sm:text-xs">{formatTimerMinutes(claimTimerSeconds)}</span>
                </div>
              ) : !isStaff ? (
                <button
                  onClick={handleClaimModerator}
                  disabled={isClaimingMod}
                  className="h-8 sm:h-9 px-2 sm:px-3 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-xs font-bold transition-all cursor-pointer shadow-md shadow-amber-500/20 animate-bounce active:scale-95 flex items-center gap-1 shrink-0"
                  title="Claim Moderator Privileges"
                >
                  <Crown size={14} className="fill-slate-950" />
                  <span className="hidden sm:inline text-xs">{isClaimingMod ? "Claiming..." : "Claim Mod"}</span>
                </button>
              ) : null}

              {/* Invite Friends */}
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(true)}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 flex items-center justify-center transition-all cursor-pointer shadow-sm shrink-0 active:scale-95"
                title="Invite Friends to Hangout"
              >
                <Share2 size={14} className="text-indigo-400" />
              </button>

              {/* Minimize Room */}
              <button
                type="button"
                onClick={handleMinimize}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 flex items-center justify-center transition-all cursor-pointer shadow-sm shrink-0 active:scale-95"
                title="Minimize Room (Browse YapClub while in voice)"
              >
                <Minimize2 size={14} className="text-indigo-400" />
              </button>

              {/* Leave Room Button in Top Header */}
              <button
                type="button"
                onClick={handleLeave}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 flex items-center justify-center transition-all cursor-pointer shadow-sm shrink-0 active:scale-95"
                title="Leave Junction Room"
              >
                <PhoneOff size={14} className="text-rose-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Seat Stage Grid */}
        <div className={`w-full mx-auto px-2.5 sm:px-6 my-auto py-2 sm:py-4 ${
          SEAT_SLOTS.length <= 2 ? "max-w-3xl" :
          SEAT_SLOTS.length <= 4 ? "max-w-4xl" :
          SEAT_SLOTS.length <= 6 ? "max-w-5xl" :
          SEAT_SLOTS.length <= 8 ? "max-w-6xl" :
          "max-w-7xl"
        }`}>
          <div className={`grid gap-2.5 sm:gap-4 justify-center mx-auto ${
            SEAT_SLOTS.length <= 2 ? "grid-cols-1 sm:grid-cols-2" :
            SEAT_SLOTS.length <= 4 ? "grid-cols-2 sm:grid-cols-2" :
            SEAT_SLOTS.length <= 6 ? "grid-cols-2 sm:grid-cols-3" :
            SEAT_SLOTS.length <= 8 ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" :
            SEAT_SLOTS.length <= 10 ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" :
            "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
          }`}>
            {SEAT_SLOTS.map((_, index) => {
              const participant = participants[index];
              const isLocal = isLocalParticipant(participant);
              const isParticipantMod = participant?.role === "moderator";
              const participantRole = isLocal
                ? myPlatformRole
                : (participant?.userRole || (
                    participant?.identity?.trim().toLowerCase() === "jayanthadmin" || participant?.identity?.trim().toLowerCase() === "jayanth"
                      ? "super_admin"
                      : "user"
                  ));
              if (participant) {
                const speaking = isLocal ? isLocalSpeaking : activeSpeakers.some((s) => s.toLowerCase() === participant.identity?.toLowerCase());
                const muted = isLocal ? (isMuted || isMutedByMod) : (participant.isMuted || participant.isMutedByMod);
                const activeCardBg = (isLocal && user?.cardBgColor && user.cardBgColor !== "#465B73")
                  ? user.cardBgColor
                  : (participant.cardBgColor || participant.color);
                const cardThemeStyle = getCardThemeStyle(activeCardBg);
                const participantAvatar = (isLocal && user?.avatar)
                  ? user.avatar
                  : (participant.avatar || "zap");

                return (
                  <div
                    key={participant.id || participant.identity || index}
                    style={cardThemeStyle}
                    className={`relative w-full min-w-0 p-3 sm:p-4 rounded-2xl sm:rounded-[1.4rem] flex flex-col justify-between items-center text-center transition-all duration-300 border overflow-hidden backdrop-blur-xl group/card shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)] ${
                      SEAT_SLOTS.length <= 2
                        ? "min-h-[175px] sm:min-h-[285px]"
                        : SEAT_SLOTS.length <= 4
                        ? "min-h-[155px] sm:min-h-[250px]"
                        : SEAT_SLOTS.length <= 8
                        ? "min-h-[140px] sm:min-h-[220px]"
                        : "min-h-[135px] sm:min-h-[200px]"
                    } ${
                      participantRole === "super_admin"
                        ? "ring-1.5 ring-amber-400/80 shadow-[0_0_25px_rgba(245,158,11,0.25)]"
                        : participantRole === "admin"
                        ? "ring-1.5 ring-rose-400/80 shadow-[0_0_25px_rgba(244,63,94,0.25)]"
                        : participantRole === "manager"
                        ? "ring-1.5 ring-cyan-400/80 shadow-[0_0_25px_rgba(6,182,212,0.25)]"
                        : isParticipantMod
                        ? "ring-1.5 ring-amber-400/60 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                        : speaking
                        ? "ring-2 ring-emerald-400/90 shadow-[0_0_25px_rgba(52,211,153,0.35)]"
                        : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    {/* Ambient Card Backlight Glow */}
                    <div
                      className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl opacity-30 pointer-events-none"
                      style={{ backgroundColor: activeCardBg.includes("gradient") ? "#6366F1" : activeCardBg }}
                    />

                    {/* Top Hairline Light Reflection */}
                    <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />

                    {/* Top Card Header */}
                    <div className="w-full flex items-center justify-between gap-1 z-10 min-h-[22px]">
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[9px] sm:text-[10px] font-mono font-medium text-slate-300 shadow-xs flex items-center gap-1.5 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                          <span>#{index + 1}</span>
                        </div>
                        {!isLocal && (() => {
                          const pIdent = participant.identity || "";
                          const pName = participant.name || "";
                          const vol = participantVolumes[pIdent] ?? participantVolumes[pIdent.toLowerCase()] ?? (pName ? participantVolumes[pName] ?? participantVolumes[pName.toLowerCase()] : undefined) ?? 100;
                          if (vol === 0) {
                            return (
                              <span
                                className="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[8px] sm:text-[9px] font-bold flex items-center gap-0.5 backdrop-blur-md"
                                title="You muted this user"
                              >
                                <VolumeX size={9} />
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>

                      <div className="flex items-center gap-1 shrink-0 justify-end">
                        {isParticipantMod && participantRole === "user" ? (
                          <span
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-xs shrink-0 backdrop-blur-md text-[8px] sm:text-[9px] font-bold tracking-wider uppercase"
                            title="Room Moderator"
                          >
                            <Crown size={10} className="fill-amber-400 text-amber-400" />
                            <span>HOST</span>
                          </span>
                        ) : null}

                        {isLocal ? (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/35 text-[8px] sm:text-[9px] font-extrabold tracking-wider shrink-0 backdrop-blur-md shadow-xs uppercase">
                            YOU
                          </span>
                        ) : (
                          /* Action Trigger for Remote Participants */
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isLocal) return;
                              if (menuAnchor?.participantIdentity === participant.identity) {
                                setMenuAnchor(null);
                                setActiveModMenuParticipant(null);
                                return;
                              }
                              const rect = e.currentTarget.getBoundingClientRect();
                              const screenW = window.innerWidth;
                              const screenH = window.innerHeight;

                              const DROPDOWN_WIDTH = 216;
                              const PADDING = 10;

                              // Preferred: align right edge of dropdown with the button's right edge
                              let calculatedLeft = rect.right - DROPDOWN_WIDTH;

                              // If aligning to right edge would push dropdown off the left screen edge:
                              if (calculatedLeft < PADDING) {
                                calculatedLeft = rect.left;
                              }

                              // Strictly clamp within viewport bounds so it never bleeds off either edge
                              calculatedLeft = Math.max(PADDING, Math.min(calculatedLeft, screenW - DROPDOWN_WIDTH - PADDING));

                              // Vertical placement:
                              const spaceBelow = screenH - rect.bottom;
                              const spaceAbove = rect.top;
                              const isUpward = spaceBelow < 340 && spaceAbove > spaceBelow;

                              setMenuAnchor({
                                top: isUpward ? undefined : Math.round(rect.bottom + 6),
                                bottom: isUpward ? Math.round(screenH - rect.top + 6) : undefined,
                                left: Math.round(calculatedLeft),
                                participantIdentity: participant.identity,
                              });
                              setActiveModMenuParticipant(participant.identity);
                            }}
                            className={`p-1 sm:p-1.5 rounded-lg border backdrop-blur-md transition-all active:scale-95 cursor-pointer shrink-0 touch-manipulation ${
                              menuAnchor?.participantIdentity === participant.identity
                                ? "bg-indigo-600 text-white border-indigo-400 shadow-md"
                                : "text-slate-400 hover:text-white bg-black/30 hover:bg-black/50 border-white/10"
                            }`}
                            title={`Participant Actions for ${participant.name}`}
                          >
                            <MoreVertical size={13} className="sm:w-3.5 sm:h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Center Squircle Avatar */}
                    <div
                      className={`relative my-1.5 sm:my-3 cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 group rounded-2xl sm:rounded-[1.4rem] ${
                        speaking
                          ? "ring-2.5 ring-emerald-400 ring-offset-2 ring-offset-[#0E1017] shadow-[0_0_24px_rgba(52,211,153,0.45)] animate-pulse"
                          : "ring-1.5 ring-white/15 shadow-xl hover:ring-white/30"
                      }`}
                      onClick={() => {
                        const effectiveAvatar = isLocal
                          ? (user?.avatar || guest?.avatar || participant.avatar || "zap")
                          : (participant.avatar || "zap");
                        const effectiveName = isLocal
                          ? (user?.displayName || user?.name || guest?.displayName || guest?.name || participant.name)
                          : participant.name;
                        const effectiveColor = isLocal
                          ? (user?.color || guest?.color || participant.color || "#6366F1")
                          : (participant.color || "#6366F1");
                        const effectiveRole = isLocal
                          ? myPlatformRole
                          : (participant.userRole || (
                              participant.identity?.trim().toLowerCase() === "jayanthadmin" || participant.identity?.trim().toLowerCase() === "jayanth"
                                ? "super_admin"
                                : "user"
                            ));
                        setPreviewParticipant({
                          ...participant,
                          avatar: effectiveAvatar,
                          name: effectiveName,
                          color: effectiveColor,
                          userRole: effectiveRole,
                        });
                      }}
                    >
                      <div
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-[1.4rem] overflow-hidden flex items-center justify-center transition-colors shadow-inner"
                        style={{
                          backgroundColor: participant.color ? `${participant.color}22` : "rgba(0,0,0,0.45)",
                          border: `1.5px solid ${participant.color ? `${participant.color}45` : "rgba(255,255,255,0.12)"}`,
                          boxShadow: participant.color ? `0 4px 18px ${participant.color}18` : undefined,
                        }}
                      >
                        {participantAvatar?.includes("http") ? (
                          <img
                            src={participantAvatar}
                            alt={participant.name}
                            className="w-full h-full object-cover rounded-2xl sm:rounded-[1.4rem]"
                          />
                        ) : (
                          (() => {
                            const normalizedKey = participantAvatar?.toLowerCase().replace(/[^a-z0-9]/g, "") || "zap";
                            const IconComponent = AVATAR_ICON_MAP[normalizedKey] || AVATAR_ICON_MAP[participantAvatar || ""] || Sparkles;
                            return (
                              <IconComponent
                                className="w-8 h-8 sm:w-10 sm:h-10 transition-transform duration-300 group-hover:scale-110 drop-shadow-md"
                                style={{ color: speaking ? "#34D399" : (participant.color || "#6366F1") }}
                              />
                            );
                          })()
                        )}
                      </div>

                      {/* Mic Mute Indicator */}
                      {muted && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 sm:w-5.5 sm:h-5.5 rounded-lg bg-gradient-to-br from-rose-500 to-rose-600 border-2 border-[#0E1017] text-white flex items-center justify-center shadow-md">
                          <MicOff size={11} />
                        </div>
                      )}
                    </div>

                    {/* Name & Audio Wave Status */}
                    <div
                      className="w-full flex flex-col items-center gap-1 z-10 px-1 cursor-pointer group/name"
                      onClick={() => {
                        const effectiveAvatar = isLocal
                          ? (user?.avatar || guest?.avatar || participant.avatar || "zap")
                          : (participant.avatar || "zap");
                        const effectiveName = isLocal
                          ? (user?.displayName || user?.name || guest?.displayName || guest?.name || participant.name)
                          : participant.name;
                        const effectiveColor = isLocal
                          ? (user?.color || guest?.color || participant.color || "#6366F1")
                          : (participant.color || "#6366F1");
                        const effectiveRole = isLocal
                          ? myPlatformRole
                          : (participant.userRole || (
                              participant.identity?.trim().toLowerCase() === "jayanthadmin" || participant.identity?.trim().toLowerCase() === "jayanth"
                                ? "super_admin"
                                : "user"
                            ));
                        setPreviewParticipant({
                          ...participant,
                          avatar: effectiveAvatar,
                          name: effectiveName,
                          color: effectiveColor,
                          userRole: effectiveRole,
                        });
                      }}
                    >
                      <div className="flex items-center justify-center gap-1.5 max-w-full">
                        <span className="font-bold text-xs sm:text-sm text-white tracking-tight truncate max-w-[120px] xs:max-w-[145px] sm:max-w-[175px] group-hover/name:underline decoration-white/40">
                          {participant.name}
                        </span>
                        {participantRole !== "user" && (
                          <RoleBadge role={participantRole} size="xs" showLabel={false} />
                        )}
                      </div>

                      {/* Username sub-label if distinct from shown name */}
                      {participant.username && participant.username.toLowerCase() !== participant.name.toLowerCase() && (
                        <span className="text-[10px] font-medium text-slate-400 truncate max-w-[120px] xs:max-w-[145px] sm:max-w-[175px] -mt-0.5">
                          @{participant.username}
                        </span>
                      )}

                      {/* Fixed Height Soundwave Bar or Status Pill */}
                      <div className="h-5 flex items-center justify-center mt-0.5">
                        {speaking ? (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 backdrop-blur-md shadow-xs">
                            <div className="flex items-center gap-0.5 h-2">
                              <span className="w-0.5 bg-emerald-300 rounded-full soundwave-bar-1" />
                              <span className="w-0.5 bg-emerald-300 rounded-full soundwave-bar-2" />
                              <span className="w-0.5 bg-emerald-300 rounded-full soundwave-bar-3" />
                              <span className="w-0.5 bg-emerald-300 rounded-full soundwave-bar-4" />
                            </div>
                            <span className="text-[8px] sm:text-[9px] text-emerald-300 font-bold uppercase tracking-wider leading-none">
                              Speaking
                            </span>
                          </div>
                        ) : participant.isMutedByMod ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-[9px] text-rose-300 font-semibold backdrop-blur-md">
                            Mod Muted
                          </span>
                        ) : muted ? (
                          <span className="px-2 py-0.5 rounded-full bg-black/40 border border-white/10 text-[9px] text-slate-400 font-medium backdrop-blur-md flex items-center gap-1">
                            <MicOff size={9} className="text-rose-400" />
                            <span>Muted</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-black/40 border border-white/10 text-[9px] text-slate-300/80 font-medium backdrop-blur-md flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-pulse" />
                            <span>Listening</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              // Vacant Seat Slot
              return (
                <div
                  key={`vacant-${index}`}
                  onClick={handleCopyLink}
                  className={`relative w-full min-w-0 p-3 sm:p-4 rounded-2xl sm:rounded-[1.4rem] border border-dashed border-white/15 hover:border-indigo-400/50 bg-[#0E1017]/40 hover:bg-indigo-950/20 backdrop-blur-xl flex flex-col justify-between items-center text-center group cursor-pointer transition-all duration-200 active:scale-98 shadow-sm hover:shadow-[0_0_25px_rgba(99,102,241,0.15)] overflow-hidden ${
                    SEAT_SLOTS.length <= 2
                      ? "min-h-[175px] sm:min-h-[285px]"
                      : SEAT_SLOTS.length <= 4
                      ? "min-h-[155px] sm:min-h-[250px]"
                      : SEAT_SLOTS.length <= 8
                      ? "min-h-[140px] sm:min-h-[220px]"
                      : "min-h-[135px] sm:min-h-[200px]"
                  }`}
                >
                  <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />

                  {/* Top Header */}
                  <div className="w-full flex items-center justify-between z-10">
                    <span className="px-2 py-0.5 rounded-full bg-black/40 border border-white/10 text-[9px] sm:text-[10px] font-mono font-medium text-slate-400">
                      #{index + 1}
                    </span>
                    <span className="text-[8px] sm:text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                      Available
                    </span>
                  </div>

                  {/* Center Icon */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-[1.4rem] border border-dashed border-white/20 group-hover:border-indigo-400/60 group-hover:bg-indigo-500/10 flex items-center justify-center text-slate-400 group-hover:text-indigo-300 transition-all my-1.5 sm:my-3 shadow-inner">
                    <UserPlus className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>

                  {/* Bottom Prompt */}
                  <div className="flex flex-col items-center gap-0.5 z-10">
                    <span className="text-xs sm:text-sm font-semibold text-slate-300 group-hover:text-white transition-colors">
                      Open Seat
                    </span>
                    <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium">
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
          fixed inset-x-0 bottom-20 top-14 sm:inset-x-auto sm:right-0 sm:top-16 sm:bottom-24 z-40 bg-[#0B0C12]/95 backdrop-blur-3xl border-t sm:border-t-0 sm:border-l border-white/[0.08] flex flex-col shadow-2xl transition-all duration-300
          ${isChatOpen ? "translate-y-0 translate-x-0 opacity-100" : "translate-y-[150%] sm:translate-y-0 sm:translate-x-full opacity-0 pointer-events-none"}
          lg:relative lg:inset-auto lg:z-10 lg:w-[410px] xl:w-[450px] lg:bg-[#0B0C12]/95 lg:border-l lg:border-white/[0.08] lg:shadow-2xl lg:transform-none lg:transition-none lg:opacity-100 lg:pointer-events-auto
          ${!isChatOpen && 'lg:hidden'}
        `}
      >
        {/* Top Header & Tab Switcher */}
        <div className="p-3 sm:p-4 border-b border-white/[0.08] bg-black/25 flex flex-col gap-2.5 shrink-0">
          <div className="flex items-center justify-between">
            {/* Tab Pill Buttons */}
            <div className="flex items-center gap-1 p-1 bg-white/[0.05] border border-white/10 rounded-2xl">
              <button
                type="button"
                onClick={() => setRightPanelTab("chat")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${rightPanelTab === "chat"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
              >
                <MessageSquare size={13} />
                <span>Chat</span>
                {chatMessages.length > 0 && rightPanelTab !== "chat" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRightPanelTab("junctions");
                  fetchOtherJunctions();
                }}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${rightPanelTab === "junctions"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
              >
                <Compass size={13} />
                <span><span className="hidden xs:inline">Other </span>Junctions</span>
                {otherJunctions.some((j) => j.currentCount > 0) && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {otherJunctions.filter((j) => j.currentCount > 0).length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-1">
              {rightPanelTab === "chat" && chatMessages.length > 1 && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  title="Clear chat"
                >
                  Clear
                </button>
              )}
              {rightPanelTab === "junctions" && (
                <button
                  type="button"
                  onClick={fetchOtherJunctions}
                  className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Refresh junctions"
                >
                  <RotateCw size={14} className={isLoadingJunctions ? "animate-spin text-indigo-400" : ""} />
                </button>
              )}
              <button
                onClick={() => setIsChatOpen(false)}
                className="w-8 h-8 rounded-full text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all cursor-pointer"
                title="Close panel"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Subheader info depending on tab */}
          {rightPanelTab === "chat" ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {/* Private Message Recipient Selector - Custom Styled Glassmorphic Dropdown */}
                <div className="relative flex-1" ref={recipientMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsRecipientMenuOpen(!isRecipientMenuOpen)}
                    className="w-full flex items-center justify-between gap-2 bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 hover:border-white/20 rounded-2xl px-3.5 py-2 transition-all cursor-pointer shadow-inner active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                        To:
                      </span>
                      <span className="text-xs font-semibold text-white truncate">
                        {privateRecipient === "all" ? "Everyone in Room" : privateRecipient}
                      </span>
                    </div>
                    <ChevronDown
                      size={14}
                      className={`text-slate-400 shrink-0 transition-transform duration-200 ${isRecipientMenuOpen ? 'rotate-180 text-white' : ''}`}
                    />
                  </button>

                  {/* Custom Dropdown Menu with Glassmorphic Styling */}
                  {isRecipientMenuOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#141622]/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-2xl p-1.5 z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          setPrivateRecipient("all");
                          setIsRecipientMenuOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${privateRecipient === "all"
                          ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                          : "text-slate-300 hover:text-white hover:bg-white/5"
                          }`}
                      >
                        <span>Everyone in Room</span>
                        {privateRecipient === "all" && <Check size={14} className="text-indigo-400" />}
                      </button>

                      {participants
                        .filter((p) => !isLocalParticipant(p))
                        .map((p) => {
                          const isSelected = privateRecipient === p.identity;
                          return (
                            <button
                              key={p.identity}
                              type="button"
                              onClick={() => {
                                setPrivateRecipient(p.identity);
                                setIsRecipientMenuOpen(false);
                              }}
                              className={`w-full px-3 py-2 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${isSelected
                                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                                : "text-slate-300 hover:text-white hover:bg-white/5"
                                }`}
                            >
                              <span className="truncate">{p.name}</span>
                              {isSelected && <Check size={14} className="text-indigo-400" />}
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Feature: Show msgs / Not show msgs Toggle */}
                <button
                  type="button"
                  onClick={toggleShowInRoomPopups}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-medium transition-all cursor-pointer shrink-0 active:scale-95 ${showInRoomPopups
                    ? "bg-white/10 text-white border-white/20 hover:bg-white/15"
                    : "bg-transparent text-slate-400 border-white/10 hover:text-slate-200 hover:bg-white/5"
                    }`}
                  title={
                    showInRoomPopups
                      ? "Side pop-up messages are ON (Click to set Not show msgs)"
                      : "Side pop-up messages are OFF (Click to set Show msgs)"
                  }
                >
                  {showInRoomPopups ? (
                    <>
                      <Eye size={13} className="text-slate-200" />
                      <span>Show msgs</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                    </>
                  ) : (
                    <>
                      <EyeOff size={13} className="text-slate-500" />
                      <span>Not show msgs</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                    </>
                  )}
                </button>
              </div>

              {/* Status helper banner */}
              <div className="flex items-center justify-between px-1 text-[10px] text-slate-400">
                <span className="truncate">
                  {showInRoomPopups
                    ? "Pop-up previews active when chat is closed"
                    : "Pop-up previews hidden"}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>Shift directly between active junctions</span>
              <span className="text-indigo-300 font-semibold">{otherJunctions.length} available</span>
            </p>
          )}
        </div>

        {/* TAB 1: WHISPER CHAT */}
        {rightPanelTab === "chat" && (
          <>
            {/* Chat Messages Log */}
            <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-3.5 scroll-smooth flex flex-col">
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center m-auto text-center py-8 px-4 select-none animate-in fade-in zoom-in-95 duration-200">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3 shadow-lg shadow-indigo-500/5">
                    <MessageSquare size={22} />
                  </div>
                  <span className="text-sm font-semibold text-slate-200">Start your conversation</span>
                  <p className="text-xs text-slate-400 mt-1 max-w-[220px] leading-relaxed">
                    Send a message to the room or whisper privately to any user.
                  </p>
                </div>
              ) : chatMessages.map((msg) => {
                // System Announcement Card
                if (msg.senderId === "system") {
                  return (
                    <div key={msg.id} className="w-full flex justify-center py-2 px-1">
                      <div className="max-w-[95%] px-3.5 py-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs text-center flex items-center gap-2.5 shadow-sm">
                        <Sparkles size={14} className="text-indigo-400 shrink-0" />
                        <p className="leading-relaxed font-medium">{msg.text}</p>
                      </div>
                    </div>
                  );
                }

                const isMe = isLocalIdentity(msg.senderName) || (!!msg.senderId && (msg.senderId === guest.id || (!!user?.id && msg.senderId === user.id)));
                const isPrivate = msg.targetIdentity !== undefined;
                const senderParticipant = participants.find((p) => p.identity === msg.senderName);
                const senderRole = senderParticipant?.userRole || (
                  msg.senderName?.trim().toLowerCase() === "jayanthadmin" || msg.senderName?.trim().toLowerCase() === "jayanth"
                    ? "super_admin"
                    : undefined
                );

                return (
                  <div key={msg.id} className={`group/msg relative flex flex-col ${isMe ? 'items-end' : 'items-start'} py-1`}>
                    {/* Sender Header for Incoming Messages */}
                    {!isMe && (
                      <div className="flex items-center gap-1.5 mb-1 pl-1">
                        <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-white/10 bg-slate-800">
                          <UserAvatar avatar={msg.senderAvatar} size="sm" className="!w-full !h-full" badgeRole={senderRole} />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-300">{msg.senderName}</span>
                        {senderRole && senderRole !== "user" ? (
                          <RoleBadge role={senderRole} size="xs" />
                        ) : msg.isModerator ? (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            <Crown size={9} /> Mod
                          </span>
                        ) : null}
                        {isPrivate && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            <Lock size={9} /> Whisper
                          </span>
                        )}
                      </div>
                    )}

                    {/* Header for own whisper */}
                    {isMe && isPrivate && (
                      <div className="flex items-center gap-1 mb-1 pr-1 text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                        <Lock size={10} /> Whisper to {msg.targetIdentity}
                      </div>
                    )}

                    {/* Quoted Message Preview if Reply */}
                    {msg.replyTo && (
                      <div className={`mb-1 px-3 py-1.5 rounded-xl border-l-2 max-w-[85%] text-xs flex flex-col ${isMe
                        ? 'bg-indigo-950/40 border-indigo-400 text-indigo-200'
                        : 'bg-black/30 border-purple-400 text-purple-200'
                        }`}>
                        <span className="text-[10px] font-bold opacity-80 flex items-center gap-1">
                          <Reply size={10} /> Replying to {msg.replyTo.senderName}
                        </span>
                        <span className="truncate opacity-75 italic text-[11px]">
                          "{msg.replyTo.text}"
                        </span>
                      </div>
                    )}

                    {/* Bubble Container with Non-Overlapping Action Toolbar Beside It */}
                    <div className="relative group/bubble max-w-[85%] flex items-center">
                      {/* Action Bar for isMe: Placed to the LEFT of the bubble in open row space */}
                      {isMe && (
                        <div className="absolute right-full mr-2.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/msg:opacity-100 transition-all duration-150 flex items-center gap-1 bg-[#141622]/95 border border-white/10 rounded-full px-1.5 py-1 shadow-2xl backdrop-blur-xl z-20 pointer-events-none group-hover/msg:pointer-events-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingToMessage(msg);
                              setEditingMessage(null);
                            }}
                            className="w-6 h-6 rounded-full text-slate-400 hover:text-white hover:bg-white/15 flex items-center justify-center transition-colors cursor-pointer"
                            title="Reply"
                            aria-label="Reply"
                          >
                            <Reply size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMessage(msg);
                              setInputMessage(msg.text);
                              setReplyingToMessage(null);
                            }}
                            className="w-6 h-6 rounded-full text-slate-400 hover:text-amber-300 hover:bg-amber-400/15 flex items-center justify-center transition-colors cursor-pointer"
                            title="Edit message"
                            aria-label="Edit"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="w-6 h-6 rounded-full text-slate-400 hover:text-rose-400 hover:bg-rose-400/15 flex items-center justify-center transition-colors cursor-pointer"
                            title="Delete message"
                            aria-label="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}

                      {/* Message Bubble */}
                      <div className={`
                    px-4 py-2.5 text-[13.5px] leading-relaxed shadow-lg backdrop-blur-md break-words transition-all
                    ${isMe
                          ? (isPrivate
                            ? 'rounded-2xl rounded-tr-xs text-white bg-gradient-to-br from-purple-600 to-fuchsia-600 shadow-purple-600/25'
                            : 'rounded-2xl rounded-tr-xs text-white bg-gradient-to-br from-indigo-600 to-indigo-500 shadow-indigo-600/25')
                          : (isPrivate
                            ? 'rounded-2xl rounded-tl-xs border border-purple-500/30 bg-[#251532]/90 text-purple-100 shadow-purple-950/20'
                            : 'rounded-2xl rounded-tl-xs border border-white/[0.08] bg-[#181924]/90 text-slate-100 shadow-black/20')
                        }
                  `}>
                        <span>{msg.text}</span>
                        {msg.isEdited && (
                          <span className="text-[10px] opacity-70 ml-1.5 italic select-none">
                            (edited)
                          </span>
                        )}
                      </div>

                      {/* Action Bar for other users: Placed to the RIGHT of the bubble in open row space */}
                      {!isMe && (
                        <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/msg:opacity-100 transition-all duration-150 flex items-center gap-1 bg-[#141622]/95 border border-white/10 rounded-full px-1.5 py-1 shadow-2xl backdrop-blur-xl z-20 pointer-events-none group-hover/msg:pointer-events-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingToMessage(msg);
                              setEditingMessage(null);
                            }}
                            className="w-6 h-6 rounded-full text-slate-400 hover:text-white hover:bg-white/15 flex items-center justify-center transition-colors cursor-pointer"
                            title="Reply"
                            aria-label="Reply"
                          >
                            <Reply size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="w-6 h-6 rounded-full text-slate-400 hover:text-rose-400 hover:bg-rose-400/15 flex items-center justify-center transition-colors cursor-pointer"
                            title="Delete message"
                            aria-label="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                    <span className="text-[9.5px] text-slate-500 mt-1 px-1 select-none">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                );
              })}
              <div ref={chatMessagesEndRef} />
            </div>

            {/* Reply Context Banner */}
            {replyingToMessage && (
              <div className="px-3.5 py-2 bg-indigo-950/70 border-t border-indigo-500/30 flex items-center justify-between gap-2 shrink-0 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 min-w-0 text-xs">
                  <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                    <Reply size={11} />
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-indigo-300 font-semibold truncate">
                      Replying to {replyingToMessage.senderName}:
                    </span>
                    <span className="text-slate-400 truncate italic text-[11px]">
                      "{replyingToMessage.text}"
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingToMessage(null)}
                  className="w-6 h-6 rounded-full text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center shrink-0 cursor-pointer"
                  title="Cancel reply"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Edit Context Banner */}
            {editingMessage && (
              <div className="px-3.5 py-2 bg-amber-950/70 border-t border-amber-500/30 flex items-center justify-between gap-2 shrink-0 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 min-w-0 text-xs">
                  <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                    <Edit2 size={11} />
                  </div>
                  <span className="text-amber-300 font-semibold truncate">
                    Editing your message (Enter to save, Esc to cancel)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMessage(null);
                    setInputMessage("");
                  }}
                  className="w-6 h-6 rounded-full text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center shrink-0 cursor-pointer"
                  title="Cancel edit"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Chat Input Area */}
            <form onSubmit={handleSendMessage} className="p-3 sm:p-4 border-t border-white/[0.08] bg-[#0E0F17]/90 backdrop-blur-xl shrink-0">
              <div className="relative flex items-center bg-white/[0.04] border border-white/10 rounded-2xl p-1 focus-within:border-indigo-500/60 focus-within:bg-white/[0.07] focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all shadow-inner">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      if (editingMessage) {
                        setEditingMessage(null);
                        setInputMessage("");
                      } else if (replyingToMessage) {
                        setReplyingToMessage(null);
                      }
                    }
                  }}
                  placeholder={
                    editingMessage
                      ? "Edit message..."
                      : privateRecipient !== "all"
                        ? `Whisper to ${privateRecipient}...`
                        : "Send a message..."
                  }
                  maxLength={200}
                  className="flex-1 bg-transparent px-3.5 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim()}
                  className="w-8 h-8 rounded-xl flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:bg-white/5 disabled:text-slate-600 text-white transition-all shadow-md shadow-indigo-600/20 cursor-pointer disabled:cursor-not-allowed"
                  aria-label="Send message"
                >
                  <Send size={14} className={inputMessage.trim() ? "translate-x-0.5 -translate-y-0.5 transition-transform" : ""} />
                </button>
              </div>
            </form>
          </>
        )}

        {/* TAB 2: OTHER JUNCTIONS EXPLORER */}
        {rightPanelTab === "junctions" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search Input */}
            <div className="p-3 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={junctionSearchQuery}
                  onChange={(e) => setJunctionSearchQuery(e.target.value)}
                  placeholder="Search live junctions..."
                  className="w-full pl-8 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
            </div>

            {/* Junctions List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {isLoadingJunctions && otherJunctions.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-500 text-xs">
                  <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
                  Scanning active voice junctions...
                </div>
              ) : otherJunctions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-52 text-center px-4 text-slate-500">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 mb-2.5">
                    <Radio size={22} />
                  </div>
                  <h4 className="text-xs font-semibold text-slate-300">No Other Public Junctions</h4>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-[200px]">
                    You are currently in the only active public voice junction.
                  </p>
                </div>
              ) : (
                otherJunctions
                  .filter((j) =>
                    j.name.toLowerCase().includes(junctionSearchQuery.toLowerCase()) ||
                    j.category.toLowerCase().includes(junctionSearchQuery.toLowerCase()) ||
                    (j.tags && j.tags.some((t) => t.toLowerCase().includes(junctionSearchQuery.toLowerCase())))
                  )
                  .map((j) => {
                    const jCount = j.participants?.length ?? j.currentCount;
                    const maxCap = j.maxParticipants || 10;
                    const isOccupied = jCount > 0;
                    const isSwitching = isSwitchingRoomId === j.id;

                    return (
                      <div
                        key={j.id}
                        className={`p-3.5 rounded-2xl border transition-all duration-200 ${isOccupied
                          ? "bg-white/[0.04] hover:bg-white/[0.07] border-white/10 hover:border-indigo-500/30"
                          : "bg-white/[0.02] border-white/5 opacity-80 hover:opacity-100"
                          }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-white truncate max-w-[190px]">
                              {j.name}
                            </h4>
                            <span className="text-[10px] font-medium text-slate-400 capitalize">
                              {j.category}
                            </span>
                          </div>

                          {/* Live Occupancy Status Badge */}
                          <div
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${isOccupied
                              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                              : "bg-white/5 text-slate-400 border border-white/10"
                              }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${isOccupied ? "bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" : "bg-slate-500"
                                }`}
                            />
                            <span>
                              {jCount}/{maxCap} {isOccupied ? "live" : "empty"}
                            </span>
                          </div>
                        </div>

                        {/* Avatars Preview if participants exist */}
                        {j.participants && j.participants.length > 0 && (
                          <div className="flex items-center gap-1 mb-2.5">
                            <div className="flex -space-x-1.5 overflow-hidden">
                              {j.participants.slice(0, 4).map((p, idx) => (
                                <div
                                  key={p.id || idx}
                                  className="w-5 h-5 rounded-full border border-black/40 overflow-hidden bg-slate-800"
                                  title={p.name}
                                >
                                  <UserAvatar avatar={p.avatar} color={p.color} size="sm" className="!w-full !h-full" />
                                </div>
                              ))}
                            </div>
                            <span className="text-[10px] text-slate-400 ml-1.5">
                              {j.participants[0]?.name}
                              {j.participants.length > 1 && ` +${j.participants.length - 1} more`}
                            </span>
                          </div>
                        )}

                        {/* Tags */}
                        {j.tags && j.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {j.tags.slice(0, 3).map((tag, tIdx) => (
                              <span
                                key={tIdx}
                                className="px-1.5 py-0.2 rounded-md bg-white/5 text-[9px] text-slate-400 font-medium"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Switch Room Action Button */}
                        <button
                          type="button"
                          disabled={isSwitching || !!isSwitchingRoomId}
                          onClick={() => handleShiftJunction(j.id, j.name)}
                          className="w-full py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-98 disabled:bg-indigo-900/50 disabled:text-indigo-300/50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:cursor-wait"
                        >
                          {isSwitching ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>Switching...</span>
                            </>
                          ) : (
                            <>
                              <LogIn size={13} />
                              <span>Switch to this Junction</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Audio Dock Controls */}
      <div className="fixed bottom-3 sm:bottom-6 inset-x-0 z-50 flex justify-center px-1 sm:px-2 pointer-events-none pb-[env(safe-area-inset-bottom)]">
        <div className="pointer-events-auto p-1 sm:p-2 px-2 sm:px-4 rounded-full bg-[#0E0F17]/90 backdrop-blur-3xl border border-white/15 shadow-[0_16px_50px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.18)] flex items-center gap-1.5 sm:gap-3 max-w-[98vw] overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {/* Mute / Unmute Mic (Hero Circular Voice Call Button) */}
          <button
            onClick={handleToggleMic}
            disabled={isMutedByMod}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-90 cursor-pointer ${isMutedByMod
              ? "bg-rose-950/80 text-rose-400 border border-rose-800/80 cursor-not-allowed opacity-80"
              : isMuted
                ? "bg-gradient-to-tr from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white shadow-[0_4px_18px_rgba(244,63,94,0.45)] ring-2 ring-rose-400/30"
                : "bg-gradient-to-tr from-emerald-500 to-teal-400 hover:from-emerald-400 text-white shadow-[0_4px_20px_rgba(16,185,129,0.5)] ring-2 ring-emerald-400/40 animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]"
              }`}
            title={isMutedByMod ? "Muted by Moderator" : isMuted ? "Unmute Mic" : "Mute Mic"}
          >
            {isMuted || isMutedByMod ? <MicOff size={19} /> : <Mic size={19} />}
          </button>

          {/* Deafen / Listen */}
          <button
            onClick={() => setIsDeafened(!isDeafened)}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-90 cursor-pointer ${isDeafened
              ? "bg-rose-600 text-white shadow-[0_4px_16px_rgba(244,63,94,0.45)] ring-2 ring-rose-400/30"
              : "bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white border border-white/10 backdrop-blur-md"
              }`}
            title={isDeafened ? "Undeafen Audio" : "Deafen Audio"}
          >
            {isDeafened ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>

          <div className="h-6 w-px bg-gradient-to-b from-transparent via-white/25 to-transparent mx-0.5" />

          {/* Reactions */}
          <div className="relative">
            <button
              onClick={() => setIsReactionsOpen(!isReactionsOpen)}
              className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-90 cursor-pointer ${isReactionsOpen
                ? "bg-indigo-600 text-white shadow-[0_4px_16px_rgba(99,102,241,0.5)] ring-2 ring-indigo-400/40"
                : "bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white border border-white/10 backdrop-blur-md"
                }`}
              title="Reactions"
            >
              <Smile size={18} />
            </button>

            {isReactionsOpen && (
              <div className="absolute bottom-14 sm:bottom-16 left-1/2 -translate-x-1/2 p-2 sm:p-2.5 rounded-full bg-[#0E0F17]/95 backdrop-blur-3xl border border-white/15 shadow-[0_16px_40px_rgba(0,0,0,0.85)] flex items-center gap-1 sm:gap-2 animate-fadeIn max-w-[90vw] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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
            onClick={() => {
              if (isChatOpen && rightPanelTab === "chat") {
                setIsChatOpen(false);
              } else {
                setRightPanelTab("chat");
                setIsChatOpen(true);
                setInRoomPopups([]);
              }
            }}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-90 cursor-pointer relative ${isChatOpen && rightPanelTab === "chat"
              ? "bg-indigo-600 text-white shadow-[0_4px_16px_rgba(99,102,241,0.5)] ring-2 ring-indigo-400/40"
              : "bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white border border-white/10 backdrop-blur-md"
              }`}
            title={showInRoomPopups ? "Room Chat (Show msgs active)" : "Room Chat (Not show msgs)"}
          >
            <MessageSquare size={18} />
            {chatMessages.length > lastReadChatCount && (!isChatOpen || rightPanelTab !== "chat") && (
              <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-indigo-400 rounded-full ring-2 ring-[#0E0F17] animate-pulse" />
            )}
          </button>

          {/* Other Junctions Explorer Toggle Button */}
          <button
            onClick={() => {
              if (isChatOpen && rightPanelTab === "junctions") {
                setIsChatOpen(false);
              } else {
                setRightPanelTab("junctions");
                setIsChatOpen(true);
                fetchOtherJunctions();
              }
            }}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-90 cursor-pointer relative ${isChatOpen && rightPanelTab === "junctions"
              ? "bg-indigo-600 text-white shadow-[0_4px_16px_rgba(99,102,241,0.5)] ring-2 ring-indigo-400/40"
              : "bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white border border-white/10 backdrop-blur-md"
              }`}
            title="Explore Other Junctions"
          >
            <Compass size={18} />
            {otherJunctions.some((j) => j.currentCount > 0) && (
              <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-[#0E0F17] animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            )}
          </button>

          {/* Inside Direct Messages Toggle Button (Only visible to logged-in users) */}
          {isRegistered && user && (
            <button
              onClick={() => setIsDirectMessengerOpen(!isDirectMessengerOpen)}
              className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-90 cursor-pointer relative ${isDirectMessengerOpen
                ? "bg-indigo-600 text-white shadow-[0_4px_16px_rgba(99,102,241,0.5)] ring-2 ring-indigo-400/40"
                : "bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white border border-white/10 backdrop-blur-md"
                }`}
              title="Direct Messages"
            >
              <MessageCircle size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1 min-w-[17px] h-4 rounded-full bg-rose-500 text-white text-[9px] font-extrabold flex items-center justify-center border-2 border-[#0E0F17] shadow-md animate-pulse">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          )}

          <div className="h-6 w-px bg-gradient-to-b from-transparent via-white/25 to-transparent mx-0.5" />

          {/* Disconnect & Leave Junction (Hero Circular End Call Button) */}
          <button
            onClick={handleLeave}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-tr from-rose-600 via-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white shadow-[0_4px_20px_rgba(244,63,94,0.45)] ring-2 ring-rose-400/30 flex items-center justify-center active:scale-90 hover:scale-105 transition-all duration-200 cursor-pointer"
            title="Leave Junction"
          >
            <PhoneOff size={19} />
          </button>
        </div>
      </div>

      {/* Moderator Control Modal */}
      {junction && isCurrentModerator && (
        <ModeratorControlModal
          isOpen={isModDeckOpen}
          onClose={() => setIsModDeckOpen(false)}
          junction={junction}
          participants={participants}
          currentModerator={myIdentity}
          isStaff={isStaff}
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

      {/* Anchored Participant Dropdown Menu */}
      {menuAnchor && (() => {
        const target = participants.find((p) => p.identity === menuAnchor.participantIdentity);
        if (!target) return null;

        // Never open dropdown menu for self
        const isTargetLocal = isLocalParticipant(target);
        if (isTargetLocal) return null;

        const targetUserClean = (target.username || target.name || target.identity || "").trim().toLowerCase();
        const targetRole = target.userRole || (
          targetUserClean === "jayanthadmin" || targetUserClean === "jayanth"
            ? "super_admin"
            : "user"
        );
        const targetVolume = target
          ? (participantVolumes[target.identity] ??
             participantVolumes[target.identity?.toLowerCase()] ??
             participantVolumes[target.username || ""] ??
             participantVolumes[(target.username || "").toLowerCase()] ??
             participantVolumes[target.name || ""] ??
             participantVolumes[(target.name || "").toLowerCase()] ??
             100)
          : 100;

        const canStaffKick = isStaff && (
          isSuperAdmin ||
          (isAdmin && targetRole !== "super_admin" && targetRole !== "admin") ||
          (isManager && targetRole === "user")
        );

        const canStaffBan = isStaff && (
          isSuperAdmin ||
          (isAdmin && targetRole !== "super_admin" && targetRole !== "admin") ||
          (isManager && targetRole === "user")
        );

        const canMute = (isStaff || isCurrentModerator) && (
          isSuperAdmin ||
          (isAdmin && targetRole !== "super_admin") ||
          (isManager && targetRole !== "super_admin" && targetRole !== "admin") ||
          (!isStaff && isCurrentModerator && targetRole === "user")
        );

        const closeMenu = () => {
          setMenuAnchor(null);
          setActiveModMenuParticipant(null);
        };

        return (
          <>
            {/* Transparent backdrop overlay to dismiss on outside click */}
            <div
              className="fixed inset-0 z-[90] cursor-default bg-black/10 touch-manipulation"
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                closeMenu();
              }}
            />

            {/* Anchored Dropdown Menu */}
            <div
              style={{
                top: menuAnchor.top !== undefined ? `${menuAnchor.top}px` : undefined,
                bottom: menuAnchor.bottom !== undefined ? `${menuAnchor.bottom}px` : undefined,
                left: `${menuAnchor.left}px`,
              }}
              onClick={(e) => e.stopPropagation()}
              className="fixed w-[216px] max-w-[calc(100vw-20px)] rounded-2xl bg-[#12131F]/98 border border-white/20 shadow-2xl p-1.5 z-[100] flex flex-col gap-1 text-left animate-fadeIn backdrop-blur-2xl max-h-[min(80vh,420px)] overflow-y-auto overscroll-contain touch-manipulation"
            >
              {/* Header Info */}
              <div className="px-2 py-1.5 border-b border-white/10 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-5 h-5 rounded-full overflow-hidden shrink-0">
                    <UserAvatar avatar={target.avatar} color={target.color} size="sm" className="!w-5 !h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{target.name}</div>
                    {target.username && target.username.toLowerCase() !== target.name.toLowerCase() && (
                      <div className="text-[10px] text-slate-400 font-semibold truncate">@{target.username}</div>
                    )}
                  </div>
                </div>
                <RoleBadge role={targetRole} size="xs" showLabel={false} />
              </div>

              {/* Section 1: Room Voice Control */}
              {canMute && (
                <button
                  type="button"
                  onClick={() => {
                    handleModerateParticipant(target.identity, target.isMutedByMod ? "unmute" : "mute");
                    closeMenu();
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-200 hover:bg-white/10 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  {target.isMutedByMod ? (
                    <Mic size={13} className="text-emerald-400 shrink-0" />
                  ) : (
                    <MicOff size={13} className="text-amber-400 shrink-0" />
                  )}
                  <span>{target.isMutedByMod ? "Allow Mic (Remove Mod Mute)" : "Force Mute"}</span>
                </button>
              )}

              {/* Kick from Room - Official Staff Only */}
              {canStaffKick && (
                <button
                  type="button"
                  onClick={() => {
                    handleModerateParticipant(target.identity, "kick");
                    closeMenu();
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-rose-400 hover:bg-rose-950/60 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <PhoneOff size={13} className="shrink-0" />
                  <span>Kick from Junction</span>
                </button>
              )}

              {/* Ban from Room - Official Staff Only */}
              {canStaffKick && (
                <button
                  type="button"
                  onClick={() => {
                    const confirmed = window.confirm(
                      `Ban @${target.identity} from this junction?\nThey will be disconnected and blocked from re-entering this room.`
                    );
                    if (!confirmed) return;
                    handleModerateParticipant(target.identity, "ban");
                    closeMenu();
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-rose-300 hover:bg-rose-950/70 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <UserX size={13} className="text-rose-400 shrink-0" />
                  <span>Ban from Junction</span>
                </button>
              )}

              {/* Suspend Account - Official Staff Only */}
              {canStaffBan && (
                <button
                  type="button"
                  onClick={() => {
                    handlePlatformBanParticipant(target);
                    closeMenu();
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-rose-300 hover:bg-rose-950/80 flex items-center gap-2 transition-colors cursor-pointer border border-rose-500/20"
                >
                  <Ban size={13} className="text-rose-400 shrink-0" />
                  <span>Suspend Account</span>
                </button>
              )}

              {/* Section 2: Staff Hierarchy Management */}
              {isAdmin && (
                <div className="pt-1 mt-0.5 border-t border-white/10 flex flex-col gap-0.5">
                  <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                    Staff Hierarchy
                  </span>

                  {/* Super Admin: Appoint Admin */}
                  {isSuperAdmin && targetRole !== "admin" && targetRole !== "super_admin" && (
                    <button
                      type="button"
                      onClick={() => {
                        handleSetRoleParticipant(target, "admin");
                        closeMenu();
                      }}
                      className="w-full px-2 py-1.5 rounded-lg text-[11px] font-semibold text-amber-300 hover:bg-amber-950/60 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Crown size={13} className="text-amber-400 shrink-0" />
                      <span>Make Admin</span>
                    </button>
                  )}

                  {/* Admin or Super Admin: Appoint Manager */}
                  {isAdmin && targetRole === "user" && (
                    <button
                      type="button"
                      onClick={() => {
                        handleSetRoleParticipant(target, "manager");
                        closeMenu();
                      }}
                      className="w-full px-2 py-1.5 rounded-lg text-[11px] font-semibold text-cyan-300 hover:bg-cyan-950/60 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Zap size={13} className="text-cyan-400 shrink-0" />
                      <span>Make Manager</span>
                    </button>
                  )}

                  {/* Super Admin: Demote Admin */}
                  {isSuperAdmin && targetRole === "admin" && (
                    <button
                      type="button"
                      onClick={() => {
                        handleSetRoleParticipant(target, "user");
                        closeMenu();
                      }}
                      className="w-full px-2 py-1.5 rounded-lg text-[11px] font-semibold text-rose-400 hover:bg-rose-950/60 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <UserMinus size={13} className="shrink-0" />
                      <span>Demote to User</span>
                    </button>
                  )}

                  {/* Admin or Super Admin: Demote Manager */}
                  {isAdmin && targetRole === "manager" && (
                    <button
                      type="button"
                      onClick={() => {
                        handleSetRoleParticipant(target, "user");
                        closeMenu();
                      }}
                      className="w-full px-2 py-1.5 rounded-lg text-[11px] font-semibold text-rose-400 hover:bg-rose-950/60 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <UserMinus size={13} className="shrink-0" />
                      <span>Demote Manager</span>
                    </button>
                  )}

                  {/* Super Admin: Delete Account Permanently */}
                  {isSuperAdmin && targetRole !== "super_admin" && (
                    <button
                      type="button"
                      onClick={() => {
                        handleDeleteAccountParticipant(target);
                        closeMenu();
                      }}
                      className="w-full px-2 py-1.5 rounded-lg text-[11px] font-semibold text-rose-400 hover:bg-rose-900/60 flex items-center gap-2 transition-colors cursor-pointer border border-rose-600/30"
                    >
                      <Trash2 size={13} className="shrink-0" />
                      <span>Delete Account</span>
                    </button>
                  )}
                </div>
              )}

              {/* Section 3: Room Moderator Co-Host delegation */}
              {isCurrentModerator && !isStaff && targetRole === "user" && (
                <div className="pt-1 mt-0.5 border-t border-white/10 flex flex-col gap-0.5">
                  {target.role === "moderator" ? (
                    <button
                      type="button"
                      onClick={() => {
                        handleModerateParticipant(target.identity, "demote_mod");
                        closeMenu();
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-rose-400 hover:bg-rose-950/60 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Shield size={13} />
                      <span>Remove Co-Host</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        handleModerateParticipant(target.identity, "promote_mod");
                        closeMenu();
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-amber-400 hover:bg-amber-950/60 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Crown size={13} />
                      <span>Make Co-Host</span>
                    </button>
                  )}
                </div>
              )}

              {/* Section 4: Inline Volume Slider */}
              <div className="px-2.5 py-2 border-t border-white/10 flex items-center gap-2">
                <button
                  type="button"
                  title={targetVolume === 0 ? "Unmute user" : "Mute user"}
                  onClick={() => {
                    handleVolumeChange(target, targetVolume === 0 ? 100 : 0);
                  }}
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                >
                  {targetVolume === 0 ? (
                    <VolumeX size={14} className="text-rose-400" />
                  ) : targetVolume <= 50 ? (
                    <Volume1 size={14} className="text-slate-300" />
                  ) : (
                    <Volume2 size={14} className="text-indigo-400" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={targetVolume}
                  onChange={(e) => handleVolumeChange(target, Number(e.target.value))}
                  className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <span className="text-[10px] text-slate-300 font-mono w-7 text-right shrink-0">
                  {targetVolume}%
                </span>
              </div>

              {/* Section 5: Profile & Report */}
              <div className="pt-1 mt-0.5 border-t border-white/10 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewParticipant(target);
                    closeMenu();
                  }}
                  className="flex-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Users size={11} />
                  <span>Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleReportParticipant(target.identity);
                    closeMenu();
                  }}
                  className="px-2 py-1 rounded-lg text-[10px] font-semibold text-slate-400 hover:text-rose-400 hover:bg-white/10 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <AlertCircle size={11} />
                  <span>Report</span>
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {/* Floating Instagram-Style Direct Messenger for Logged-In Users */}
      <InRoomMessenger isOpen={isDirectMessengerOpen} onClose={() => setIsDirectMessengerOpen(false)} />

      {/* Direct Room Invite to Friends Modal */}
      {isInviteModalOpen && junction && (
        <InviteFriendsModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          junctionId={junctionId}
          junctionName={junction.name}
          description={junction.description}
          participantCount={participants.length}
          maxParticipants={junction.maxParticipants || 10}
          currentUserId={user?.id}
          currentUsername={user?.name || guest.name}
        />
      )}

      {/* Junction Switching Transition Overlay */}
      {isSwitchingRoomId && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none">
          <div className="p-6 rounded-3xl bg-[#12131A] border border-white/10 shadow-2xl flex flex-col items-center text-center max-w-xs mx-4">
            <div className="w-13 h-13 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 shadow-inner">
              <Compass size={24} className="animate-spin" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">
              Switching Junction
            </h3>
            <p className="text-xs text-indigo-300 font-semibold truncate max-w-[220px] mb-2">
              {switchingRoomName || "Connecting..."}
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Disconnecting from current voice audio and entering the new junction...
            </p>
          </div>
        </div>
      )}
      {/* Floating Pop-up Notification (In-Room Whisper Chat Preview) - Positioned right above bottom controls dock */}
      {!isChatOpen && showInRoomPopups && inRoomPopups.length > 0 && (
        <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-24 z-40 max-w-sm sm:max-w-[340px] mx-auto sm:mx-0 pointer-events-none transition-all duration-200">
          {inRoomPopups.map((popup) => (
            <div
              key={popup.id}
              onClick={() => {
                setIsChatOpen(true);
                setRightPanelTab("chat");
                if (popup.isWhisper && popup.senderName) {
                  setPrivateRecipient(popup.senderName);
                }
                setInRoomPopups([]);
              }}
              className="pointer-events-auto rounded-2xl p-3 sm:p-3.5 bg-[#12131C]/95 backdrop-blur-2xl border border-white/15 shadow-2xl shadow-black/80 transition-all duration-200 animate-in slide-in-from-bottom-3 sm:slide-in-from-right-3 fade-in group cursor-pointer hover:border-white/25 active:scale-[0.99]"
            >
              {/* Top Header */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-white/15">
                    <UserAvatar avatar={popup.avatar || "zap"} color={popup.color || "#8B5CF6"} size="sm" className="!w-full !h-full" />
                  </div>
                  <span className="text-xs font-bold text-white truncate max-w-[120px] sm:max-w-[150px]">
                    {popup.senderName}
                  </span>
                  {popup.isWhisper && (
                    <span className="text-[10px] text-slate-300 bg-white/10 px-1.5 py-0.2 rounded-full font-medium flex items-center gap-0.5 shrink-0">
                      <Lock size={9} /> Whisper
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInRoomPopups([]);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    title="Dismiss"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* Message text */}
              <p className="text-xs text-slate-200 font-medium line-clamp-2 leading-relaxed break-words pl-0.5 mt-0.5">
                {popup.text}
              </p>

              {/* Action Footer */}
              <div className="mt-2 pt-1.5 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-slate-400">
                <span className="text-indigo-400 font-semibold group-hover:text-indigo-300 transition-colors flex items-center gap-1">
                  Tap to reply <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleShowInRoomPopups();
                  }}
                  className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  title="Silence future pop-up messages"
                >
                  Not show msgs
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
        </div>
      )}
    </>
  );
}
