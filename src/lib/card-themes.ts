import React from "react";

export interface ColorPreset {
  id: string;
  name: string;
  hex: string;
}

export interface PatternPreset {
  id: string;
  name: string;
  cssPattern: string;
  bgSize?: string;
}

export const PRESET_COLORS: ColorPreset[] = [
  { id: "harbor", name: "Harbor", hex: "#465B73" },
  { id: "eucalyptus", name: "Eucalyptus", hex: "#2D5F5D" },
  { id: "moss", name: "Moss", hex: "#4C5B42" },
  { id: "soft_plum", name: "Soft plum", hex: "#5B485E" },
  { id: "clay", name: "Clay", hex: "#6B4940" },
  { id: "denim", name: "Denim", hex: "#3E5975" },
  { id: "mulberry", name: "Mulberry", hex: "#5A3B4E" },
  { id: "graphite", name: "Graphite", hex: "#3C434B" },
  { id: "spruce", name: "Spruce", hex: "#2F5249" },
  { id: "storm", name: "Storm", hex: "#4D5863" },
  { id: "wine", name: "Wine", hex: "#5F3E48" },
  { id: "ochre", name: "Ochre", hex: "#6A5435" },
  { id: "blush", name: "Blush", hex: "#7E4F5B" },
  { id: "mauve", name: "Mauve", hex: "#674A63" },
  { id: "lilac", name: "Lilac", hex: "#5A5577" },
  { id: "berry", name: "Berry", hex: "#6E3B52" },
  { id: "periwinkle", name: "Periwinkle", hex: "#4B5C82" },
  { id: "dusty_rose", name: "Dusty rose", hex: "#754A53" },
  { id: "midnight_black", name: "Midnight black", hex: "#151921" },
  { id: "cherry", name: "Cherry", hex: "#7B3045" },
  { id: "orchid", name: "Orchid", hex: "#5E3E72" },
  { id: "deep_ocean", name: "Deep ocean", hex: "#254D63" },
  { id: "jade", name: "Jade", hex: "#2B5E4F" },
  { id: "cocoa", name: "Cocoa", hex: "#594239" },
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
];

/**
 * Returns inline CSS properties for rendering a customized background card.
 */
export function getCardThemeStyle(bgColor?: string, patternId?: string): React.CSSProperties {
  const hex = bgColor || "#465B73";
  const pattern = PRESET_PATTERNS.find((p) => p.id === patternId) || PRESET_PATTERNS[0];

  const style: React.CSSProperties = {
    backgroundColor: hex,
    borderColor: `${hex}80`,
  };

  if (pattern.id !== "none") {
    style.backgroundImage = pattern.cssPattern;
    if (pattern.bgSize) {
      style.backgroundSize = pattern.bgSize;
    }
  }

  return style;
}
