export type ParticipantRole = 'moderator' | 'speaker' | 'listener';

export interface Junction {
  id: string;
  name: string;
  description: string;
  category: 'casual' | 'gaming' | 'tech' | 'music' | 'philosophy' | 'languages' | 'chill';
  icon: string;
  tags: string[];
  maxParticipants: number; // Always 7
  currentCount: number;
  participants: JunctionParticipant[];
  createdAt: number;
  isCustom?: boolean;
  creatorId?: string;
  moderatorIdentity: string;
  isLocked?: boolean;
  bannedIdentities?: string[];
}

export interface JunctionParticipant {
  id: string;
  identity: string;
  name: string;
  avatar: string;
  color: string;
  role: ParticipantRole;
  isMuted?: boolean;
  isMutedByMod?: boolean;
  isSpeaking?: boolean;
  joinedAt: number;
  connectionQuality?: 'excellent' | 'good' | 'poor';
}

export interface GuestUser {
  id: string;
  name: string;
  avatar: string;
  color: string;
}

export interface RoomChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderColor: string;
  text: string;
  timestamp: number;
  isModerator?: boolean;
}

export interface SoundReaction {
  id: string;
  emoji: string;
  label: string;
  senderName: string;
  x: number;
}

export type ModerationActionType = 
  | 'mute_participant' 
  | 'unmute_participant' 
  | 'kick_participant' 
  | 'ban_participant' 
  | 'transfer_moderator' 
  | 'end_junction';

