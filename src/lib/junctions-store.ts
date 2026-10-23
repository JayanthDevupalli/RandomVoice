import { supabase as anonSupabase } from "./supabase";
import { createClient } from "@supabase/supabase-js";
import { Junction, JunctionParticipant, UserRole } from "./types";
import { kickLiveKitParticipant, muteLiveKitParticipant } from "./livekit-server";

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabase = (serviceKey && url)
  ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : anonSupabase;

export function resolvePlatformRole(username?: string, rawRole?: string): UserRole {
  if (username) {
    const clean = username.trim().toLowerCase();
    if (clean === "jayanthadmin" || clean === "jayanth") {
      return "super_admin";
    }
  }
  if (rawRole === "super_admin" || rawRole === "admin" || rawRole === "manager") {
    return rawRole as UserRole;
  }
  return "user";
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
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category as Junction["category"],
    icon: row.icon,
    tags: row.tags || [],
    maxParticipants: (row.max_participants === 7 || !row.max_participants) ? 10 : row.max_participants,
    currentCount: participants.length,
    createdAt: row.created_at,
    isCustom: row.is_custom,
    creatorId: row.creator_id || undefined,
    moderatorIdentity: row.moderator_identity,
    isLocked: row.is_locked,
    bannedIdentities: row.banned_identities || [],
    participants: participants.map((p) => rowToParticipant(p, roleMap, profileMap)),
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
  const cleanId = (row.identity || "").toLowerCase();
  const cleanName = (row.name || "").toLowerCase();
  const userProfile = profileMap?.[cleanId] || profileMap?.[cleanName];

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

  const rawRole = roleMap?.[cleanId] || roleMap?.[cleanName] || userProfile?.role;
  const userRole = resolvePlatformRole(row.name || row.identity, rawRole);
  const resolvedName = userProfile?.displayName || row.name || row.identity;
  const resolvedUsername = userProfile?.username || row.name || row.identity;
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

// ─── Fetch a junction with its participants ─────────────────────────────────

async function fetchJunctionWithParticipants(junctionId: string): Promise<Junction | undefined> {
  const { data: jRow, error } = await supabase
    .from("junctions")
    .select("*")
    .eq("id", junctionId)
    .single();

  if (error || !jRow) return undefined;

  const { data: pRows } = await supabase
    .from("junction_participants")
    .select("*")
    .eq("junction_id", junctionId)
    .order("joined_at", { ascending: true });

  const rawParticipants = (pRows || []) as ParticipantRow[];
  const identities = Array.from(
    new Set(
      rawParticipants
        .flatMap((p) => [p.identity, p.name])
        .filter(Boolean)
    )
  );
  
  const roleMap: Record<string, UserRole> = {};
  const profileMap: Record<string, ParticipantProfile> = {};
  const bannedUsernames = new Set<string>();

  // Fetch verified platform profiles ONLY for current participants in this junction
  const searchIdentities = Array.from(
    new Set(
      identities
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
        console.error("Error fetching participant platform profiles:", profError);
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
      console.error("Error fetching participant platform profiles:", e);
    }
  }

  // Filter out any suspended users and purge from this room
  const participants = rawParticipants.filter((p) => {
    if (bannedUsernames.has(p.identity.toLowerCase())) {
      supabase.from("junction_participants").delete().eq("id", p.id).then();
      return false;
    }
    return true;
  });

  return rowToJunction(jRow as JunctionRow, participants, roleMap, profileMap);
}

// ─── Sync current_count helper ──────────────────────────────────────────────

async function syncCount(junctionId: string) {
  const { count } = await supabase
    .from("junction_participants")
    .select("*", { count: "exact", head: true })
    .eq("junction_id", junctionId);

  await supabase
    .from("junctions")
    .update({ current_count: count || 0 })
    .eq("id", junctionId);
}

// ─── Fast In-Memory Cache for Lobby ──────────────────────────────────────────

let cachedJunctions: { list: Junction[]; timestamp: number } | null = null;
const LOBBY_CACHE_TTL_MS = 2500; // 2.5s TTL for sub-millisecond repeated queries

export function invalidateJunctionsCache() {
  cachedJunctions = null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

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

  // Filter out any suspended users from participant rows and purge from DB
  const participantsByJunction: Record<string, ParticipantRow[]> = {};
  for (const p of rawParticipants) {
    if (bannedUsernames.has(p.identity.toLowerCase())) {
      supabase.from("junction_participants").delete().eq("id", p.id).then();
      continue;
    }
    if (!participantsByJunction[p.junction_id]) {
      participantsByJunction[p.junction_id] = [];
    }
    participantsByJunction[p.junction_id].push(p);
  }

  const result = (jRows as JunctionRow[]).map((row) =>
    rowToJunction(row, participantsByJunction[row.id] || [], roleMap, profileMap)
  );

  cachedJunctions = { list: result, timestamp: Date.now() };
  return result;
}

export async function getJunctionById(id: string): Promise<Junction | undefined> {
  return fetchJunctionWithParticipants(id);
}

export async function createJunction(data: {
  name: string;
  description: string;
  category: Junction["category"];
  tags: string[];
  maxParticipants?: number;
  creator: { name: string; avatar: string; color: string };
  isLocked?: boolean;
}): Promise<Junction> {
  const creatorIdentity = data.creator.name;
  const junctionId = "junc_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 6);
  const now = Date.now();

  // Insert junction — creator is recorded but NOT auto-added as participant.
  // The first person to actually visit/join the room becomes the host (moderator).
  const { error: jError } = await supabase.from("junctions").insert({
    id: junctionId,
    name: data.name,
    description: data.description || "A user-created voice junction.",
    category: data.category,
    icon: "Mic",
    tags: data.tags.length > 0 ? data.tags : ["Custom", data.category],
    max_participants: data.maxParticipants || 10,
    current_count: 0,
    created_at: now,
    is_custom: true,
    creator_id: creatorIdentity,
    moderator_identity: "",
    is_locked: data.isLocked || false,
    banned_identities: [],
  });

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

export async function addParticipantToJunction(
  junctionId: string,
  participant: Omit<JunctionParticipant, "joinedAt">
): Promise<{ success: boolean; error?: string; junction?: Junction }> {
  const cleanParticipantIdentity = (participant.identity || "").trim().toLowerCase();

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

  // 0% Ghosting Guarantee: PREEMPTIVELY remove this identity from ALL OTHER junctions before joining this one.
  await supabase
    .from("junction_participants")
    .delete()
    .eq("identity", participant.identity)
    .neq("junction_id", junctionId);

  const existing = junction.participants.find(
    (p) => (p.identity || "").trim().toLowerCase() === cleanParticipantIdentity
  );
  const isAlreadyPresent = Boolean(existing);

  if (junction.currentCount >= junction.maxParticipants && !isAlreadyPresent) {
    return { success: false, error: `Junction is full (Max ${junction.maxParticipants || 10} seats reached)` };
  }

  const isCreator = cleanParticipantIdentity === (junction.creatorId || "").trim().toLowerCase();

  if (junction.isLocked && !isAlreadyPresent && !isCreator) {
    return { success: false, error: "This room is locked by the moderator." };
  }

  // Dynamic host assignment: first person to join an empty room becomes the moderator/host.
  const isRoomEmpty = junction.participants.length === 0;
  const currentModPresent = junction.participants.some((p) => p.role === "moderator");
  
  let isMod = false;
  if (isCreator) {
    isMod = true;
  } else if (isAlreadyPresent && existing?.role === "moderator") {
    isMod = true;
  } else if (isRoomEmpty || !currentModPresent) {
    isMod = true;
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

  const participantId = existing?.id || ("p_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5));
  const newRole = isMod ? "moderator" : (existing?.role || participant.role || "speaker");
  const newMuted = shouldKeepModMute ? true : (existing?.isMuted !== undefined ? existing.isMuted : (participant.isMuted !== undefined ? participant.isMuted : true));
  const joinedAtTime = existing?.joinedAt || Date.now();
  const newCount = isAlreadyPresent ? junction.participants.length : junction.participants.length + 1;

  // Execute database writes concurrently: upsert participant, remove ghost records, update count & moderator
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
    supabase
      .from("junctions")
      .update({
        current_count: newCount,
        ...(isMod && junction.moderatorIdentity !== participant.identity ? { moderator_identity: participant.identity } : {}),
      })
      .eq("id", junctionId),
  ]);

  if (upsertRes.error) {
    console.error("Failed to upsert participant:", upsertRes.error);
    return { success: false, error: "Database error: " + upsertRes.error.message };
  }

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
    moderatorIdentity: isMod ? participant.identity : junction.moderatorIdentity,
  };

  return { success: true, junction: updatedJunction };
}

export async function removeParticipantFromJunction(
  junctionId: string,
  identity: string,
  extra?: { identities?: string[]; name?: string; participantId?: string; userId?: string }
) {
  const targetSet = new Set<string>();
  if (identity) targetSet.add(identity.trim());
  if (extra?.name) targetSet.add(extra.name.trim());
  if (extra?.participantId) targetSet.add(extra.participantId.trim());
  if (extra?.userId) targetSet.add(extra.userId.trim());
  if (Array.isArray(extra?.identities)) {
    extra.identities.forEach((id) => id && targetSet.add(id.trim()));
  }

  // 1. Fetch current participants of this junction to find matches by identity, name, or id (case-insensitive)
  const { data: currentParticipants } = await supabase
    .from("junction_participants")
    .select("id, identity, name")
    .eq("junction_id", junctionId);

  const matchedIds = (currentParticipants || [])
    .filter((p) => {
      const pIdent = (p.identity || "").toLowerCase().trim();
      const pName = (p.name || "").toLowerCase().trim();
      const pId = (p.id || "").toLowerCase().trim();
      return Array.from(targetSet).some((t) => {
        const tLower = t.toLowerCase().trim();
        return pIdent === tLower || pName === tLower || pId === tLower;
      });
    })
    .map((p) => p.id);

  if (matchedIds.length > 0) {
    await supabase
      .from("junction_participants")
      .delete()
      .in("id", matchedIds);
  }

  // 2. Direct fallback delete for every target candidate using ilike on identity and name
  for (const t of Array.from(targetSet)) {
    if (!t) continue;
    await supabase
      .from("junction_participants")
      .delete()
      .eq("junction_id", junctionId)
      .or(`identity.eq.${t},identity.ilike.${t},name.eq.${t},name.ilike.${t},id.eq.${t}`);
  }

  await syncCount(junctionId);

  // Check if any moderators are left — if none, promote oldest remaining
  const junction = await fetchJunctionWithParticipants(junctionId);
  if (!junction) return;

  const modsLeft = junction.participants.filter(p => p.role === "moderator");
  if (modsLeft.length === 0 && junction.participants.length > 0) {
    const newMod = junction.participants[0];
    await supabase
      .from("junction_participants")
      .update({ role: "moderator" })
      .eq("junction_id", junctionId)
      .eq("identity", newMod.identity);

    await supabase
      .from("junctions")
      .update({ moderator_identity: newMod.identity })
      .eq("id", junctionId);
  }
  invalidateJunctionsCache();
}

export async function moderateParticipant(
  junctionId: string,
  moderatorIdentity: string,
  targetIdentity: string,
  action: "mute" | "unmute" | "kick" | "ban" | "unban" | "promote_mod" | "demote_mod",
  moderatorUserId?: string,
  requesterRole?: UserRole
): Promise<{ success: boolean; error?: string; junction?: Junction }> {
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

  const cleanModId = (moderatorIdentity || "").trim().toLowerCase();
  const modParticipant = junction.participants.find(
    (p) => (p.identity || "").trim().toLowerCase() === cleanModId
  );
  const isCallerRoomMod = Boolean(modParticipant && modParticipant.role === "moderator");

  if (!isCallerManager && !isCallerRoomMod) {
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
  // 1. Only official Staff (Managers, Admins, Main Admin) can kick or ban participants. Room hosts/regular users cannot force kick.
  if ((action === "kick" || action === "ban") && !isCallerManager) {
    return {
      success: false,
      error: "Unauthorized: Only official Staff (Managers, Admins, Main Admin) can kick or ban participants.",
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
    // Promote new co-moderator
    await supabase
      .from("junction_participants")
      .update({ role: "moderator" })
      .eq("id", target.id);
  } else if (action === "demote_mod") {
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
  junctionId: string,
  identity: string
): Promise<{ success: boolean; error?: string; junction?: Junction }> {
  const junction = await fetchJunctionWithParticipants(junctionId);

  if (!junction) {
    return { success: false, error: "Junction not found" };
  }

  const cleanId = (identity || "").trim().toLowerCase();
  const participant = junction.participants.find(
    (p) => (p.identity || "").trim().toLowerCase() === cleanId
  );
  if (!participant) {
    return { success: false, error: "Participant not found in junction" };
  }

  if (participant.role === "moderator") {
    return { success: true, junction };
  }

  // Check 3-minute timer (180,000 ms with 5s clock drift tolerance)
  const timeInRoom = Date.now() - (participant.joinedAt || Date.now());
  const MIN_CLAIM_TIME_MS = 175000;

  if (timeInRoom < MIN_CLAIM_TIME_MS) {
    const remainingSecs = Math.ceil((180000 - timeInRoom) / 1000);
    return {
      success: false,
      error: `You must wait 3 minutes before claiming Moderator privileges (${remainingSecs}s remaining).`,
    };
  }

  // Promote participant to moderator
  const { error: updateError } = await supabase
    .from("junction_participants")
    .update({ role: "moderator" })
    .eq("id", participant.id);

  if (updateError) {
    console.error("Failed to promote to moderator:", updateError);
    return { success: false, error: "Failed to promote to moderator" };
  }

  const updated = await fetchJunctionWithParticipants(junctionId);
  return { success: true, junction: updated };
}

export async function updateParticipantProfile(
  junctionId: string,
  identity: string,
  updates: { name?: string; avatar?: string; color?: string; cardBgColor?: string; isMuted?: boolean }
): Promise<{ success: boolean; error?: string; junction?: Junction }> {
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
): Promise<{ success: boolean; error?: string; junction?: Junction }> {
  const { data: jRow, error: jError } = await supabase
    .from("junctions")
    .select("moderator_identity")
    .eq("id", junctionId)
    .single();

  if (jError || !jRow) return { success: false, error: "Junction not found" };

  const modParticipant = await supabase
    .from("junction_participants")
    .select("role")
    .eq("junction_id", junctionId)
    .eq("identity", moderatorIdentity)
    .single();

  if (!modParticipant.data || modParticipant.data.role !== "moderator") {
    return { success: false, error: "Only moderators can edit junction details" };
  }

  const updateData: any = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.maxParticipants !== undefined) updateData.max_participants = updates.maxParticipants;

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
  isLocked: boolean
): Promise<{ success: boolean; error?: string; junction?: Junction }> {
  const junction = await fetchJunctionWithParticipants(junctionId);

  if (!junction) {
    return { success: false, error: "Junction not found" };
  }

  const cleanModId = (moderatorIdentity || "").trim().toLowerCase();
  const modParticipant = junction.participants.find(
    (p) => (p.identity || "").trim().toLowerCase() === cleanModId
  );
  if (!modParticipant || modParticipant.role !== "moderator") {
    return { success: false, error: "Unauthorized: Only Moderators can lock/unlock the room" };
  }

  if (!junction.isCustom) {
    return { success: false, error: "Cannot lock a public station" };
  }

  await supabase
    .from("junctions")
    .update({ is_locked: isLocked })
    .eq("id", junctionId);

  const updated = await fetchJunctionWithParticipants(junctionId);
  invalidateJunctionsCache();
  return { success: true, junction: updated };
}

export async function deleteJunction(
  junctionId: string,
  creatorId?: string,
  callerRole?: string
): Promise<boolean> {
  const isStaff =
    callerRole === "super_admin" ||
    callerRole === "admin" ||
    creatorId?.toLowerCase() === "jayanthadmin" ||
    creatorId?.toLowerCase() === "jayanth";

  // Prevent unauthenticated calls from deleting any rooms
  if (!creatorId && !isStaff) {
    return false;
  }

  const junction = await fetchJunctionWithParticipants(junctionId);
  if (!junction) return false;

  // Protect public stations from being deleted by non-staff
  if (!junction.isCustom && !isStaff) {
    return false;
  }

  if (creatorId && !isStaff) {
    if (junction.creatorId !== creatorId) return false;
  }

  // Participants are cascade-deleted by the FK constraint
  const { error } = await supabase
    .from("junctions")
    .delete()
    .eq("id", junctionId);

  if (!error) {
    invalidateJunctionsCache();
    return true;
  }
  return false;
}

export async function reportParticipant(
  junctionId: string,
  reporterIdentity: string,
  targetIdentity: string
): Promise<{ success: boolean; error?: string; junction?: Junction; banned?: boolean }> {
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

  const currentReports = target.reportedBy || [];
  if (currentReports.some((r) => (r || "").trim().toLowerCase() === cleanReporterId)) {
    return { success: false, error: "You have already reported this user" };
  }

  const newReports = [...currentReports, reporterIdentity];

  // Require majority of the room to ban (min 2 reports for small rooms)
  const requiredReports = Math.max(2, Math.ceil(junction.participants.length / 2));

  if (newReports.length >= requiredReports) {
    // Execute ban directly without requiring a specific moderator auth
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
    return { success: true, junction: updated, banned: true };
  } else {
    await supabase
      .from("junction_participants")
      .update({ reported_by: newReports })
      .eq("id", target.id);
      
    const updated = await fetchJunctionWithParticipants(junctionId);
    return { success: true, junction: updated, banned: false };
  }
}

