import React from "react";

export interface ColorPreset {
  id: string;
  name: string;
  hex: string;
  category?: "gradient" | "solid";
}

export const PRESET_COLORS: ColorPreset[] = [
  // ─── Luxury Metallic & Holographic Gradients ───
  { id: "diamond_obsidian", name: "Diamond Obsidian", hex: "linear-gradient(135deg, #090A0F 0%, #18181B 35%, #27272A 70%, #3F3F46 100%)", category: "gradient" },
  { id: "liquid_gold", name: "Liquid Gold", hex: "linear-gradient(135deg, #1C1917 0%, #78350F 40%, #B45309 70%, #F59E0B 100%)", category: "gradient" },
  { id: "imperial_ruby", name: "Imperial Ruby", hex: "linear-gradient(135deg, #2A040D 0%, #7F1D1D 50%, #B91C1C 100%)", category: "gradient" },
  { id: "cyber_violet", name: "Cyber Violet", hex: "linear-gradient(135deg, #3B0764 0%, #6B21A8 50%, #A21CAF 100%)", category: "gradient" },
  { id: "aurora_teal", name: "Aurora Teal", hex: "linear-gradient(135deg, #042F2E 0%, #0F766E 50%, #0369A1 100%)", category: "gradient" },
  { id: "supernova_neon", name: "Supernova Neon", hex: "linear-gradient(135deg, #030712 0%, #312E81 50%, #4F46E5 100%)", category: "gradient" },
  { id: "rose_gold", name: "Rose Gold", hex: "linear-gradient(135deg, #4C0519 0%, #9F1239 50%, #E11D48 100%)", category: "gradient" },
  { id: "royal_velvet", name: "Royal Velvet", hex: "linear-gradient(135deg, #2E1065 0%, #5B21B6 50%, #7C3AED 100%)", category: "gradient" },
  { id: "emerald_dragon", name: "Emerald Dragon", hex: "linear-gradient(135deg, #022C22 0%, #064E3B 50%, #059669 100%)", category: "gradient" },
  { id: "cyber_synthwave", name: "Synthwave Pulse", hex: "linear-gradient(135deg, #2E1065 0%, #A21CAF 50%, #F43F5E 100%)", category: "gradient" },
  { id: "midnight_nebula", name: "Midnight Nebula", hex: "linear-gradient(135deg, #020617 0%, #1E1B4B 50%, #312E81 100%)", category: "gradient" },
  { id: "electric_cyan", name: "Electric Cyan", hex: "linear-gradient(135deg, #083344 0%, #0891B2 50%, #06B6D4 100%)", category: "gradient" },
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

/**
 * Returns inline CSS properties for rendering a customized background card.
 * Provides multi-layer glass reflection, rim glow, and depth lighting.
 */
export function getCardThemeStyle(bgColor?: string): React.CSSProperties {
  const bg = bgColor || "#465B73";
  const isGradient = bg.includes("gradient") || bg.includes("linear") || bg.includes("radial");

  const style: React.CSSProperties = {
    boxShadow: `0 20px 45px -12px rgba(0,0,0,0.75), inset 0 1px 1.5px 0 rgba(255,255,255,0.35), inset 0 -2px 10px 0 rgba(0,0,0,0.45)`,
    backdropFilter: "blur(12px)",
  };

  if (isGradient) {
    style.background = bg;
    style.borderColor = "rgba(255, 255, 255, 0.28)";
  } else {
    style.backgroundColor = bg;
    style.borderColor = `${bg}C0`;
  }

  // Multi-layered volumetric light overlay for high-end glass refraction
  const ambientGradient = `radial-gradient(ellipse at 50% -10%, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.05) 45%, rgba(0, 0, 0, 0.55) 100%), linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.3) 100%)`;

  if (isGradient) {
    style.backgroundImage = `${ambientGradient}, ${bg}`;
  } else {
    style.backgroundImage = ambientGradient;
  }

  return style;
}


