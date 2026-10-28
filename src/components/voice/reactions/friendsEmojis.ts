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
  color: string;
  x: number; // horizontal % (25% to 75%)
  sway?: "left" | "right" | "center" | "arc-left" | "arc-right";
  trajectory?: 1 | 2 | 3 | 4 | 5;
  scale?: number;
  duration?: number;
  combo?: number;
}

export const FRIENDS_EMOJI_REACTIONS: EmojiReactionItem[] = [
  { id: "heart_hands", emoji: "🫶", label: "Besties", color: "#F43F5E" },
  { id: "heart", emoji: "❤️", label: "Love", color: "#EF4444" },
  { id: "laugh", emoji: "😂", label: "Haha", color: "#EAB308" },
  { id: "dead", emoji: "💀", label: "Dead", color: "#94A3B8" },
  { id: "fire", emoji: "🔥", label: "Fire", color: "#F97316" },
  { id: "hug", emoji: "🫂", label: "Hug", color: "#8B5CF6" },
  { id: "handshake", emoji: "🤝", label: "Bro", color: "#10B981" },
  { id: "salute", emoji: "🫡", label: "Respect", color: "#3B82F6" },
  { id: "sparkles", emoji: "✨", label: "Vibes", color: "#FCD34D" },
  { id: "party", emoji: "🎉", label: "Party", color: "#EC4899" },
  { id: "cheers", emoji: "🍻", label: "Cheers", color: "#F59E0B" },
  { id: "hundred", emoji: "💯", label: "100", color: "#EF4444" },
];

export const QUICK_FRIENDS_REACTIONS = FRIENDS_EMOJI_REACTIONS;
