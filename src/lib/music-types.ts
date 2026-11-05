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

export interface RoomMusicState {
  isActive: boolean;
  auxHolderIdentity: string | null;
  auxHolderName: string | null;
  auxStartedAt: number | null; // Timestamp when current AUX holder claimed it
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  seekTime: number; // Current playback progress in seconds
  lastSyncTime: number; // Wall-clock timestamp when seekTime was last updated
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
  | { type: 'music_track_change'; payload: { track: MusicTrack; startedAt?: number } }
  | { type: 'music_playback_toggle'; payload: { isPlaying: boolean; seekTime: number; timestamp: number } }
  | { type: 'music_seek'; payload: { seekTime: number; timestamp: number } }
  | { type: 'music_stop' };

