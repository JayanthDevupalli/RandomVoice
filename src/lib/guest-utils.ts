import { GuestUser } from "./types";

export const INDIAN_MALE_NAMES = [
  "Vivek", "Krishna", "Rahul", "Sanjay", "Amit", "Rohan", "Vikram", "Arjun",
  "Karan", "Aarav", "Ravi", "Suresh", "Aditya", "Raj", "Varun", "Kabir", "Aryan"
];

export const INDIAN_FEMALE_NAMES = [
  "Priya", "Neha", "Pooja", "Anjali", "Sneha", "Kavya", "Riya", "Aarti",
  "Meera", "Swati", "Divya", "Kiran", "Shruti", "Isha", "Tara", "Naina", "Kiara"
];

export const AVATAR_PRESETS = [
  { id: "zap", label: "Bolt", iconName: "zap" },
  { id: "flame", label: "Flame", iconName: "flame" },
  { id: "rocket", label: "Rocket", iconName: "rocket" },
  { id: "headphones", label: "Beats", iconName: "headphones" },
  { id: "gamepad", label: "Gamer", iconName: "gamepad" },
  { id: "sparkles", label: "Spark", iconName: "sparkles" },
  { id: "bot", label: "Cyborg", iconName: "bot" },
  { id: "ghost", label: "Phantom", iconName: "ghost" },
  { id: "crown", label: "Legend", iconName: "crown" },
  { id: "shield", label: "Guardian", iconName: "shield" },
  { id: "heart", label: "Vibe", iconName: "heart" },
  { id: "star", label: "Nova", iconName: "star" },
];

export const COLOR_PALETTES = [
  "#6366F1", // Indigo
  "#06B6D4", // Cyan
  "#10B981", // Emerald
  "#EC4899", // Pink
  "#F59E0B", // Amber
  "#8B5CF6", // Purple
  "#3B82F6", // Blue
  "#F43F5E", // Rose
];

export function generateRandomNickname(gender: 'male' | 'female' | 'any' = 'any'): string {
  let list = [...INDIAN_MALE_NAMES, ...INDIAN_FEMALE_NAMES];
  if (gender === 'male') list = INDIAN_MALE_NAMES;
  if (gender === 'female') list = INDIAN_FEMALE_NAMES;
  
  const name = list[Math.floor(Math.random() * list.length)];
  return name;
}

export function generateRandomGuest(): GuestUser {
  const randomPreset = AVATAR_PRESETS[Math.floor(Math.random() * AVATAR_PRESETS.length)];
  const randomColor = COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)];
  const id = "guest_" + Math.random().toString(36).substring(2, 9);

  return {
    id,
    name: generateRandomNickname(),
    avatar: randomPreset.id,
    color: randomColor,
  };
}
