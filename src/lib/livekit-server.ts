import { RoomServiceClient } from "livekit-server-sdk";

export function getLiveKitRoomService(): RoomServiceClient | null {
  const url = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || "";
  const host = url.replace("wss://", "https://").replace("ws://", "http://");
  const apiKey = process.env.LIVEKIT_API_KEY || "";
  const apiSecret = process.env.LIVEKIT_API_SECRET || "";

  if (!host || !apiKey || !apiSecret) {
    return null;
  }
  return new RoomServiceClient(host, apiKey, apiSecret);
}

/**
 * Server-side force kick a participant from LiveKit WebRTC room.
 * This immediately severs their audio and data connection at the media server level.
 */
export async function kickLiveKitParticipant(room: string, identity: string): Promise<boolean> {
  try {
    const svc = getLiveKitRoomService();
    if (!svc) return false;
    await svc.removeParticipant(room, identity);
    return true;
  } catch (err: any) {
    // If participant is not found in LiveKit room, ignore gracefully
    console.warn(`[LiveKit Server] Could not remove participant "${identity}" from "${room}":`, err.message);
    return false;
  }
}

/**
 * Server-side force mute or unmute a participant's published audio tracks.
 */
export async function muteLiveKitParticipant(room: string, identity: string, muted: boolean): Promise<boolean> {
  try {
    const svc = getLiveKitRoomService();
    if (!svc) return false;
    const participant = await svc.getParticipant(room, identity);
    if (participant && participant.tracks) {
      for (const track of participant.tracks) {
        if (track.sid) {
          await svc.mutePublishedTrack(room, identity, track.sid, muted);
        }
      }
    }
    return true;
  } catch (err: any) {
    console.warn(`[LiveKit Server] Could not mute participant "${identity}" in "${room}":`, err.message);
    return false;
  }
}

/**
 * Fetch the set of lowercase identities actively connected in a LiveKit room.
 * Returns:
 * - Set of identities currently present in the LiveKit room.
 * - Empty Set() if the room does not exist in LiveKit (0 active participants).
 * - null if LiveKit service is unavailable or encountered a network error.
 */
export async function getActiveLiveKitParticipants(room: string): Promise<Set<string> | null> {
  try {
    const svc = getLiveKitRoomService();
    if (!svc) return null;
    const participants = await svc.listParticipants(room);
    return new Set(
      participants
        .map((p) => (p.identity || "").toLowerCase().trim())
        .filter(Boolean)
    );
  } catch (err: any) {
    // If room does not exist in LiveKit, 0 participants are connected
    if (
      err?.status === 404 ||
      err?.code === "not_found" ||
      err?.message?.includes("does not exist") ||
      err?.message?.includes("room not found")
    ) {
      return new Set();
    }
    console.warn(`[LiveKit Server] Could not list participants for "${room}":`, err?.message || err);
    return null;
  }
}

/**
 * Fetch all active rooms and their participant counts in LiveKit.
 * Returns a Map of room name -> participant count, or null if service unavailable.
 */
export async function getActiveLiveKitRooms(): Promise<Map<string, number> | null> {
  try {
    const svc = getLiveKitRoomService();
    if (!svc) return null;
    const rooms = await svc.listRooms();
    const map = new Map<string, number>();
    for (const r of rooms) {
      map.set(r.name, r.numParticipants || 0);
    }
    return map;
  } catch (err: any) {
    console.warn("[LiveKit Server] Could not list active rooms:", err?.message || err);
    return null;
  }
}
