import React from "react";

export interface ColorPreset {
  id: string;
  name: string;
  hex: string;
  category?: "gradient" | "solid";
}

export interface PatternPreset {
  id: string;
  name: string;
  cssPattern: string;
  bgSize?: string;
}

export const PRESET_COLORS: ColorPreset[] = [
  // ─── Luxury Gradient & Metallic Presets ───
  { id: "cyber_violet", name: "Cyber Violet", hex: "linear-gradient(135deg, #3B0764 0%, #6B21A8 50%, #A21CAF 100%)", category: "gradient" },
  { id: "aurora_teal", name: "Aurora Teal", hex: "linear-gradient(135deg, #042F2E 0%, #0F766E 50%, #0369A1 100%)", category: "gradient" },
  { id: "obsidian_gold", name: "Obsidian Gold", hex: "linear-gradient(135deg, #18181B 0%, #3F3F46 50%, #854D0E 100%)", category: "gradient" },
  { id: "rose_gold", name: "Rose Gold", hex: "linear-gradient(135deg, #4C0519 0%, #9F1239 50%, #E11D48 100%)", category: "gradient" },
  { id: "royal_velvet", name: "Royal Velvet", hex: "linear-gradient(135deg, #2E1065 0%, #5B21B6 50%, #7C3AED 100%)", category: "gradient" },
  { id: "emerald_luxury", name: "Emerald Luxe", hex: "linear-gradient(135deg, #022C22 0%, #047857 50%, #10B981 100%)", category: "gradient" },
  { id: "midnight_nebula", name: "Midnight Nebula", hex: "linear-gradient(135deg, #020617 0%, #1E1B4B 50%, #312E81 100%)", category: "gradient" },
  { id: "volcanic_amber", name: "Volcanic Amber", hex: "linear-gradient(135deg, #450A0A 0%, #9A3412 50%, #D97706 100%)", category: "gradient" },
  { id: "electric_cyan", name: "Electric Cyan", hex: "linear-gradient(135deg, #083344 0%, #0891B2 50%, #06B6D4 100%)", category: "gradient" },
  { id: "platinum_noir", name: "Platinum Noir", hex: "linear-gradient(135deg, #09090B 0%, #27272A 50%, #52525B 100%)", category: "gradient" },
  { id: "solar_eclipse", name: "Solar Eclipse", hex: "linear-gradient(135deg, #2A0800 0%, #7C2D12 50%, #EAB308 100%)", category: "gradient" },
  { id: "deep_abyss", name: "Deep Abyss", hex: "linear-gradient(135deg, #050510 0%, #0F172A 50%, #1E293B 100%)", category: "gradient" },

  // ─── Rich Solid Luxury Tones ───
  { id: "harbor", name: "Harbor", hex: "#465B73", category: "solid" },
  { id: "eucalyptus", name: "Eucalyptus", hex: "#2D5F5D", category: "solid" },
  { id: "moss", name: "Moss", hex: "#4C5B42", category: "solid" },
  { id: "soft_plum", name: "Soft plum", hex: "#5B485E", category: "solid" },
  { id: "clay", name: "Clay", hex: "#6B4940", category: "solid" },
  { id: "denim", name: "Denim", hex: "#3E5975", category: "solid" },
  { id: "mulberry", name: "Mulberry", hex: "#5A3B4E", category: "solid" },
  { id: "graphite", name: "Graphite", hex: "#3C434B", category: "solid" },
  { id: "spruce", name: "Spruce", hex: "#2F5249", category: "solid" },
  { id: "storm", name: "Storm", hex: "#4D5863", category: "solid" },
  { id: "wine", name: "Wine", hex: "#5F3E48", category: "solid" },
  { id: "ochre", name: "Ochre", hex: "#6A5435", category: "solid" },
  { id: "blush", name: "Blush", hex: "#7E4F5B", category: "solid" },
  { id: "mauve", name: "Mauve", hex: "#674A63", category: "solid" },
  { id: "lilac", name: "Lilac", hex: "#5A5577", category: "solid" },
  { id: "berry", name: "Berry", hex: "#6E3B52", category: "solid" },
  { id: "periwinkle", name: "Periwinkle", hex: "#4B5C82", category: "solid" },
  { id: "dusty_rose", name: "Dusty rose", hex: "#754A53", category: "solid" },
  { id: "midnight_black", name: "Midnight black", hex: "#151921", category: "solid" },
  { id: "cherry", name: "Cherry", hex: "#7B3045", category: "solid" },
  { id: "orchid", name: "Orchid", hex: "#5E3E72", category: "solid" },
  { id: "deep_ocean", name: "Deep ocean", hex: "#254D63", category: "solid" },
  { id: "jade", name: "Jade", hex: "#2B5E4F", category: "solid" },
  { id: "cocoa", name: "Cocoa", hex: "#594239", category: "solid" },
];

export const PRESET_PATTERNS: PatternPreset[] = [
  {
    id: "none",
    name: "None",
    cssPattern: "none",
  },
  {
    id: "diagonal",
    name: "Diagonal",
    cssPattern: "repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 1px, transparent 0, transparent 10px)",
  },
  {
    id: "grid",
    name: "Grid",
    cssPattern: "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)",
    bgSize: "16px 16px",
  },
  {
    id: "dots",
    name: "Dots",
    cssPattern: "radial-gradient(rgba(255,255,255,0.18) 1.5px, transparent 1.5px)",
    bgSize: "14px 14px",
  },
  {
    id: "waves",
    name: "Waves",
    cssPattern: "radial-gradient(circle at 50% 100%, transparent 6px, rgba(255,255,255,0.08) 7px, rgba(255,255,255,0.08) 8px, transparent 9px)",
    bgSize: "20px 12px",
  },
  {
    id: "checker",
    name: "Checker",
    cssPattern: "conic-gradient(rgba(255,255,255,0.07) 90deg, transparent 90deg 180deg, rgba(255,255,255,0.07) 180deg 270deg, transparent 270deg)",
    bgSize: "16px 16px",
  },
  {
    id: "pinstripe",
    name: "Pinstripe",
    cssPattern: "repeating-linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.08) 1px, transparent 1px, transparent 12px)",
  },
  {
    id: "rings",
    name: "Rings",
    cssPattern: "radial-gradient(circle, transparent 25%, rgba(255,255,255,0.08) 26%, rgba(255,255,255,0.08) 30%, transparent 31%)",
    bgSize: "24px 24px",
  },
  {
    id: "crosshatch",
    name: "Crosshatch",
    cssPattern: "repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 8px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 8px)",
  },
  {
    id: "carbon",
    name: "Carbon Fiber",
    cssPattern: "repeating-linear-gradient(45deg, rgba(0,0,0,0.3) 0, rgba(0,0,0,0.3) 2px, transparent 0, transparent 4px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 1px, transparent 0, transparent 6px)",
    bgSize: "10px 10px",
  },
  {
    id: "hexagon",
    name: "Honeycomb",
    cssPattern: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.12) 1.5px, transparent 2px), radial-gradient(circle at 0% 100%, rgba(255,255,255,0.1) 1.5px, transparent 2px)",
    bgSize: "18px 18px",
  },
  {
    id: "stardust",
    name: "Stardust",
    cssPattern: "radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)",
    bgSize: "20px 20px, 12px 12px",
  },
  {
    id: "prism",
    name: "Prism Geometry",
    cssPattern: "repeating-linear-gradient(60deg, rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 1px, transparent 0, transparent 14px), repeating-linear-gradient(-60deg, rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 1px, transparent 0, transparent 14px)",
  },
  {
    id: "cyber_circuit",
    name: "Cyber Circuit",
    cssPattern: "linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
    bgSize: "24px 24px",
  },
];

/**
 * Returns inline CSS properties for rendering a customized background card.
 */
export function getCardThemeStyle(bgColor?: string, patternId?: string): React.CSSProperties {
  const bg = bgColor || "#465B73";
  const pattern = PRESET_PATTERNS.find((p) => p.id === patternId) || PRESET_PATTERNS[0];

  const isGradient = bg.includes("gradient") || bg.includes("linear") || bg.includes("radial");

  const style: React.CSSProperties = {
    boxShadow: `0 14px 35px -10px rgba(0,0,0,0.65), inset 0 1px 0 0 rgba(255,255,255,0.2)`,
  };

  if (isGradient) {
    style.background = bg;
    style.borderColor = "rgba(255, 255, 255, 0.25)";
  } else {
    style.backgroundColor = bg;
    style.borderColor = `${bg}A0`;
  }

  const ambientGradient = `radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.16) 0%, rgba(0,0,0,0.38) 100%)`;

  if (pattern.id !== "none") {
    if (isGradient) {
      style.backgroundImage = `${pattern.cssPattern}, ${ambientGradient}, ${bg}`;
    } else {
      style.backgroundImage = `${pattern.cssPattern}, ${ambientGradient}`;
    }
    if (pattern.bgSize) {
      style.backgroundSize = isGradient ? `${pattern.bgSize}, 100% 100%, 100% 100%` : `${pattern.bgSize}, 100% 100%`;
    }
  } else {
    if (isGradient) {
      style.backgroundImage = `${ambientGradient}, ${bg}`;
    } else {
      style.backgroundImage = ambientGradient;
    }
  }

  return style;
}
