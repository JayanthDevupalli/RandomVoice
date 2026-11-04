export interface EmojiReactionItem {
  id: string;
  emoji: string;
  label: string;
  color: string;
}

export interface VectorReaction {
  id: string;
  iconName: string;
  emoji: string;
  label: string;
  senderName: string;
  senderIdentity?: string;
  color: string;
  x: number; // horizontal % (78% to 92%)
  sway?: "left" | "right" | "center" | "wide-left" | "wide-right" | "wave";
  trajectory?: 1 | 2 | 3 | 4 | 5;
  scale?: number;
  duration?: number;
  hideSender?: boolean;
}

export const FRIENDS_EMOJI_REACTIONS: EmojiReactionItem[] = [
  { id: "praise", emoji: "🙌", label: "Praise", color: "#F59E0B" },
  { id: "sparkles", emoji: "✨", label: "Sparkles", color: "#FCD34D" },
  { id: "shrug", emoji: "🤷", label: "Shrug", color: "#A855F7" },
  { id: "melting", emoji: "🫠", label: "Melting", color: "#F97316" },
  { id: "cool", emoji: "😎", label: "Cool", color: "#3B82F6" },
  { id: "eyes", emoji: "👀", label: "Eyes", color: "#06B6D4" },
  { id: "rofl", emoji: "🤣", label: "Haha", color: "#EAB308" },
  { id: "heart_eyes", emoji: "😍", label: "Love", color: "#EC4899" },
  { id: "salute", emoji: "🫡", label: "Respect", color: "#3B82F6" },
  { id: "smirk", emoji: "😏", label: "Smirk", color: "#8B5CF6" },
  { id: "sob", emoji: "😭", label: "Sob", color: "#38BDF8" },
  { id: "scream", emoji: "😱", label: "Shock", color: "#6366F1" },
  { id: "broken_heart", emoji: "💔", label: "Broken", color: "#EF4444" },
  { id: "heart", emoji: "❤️", label: "Heart", color: "#EF4444" },
  { id: "finger_heart", emoji: "🫰", label: "Heart", color: "#F43F5E" },
  { id: "pray", emoji: "🙏", label: "Pray", color: "#10B981" },
  { id: "man_dancing", emoji: "🕺", label: "Dance", color: "#F59E0B" },
  { id: "woman_dancing", emoji: "💃", label: "Dance", color: "#EC4899" },
];

export const QUICK_FRIENDS_REACTIONS = FRIENDS_EMOJI_REACTIONS;
