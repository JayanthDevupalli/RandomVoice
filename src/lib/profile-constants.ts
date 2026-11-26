import { UserRole } from "@/lib/types";

export interface VoiceInterestOption {
  id: "casual" | "gaming" | "tech" | "music" | "philosophy" | "languages" | "chill";
  label: string;
  emoji: string;
}

export const VOICE_INTEREST_OPTIONS: VoiceInterestOption[] = [
  { id: "casual", label: "Casual Hangouts", emoji: "💬" },
  { id: "music", label: "Music & Listening", emoji: "🎵" },
  { id: "gaming", label: "Gaming Squads", emoji: "🎮" },
  { id: "tech", label: "Tech & Builders", emoji: "💻" },
  { id: "philosophy", label: "Deep Talks", emoji: "🧠" },
  { id: "languages", label: "Languages", emoji: "🌍" },
  { id: "chill", label: "Late Night Chill", emoji: "🌙" },
];

export const VIBE_PRESETS: string[] = [
  "Down to yap",
  "Listening to music",
  "Looking for gaming buddies",
  "Late night chill",
  "Tech & coffee",
  "Just vibing",
];

export interface ProfileSocialLinks {
  display_name?: string;
  card_bg_color?: string;
  role?: UserRole;
  is_banned?: boolean;
  recovery_code?: string;
  show_online?: boolean;
  interests?: string[];
  vibe_status?: string;
  last_seen_at?: string;
  current_junction_id?: string;
  [key: string]: unknown;
}

export interface ProfileRecord {
  id: string;
  username: string;
  display_name: string;
  avatar: string;
  bio: string;
  card_bg_color: string;
  role: UserRole;
  is_banned: boolean;
  created_at?: string;
  recovery_code?: string;
  isGuestProfile?: boolean;
  social_links: ProfileSocialLinks;
}

export function isImageAvatarUrl(avatar?: string | null): boolean {
  if (!avatar) return false;
  return avatar.startsWith("http://") || avatar.startsWith("https://") || avatar.startsWith("data:");
}

export function isProfileUuid(value?: string | null): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function formatMemberSince(isoDate?: string): string | null {
  if (!isoDate) return null;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}
