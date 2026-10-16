export interface RoomInviteData {
  junctionId: string;
  junctionName: string;
  description?: string;
  participantCount?: number;
  maxParticipants?: number;
  inviterName?: string;
}

export interface ParsedMessage {
  type: "text" | "voice" | "room_invite";
  text?: string;
  audioUrl?: string;
  duration?: number;
  roomInvite?: RoomInviteData;
  replyTo?: {
    id: string;
    sender: string;
    text: string;
    isVoice?: boolean;
  } | null;
  isEdited?: boolean;
}

export function parseMessageContent(raw: string): ParsedMessage {
  if (typeof raw !== "string") {
    return { type: "text", text: String(raw) };
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
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

