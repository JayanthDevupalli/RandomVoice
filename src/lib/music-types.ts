export type MediaSourceType = 'youtube' | 'radio' | 'custom';

export interface MusicTrack {
  id: string;
  source: MediaSourceType;
  url: string;
  title: string;
  artist?: string;
  thumbnail?: string;
  duration?: number; // duration in seconds, 0 or undefined for live streams
  isLive?: boolean;
}

export interface QueuedTrack extends MusicTrack {
  queueId: string;
  addedByIdentity: string;
  addedByName: string;
  addedAt: number;
}

export interface RoomMusicState {
  isActive: boolean;
  auxHolderIdentity: string | null; // DJ identity
  auxHolderName: string | null;     // DJ name
  auxStartedAt: number | null; // Timestamp when DJ claimed control
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  seekTime: number; // Current playback progress in seconds
  lastSyncTime: number; // Wall-clock timestamp when seekTime was last updated
  queue: QueuedTrack[]; // Live collaborative song queue
}

export interface CuratedStation {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  accentColor: string;
  gradient: string;
  track: MusicTrack;
}

export type MusicDataPacket =
  | { type: 'music_sync_request' }
  | { type: 'music_sync'; payload: RoomMusicState }
  | { type: 'music_aux_claim'; payload: { identity: string; name: string } }
  | { type: 'music_aux_release'; payload: { previousIdentity: string } }
  | { type: 'music_aux_pass'; payload: { targetIdentity: string; targetName: string } }
  | { type: 'music_track_change'; payload: { track: MusicTrack; startedAt?: number; auxHolderIdentity?: string; auxHolderName?: string } }
  | { type: 'music_playback_toggle'; payload: { isPlaying: boolean; seekTime: number; timestamp: number; senderIdentity?: string } }
  | { type: 'music_seek'; payload: { seekTime: number; timestamp: number; senderIdentity?: string } }
  | { type: 'music_stop'; payload?: { senderIdentity?: string } }
  | { type: 'music_sync_heartbeat'; payload: { seekTime: number; isPlaying: boolean; timestamp: number } }
  | { type: 'music_queue_add'; payload: { track: QueuedTrack } }
  | { type: 'music_queue_remove'; payload: { queueId: string; senderIdentity: string } }
  | { type: 'music_queue_play'; payload: { queueId: string; track: MusicTrack; senderIdentity: string } }
  | { type: 'music_queue_clear'; payload: { senderIdentity: string } };

