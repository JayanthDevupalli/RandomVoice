import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

const HASH_SALT =
  process.env.BAN_HASH_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 24) ||
  "yapclub_ban_evasion_salt_v1";

export function hashIp(ip: string): string {
  if (!ip || ip === "unknown") return "";
  return crypto.createHash("sha256").update(`ip:${ip}:${HASH_SALT}`).digest("hex").slice(0, 32);
}

export function hashSubnet(ip: string): string {
  if (!ip || ip === "unknown") return "";
  // IPv4 /24 or IPv6 /48 prefix
  let prefix = ip;
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) prefix = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  } else if (ip.includes(":")) {
    const parts = ip.split(":");
    prefix = `${parts.slice(0, 3).join(":")}::/48`;
  }
  return crypto.createHash("sha256").update(`sub:${prefix}:${HASH_SALT}`).digest("hex").slice(0, 32);
}

export interface BanCheckResult {
  blocked: boolean;
  reason?: string;
  matchedBy?: "device" | "ip";
  ipFlagged?: boolean;
}

/**
 * Checks whether a device_hash or ip_hash is currently banned in `banned_fingerprints`.
 * - Exact device_hash match => hard block for both guests & registered users.
 * - Exact ip_hash match => hard block for guests (prevents Incognito/guest trolling),
 *   soft-flag for registered users (protects shared Wi-Fi / mobile CGNAT users).
 */
export async function checkBanEvasion(params: {
  deviceHash?: string | null;
  ip?: string | null;
  isRegistered?: boolean;
}): Promise<BanCheckResult> {
  const { deviceHash, ip, isRegistered = false } = params;
  const ipH = ip ? hashIp(ip) : "";

  if (!deviceHash && !ipH) {
    return { blocked: false };
  }

  try {
    const nowIso = new Date().toISOString();
    const orFilters: string[] = [];
    if (deviceHash) orFilters.push(`and(ban_type.eq.device,hash_value.eq.${deviceHash})`);
    if (ipH) orFilters.push(`and(ban_type.eq.ip,hash_value.eq.${ipH})`);

    const { data, error } = await supabaseAdmin
      .from("banned_fingerprints")
      .select("ban_type, hash_value, reason, expires_at")
      .or(orFilters.join(","));

    if (error || !data || data.length === 0) {
      return { blocked: false };
    }

    const activeBans = data.filter(
      (row: any) => !row.expires_at || row.expires_at > nowIso
    );

    const deviceBan = activeBans.find((r: any) => r.ban_type === "device");
    if (deviceBan) {
      return {
        blocked: true,
        matchedBy: "device",
        reason: deviceBan.reason || "Your device has been suspended from YapClub.",
      };
    }

    const ipBan = activeBans.find((r: any) => r.ban_type === "ip");
    if (ipBan) {
      if (!isRegistered) {
        return {
          blocked: true,
          matchedBy: "ip",
          reason:
            ipBan.reason ||
            "Guest access from this network is temporarily restricted due to a moderation action.",
        };
      }
      return {
        blocked: false,
        ipFlagged: true,
      };
    }

    return { blocked: false };
  } catch {
    // Fail open if table hasn't been migrated yet
    return { blocked: false };
  }
}

/**
 * Records/updates a user or guest heartbeat in `device_sessions` and `profiles`.
 */
export async function recordDeviceSession(params: {
  deviceHash?: string | null;
  ip?: string | null;
  userId?: string | null;
  guestId?: string | null;
  displayName?: string | null;
  userAgent?: string | null;
  currentJunctionId?: string | null;
}) {
  const {
    deviceHash,
    ip,
    userId,
    guestId,
    displayName,
    userAgent,
    currentJunctionId,
  } = params;

  const nowIso = new Date().toISOString();
  const ipH = ip ? hashIp(ip) : "";
  const subH = ip ? hashSubnet(ip) : "";

  // 1. Update registered user's last_seen_at & social_links fallback
  if (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    try {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          last_seen_at: nowIso,
          current_junction_id: currentJunctionId || null,
        })
        .eq("id", userId);

      if (error) {
        // Fallback if native columns aren't migrated yet
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("social_links")
          .eq("id", userId)
          .maybeSingle();
        const links = (prof?.social_links && typeof prof.social_links === "object") ? prof.social_links : {};
        await supabaseAdmin
          .from("profiles")
          .update({
            social_links: {
              ...links,
              last_seen_at: nowIso,
              current_junction_id: currentJunctionId || null,
              ...(deviceHash ? { last_device_hash: deviceHash } : {}),
              ...(ipH ? { last_ip_hash: ipH } : {}),
            },
          })
          .eq("id", userId);
      }
    } catch {}
  }

  // 2. Upsert into device_sessions
  if (deviceHash) {
    try {
      await supabaseAdmin.from("device_sessions").upsert(
        {
          device_hash: deviceHash,
          ip_hash: ipH || null,
          subnet_hash: subH || null,
          user_id: userId || null,
          guest_id: guestId || null,
          display_name: displayName || null,
          user_agent: userAgent ? userAgent.slice(0, 200) : null,
          current_junction_id: currentJunctionId || null,
          last_seen_at: nowIso,
        },
        { onConflict: "device_hash" }
      );
    } catch {}
  }
}

/**
 * Bans all known device_hashes and ip_hashes associated with a suspended user.
 */
export async function banUserFingerprints(params: {
  userId?: string;
  username?: string;
  reason?: string;
  bannedBy?: string;
}) {
  const { userId, username, reason, bannedBy } = params;
  if (!userId && !username) return;

  try {
    const deviceHashes = new Set<string>();
    const ipHashes = new Set<string>();

    if (userId) {
      const { data: sessions } = await supabaseAdmin
        .from("device_sessions")
        .select("device_hash, ip_hash")
        .eq("user_id", userId);

      if (sessions) {
        for (const s of sessions) {
          if (s.device_hash) deviceHashes.add(s.device_hash);
          if (s.ip_hash) ipHashes.add(s.ip_hash);
        }
      }

      // Also check social_links fallback
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("social_links")
        .eq("id", userId)
        .maybeSingle();
      if (prof?.social_links?.last_device_hash) deviceHashes.add(prof.social_links.last_device_hash);
      if (prof?.social_links?.last_ip_hash) ipHashes.add(prof.social_links.last_ip_hash);
    }

    const deviceExpiry = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(); // 180 days
    const ipExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days (safe for CGNAT)

    const rows: any[] = [];
    deviceHashes.forEach((h) =>
      rows.push({
        ban_type: "device",
        hash_value: h,
        source_user_id: userId || null,
        source_username: username || null,
        reason: reason || "Account suspended for violating community guidelines.",
        banned_by: bannedBy || "admin",
        expires_at: deviceExpiry,
      })
    );
    ipHashes.forEach((h) =>
      rows.push({
        ban_type: "ip",
        hash_value: h,
        source_user_id: userId || null,
        source_username: username || null,
        reason: reason || "Network restricted due to moderation action.",
        banned_by: bannedBy || "admin",
        expires_at: ipExpiry,
      })
    );

    if (rows.length > 0) {
      await supabaseAdmin
        .from("banned_fingerprints")
        .upsert(rows, { onConflict: "ban_type,hash_value" });
    }

    if (deviceHashes.size > 0) {
      await supabaseAdmin
        .from("device_sessions")
        .update({ is_banned: true })
        .in("device_hash", Array.from(deviceHashes));
    }
  } catch (e) {
    console.warn("banUserFingerprints warning:", e);
  }
}

/**
 * Removes device/IP bans linked to an unsuspended user.
 */
export async function unbanUserFingerprints(params: { userId?: string; username?: string }) {
  const { userId, username } = params;
  if (!userId && !username) return;
  try {
    if (userId) {
      await supabaseAdmin.from("banned_fingerprints").delete().eq("source_user_id", userId);
      await supabaseAdmin.from("device_sessions").update({ is_banned: false }).eq("user_id", userId);
    } else if (username) {
      await supabaseAdmin.from("banned_fingerprints").delete().ilike("source_username", username);
    }
  } catch (e) {
    console.warn("unbanUserFingerprints warning:", e);
  }
}
