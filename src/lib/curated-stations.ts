import { CuratedStation } from "./music-types";

export const CURATED_STATIONS: CuratedStation[] = [
  {
    id: "lofi_girl",
    name: "Lofi Beats Chill",
    description: "Beats to relax, study, and yap to 24/7",
    category: "Chill",
    icon: "Coffee",
    accentColor: "#F59E0B",
    gradient: "from-amber-500/20 via-orange-500/10 to-transparent",
    track: {
      id: "jfKfPfyJRdk",
      source: "youtube",
      url: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
      title: "Lofi Hip Hop Radio ☕ Beats to Relax/Study to",
      artist: "Lofi Girl",
      thumbnail: "https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg",
      isLive: true,
      duration: 0,
    },
  },
  {
    id: "synthwave_chill",
    name: "Synthwave & Chill",
    description: "Cyberpunk retro-wave & late night neon drives",
    category: "Retro",
    icon: "Radio",
    accentColor: "#EC4899",
    gradient: "from-pink-500/20 via-purple-500/10 to-transparent",
    track: {
      id: "4xDzrJKXOOY",
      source: "youtube",
      url: "https://www.youtube.com/watch?v=4xDzrJKXOOY",
      title: "Synthwave Radio 🌌 Chill Synth / Retro Beats",
      artist: "Lofi Girl Synthwave",
      thumbnail: "https://img.youtube.com/vi/4xDzrJKXOOY/hqdefault.jpg",
      isLive: true,
      duration: 0,
    },
  },
  {
    id: "jazz_cafe",
    name: "Midnight Jazz Cafe",
    description: "Warm acoustic piano & cozy coffee shop vibes",
    category: "Jazz",
    icon: "Music",
    accentColor: "#8B5CF6",
    gradient: "from-violet-500/20 via-indigo-500/10 to-transparent",
    track: {
      id: "Dx5qF63424k",
      source: "youtube",
      url: "https://www.youtube.com/watch?v=Dx5qF63424k",
      title: "Cozy Coffee Shop Jazz 🎷 Relaxing Instrumental Piano",
      artist: "Cafe Music BGM",
      thumbnail: "https://img.youtube.com/vi/Dx5qF63424k/hqdefault.jpg",
      isLive: true,
      duration: 0,
    },
  },
  {
    id: "rain_ambient",
    name: "Rain & Piano Sanctuary",
    description: "Deep calming rain soundscape & gentle melodies",
    category: "Ambient",
    icon: "CloudRain",
    accentColor: "#06B6D4",
    gradient: "from-cyan-500/20 via-blue-500/10 to-transparent",
    track: {
      id: "lTRiuFIWV54",
      source: "youtube",
      url: "https://www.youtube.com/watch?v=lTRiuFIWV54",
      title: "Gentle Night Rain & Piano 🌧️ Deep Sleep & Calm",
      artist: "Calm Rain Ambient",
      thumbnail: "https://img.youtube.com/vi/lTRiuFIWV54/hqdefault.jpg",
      isLive: true,
      duration: 0,
    },
  },
  {
    id: "gaming_beats",
    name: "Chiptune & Game Vibes",
    description: "Pixel-perfect video game music & upbeat chiptunes",
    category: "Gaming",
    icon: "Gamepad2",
    accentColor: "#10B981",
    gradient: "from-emerald-500/20 via-teal-500/10 to-transparent",
    track: {
      id: "S_MOd40tx54",
      source: "youtube",
      url: "https://www.youtube.com/watch?v=S_MOd40tx54",
      title: "Chiptune Radio 🎮 8-Bit Pixel Beats to Game & Yap to",
      artist: "Chiptune Cafe",
      thumbnail: "https://img.youtube.com/vi/S_MOd40tx54/hqdefault.jpg",
      isLive: true,
      duration: 0,
    },
  },
];

/**
 * Helper to parse any YouTube URL or string into an embeddable video ID
 */
export function extractYouTubeId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const clean = urlOrId.trim();

  // If already an 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
    return clean;
  }

  // Common YouTube URL regex
  const regExp =
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/;
  const match = clean.match(regExp);
  return match ? match[1] : null;
}

