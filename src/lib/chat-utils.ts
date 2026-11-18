export interface RoomInviteData {
  junctionId: string;
  junctionName: string;
  description?: string;
  participantCount?: number;
  maxParticipants?: number;
  inviterName?: string;
}

export interface MessageReaction {
  emoji: string;
  userId: string;
  username?: string;
  displayName?: string;
  createdAt?: string;
}

export interface GroupedReaction {
  emoji: string;
  count: number;
  users: Array<{ userId: string; username?: string; displayName?: string }>;
  hasReacted: boolean;
}

export interface NicknameUpdateData {
  setterId: string;
  setterUsername: string;
  targetUserId: string;
  targetUsername: string;
  nickname: string;
  action: "set" | "cleared";
}

export interface ParsedMessage {
  type: "text" | "voice" | "room_invite" | "gif" | "nickname_update";
  text?: string;
  audioUrl?: string;
  duration?: number;
  gifUrl?: string;
  gifTitle?: string;
  roomInvite?: RoomInviteData;
  nicknameUpdate?: NicknameUpdateData;
  replyTo?: {
    id: string;
    sender: string;
    text: string;
    isVoice?: boolean;
    isGif?: boolean;
    gifUrl?: string;
  } | null;
  isEdited?: boolean;
  reactions?: MessageReaction[];
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

  // 2. Check if raw content is a plain nickname notice
  if (trimmed.startsWith("🏷️")) {
    return {
      type: "nickname_update",
      text: trimmed,
    };
  }

  // 3. Parse JSON formatted messages
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      const reactions = Array.isArray(parsed.reactions) ? parsed.reactions : undefined;

      if (parsed.type === "nickname_update" || parsed.nicknameUpdate) {
        const update: NicknameUpdateData = parsed.nicknameUpdate || {
          setterId: parsed.setterId || "",
          setterUsername: parsed.setterUsername || "Someone",
          targetUserId: parsed.targetUserId || "",
          targetUsername: parsed.targetUsername || "friend",
          nickname: parsed.nickname || "",
          action: parsed.action || (parsed.nickname ? "set" : "cleared"),
        };
        return {
          type: "nickname_update",
          nicknameUpdate: update,
          text: parsed.text || (update.action === "set" ? `🏷️ Nickname set to "${update.nickname}"` : `🏷️ Nickname removed`),
          reactions,
        };
      }

      if (parsed.type === "gif") {
        return {
          type: "gif",
          gifUrl: parsed.gifUrl || parsed.url || "",
          gifTitle: parsed.gifTitle || parsed.title || "GIF",
          text: parsed.text,
          replyTo: parsed.replyTo || null,
          reactions,
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
          reactions,
        };
      }

      if (parsed.type === "voice") {
        return {
          type: "voice",
          audioUrl: parsed.audioUrl || parsed.url || "",
          duration: parsed.duration || 0,
          replyTo: parsed.replyTo || null,
          isEdited: !!parsed.isEdited,
          reactions,
        };
      }

      if (parsed.type === "text" || parsed.text !== undefined) {
        return {
          type: "text",
          text: parsed.text || "",
          replyTo: parsed.replyTo || null,
          isEdited: !!parsed.isEdited,
          reactions,
        };
      }
    } catch (e) {
      // Fallback to plain text
    }
  }

  return { type: "text", text: raw };
}

export function serializeNicknameMessage(data: NicknameUpdateData): string {
  const isSet = data.action === "set" && Boolean(data.nickname && data.nickname.trim().length > 0);
  const cleanNick = data.nickname ? data.nickname.trim() : "";
  const fallbackText = isSet
    ? `🏷️ Nickname set to "${cleanNick}"`
    : `🏷️ Nickname cleared`;

  return JSON.stringify({
    type: "nickname_update",
    nicknameUpdate: {
      ...data,
      nickname: cleanNick,
      action: isSet ? "set" : "cleared",
    },
    text: fallbackText,
  });
}

export function serializeTextMessage(
  text: string,
  replyTo?: ParsedMessage["replyTo"],
  isEdited: boolean = false,
  reactions?: MessageReaction[]
): string {
  if (!replyTo && !isEdited && (!reactions || reactions.length === 0)) {
    return text;
  }
  return JSON.stringify({
    type: "text",
    text,
    replyTo: replyTo || null,
    isEdited,
    reactions: reactions && reactions.length > 0 ? reactions : undefined,
  });
}

export function groupReactions(
  reactions?: MessageReaction[],
  currentUserId?: string
): GroupedReaction[] {
  if (!reactions || reactions.length === 0) return [];
  const map = new Map<string, GroupedReaction>();

  for (const r of reactions) {
    if (!r?.emoji) continue;
    let group = map.get(r.emoji);
    if (!group) {
      group = {
        emoji: r.emoji,
        count: 0,
        users: [],
        hasReacted: false,
      };
      map.set(r.emoji, group);
    }
    group.count += 1;
    group.users.push({ userId: r.userId, username: r.username, displayName: r.displayName });
    if (currentUserId && r.userId === currentUserId) {
      group.hasReacted = true;
    }
  }

  return Array.from(map.values());
}

export function toggleReactionInContent(
  rawContent: string,
  reaction: { emoji: string; userId: string; username?: string; displayName?: string }
): { newContent: string; reactions: MessageReaction[] } {
  const parsed = parseMessageContent(rawContent);
  const currentReactions: MessageReaction[] = Array.isArray(parsed.reactions)
    ? [...parsed.reactions]
    : [];

  const existingExactIdx = currentReactions.findIndex(
    (r) => r.userId === reaction.userId && r.emoji === reaction.emoji
  );

  let updatedReactions: MessageReaction[];

  if (existingExactIdx >= 0) {
    // Exact reaction clicked again -> toggle off (remove)
    updatedReactions = currentReactions.filter((_, idx) => idx !== existingExactIdx);
  } else {
    // If user previously reacted with another emoji, update it (WhatsApp style)
    const userOtherIdx = currentReactions.findIndex((r) => r.userId === reaction.userId);
    const newEntry: MessageReaction = {
      emoji: reaction.emoji,
      userId: reaction.userId,
      username: reaction.username,
      displayName: reaction.displayName,
      createdAt: new Date().toISOString(),
    };

    if (userOtherIdx >= 0) {
      updatedReactions = currentReactions.map((r, idx) => (idx === userOtherIdx ? newEntry : r));
    } else {
      updatedReactions = [...currentReactions, newEntry];
    }
  }

  const updatedPayload: Record<string, any> = {
    ...parsed,
    reactions: updatedReactions,
  };

  return {
    newContent: JSON.stringify(updatedPayload),
    reactions: updatedReactions,
  };
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

/**
 * Resolves the friendly Shown Name (Display Name) for any user profile,
 * falling back gracefully to username or a custom default fallback.
 */
export function getProfileDisplayName(
  profile?: {
    display_name?: string;
    displayName?: string;
    name?: string;
    username?: string;
    social_links?: any;
  } | null,
  fallback: string = "User"
): string {
  if (!profile) return fallback;
  return (
    profile.display_name ||
    profile.displayName ||
    profile.social_links?.display_name ||
    profile.name ||
    profile.username ||
    fallback
  );
}

/**
 * Checks if two dates fall on the same calendar day.
 */
export function isSameDay(d1?: string | number | Date, d2?: string | number | Date): boolean {
  if (!d1 || !d2) return false;
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return false;
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Formats a message timestamp into a clean WhatsApp-style date divider:
 * - "Today"
 * - "Yesterday"
 * - Weekday name (e.g. "Wednesday") for the last 6 days
 * - "November 5" for earlier dates in current year
 * - "November 5, 2025" for previous years
 */
export function formatChatDateDivider(dateInput?: string | number | Date): string {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffTime = today.getTime() - targetDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "long" });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: "long", day: "numeric" });
  }
  return date.toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });
}



