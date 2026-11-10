import { supabase as anonSupabase } from "./supabase";
import { createClient } from "@supabase/supabase-js";
import { Junction, JunctionParticipant, UserRole, UserReportRecord, WaitingGuest } from "./types";
import {
  kickLiveKitParticipant,
  muteLiveKitParticipant,
  getActiveLiveKitParticipants,
  getActiveLiveKitRooms,
} from "./livekit-server";

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabase = (serviceKey && url)
  ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : anonSupabase;

export function resolvePlatformRole(username?: string, rawRole?: string): UserRole {
  if (rawRole === "super_admin" || rawRole === "admin" || rawRole === "manager") {
    return rawRole as UserRole;
  }
  return "user";
}

// ─── Waiting Room In-Memory Stores ──────────────────────────────────────────
// Maps junctionId -> Set of admitted lowercased identities
const admittedIdentitiesByJunction = new Map<string, Set<string>>();
// Maps junctionId -> Map of identity -> WaitingGuest
const waitingGuestsByJunction = new Map<string, Map<string, WaitingGuest>>();

export function knockWaitingRoom(junctionId: string, guest: WaitingGuest): { success: boolean; queueLength: number } {
  let waitingMap = waitingGuestsByJunction.get(junctionId);
  if (!waitingMap) {
    waitingMap = new Map();
    waitingGuestsByJunction.set(junctionId, waitingMap);
  }
  const cleanId = (guest.identity || "").trim().toLowerCase();
  waitingMap.set(cleanId, guest);
  return { success: true, queueLength: waitingMap.size };
}

export function admitWaitingGuest(junctionId: string, targetIdentity: string): boolean {
  const cleanTarget = (targetIdentity || "").trim().toLowerCase();
  let admittedSet = admittedIdentitiesByJunction.get(junctionId);
  if (!admittedSet) {
    admittedSet = new Set();
    admittedIdentitiesByJunction.set(junctionId, admittedSet);
  }
  admittedSet.add(cleanTarget);

  const waitingMap = waitingGuestsByJunction.get(junctionId);
  if (waitingMap) {
    waitingMap.delete(cleanTarget);
  }
  return true;
}

export function denyWaitingGuest(junctionId: string, targetIdentity: string): boolean {
  const cleanTarget = (targetIdentity || "").trim().toLowerCase();
  const waitingMap = waitingGuestsByJunction.get(junctionId);
  if (waitingMap) {
    waitingMap.delete(cleanTarget);
  }
  return true;
}

export function cancelWaitingKnock(junctionId: string, targetIdentity: string): boolean {
  const cleanTarget = (targetIdentity || "").trim().toLowerCase();
  const waitingMap = waitingGuestsByJunction.get(junctionId);
  if (waitingMap) {
    waitingMap.delete(cleanTarget);
  }
  return true;
}

export function getWaitingGuests(junctionId: string): WaitingGuest[] {
  const waitingMap = waitingGuestsByJunction.get(junctionId);
  return waitingMap ? Array.from(waitingMap.values()) : [];
}

export function isIdentityAdmitted(junctionId: string, identity?: string): boolean {
  if (!identity) return false;
  const cleanId = identity.trim().toLowerCase();
  const admittedSet = admittedIdentitiesByJunction.get(junctionId);
  return Boolean(admittedSet && admittedSet.has(cleanId));
}

// ─── Helpers: DB row ↔ TypeScript mapping ───────────────────────────────────

interface JunctionRow {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  tags: string[];
  max_participants: number;
  current_count: number;
  created_at: number;
  is_custom: boolean;
  creator_id: string | null;
  moderator_identity: string;
  is_locked: boolean;
  banned_identities: string[];
  expires_at?: number | null;
  duration_type?: string;
}

interface ParticipantRow {
  id: string;
  junction_id: string;
  identity: string;
  name: string;
  avatar: string;
  color: string;
  card_bg_color?: string;
  role: string;
  is_muted: boolean;
  is_muted_by_mod: boolean;
  is_speaking: boolean;
  joined_at: number;
  connection_quality: string;
  reported_by: string[];
}

interface ParticipantProfile {
  username: string;
  displayName: string;
  avatar?: string;
  cardBgColor?: string;
  role?: UserRole;
}

function rowToJunction(
  row: JunctionRow,
  participants: ParticipantRow[],
  roleMap?: Record<string, UserRole>,
  profileMap?: Record<string, ParticipantProfile>
): Junction {
  const isPrivate = Boolean(
    row.is_custom ||
    row.creator_id ||
    (typeof row.id === "string" && row.id.startsWith("junc_"))
  );

  // Extract duration metadata from direct row columns OR internal tag metadata
  let resolvedDurationType: string | undefined = row.duration_type;
  let resolvedExpiresAt: number | null | undefined = row.expires_at;

  const rawTags = Array.isArray(row.tags) ? row.tags : [];
  const cleanTags: string[] = [];

  for (const t of rawTags) {
    if (typeof t === "string" && t.startsWith("__duration:")) {
      if (!resolvedDurationType) {
        resolvedDurationType = t.replace("__duration:", "").replace(/__$/, "");
      }
    } else if (typeof t === "string" && t.startsWith("__expires:")) {
      if (resolvedExpiresAt === undefined || resolvedExpiresAt === null) {
        const val = parseInt(t.replace("__expires:", "").replace(/__$/, ""), 10);
        if (!isNaN(val) && val > 0) {
          resolvedExpiresAt = val;
        }
      }
    } else {
      cleanTags.push(t);
    }
  }

  // If a private room has duration type but expiresAt wasn't explicitly saved:
  if (isPrivate && resolvedDurationType && resolvedDurationType !== "permanent" && !resolvedExpiresAt) {
    resolvedExpiresAt = computeExpiresAt(resolvedDurationType, row.created_at || Date.now());
  }

  // Backwards compatibility for private rooms created when duration was defaulted to 1h
  if (isPrivate && !resolvedDurationType && (resolvedExpiresAt === undefined || resolvedExpiresAt === null)) {
    const createdAtTime = typeof row.created_at === "number" ? row.created_at : Date.now();
    const standard1hExpiry = createdAtTime + 60 * 60 * 1000;
    if (Date.now() < standard1hExpiry) {
      resolvedDurationType = "1h";
      resolvedExpiresAt = standard1hExpiry;
    } else {
      resolvedDurationType = "permanent";
      resolvedExpiresAt = null;
    }
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category as Junction["category"],
    icon: row.icon,
    tags: cleanTags.length > 0 ? cleanTags : (row.tags || []),
    maxParticipants: row.max_participants || (isPrivate ? 2 : 10),
    currentCount: participants.length,
    createdAt: row.created_at,
    isCustom: row.is_custom,
    creatorId: row.creator_id || undefined,
    moderatorIdentity: isPrivate ? (row.creator_id || row.moderator_identity || "") : "",
    isLocked: row.is_locked,
    bannedIdentities: row.banned_identities || [],
    expiresAt: isPrivate ? (resolvedExpiresAt ?? null) : undefined,
    durationType: isPrivate ? (resolvedDurationType ?? "permanent") : undefined,
    participants: participants.map((p) => {
      const part = rowToParticipant(p, roleMap, profileMap);
      if (isPrivate) {
        const cleanCreator = (row.creator_id || "").trim().toLowerCase();
        const cleanId = (part.identity || "").trim().toLowerCase();
        const cleanUser = (part.username || "").trim().toLowerCase();
        const cleanName = (part.name || "").trim().toLowerCase();
        const isCreator = Boolean(
          cleanCreator &&
          (cleanId === cleanCreator || cleanUser === cleanCreator || cleanName === cleanCreator)
        );
        return {
          ...part,
          role: isCreator ? "moderator" : "speaker",
        };
      } else {
        return {
          ...part,
          role: "speaker",
        };
      }
    }),
  };
}

function encodeParticipantColor(color?: string, cardBgColor?: string): string {
  const c = color || "#6366F1";
  const bg = cardBgColor || "#465B73";
  return `${c}|${bg}`;
}

function decodeParticipantColor(rawColor?: string): { color: string; cardBgColor: string } {
  if (!rawColor) {
    return { color: "#6366F1", cardBgColor: "#465B73" };
  }
  if (rawColor.includes("|")) {
    const parts = rawColor.split("|");
    return {
      color: parts[0] || "#6366F1",
      cardBgColor: parts[1] || "#465B73",
    };
  }
  return {
    color: rawColor,
    cardBgColor: "#465B73",
  };
}

function rowToParticipant(
  row: ParticipantRow,
  roleMap?: Record<string, UserRole>,
  profileMap?: Record<string, ParticipantProfile>
): JunctionParticipant {
  const decoded = decodeParticipantColor(row.color);
  const isGuest = !row.id || row.id.startsWith("guest_") || row.id.startsWith("p_");
  const cleanId = (row.identity || "").toLowerCase();
  const cleanDbId = (row.id || "").toLowerCase();
  const userProfile = !isGuest ? (profileMap?.[cleanDbId] || profileMap?.[cleanId]) : undefined;

  // Resolve cardBgColor: userProfile theme > row.card_bg_color > decoded cardBgColor > default
  let cardBgColor = "#465B73";
  if (userProfile?.cardBgColor && userProfile.cardBgColor !== "#465B73") {
    cardBgColor = userProfile.cardBgColor;
  } else if (row.card_bg_color && row.card_bg_color !== "#465B73") {
    cardBgColor = row.card_bg_color;
  } else if (decoded.cardBgColor && decoded.cardBgColor !== "#465B73") {
    cardBgColor = decoded.cardBgColor;
  } else {
    cardBgColor = row.card_bg_color || decoded.cardBgColor || "#465B73";
  }

  const rawRole = !isGuest ? (roleMap?.[cleanDbId] || roleMap?.[cleanId] || userProfile?.role) : "user";
  const userRole = !isGuest ? resolvePlatformRole(row.identity, rawRole) : "user";
  const resolvedName = userProfile?.displayName || row.name || row.identity;
  const resolvedUsername = userProfile?.username || row.identity;
  const resolvedAvatar = userProfile?.avatar ? userProfile.avatar : (row.avatar || "zap");

  return {
    id: row.id,
    identity: row.identity,
    name: resolvedName,
    username: resolvedUsername,
    displayName: resolvedName,
    avatar: resolvedAvatar,
    color: decoded.color,
    cardBgColor,
    role: row.role as JunctionParticipant["role"],
    userRole,
    isMuted: row.is_muted,
    isMutedByMod: row.is_muted_by_mod,
    isSpeaking: row.is_speaking,
    joinedAt: row.joined_at,
    connectionQuality: row.connection_quality as JunctionParticipant["connectionQuality"],
    reportedBy: row.reported_by || [],
  };
}

// ─── Platform Profiles Fast In-Memory Cache ────────────────────────────────
interface CachedProfileEntry {
  profile: ParticipantProfile;
  role: UserRole;
  isBanned: boolean;
  timestamp: number;
}
const platformProfileCache = new Map<string, CachedProfileEntry>();
const PROFILE_CACHE_TTL_MS = 60000;

// ─── Fetch a junction with its participants ─────────────────────────────────

async function fetchJunctionWithParticipants(junctionId: string): Promise<Junction | undefined> {
  // Concurrent parallel fetch: junction metadata & participants
  const [jRes, pRes] = await Promise.all([
    supabase
      .from("junctions")
      .select("*")
      .eq("id", junctionId)
      .single(),
    supabase
      .from("junction_participants")
      .select("*")
      .eq("junction_id", junctionId)
      .order("joined_at", { ascending: true }),
  ]);

  const jRow = jRes.data;
  if (jRes.error || !jRow) return undefined;

  const rawParticipants = (pRes.data || []) as ParticipantRow[];

  // Only registered participants (non-guests) have authentic platform profiles
  const registeredParticipants = rawParticipants.filter(
    (p) => p.id && !p.id.startsWith("guest_") && !p.id.startsWith("p_")
  );
  const registeredUsernames = Array.from(
    new Set(
      registeredParticipants
        .map((p) => (p.identity || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
  const registeredUserIds = Array.from(
    new Set(
      registeredParticipants
        .map((p) => p.id)
        .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    )
  );

  const roleMap: Record<string, UserRole> = {};
  const profileMap: Record<string, ParticipantProfile> = {};
  const bannedUsernames = new Set<string>();

  // Fetch verified platform profiles with fast 60s memory caching
  const now = Date.now();
  const missingUsernames: string[] = [];

  for (const cleanId of registeredUsernames) {
    if (!cleanId || !/^[a-zA-Z0-9_.-]+$/.test(cleanId)) continue;
    const cached = platformProfileCache.get(cleanId);
    if (cached && now - cached.timestamp < PROFILE_CACHE_TTL_MS) {
      if (cached.isBanned) bannedUsernames.add(cleanId);
      roleMap[cleanId] = cached.role;
      profileMap[cleanId] = cached.profile;
    } else {
      missingUsernames.push(cleanId);
    }
  }

  if (missingUsernames.length > 0 || registeredUserIds.length > 0) {
    try {
      let query = supabase.from("profiles").select("*");
      if (missingUsernames.length > 0 && registeredUserIds.length > 0) {
        query = query.or(`id.in.(${registeredUserIds.map((id) => `"${id}"`).join(",")}),username.in.(${missingUsernames.map((u) => `"${u}"`).join(",")})`);
      } else if (registeredUserIds.length > 0) {
        query = query.in("id", registeredUserIds);
      } else {
        query = query.in("username", missingUsernames);
      }
      const { data: profs } = await query;

      for (const pr of (profs as any[]) || []) {
        if (pr.username) {
          const uLower = pr.username.toLowerCase();
          const idLower = (pr.id || "").toLowerCase();
          const isBanned = Boolean(pr.is_banned ?? pr.social_links?.is_banned);
          if (isBanned) {
            bannedUsernames.add(uLower);
          }

          const rawDbRole = pr.role || pr.social_links?.role;
          const resolved = resolvePlatformRole(
            pr.username,
            rawDbRole
          );
          roleMap[uLower] = resolved;
          if (idLower) roleMap[idLower] = resolved;

          const dName = pr.display_name || pr.social_links?.display_name || pr.username;
          const cardBg = (pr.card_bg_color && pr.card_bg_color !== "#465B73")
            ? pr.card_bg_color
            : (pr.social_links?.card_bg_color || pr.card_bg_color || "#465B73");

          const pInfo: ParticipantProfile = {
            username: pr.username,
            displayName: dName,
            avatar: pr.avatar,
            cardBgColor: cardBg,
            role: resolved,
          };

          profileMap[uLower] = pInfo;
          if (idLower) profileMap[idLower] = pInfo;

          platformProfileCache.set(uLower, {
            profile: pInfo,
            role: resolved,
            isBanned,
            timestamp: now,
          });
        }
      }
    } catch (e) {
      console.error("Error fetching participant platform profiles:", e);
    }
  }

  // Only filter platform-banned users.
  // Never purge active participants synchronously during room fetch!
  const participants = rawParticipants.filter((p) => {
    if (bannedUsernames.has((p.identity || "").toLowerCase())) {
      supabase.from("junction_participants").delete().eq("id", p.id).then();
      return false;
    }
    return true;
  });

  return rowToJunction(jRow as JunctionRow, participants, roleMap, profileMap);
}

// ─── Global Presence Realtime Broadcast ──────────────────────────────────────

let globalPresenceChannel: any = null;
function getGlobalPresenceChannel() {
  if (!globalPresenceChannel) {
    globalPresenceChannel = supabase.channel("junctions_global_presence");
    globalPresenceChannel.subscribe();
  }
  return globalPresenceChannel;
}

export async function broadcastGlobalPresence(junctionId: string, count: number, totalOnline?: number, participants?: any[]) {
  try {
    const ch = getGlobalPresenceChannel();
    await ch.send({
      type: "broadcast",
      event: "presence_updated",
      payload: {
        junctionId,
        count,
        totalOnline,
        participants: participants || [],
        timestamp: Date.now(),
      },
    });
  } catch (err) {
    console.warn("Failed to broadcast global presence:", err);
  }
}

// ─── Sync current_count helper ──────────────────────────────────────────────

async function syncCount(junctionId: string) {
  const { data: currentRows, count } = await supabase
    .from("junction_participants")
    .select("id, identity, name, avatar, color, card_bg_color, role, is_speaking")
    .eq("junction_id", junctionId);

  const newCount = count !== null && count !== undefined ? count : (currentRows ? currentRows.length : 0);
  const updatePayload: Record<string, any> = { current_count: newCount };
  if (newCount === 0) {
    updatePayload.moderator_identity = "";
  }

  await supabase
    .from("junctions")
    .update(updatePayload)
    .eq("id", junctionId);

  // Invalidate in-memory lobby cache immediately
  invalidateJunctionsCache();

  // Compute total online count and broadcast globally
  const { count: totalOnline } = await supabase
    .from("junction_participants")
    .select("*", { count: "exact", head: true });

  const participantsList = (currentRows || []).map((r) => ({
    id: r.id,
    identity: r.identity,
    name: r.name,
    avatar: r.avatar,
    color: r.color,
    cardBgColor: r.card_bg_color,
    role: r.role,
    isSpeaking: r.is_speaking,
  }));

  broadcastGlobalPresence(junctionId, newCount, totalOnline ?? newCount, participantsList).catch(() => {});
}

// ─── Touch Heartbeat to Keep Active Participants Fresh ─────────────────────────

export async function touchParticipantHeartbeat(junctionId: string, identity: string) {
  const clean = (identity || "").trim().toLowerCase();
  const sessionKey = `${junctionId}:${clean}`;
  const existing = activeParticipantTabs.get(sessionKey);
  if (existing) {
    existing.updatedAt = Date.now();
  } else {
    activeParticipantTabs.set(sessionKey, { tabSessionId: "", updatedAt: Date.now() });
  }
}

// ─── Fast In-Memory Cache for Lobby ──────────────────────────────────────────

let cachedJunctions: { list: Junction[]; timestamp: number } | null = null;
const LOBBY_CACHE_TTL_MS = 2500; // 2.5s TTL for sub-millisecond repeated queries

export function invalidateJunctionsCache() {
  cachedJunctions = null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

function computeExpiresAt(durationType?: string, now = Date.now()): number | null {
  if (!durationType || durationType === "permanent") return null;
  switch (durationType) {
    case "30m":
      return now + 30 * 60 * 1000;
    case "1h":
      return now + 60 * 60 * 1000;
    case "2h":
      return now + 2 * 60 * 60 * 1000;
    case "3h":
      return now + 3 * 60 * 60 * 1000;
    case "24h":
    case "1d":
      return now + 24 * 60 * 60 * 1000;
    case "48h":
    case "2d":
      return now + 48 * 60 * 60 * 1000;
    default:
      return null;
  }
}

export async function getAllJunctions(): Promise<Junction[]> {
  const now = Date.now();
  if (cachedJunctions && now - cachedJunctions.timestamp < LOBBY_CACHE_TTL_MS) {
    return cachedJunctions.list;
  }

  const [jRes, pRes] = await Promise.all([
    supabase
      .from("junctions")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("junction_participants")
      .select("*")
      .order("joined_at", { ascending: true }),
  ]);

  const jRows = jRes.data;
  const pRows = pRes.data;

  if (jRes.error || !jRows) return [];

  // Filter out and auto-cleanup expired junctions
  const expiredIds: string[] = [];
  const activeJRows = (jRows as JunctionRow[]).filter((row) => {
    let exp = row.expires_at;
    if ((!exp || typeof exp !== "number") && Array.isArray(row.tags)) {
      for (const t of row.tags) {
        if (typeof t === "string" && t.startsWith("__expires:")) {
          const val = parseInt(t.replace("__expires:", "").replace(/__$/, ""), 10);
          if (!isNaN(val) && val > 0) exp = val;
        }
      }
    }
    if (exp && typeof exp === "number" && now >= exp) {
      expiredIds.push(row.id);
      return false;
    }
    return true;
  });

  if (expiredIds.length > 0) {
    supabase.from("junctions").delete().in("id", expiredIds).then();
    expiredIds.forEach((id) => {
      waitingGuestsByJunction.delete(id);
      admittedIdentitiesByJunction.delete(id);
    });
  }

  const rawParticipants = (pRows || []) as ParticipantRow[];
  const allIdentities = Array.from(
    new Set(
      rawParticipants
        .flatMap((p: any) => [p.identity, p.name])
        .filter(Boolean)
    )
  ) as string[];
  
  const roleMap: Record<string, UserRole> = {};
  const profileMap: Record<string, ParticipantProfile> = {};
  const bannedUsernames = new Set<string>();

  // Fetch verified platform profiles ONLY for active room participants across junctions
  const searchIdentities = Array.from(
    new Set(
      allIdentities
        .map((id) => (id || "").trim())
        .filter((id) => /^[a-zA-Z0-9_.-]+$/.test(id))
        .flatMap((id) => [id, id.toLowerCase()])
    )
  );

  if (searchIdentities.length > 0) {
    try {
      const { data: profs, error: profError } = await supabase
        .from("profiles")
        .select("*")
        .in("username", searchIdentities);

      if (profError) {
        console.error("Error fetching lobby participant platform profiles:", profError);
      }

      for (const pr of (profs as any[]) || []) {
        if (pr.username) {
          const isBanned = Boolean(pr.is_banned ?? pr.social_links?.is_banned);
          if (isBanned) {
            bannedUsernames.add(pr.username.toLowerCase());
          }

          const resolved = resolvePlatformRole(
            pr.username,
            pr.role || pr.social_links?.role
          );
          roleMap[pr.username.toLowerCase()] = resolved;
          const dName = pr.display_name || pr.social_links?.display_name || pr.username;
          const cardBg = (pr.card_bg_color && pr.card_bg_color !== "#465B73")
            ? pr.card_bg_color
            : (pr.social_links?.card_bg_color || pr.card_bg_color || "#465B73");

          const pInfo: ParticipantProfile = {
            username: pr.username,
            displayName: dName,
            avatar: pr.avatar,
            cardBgColor: cardBg,
            role: resolved,
          };

          profileMap[pr.username.toLowerCase()] = pInfo;
          if (dName) {
            roleMap[dName.toLowerCase()] = resolved;
            profileMap[dName.toLowerCase()] = pInfo;
          }
        }
      }
    } catch (e) {
      console.error("Error fetching lobby participant platform profiles:", e);
    }
  }

  // Group active participants by junction (filtering banned accounts)
  const participantsByJunction: Record<string, ParticipantRow[]> = {};

  for (const p of rawParticipants) {
    if (bannedUsernames.has((p.identity || "").toLowerCase())) {
      supabase.from("junction_participants").delete().eq("id", p.id).then();
      continue;
    }

    if (!participantsByJunction[p.junction_id]) {
      participantsByJunction[p.junction_id] = [];
    }
    participantsByJunction[p.junction_id].push(p);
  }

  const result = activeJRows
    .map((row) =>
      rowToJunction(row, participantsByJunction[row.id] || [], roleMap, profileMap)
    )
    .sort((a, b) => {
      const countA = a.participants?.length ?? a.currentCount ?? 0;
      const countB = b.participants?.length ?? b.currentCount ?? 0;
      if (countB !== countA) return countB - countA;
      return a.name.localeCompare(b.name);
    });

  cachedJunctions = { list: result, timestamp: Date.now() };
  return result;
}

export async function getJunctionById(id: string): Promise<Junction | undefined> {
  const junc = await fetchJunctionWithParticipants(id);
  if (junc && junc.expiresAt && Date.now() >= junc.expiresAt) {
    supabase.from("junctions").delete().eq("id", id).then();
    waitingGuestsByJunction.delete(id);
    admittedIdentitiesByJunction.delete(id);
    return undefined;
  }
  return junc;
}

export async function createJunction(data: {
  name: string;
  description: string;
  category: Junction["category"];
  tags: string[];
  maxParticipants?: number;
  creator: { name: string; avatar: string; color: string };
  isLocked?: boolean;
  durationType?: string;
}): Promise<Junction> {
  const creatorIdentity = data.creator.name;
  const junctionId = "junc_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 6);
  const now = Date.now();
  const durType = data.durationType || "1h";
  const expiresAt = computeExpiresAt(durType, now);

  const baseTags = (data.tags && data.tags.length > 0) ? data.tags : ["Custom", data.category];
  const metadataTags: string[] = [`__duration:${durType}__`];
  if (expiresAt) {
    metadataTags.push(`__expires:${expiresAt}__`);
  }

  const insertPayload: any = {
    id: junctionId,
    name: data.name,
    description: data.description || "A user-created voice junction.",
    category: data.category,
    icon: "Mic",
    tags: [...baseTags, ...metadataTags],
    max_participants: data.maxParticipants || 2,
    current_count: 0,
    created_at: now,
    is_custom: true,
    creator_id: creatorIdentity,
    moderator_identity: creatorIdentity,
    is_locked: data.isLocked || false,
    banned_identities: [],
    expires_at: expiresAt,
    duration_type: durType,
  };

  // Insert junction — creator is recorded and designated as host (moderator).
  let { error: jError } = await supabase.from("junctions").insert(insertPayload);

  // Graceful fallback if expires_at or duration_type columns do not exist yet in Supabase
  if (jError && (jError.message?.includes("expires_at") || (jError as any).details?.includes("expires_at") || jError.message?.includes("duration_type"))) {
    delete insertPayload.expires_at;
    delete insertPayload.duration_type;
    const retry = await supabase.from("junctions").insert(insertPayload);
    jError = retry.error;
  }

  if (jError) {
    console.error("Error creating junction:", jError);
    throw new Error("Failed to create junction");
  }

  const junction = await fetchJunctionWithParticipants(junctionId);
  invalidateJunctionsCache();
  return junction!;
}

const isUUID = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export async function checkPlatformSuspension(identity?: string, id?: string): Promise<boolean> {
  const identifiers = Array.from(new Set([identity, id].filter(Boolean))) as string[];
  if (identifiers.length === 0) return false;

  for (const identifier of identifiers) {
    try {
      let query = supabase.from("profiles").select("*");
      if (isUUID(identifier)) {
        query = query.or(`id.eq.${identifier},username.ilike.${identifier}`);
      } else {
        query = query.ilike("username", identifier);
      }
      const { data: profile } = await query.maybeSingle();
      if (profile) {
        const isBanned = Boolean(
          (profile as any).is_banned ?? profile.social_links?.is_banned
        );
        if (isBanned) return true;
      }
    } catch (e) {
      console.error("Error verifying suspension status for", identifier, e);
    }
  }
  return false;
}

// Active participant tab tracker: `${junctionId}:${cleanParticipantIdentity}` -> { tabSessionId, updatedAt }
const activeParticipantTabs = new Map<string, { tabSessionId: string; updatedAt: number }>();

export async function addParticipantToJunction(
  junctionId: string,
  participant: Omit<JunctionParticipant, "joinedAt">,
  tabSessionId?: string
): Promise<{ success: boolean; error?: string; isLocked?: boolean; junction?: Junction }> {
  const cleanParticipantIdentity = (participant.identity || "").trim().toLowerCase();

  if (tabSessionId) {
    activeParticipantTabs.set(`${junctionId}:${cleanParticipantIdentity}`, {
      tabSessionId,
      updatedAt: Date.now(),
    });
  }

  // Check if participant is platform-suspended / banned by YapClub moderation
  const isSuspended = await checkPlatformSuspension(participant.identity, participant.id);
  if (isSuspended) {
    return {
      success: false,
      error: "Your account has been suspended by YapClub moderation.",
    };
  }

  const junction = await fetchJunctionWithParticipants(junctionId);

  if (!junction) {
    return { success: false, error: "Junction not found" };
  }

  // Check if participant is banned from this junction
  if (junction.bannedIdentities && junction.bannedIdentities.some((b) => (b || "").trim().toLowerCase() === cleanParticipantIdentity)) {
    return { success: false, error: "You have been banned from this junction by the moderator." };
  }

  // Remove this unique identity from any other junction before joining this one.
  const { data: prevRows } = await supabase
    .from("junction_participants")
    .select("junction_id")
    .ilike("identity", cleanParticipantIdentity)
    .neq("junction_id", junctionId);

  await supabase
    .from("junction_participants")
    .delete()
    .ilike("identity", cleanParticipantIdentity)
    .neq("junction_id", junctionId);

  if (prevRows && prevRows.length > 0) {
    const prevJunctionIds = Array.from(new Set(prevRows.map((r) => r.junction_id)));
    prevJunctionIds.forEach((pId) => {
      syncCount(pId).catch(() => {});
    });
  }

  const existing = junction.participants.find(
    (p) => (p.identity || "").trim().toLowerCase() === cleanParticipantIdentity
  );
  const isAlreadyPresent = Boolean(existing);

  if (junction.currentCount >= junction.maxParticipants && !isAlreadyPresent) {
    return { success: false, error: `Junction is full (Max ${junction.maxParticipants || 10} seats reached)` };
  }

  const isPrivate = Boolean(
    junction.isCustom ||
    junction.creatorId ||
    (typeof junction.id === "string" && junction.id.startsWith("junc_"))
  );
  const cleanCreator = (junction.creatorId || "").trim().toLowerCase();
  const cleanModIdentity = (junction.moderatorIdentity || "").trim().toLowerCase();
  const cleanUsername = (participant.username || "").trim().toLowerCase();
  const cleanName = (participant.name || "").trim().toLowerCase();
  const cleanDbId = (participant.id || "").trim().toLowerCase();
  const cleanDisplayName = (participant.displayName || "").trim().toLowerCase();
  const isCreator = Boolean(
    isPrivate &&
    ((cleanCreator && (cleanParticipantIdentity === cleanCreator || cleanUsername === cleanCreator || cleanName === cleanCreator || cleanDbId === cleanCreator || cleanDisplayName === cleanCreator)) ||
     (cleanModIdentity && (cleanParticipantIdentity === cleanModIdentity || cleanUsername === cleanModIdentity || cleanName === cleanModIdentity || cleanDbId === cleanModIdentity || cleanDisplayName === cleanModIdentity)))
  );

  const isAdmitted =
    isIdentityAdmitted(junctionId, cleanParticipantIdentity) ||
    isIdentityAdmitted(junctionId, cleanUsername) ||
    isIdentityAdmitted(junctionId, cleanName) ||
    isIdentityAdmitted(junctionId, participant.id);

  const isSuperAdmin = participant.userRole === "super_admin";

  if (junction.isLocked && !isAlreadyPresent && !isCreator && !isAdmitted && !isSuperAdmin) {
    return { success: false, error: "This room is locked by the host.", isLocked: true };
  }

  // Determine avatar and cardBgColor from participant or existing
  const resolvedAvatar = participant.avatar || existing?.avatar || "zap";
  const finalBgColor = participant.cardBgColor || existing?.cardBgColor || "#465B73";

  // Upsert participant atomically to avoid duplicate key conflicts or race conditions
  const shouldKeepModMute = Boolean(existing?.isMutedByMod || participant.isMutedByMod);
  const encodedColor = encodeParticipantColor(
    participant.color || existing?.color,
    finalBgColor !== "#465B73" ? finalBgColor : existing?.cardBgColor
  );

  const participantId = participant.id || existing?.id || ("guest_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5));
  // In private rooms, ONLY the creator has the host (moderator) tag; fellow users remain speakers.
  // In public junctions, all participants remain equal speakers.
  const newRole: JunctionParticipant["role"] = isPrivate
    ? (isCreator ? "moderator" : "speaker")
    : "speaker";
  const newMuted = shouldKeepModMute ? true : (existing?.isMuted !== undefined ? existing.isMuted : (participant.isMuted !== undefined ? participant.isMuted : true));
  const joinedAtTime = existing?.joinedAt || (participant as any).joinedAt || (participant as any).joined_at || Date.now();
  const newCount = isAlreadyPresent ? junction.participants.length : junction.participants.length + 1;

  // Execute database writes concurrently: upsert participant, remove duplicate records from other rooms
  const [upsertRes] = await Promise.all([
    supabase.from("junction_participants").upsert(
      {
        id: participantId,
        junction_id: junctionId,
        identity: participant.identity,
        name: participant.name,
        avatar: resolvedAvatar,
        color: encodedColor,
        card_bg_color: finalBgColor,
        role: newRole,
        is_muted: newMuted,
        is_muted_by_mod: shouldKeepModMute,
        is_speaking: false,
        joined_at: joinedAtTime,
        connection_quality: participant.connectionQuality || "excellent",
      },
      { onConflict: "junction_id,identity" }
    ),
    supabase
      .from("junction_participants")
      .delete()
      .eq("identity", participant.identity)
      .neq("junction_id", junctionId),
  ]);

  if (upsertRes.error) {
    console.error("Failed to upsert participant:", upsertRes.error);
    return { success: false, error: "Database error: " + upsertRes.error.message };
  }

  // Atomically sync exact room count
  await syncCount(junctionId);

  // Invalidate in-memory lobby cache so callers get fresh counts immediately
  invalidateJunctionsCache();

  // Construct updated junction immediately without making 3 extra round-trip queries!
  const selfParticipant: JunctionParticipant = {
    id: participantId,
    identity: participant.identity,
    name: participant.name,
    displayName: participant.displayName || participant.name,
    avatar: resolvedAvatar,
    color: participant.color || existing?.color || "#6366F1",
    cardBgColor: finalBgColor,
    role: newRole,
    userRole: participant.userRole || existing?.userRole || "user",
    isMuted: newMuted,
    isMutedByMod: shouldKeepModMute,
    isSpeaking: false,
    joinedAt: joinedAtTime,
    connectionQuality: participant.connectionQuality || "excellent",
    reportedBy: existing?.reportedBy || [],
  };

  const updatedParticipants = isAlreadyPresent
    ? junction.participants.map((p) =>
        (p.identity || "").trim().toLowerCase() === cleanParticipantIdentity
          ? selfParticipant
          : p
      )
    : [...junction.participants, selfParticipant];

  const updatedJunction: Junction = {
    ...junction,
    currentCount: updatedParticipants.length,
    participants: updatedParticipants,
    moderatorIdentity: isPrivate ? (junction.creatorId || "") : "",
  };

  return { success: true, junction: updatedJunction };
}

export async function removeParticipantFromJunction(
  junctionId: string,
  identity: string,
  extra?: { identities?: string[]; name?: string; participantId?: string; userId?: string; tabSessionId?: string }
) {
  invalidateJunctionsCache();

  const cleanId = (identity || "").trim().toLowerCase();
  const sessionKey = `${junctionId}:${cleanId}`;
  const activeSession = activeParticipantTabs.get(sessionKey);

  // If a tabSessionId was provided, verify it is still the active tab for this user.
  // If an older tab's close beacon arrived after a newer tab has joined, ignore the stale leave request!
  if (activeSession && extra?.tabSessionId && activeSession.tabSessionId !== extra.tabSessionId) {
    console.log(`[Store] Stale leave beacon ignored for @${cleanId} (active: ${activeSession.tabSessionId}, stale: ${extra.tabSessionId})`);
    return;
  }

  // Active tab or intentional leave, clear tracking
  if (activeSession && (!extra?.tabSessionId || activeSession.tabSessionId === extra.tabSessionId)) {
    activeParticipantTabs.delete(sessionKey);
  }

  const targetSet = new Set<string>();
  if (identity) targetSet.add(identity.trim());
  if (extra?.participantId) targetSet.add(extra.participantId.trim());
  if (extra?.userId) targetSet.add(extra.userId.trim());
  if (Array.isArray(extra?.identities)) {
    extra.identities.forEach((id) => id && targetSet.add(id.trim()));
  }

  // 1. Fetch current participants of this junction to find matches by unique identity or id
  const { data: currentParticipants } = await supabase
    .from("junction_participants")
    .select("id, identity, name")
    .eq("junction_id", junctionId);

  const matchedIds = (currentParticipants || [])
    .filter((p) => {
      const pIdent = (p.identity || "").toLowerCase().trim();
      const pId = (p.id || "").toLowerCase().trim();
      return Array.from(targetSet).some((t) => {
        const tLower = t.toLowerCase().trim();
        return pIdent === tLower || pId === tLower;
      });
    })
    .map((p) => p.id);

  if (matchedIds.length > 0) {
    await supabase
      .from("junction_participants")
      .delete()
      .in("id", matchedIds);
  } else {
    // 2. Direct fallback delete strictly within this junctionId
    const candidates = Array.from(targetSet).filter(Boolean);
    if (candidates.length > 0) {
      await Promise.allSettled(
        candidates.map((t) =>
          supabase
            .from("junction_participants")
            .delete()
            .eq("junction_id", junctionId)
            .or(`identity.eq.${t},identity.ilike.${t},id.eq.${t}`)
        )
      );
    }
  }

  await syncCount(junctionId);

  // Clear moderator_identity and auto-unlock ONLY if public station is empty.
  // For private rooms created by users, preserve creator's locked room state so
  // if creator locks and exits, their room remains safely locked and found by creator / Super Admin!
  const junction = await fetchJunctionWithParticipants(junctionId);
  if (junction && junction.participants.length === 0) {
    const isPrivate = Boolean(
      junction.isCustom ||
      junction.creatorId ||
      (typeof junction.id === "string" && junction.id.startsWith("junc_"))
    );
    await supabase
      .from("junctions")
      .update({
        current_count: 0,
        ...(isPrivate ? {} : { moderator_identity: "", is_locked: false }),
      })
      .eq("id", junctionId);
    waitingGuestsByJunction.delete(junctionId);
    admittedIdentitiesByJunction.delete(junctionId);
  }

  invalidateJunctionsCache();
}

export async function purgeUserFromAllJunctions(targetIdentities: string[]): Promise<{ purged: number }> {
  const cleanTargets = Array.from(
    new Set(
      targetIdentities
        .map((t) => (t || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
  if (cleanTargets.length === 0) return { purged: 0 };

  try {
    const { data: rows } = await supabase
      .from("junction_participants")
      .select("junction_id, id, identity");

    const matched = (rows || []).filter((r) => {
      const rIdent = (r.identity || "").toLowerCase().trim();
      const rId = (r.id || "").toLowerCase().trim();
      return cleanTargets.some((t) => rIdent === t || rId === t);
    });

    if (matched.length > 0) {
      const idsToDelete = matched.map((m) => m.id);
      const junctionIdsToSync = Array.from(new Set(matched.map((m) => m.junction_id)));

      matched.forEach((m) => {
        activeParticipantTabs.delete(`${m.junction_id}:${(m.identity || "").toLowerCase().trim()}`);
      });

      await supabase
        .from("junction_participants")
        .delete()
        .in("id", idsToDelete);

      await Promise.allSettled(junctionIdsToSync.map((jId) => syncCount(jId)));
      invalidateJunctionsCache();
      return { purged: matched.length };
    }
  } catch (err) {
    console.warn("Failed to purge user ghosts:", err);
  }
  return { purged: 0 };
}

export async function moderateParticipant(
  junctionId: string,
  moderatorIdentity: string,
  targetIdentity: string,
  action: "mute" | "unmute" | "kick" | "ban" | "unban" | "promote_mod" | "demote_mod",
  moderatorUserId?: string,
  requesterRole?: UserRole
): Promise<{ success: boolean; error?: string; isLocked?: boolean; junction?: Junction }> {
  const junction = await fetchJunctionWithParticipants(junctionId);

  if (!junction) {
    return { success: false, error: "Junction not found" };
  }

  // Determine caller platform role
  let callerRole: UserRole = resolvePlatformRole(moderatorIdentity, requesterRole);
  if (callerRole === "user") {
    try {
      let query = supabase.from("profiles").select("*");
      if (moderatorUserId && isUUID(moderatorUserId)) {
        query = query.or(`id.eq.${moderatorUserId},username.ilike.${moderatorIdentity}`);
      } else {
        query = query.ilike("username", moderatorIdentity);
      }
      const { data: callerProf } = await query.maybeSingle();

      if (callerProf) {
        callerRole = resolvePlatformRole(callerProf.username, callerProf.role || callerProf.social_links?.role);
      }
    } catch (e) {
      console.error("Error resolving caller platform role:", e);
    }
  }

  const isCallerSuperAdmin = callerRole === "super_admin";
  const isCallerAdmin = isCallerSuperAdmin || callerRole === "admin";
  const isCallerManager = isCallerAdmin || callerRole === "manager";

  const isPrivateRoom = Boolean(
    junction.isCustom ||
    junction.creatorId ||
    (typeof junction.id === "string" && junction.id.startsWith("junc_"))
  );
  const cleanCreator = (junction.creatorId || "").trim().toLowerCase();
  const cleanModId = (moderatorIdentity || "").trim().toLowerCase();
  const modParticipant = junction.participants.find(
    (p) => (p.identity || "").trim().toLowerCase() === cleanModId
  );
  const isCallerRoomMod = Boolean(modParticipant && modParticipant.role === "moderator");
  const isCreatorHost = Boolean(
    isPrivateRoom &&
    cleanCreator &&
    (cleanModId === cleanCreator || (modParticipant && modParticipant.role === "moderator"))
  );

  if (!isCallerManager && !isCallerRoomMod && !isCreatorHost) {
    return { success: false, error: "Unauthorized: Staff or Moderator privileges required" };
  }

  const cleanTargetId = (targetIdentity || "").trim().toLowerCase();

  // If action is unban, target is not in active participants list
  if (action === "unban") {
    const currentBanned = (junction.bannedIdentities || []).filter(
      (b) => (b || "").trim().toLowerCase() !== cleanTargetId
    );
    await supabase
      .from("junctions")
      .update({ banned_identities: currentBanned })
      .eq("id", junctionId);

    const updated = await fetchJunctionWithParticipants(junctionId);
    return { success: true, junction: updated };
  }

  // Target role check
  const target = junction.participants.find(
    (p) => (p.identity || "").trim().toLowerCase() === cleanTargetId
  );
  if (!target) {
    return { success: false, error: "Target participant not in junction" };
  }

  const targetRole: UserRole = target.userRole || resolvePlatformRole(target.identity);

  // Hierarchy rules for moderating:
  // 1. Super Admins, Admins, and Managers have authority to ban regular participants.
  if (action === "ban" && !isCallerManager) {
    return {
      success: false,
      error: "Unauthorized: Staff privileges required to ban participants.",
    };
  }
  // Managers can only ban regular users (not fellow managers or admins)
  if (action === "ban" && !isCallerAdmin && targetRole !== "user") {
    return {
      success: false,
      error: "Unauthorized: Admin clearance required to ban staff members.",
    };
  }
  if (action === "kick" && !isCallerManager && !isCreatorHost) {
    return {
      success: false,
      error: "Unauthorized: Staff privileges or Private Room Host required to kick participants.",
    };
  }

  // 2. Super Admin cannot be kicked or muted by anyone except themselves
  if (targetRole === "super_admin" && !isCallerSuperAdmin) {
    return { success: false, error: "The Main Admin cannot be moderated." };
  }

  // 3. Admins cannot be moderated by Managers or regular Room Hosts
  if (targetRole === "admin" && !isCallerSuperAdmin) {
    return { success: false, error: "Admins cannot be moderated by Managers or Room Hosts." };
  }

  // 4. Managers cannot be moderated by regular Room Hosts
  if (targetRole === "manager" && !isCallerAdmin && !isCallerSuperAdmin) {
    return { success: false, error: "Managers cannot be moderated by regular Room Hosts." };
  }

  if (action === "mute") {
    await supabase
      .from("junction_participants")
      .update({ is_muted: true, is_muted_by_mod: true, is_speaking: false })
      .eq("id", target.id);
    await muteLiveKitParticipant(junctionId, target.identity, true);
  } else if (action === "unmute") {
    // Only remove mod mute restriction. Do NOT auto-unmute user's microphone.
    await supabase
      .from("junction_participants")
      .update({ is_muted_by_mod: false })
      .eq("id", target.id);
  } else if (action === "kick") {
    await supabase
      .from("junction_participants")
      .delete()
      .eq("id", target.id);
    await syncCount(junctionId);
    await kickLiveKitParticipant(junctionId, target.identity);
  } else if (action === "ban") {
    // Add to banned list
    const currentBanned = junction.bannedIdentities || [];
    if (!currentBanned.some((b) => (b || "").trim().toLowerCase() === cleanTargetId)) {
      currentBanned.push(target.identity);
    }
    await supabase
      .from("junctions")
      .update({ banned_identities: currentBanned })
      .eq("id", junctionId);

    // Remove from participants
    await supabase
      .from("junction_participants")
      .delete()
      .eq("id", target.id);
    await syncCount(junctionId);
    await kickLiveKitParticipant(junctionId, target.identity);
  } else if (action === "promote_mod") {
    if (isPrivateRoom) {
      return { success: false, error: "Private rooms can only have one host: the room creator." };
    }
    await supabase
      .from("junction_participants")
      .update({ role: "moderator" })
      .eq("id", target.id);
  } else if (action === "demote_mod") {
    if (isPrivateRoom && isCreatorHost && cleanTargetId === cleanCreator) {
      return { success: false, error: "The room creator cannot be demoted from host." };
    }
    // Cannot demote yourself unless admin
    if (cleanTargetId === cleanModId && !isCallerAdmin) {
      return { success: false, error: "Cannot demote yourself" };
    }

    await supabase
      .from("junction_participants")
      .update({ role: "speaker" })
      .eq("id", target.id);
  }

  const updated = await fetchJunctionWithParticipants(junctionId);
  return { success: true, junction: updated };
}


export async function claimModeratorRole(
  _junctionId: string,
  _identity: string
): Promise<{ success: boolean; error?: string; isLocked?: boolean; junction?: Junction }> {
  return {
    success: false,
    error: "Room Host concept has been decommissioned. All participants are equal speakers.",
  };
}

export async function updateParticipantProfile(
  junctionId: string,
  identity: string,
  updates: { name?: string; avatar?: string; color?: string; cardBgColor?: string; isMuted?: boolean }
): Promise<{ success: boolean; error?: string; isLocked?: boolean; junction?: Junction }> {
  const junction = await fetchJunctionWithParticipants(junctionId);

  if (!junction) {
    return { success: false, error: "Junction not found" };
  }

  const cleanId = (identity || "").trim().toLowerCase();
  const existing = junction.participants.find(
    (p) => (p.identity || "").trim().toLowerCase() === cleanId
  );
  if (!existing) {
    return { success: false, error: "Participant not found" };
  }

  const updatePayload: Record<string, any> = {};
  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.avatar !== undefined) updatePayload.avatar = updates.avatar;
  if (updates.color !== undefined || updates.cardBgColor !== undefined) {
    updatePayload.color = encodeParticipantColor(
      updates.color || existing.color,
      updates.cardBgColor || existing.cardBgColor
    );
  }
  if (updates.isMuted !== undefined) updatePayload.is_muted = updates.isMuted;

  if (Object.keys(updatePayload).length > 0) {
    await supabase
      .from("junction_participants")
      .update(updatePayload)
      .eq("id", existing.id);
  }

  const updated = await fetchJunctionWithParticipants(junctionId);
  return { success: true, junction: updated };
}

export async function updateJunctionDetails(
  junctionId: string,
  moderatorIdentity: string,
  updates: { name?: string; maxParticipants?: number }
): Promise<{ success: boolean; error?: string; isLocked?: boolean; junction?: Junction }> {
  const { data: jRow, error: jError } = await supabase
    .from("junctions")
    .select("id, is_custom, creator_id, moderator_identity")
    .eq("id", junctionId)
    .single();

  if (jError || !jRow) return { success: false, error: "Junction not found" };

  const isPrivate = Boolean(
    jRow.is_custom ||
    jRow.creator_id ||
    (typeof jRow.id === "string" && jRow.id.startsWith("junc_"))
  );

  if (!isPrivate) {
    return { success: false, error: "Room capacity can only be modified in private rooms." };
  }

  const cleanMod = (moderatorIdentity || "").trim().toLowerCase();
  const cleanCreator = (jRow.creator_id || "").trim().toLowerCase();
  const isCreator = Boolean(cleanCreator && cleanMod === cleanCreator);

  const { data: modParticipant } = await supabase
    .from("junction_participants")
    .select("role")
    .eq("junction_id", junctionId)
    .ilike("identity", cleanMod)
    .maybeSingle();

  const isMod = modParticipant?.role === "moderator";

  if (!isCreator && !isMod) {
    return { success: false, error: "Only the private room host can edit room capacity." };
  }

  const updateData: any = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.maxParticipants !== undefined) {
    const newCap = Math.max(2, Math.min(16, Number(updates.maxParticipants)));
    updateData.max_participants = newCap;
  }

  if (Object.keys(updateData).length === 0) return { success: true };

  const { error: updateError } = await supabase
    .from("junctions")
    .update(updateData)
    .eq("id", junctionId);

  if (updateError) {
    console.error("Failed to update junction details:", updateError);
    return { success: false, error: "Database update failed" };
  }

  const updatedJunction = await fetchJunctionWithParticipants(junctionId);
  invalidateJunctionsCache();
  return { success: true, junction: updatedJunction };
}


export async function toggleRoomLock(
  junctionId: string,
  moderatorIdentity: string,
  isLocked: boolean,
  callerRoleParam?: string,
  moderatorUserId?: string
): Promise<{ success: boolean; error?: string; isLocked?: boolean; junction?: Junction }> {
  const junction = await fetchJunctionWithParticipants(junctionId);

  if (!junction) {
    return { success: false, error: "Junction not found" };
  }

  const isPrivate = Boolean(
    junction.isCustom ||
    junction.creatorId ||
    (typeof junction.id === "string" && junction.id.startsWith("junc_"))
  );

  // Locking a public station is disallowed, but unlocking can be done if room is locked
  if (!isPrivate && isLocked) {
    return { success: false, error: "Cannot lock a public station" };
  }

  // Determine platform role of the caller
  let callerRole: UserRole = resolvePlatformRole(moderatorIdentity, callerRoleParam);
  if (callerRole === "user") {
    try {
      let query = supabase.from("profiles").select("*");
      if (moderatorUserId && isUUID(moderatorUserId)) {
        query = query.or(`id.eq.${moderatorUserId},username.ilike.${moderatorIdentity}`);
      } else {
        query = query.ilike("username", moderatorIdentity);
      }
      const { data: callerProf } = await query.maybeSingle();

      if (callerProf) {
        callerRole = resolvePlatformRole(callerProf.username, callerProf.role || callerProf.social_links?.role);
      }
    } catch (e) {
      console.error("Error resolving caller platform role in toggleRoomLock:", e);
    }
  }

  const isSuperAdmin = callerRole === "super_admin";
  const isStaff = isSuperAdmin || callerRole === "admin" || callerRole === "manager";

  const cleanModId = (moderatorIdentity || "").trim().toLowerCase();
  const cleanCreator = (junction.creatorId || "").trim().toLowerCase();
  const cleanModIdentity = (junction.moderatorIdentity || "").trim().toLowerCase();
  const cleanUserId = (moderatorUserId || "").trim().toLowerCase();

  const isCreator = Boolean(
    (cleanCreator && (cleanModId === cleanCreator || (cleanUserId && cleanUserId === cleanCreator))) ||
    (cleanModIdentity && (cleanModId === cleanModIdentity || (cleanUserId && cleanUserId === cleanModIdentity)))
  );

  let isMod = false;
  if (!isCreator && !isStaff) {
    const { data: modParticipant } = await supabase
      .from("junction_participants")
      .select("role")
      .eq("junction_id", junctionId)
      .ilike("identity", cleanModId)
      .maybeSingle();
    isMod = modParticipant?.role === "moderator";
  }

  // Super Admin has authority to lock/unlock any room. Room hosts / mods can lock/unlock private rooms.
  if (!isCreator && !isMod && !isStaff) {
    return { success: false, error: "Unauthorized: Only the room host or Super Admin can lock or unlock the room" };
  }

  await supabase
    .from("junctions")
    .update({ is_locked: isLocked })
    .eq("id", junctionId);

  // Broadcast realtime event so all active clients update instantly
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const sb = (serviceKey && url)
      ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
      : supabase;
    sb.channel(`room_realtime_${junctionId}`).send({
      type: "broadcast",
      event: "room_updated",
      payload: {
        type: "room_lock_updated",
        payload: { isLocked },
      },
    }).then();
  } catch (broadcastErr) {
    console.warn("Failed to broadcast room_lock_updated:", broadcastErr);
  }

  const updated = await fetchJunctionWithParticipants(junctionId);
  invalidateJunctionsCache();
  return { success: true, junction: updated };
}

export async function deleteJunction(
  junctionId: string,
  creatorId?: string,
  callerRole?: string
): Promise<boolean> {
  const isSuperAdmin = callerRole === "super_admin";

  const junction = await fetchJunctionWithParticipants(junctionId);
  if (!junction) return false;

  const isPrivate = Boolean(
    junction.isCustom ||
    junction.creatorId ||
    (typeof junction.id === "string" && junction.id.startsWith("junc_"))
  );

  // Rule 1: Public Junctions (Stations) can ONLY be deleted by Super Admin
  if (!isPrivate) {
    if (!isSuperAdmin) {
      return false;
    }
  } else {
    // Rule 2: Private rooms can ONLY be deleted by the room creator or Super Admin
    if (!isSuperAdmin) {
      if (!creatorId) return false;
      const cleanParam = creatorId.trim().toLowerCase();
      const cleanCreator = (junction.creatorId || "").trim().toLowerCase();
      const cleanMod = (junction.moderatorIdentity || "").trim().toLowerCase();
      if (cleanCreator !== cleanParam && cleanMod !== cleanParam) {
        return false;
      }
    }
  }

  // Participants are cascade-deleted by the FK constraint
  const { error } = await supabase
    .from("junctions")
    .delete()
    .eq("id", junctionId);

  if (!error) {
    waitingGuestsByJunction.delete(junctionId);
    admittedIdentitiesByJunction.delete(junctionId);
    invalidateJunctionsCache();
    return true;
  }
  return false;
}

// In-memory room reports tracker: Map<room:target, Array<{ reporter: string; reason: string; timestamp: number }>>
const roomReportLog = new Map<string, Array<{ reporter: string; reason: string; timestamp: number }>>();

// Global in-memory platform reports log
const globalReportsLog: UserReportRecord[] = [];

export function getGlobalReports(): UserReportRecord[] {
  return [...globalReportsLog];
}

export function updateGlobalReportStatus(reportId: string, status: 'pending' | 'resolved' | 'dismissed'): boolean {
  const item = globalReportsLog.find((r) => r.id === reportId);
  if (item) {
    item.status = status;
    return true;
  }
  return false;
}

export function deleteGlobalReport(reportId: string): boolean {
  const index = globalReportsLog.findIndex((r) => r.id === reportId);
  if (index !== -1) {
    globalReportsLog.splice(index, 1);
    return true;
  }
  return false;
}

export async function reportParticipant(
  junctionId: string,
  reporterIdentity: string,
  targetIdentity: string,
  reason?: string
): Promise<{ success: boolean; error?: string; junction?: Junction; banned?: boolean; report?: UserReportRecord }> {
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    return { success: false, error: "Please enter a reason for reporting this participant." };
  }

  const junction = await fetchJunctionWithParticipants(junctionId);
  if (!junction) {
    return { success: false, error: "Junction not found" };
  }

  const cleanTargetId = (targetIdentity || "").trim().toLowerCase();
  const cleanReporterId = (reporterIdentity || "").trim().toLowerCase();

  const target = junction.participants.find(
    (p) => (p.identity || "").trim().toLowerCase() === cleanTargetId
  );
  if (!target) {
    return { success: false, error: "Target participant not in junction" };
  }

  if ((target.identity || "").trim().toLowerCase() === cleanReporterId) {
    return { success: false, error: "Cannot report yourself" };
  }

  const reporterParticipant = junction.participants.find(
    (p) => (p.identity || "").trim().toLowerCase() === cleanReporterId
  );

  const reportKey = `${junctionId}:${cleanTargetId}`;
  const existingReports = roomReportLog.get(reportKey) || [];

  if (existingReports.some((r) => r.reporter.toLowerCase() === cleanReporterId)) {
    return { success: false, error: "You have already reported this user in this room." };
  }

  // Parse category if reason formatted as "[Category] Detail"
  const catMatch = reason.trim().match(/^\[(.*?)\]\s*(.*)$/);
  const category = catMatch ? catMatch[1] : "General";

  const reportEntry = {
    reporter: reporterIdentity,
    reason: reason.trim(),
    timestamp: Date.now(),
  };
  const newReports = [...existingReports, reportEntry];
  roomReportLog.set(reportKey, newReports);

  // Update target in-memory reportedBy list
  target.reportedBy = Array.from(new Set([...(target.reportedBy || []), cleanReporterId]));

  const reportRecord: UserReportRecord = {
    id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    reporterIdentity,
    reporterName: reporterParticipant?.name || reporterIdentity,
    targetIdentity: target.identity,
    targetName: target.name || target.identity,
    targetUsername: target.username || target.identity,
    targetAvatar: target.avatar || "user",
    targetIsGuest: !target.id || target.id.startsWith("guest_") || target.id.startsWith("p_"),
    junctionId,
    junctionName: junction.name,
    category,
    reason: reason.trim(),
    timestamp: Date.now(),
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  // Add to in-memory global reports list
  globalReportsLog.unshift(reportRecord);

  // Persist to Super Admin ('jayanthadmin') platform_reports in social_links
  try {
    const { data: adminProf } = await supabase
      .from("profiles")
      .select("id, social_links")
      .ilike("username", "jayanthadmin")
      .maybeSingle();

    if (adminProf) {
      const links = adminProf.social_links || {};
      const existing = Array.isArray(links.platform_reports) ? links.platform_reports : [];
      // Keep up to 100 recent reports
      const updated = [reportRecord, ...existing.filter((r: any) => r.id !== reportRecord.id)].slice(0, 100);
      await supabase
        .from("profiles")
        .update({
          social_links: {
            ...links,
            platform_reports: updated,
            last_report_at: Date.now(),
          },
        })
        .eq("id", adminProf.id);
    }
  } catch (err) {
    console.warn("Failed to persist report to admin profile:", err);
  }

  // Also persist to target user's profile if registered
  try {
    const isTargetUuid = Boolean(target.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.id));
    const { data: targetProf } = await (isTargetUuid
      ? supabase.from("profiles").select("id, social_links").eq("id", target.id).maybeSingle()
      : target.username
      ? supabase.from("profiles").select("id, social_links").ilike("username", target.username).maybeSingle()
      : supabase.from("profiles").select("id, social_links").ilike("username", target.identity).maybeSingle());

    if (targetProf) {
      const links = targetProf.social_links || {};
      const profileReports = Array.isArray(links.reports) ? links.reports : [];
      profileReports.unshift(reportRecord);
      await supabase
        .from("profiles")
        .update({
          social_links: {
            ...links,
            reports: profileReports.slice(0, 50),
            last_reported_at: Date.now(),
          },
        })
        .eq("id", targetProf.id);
    }
  } catch (err) {
    console.warn("Failed to persist report to target profile:", err);
  }

  // Require majority of the room to ban (min 2 reports for small rooms)
  const requiredReports = Math.max(2, Math.ceil(junction.participants.length / 2));

  if (newReports.length >= requiredReports) {
    const currentBanned = junction.bannedIdentities || [];
    if (!currentBanned.some((b) => (b || "").trim().toLowerCase() === cleanTargetId)) {
      currentBanned.push(target.identity);
    }
    await supabase
      .from("junctions")
      .update({ banned_identities: currentBanned })
      .eq("id", junctionId);

    await supabase
      .from("junction_participants")
      .delete()
      .eq("id", target.id);
      
    await syncCount(junctionId);

    const updated = await fetchJunctionWithParticipants(junctionId);
    return { success: true, junction: updated, banned: true, report: reportRecord };
  } else {
    return { success: true, junction, banned: false, report: reportRecord };
  }
}

