"use client";

import React from "react";
import { Crown, ShieldCheck, Zap, Mic, LucideIcon } from "lucide-react";
import { UserRole } from "@/lib/types";

export interface RoleConfig {
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  pillClass: string;
  textClass: string;
  borderClass: string;
  bgGradient: string;
  dotColor: string;
  glowShadow: string;
}

export const ROLE_CONFIGS: Record<string, RoleConfig> = {
  super_admin: {
    label: "Main Admin",
    shortLabel: "Founder",
    icon: Crown,
    pillClass: "bg-gradient-to-r from-amber-500/25 via-yellow-500/20 to-amber-500/10 text-amber-300 border-amber-400/50 shadow-amber-500/20",
    textClass: "text-amber-300 font-bold",
    borderClass: "border-amber-400/60",
    bgGradient: "bg-gradient-to-br from-amber-400 to-yellow-500 text-slate-950",
    dotColor: "bg-amber-400",
    glowShadow: "shadow-[0_0_12px_rgba(251,191,36,0.5)]",
  },
  admin: {
    label: "Admin",
    shortLabel: "Admin",
    icon: ShieldCheck,
    pillClass: "bg-gradient-to-r from-rose-500/25 via-red-500/20 to-rose-500/10 text-rose-300 border-rose-400/50 shadow-rose-500/20",
    textClass: "text-rose-300 font-bold",
    borderClass: "border-rose-400/60",
    bgGradient: "bg-gradient-to-br from-rose-500 to-red-600 text-white",
    dotColor: "bg-rose-500",
    glowShadow: "shadow-[0_0_12px_rgba(244,63,94,0.5)]",
  },
  manager: {
    label: "Manager",
    shortLabel: "Manager",
    icon: Zap,
    pillClass: "bg-gradient-to-r from-cyan-500/25 via-blue-500/20 to-cyan-500/10 text-cyan-300 border-cyan-400/50 shadow-cyan-500/20",
    textClass: "text-cyan-300 font-bold",
    borderClass: "border-cyan-400/60",
    bgGradient: "bg-gradient-to-br from-cyan-400 to-blue-500 text-slate-950",
    dotColor: "bg-cyan-400",
    glowShadow: "shadow-[0_0_12px_rgba(34,211,238,0.5)]",
  },
  moderator: {
    label: "Host",
    shortLabel: "Host",
    icon: ShieldCheck,
    pillClass: "bg-gradient-to-r from-amber-500/25 via-yellow-500/20 to-amber-500/10 text-amber-300 border-amber-400/50 shadow-amber-500/20",
    textClass: "text-amber-300 font-bold",
    borderClass: "border-amber-400/60",
    bgGradient: "bg-gradient-to-br from-amber-400 to-yellow-500 text-slate-950",
    dotColor: "bg-amber-400",
    glowShadow: "shadow-[0_0_12px_rgba(245,158,11,0.5)]",
  },
};

export function getRoleConfig(role?: string): RoleConfig | null {
  if (!role) return null;
  const normalized = role.toLowerCase().trim();
  return ROLE_CONFIGS[normalized] || null;
}

interface RoleBadgeProps {
  role?: UserRole | "moderator" | string;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
  useShortLabel?: boolean;
  className?: string;
}

export function RoleBadge({
  role,
  size = "sm",
  showLabel = true,
  useShortLabel = false,
  className = "",
}: RoleBadgeProps) {
  const config = getRoleConfig(role);
  if (!config) return null;

  const Icon = config.icon;

  const sizeClasses = {
    xs: "px-1.5 py-0.5 text-[8px] gap-0.5",
    sm: "px-2 py-0.5 text-[9px] sm:text-[10px] gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5",
  };

  const iconSizes = {
    xs: 9,
    sm: 11,
    md: 13,
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border backdrop-blur-md font-semibold tracking-wide uppercase transition-all shadow-sm ${config.pillClass} ${sizeClasses[size]} ${className}`}
      title={config.label}
    >
      <Icon size={iconSizes[size]} className="shrink-0" />
      {showLabel && (
        <span className="leading-none">{useShortLabel ? config.shortLabel : config.label}</span>
      )}
    </span>
  );
}

/**
 * Compact Icon-Dot Badge to place on avatar corners or seat strips.
 */
interface RoleAvatarDotProps {
  role?: UserRole | "moderator" | string;
  size?: "xs" | "sm" | "md";
  className?: string;
}

export function RoleAvatarDot({
  role,
  size = "sm",
  className = "",
}: RoleAvatarDotProps) {
  const config = getRoleConfig(role);
  if (!config) return null;

  const Icon = config.icon;

  const sizeStyles = {
    xs: "w-3 h-3 text-[7px]",
    sm: "w-3.5 h-3.5 text-[8px]",
    md: "w-4.5 h-4.5 text-[10px]",
  };

  const iconSizes = {
    xs: 8,
    sm: 9,
    md: 11,
  };

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border border-slate-900 shadow-md ${config.bgGradient} ${config.glowShadow} ${sizeStyles[size]} ${className}`}
      title={config.label}
    >
      <Icon size={iconSizes[size]} className="fill-current" />
    </span>
  );
}
