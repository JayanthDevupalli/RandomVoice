"use client";

import React from "react";
import {
  LucideIcon,
  Zap,
  Flame,
  Rocket,
  Headphones,
  Gamepad2,
  Sparkles,
  Bot,
  Ghost,
  Crown,
  Shield,
  Heart,
  Smile,
  Radio,
  Compass,
  Star,
  Code,
  User,
  Music
} from "lucide-react";

export const AVATAR_ICON_MAP: Record<string, LucideIcon> = {
  zap: Zap,
  flame: Flame,
  rocket: Rocket,
  headphones: Headphones,
  gamepad: Gamepad2,
  sparkles: Sparkles,
  bot: Bot,
  ghost: Ghost,
  crown: Crown,
  shield: Shield,
  heart: Heart,
  smile: Smile,
  radio: Radio,
  compass: Compass,
  star: Star,
  code: Code,
  music: Music,
};

export const AVAILABLE_AVATARS = [
  { id: "zap", label: "Bolt", icon: Zap },
  { id: "flame", label: "Flame", icon: Flame },
  { id: "rocket", label: "Rocket", icon: Rocket },
  { id: "headphones", label: "Beats", icon: Headphones },
  { id: "gamepad", label: "Gamer", icon: Gamepad2 },
  { id: "sparkles", label: "Spark", icon: Sparkles },
  { id: "bot", label: "Cyborg", icon: Bot },
  { id: "ghost", label: "Phantom", icon: Ghost },
  { id: "crown", label: "Legend", icon: Crown },
  { id: "shield", label: "Guardian", icon: Shield },
  { id: "heart", label: "Vibe", icon: Heart },
  { id: "star", label: "Nova", icon: Star },
];

interface UserAvatarProps {
  avatar?: string;
  color?: string;
  size?: "sm" | "md" | "lg" | "xl";
  isSpeaking?: boolean;
  className?: string;
}

export function UserAvatar({
  avatar = "zap",
  color = "#6366F1",
  size = "md",
  isSpeaking = false,
  className = "",
}: UserAvatarProps) {
  const normalizedKey = avatar?.toLowerCase().replace(/[^a-z0-9]/g, "") || "zap";
  const IconComponent = AVATAR_ICON_MAP[normalizedKey] || AVATAR_ICON_MAP[avatar] || User;

  const sizeClasses = {
    sm: "w-7 h-7 rounded-lg text-xs",
    md: "w-10 h-10 rounded-xl text-sm",
    lg: "w-16 h-16 rounded-2xl text-base",
    xl: "w-20 h-20 sm:w-24 sm:h-24 rounded-3xl text-xl",
  };

  const iconSizes = {
    sm: 14,
    md: 18,
    lg: 28,
    xl: 38,
  };

  return (
    <div
      className={`relative flex items-center justify-center transition-all duration-200 shadow-md ${
        sizeClasses[size]
      } ${isSpeaking ? "speaking-ring ring-emerald-400" : "border border-slate-300 dark:border-slate-700/60"} ${className}`}
      style={{
        backgroundColor: `${color}25`,
        borderColor: isSpeaking ? "#10B981" : `${color}60`,
        boxShadow: isSpeaking
          ? `0 0 20px #10B981, inset 0 0 10px #10B981`
          : `0 4px 12px ${color}15`,
      }}
    >
      <IconComponent
        size={iconSizes[size]}
        style={{ color: isSpeaking ? "#10B981" : color }}
        className="transition-transform group-hover:scale-110"
      />
    </div>
  );
}
