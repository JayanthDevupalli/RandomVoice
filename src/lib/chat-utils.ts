export interface RoomInviteData {
  junctionId: string;
  junctionName: string;
  description?: string;
  participantCount?: number;
  maxParticipants?: number;
  inviterName?: string;
}

export interface ParsedMessage {
  type: "text" | "voice" | "room_invite" | "gif";
  text?: string;
  audioUrl?: string;
  duration?: number;
  gifUrl?: string;
  gifTitle?: string;
  roomInvite?: RoomInviteData;
  replyTo?: {
    id: string;
    sender: string;
    text: string;
    isVoice?: boolean;
    isGif?: boolean;
    gifUrl?: string;
  } | null;
  isEdited?: boolean;
}

export function parseMessageContent(raw: string): ParsedMessage {
  if (typeof raw !== "string") {
    return { type: "text", text: String(raw) };
  }

  const trimmed = raw.trim();

  // 1. Check if raw content is a direct GIF URL
  if (
    trimmed.startsWith("http") &&
    (trimmed.includes(".gif") || trimmed.includes("giphy.com") || trimmed.includes("tenor.com")) &&
    !trimmed.includes(" ")
  ) {
    return {
      type: "gif",
      gifUrl: trimmed,
      gifTitle: "GIF",
    };
  }

  // 2. Parse JSON formatted messages
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);

      if (parsed.type === "gif") {
        return {
          type: "gif",
          gifUrl: parsed.gifUrl || parsed.url || "",
          gifTitle: parsed.gifTitle || parsed.title || "GIF",
          text: parsed.text,
          replyTo: parsed.replyTo || null,
        };
      }

      if (parsed.type === "room_invite" && (parsed.roomInvite || parsed.junctionId)) {
        const invite: RoomInviteData = parsed.roomInvite || {
          junctionId: parsed.junctionId,
          junctionName: parsed.junctionName || "Voice Room",
          description: parsed.description,
          participantCount: parsed.participantCount,
          maxParticipants: parsed.maxParticipants,
          inviterName: parsed.inviterName,
        };
        return {
          type: "room_invite",
          roomInvite: invite,
          text: parsed.text || `🎙️ Joined "${invite.junctionName}"! Tap to join the hangout.`,
          replyTo: parsed.replyTo || null,
        };
      }

      if (parsed.type === "voice") {
        return {
          type: "voice",
          audioUrl: parsed.audioUrl || parsed.url || "",
          duration: parsed.duration || 0,
          replyTo: parsed.replyTo || null,
          isEdited: !!parsed.isEdited,
        };
      }

      if (parsed.type === "text" || parsed.text !== undefined) {
        return {
          type: "text",
          text: parsed.text || "",
          replyTo: parsed.replyTo || null,
          isEdited: !!parsed.isEdited,
        };
      }
    } catch (e) {
      // Fallback to plain text
    }
  }

  return { type: "text", text: raw };
}

export function serializeTextMessage(
  text: string,
  replyTo?: ParsedMessage["replyTo"],
  isEdited: boolean = false
): string {
  if (!replyTo && !isEdited) {
    return text;
  }
  return JSON.stringify({
    type: "text",
    text,
    replyTo: replyTo || null,
    isEdited,
  });
}

export function serializeVoiceMessage(
  audioUrl: string,
  duration: number,
  replyTo?: ParsedMessage["replyTo"]
): string {
  return JSON.stringify({
    type: "voice",
    audioUrl,
    duration: Math.round(duration),
    replyTo: replyTo || null,
  });
}

export function serializeGifMessage(
  gifUrl: string,
  gifTitle: string = "GIF",
  replyTo?: ParsedMessage["replyTo"]
): string {
  return JSON.stringify({
    type: "gif",
    gifUrl,
    gifTitle,
    replyTo: replyTo || null,
  });
}

export function serializeRoomInvite(
  invite: RoomInviteData,
  replyTo?: ParsedMessage["replyTo"]
): string {
  return JSON.stringify({
    type: "room_invite",
    roomInvite: invite,
    text: `🎙️ Invited you to "${invite.junctionName}"! Tap to join the voice hangout.`,
    replyTo: replyTo || null,
  });
}

// Distinct WhatsApp / Discord style vibrant colors for group chat members
export const SENDER_COLORS = [
  "text-emerald-400",
  "text-sky-400",
  "text-amber-400",
  "text-purple-400",
  "text-rose-400",
  "text-teal-400",
  "text-cyan-400",
  "text-orange-400",
  "text-pink-400",
  "text-indigo-400",
];

export function getSenderColor(nameOrId?: string): string {
  if (!nameOrId) return SENDER_COLORS[0];
  let hash = 0;
  for (let i = 0; i < nameOrId.length; i++) {
    hash = nameOrId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % SENDER_COLORS.length;
  return SENDER_COLORS[index];
}


