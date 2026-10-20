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
