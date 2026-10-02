import { supabase } from "./supabase";
import { Junction, JunctionParticipant } from "./types";

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
  card_pattern?: string;
  role: string;
  is_muted: boolean;
  is_muted_by_mod: boolean;
  is_speaking: boolean;
  joined_at: number;
  connection_quality: string;
  reported_by: string[];
}

function rowToJunction(row: JunctionRow, participants: ParticipantRow[]): Junction {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category as Junction["category"],
    icon: row.icon,
    tags: row.tags || [],
    maxParticipants: row.max_participants,
    currentCount: participants.length,
    createdAt: row.created_at,
    isCustom: row.is_custom,
    creatorId: row.creator_id || undefined,
    moderatorIdentity: row.moderator_identity,
    isLocked: row.is_locked,
    bannedIdentities: row.banned_identities || [],
    participants: participants.map(rowToParticipant),
  };
}

function encodeParticipantColor(color?: string, cardBgColor?: string, cardPattern?: string): string {
  const c = color || "#6366F1";
  const bg = cardBgColor || "#465B73";
  const p = cardPattern || "none";
  return `${c}|${bg}|${p}`;
}

function decodeParticipantColor(rawColor?: string): { color: string; cardBgColor: string; cardPattern: string } {
  if (!rawColor) {
    return { color: "#6366F1", cardBgColor: "#465B73", cardPattern: "none" };
  }
  if (rawColor.includes("|")) {
    const parts = rawColor.split("|");
    return {
      color: parts[0] || "#6366F1",
      cardBgColor: parts[1] || "#465B73",
      cardPattern: parts[2] || "none",
    };
  }
  return {
    color: rawColor,
    cardBgColor: "#465B73",
    cardPattern: "none",
  };
}

function rowToParticipant(row: ParticipantRow): JunctionParticipant {
  const decoded = decodeParticipantColor(row.color);
  return {
    id: row.id,
    identity: row.identity,
    name: row.name,
    avatar: row.avatar,
    color: decoded.color,
    cardBgColor: row.card_bg_color || decoded.cardBgColor,
    cardPattern: row.card_pattern || decoded.cardPattern,
    role: row.role as JunctionParticipant["role"],
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

  const participants = (pRows || []) as ParticipantRow[];
  if (jRow.current_count !== participants.length) {
    // Keep cached DB count synchronized
    await supabase
      .from("junctions")
      .update({ current_count: participants.length })
      .eq("id", junctionId);
  }

  return rowToJunction(jRow as JunctionRow, participants);
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

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getAllJunctions(): Promise<Junction[]> {
  const { data: jRows, error } = await supabase
    .from("junctions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !jRows) return [];

  const { data: pRows } = await supabase
    .from("junction_participants")
    .select("*")
    .order("joined_at", { ascending: true });

  const participantsByJunction: Record<string, ParticipantRow[]> = {};
  for (const p of (pRows || []) as ParticipantRow[]) {
    if (!participantsByJunction[p.junction_id]) {
      participantsByJunction[p.junction_id] = [];
    }
    participantsByJunction[p.junction_id].push(p);
  }

  // Synchronize any out-of-sync current_count columns in the background
  for (const row of (jRows as JunctionRow[])) {
    const realCount = (participantsByJunction[row.id] || []).length;
    if (row.current_count !== realCount) {
      supabase
        .from("junctions")
        .update({ current_count: realCount })
        .eq("id", row.id)
        .then();
    }
  }

  return (jRows as JunctionRow[]).map((row) =>
    rowToJunction(row, participantsByJunction[row.id] || [])
  );
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
    max_participants: data.maxParticipants || 7,
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
  return junction!;
}

export async function addParticipantToJunction(
  junctionId: string,
  participant: Omit<JunctionParticipant, "joinedAt">
): Promise<{ success: boolean; error?: string; junction?: Junction }> {
  const junction = await fetchJunctionWithParticipants(junctionId);

  if (!junction) {
    return { success: false, error: "Junction not found" };
  }

  // Check if participant is banned
  if (junction.bannedIdentities && junction.bannedIdentities.includes(participant.identity)) {
    return { success: false, error: "You have been banned from this junction by the moderator." };
  }

  // 0% Ghosting Guarantee: PREEMPTIVELY remove this identity from ALL OTHER junctions before joining this one.
  // This ensures that even if the browser crashes or disconnects without sending a 'leave' beacon,
  // the user's identity is strictly limited to 1 active seat across the entire platform.
  await supabase
    .from("junction_participants")
    .delete()
    .eq("identity", participant.identity)
    .neq("junction_id", junctionId);

  const isAlreadyPresent = junction.participants.some((p) => p.identity === participant.identity);

  if (junction.currentCount >= junction.maxParticipants && !isAlreadyPresent) {
    return { success: false, error: "Junction is full (Max 7 seats reached)" };
  }

  const isCreator = participant.identity === junction.creatorId;

  if (junction.isLocked && !isAlreadyPresent && !isCreator) {
    return { success: false, error: "This room is locked by the moderator." };
  }

  // Dynamic host assignment: first person to join an empty room becomes the moderator/host.
  // This applies whether moderator_identity is empty (new room) or the current moderator has left.
  const isRoomEmpty = junction.participants.length === 0;
  const currentModPresent = junction.participants.some((p) => p.role === "moderator");
  
  // A participant becomes a mod if they are the creator, OR if they were already the mod, OR if there's no mod present.
  let isMod = false;
  if (isCreator) {
    isMod = true;
  } else if (isAlreadyPresent && junction.participants.find(p => p.identity === participant.identity)?.role === "moderator") {
    isMod = true;
  } else if (isRoomEmpty || !currentModPresent) {
    isMod = true;
  }

  if (!isAlreadyPresent) {
    // Insert new participant securely
    const shouldModMute = Boolean(participant.isMutedByMod);
    const encodedColor = encodeParticipantColor(
      participant.color,
      participant.cardBgColor,
      participant.cardPattern
    );

    const { error: insertError } = await supabase.from("junction_participants").insert({
      id: "p_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5), // Securely generate fresh session ID
      junction_id: junctionId,
      identity: participant.identity,
      name: participant.name,
      avatar: participant.avatar || "zap",
      color: encodedColor,
      role: isMod ? "moderator" : (participant.role || "speaker"),
      is_muted: shouldModMute ? true : (participant.isMuted !== undefined ? participant.isMuted : true), // Default to muted on entry
      is_muted_by_mod: shouldModMute,
      is_speaking: false,
      joined_at: Date.now(),
      connection_quality: participant.connectionQuality || "excellent",
    });

    if (insertError) {
      console.error("Failed to insert participant:", insertError);
      return { success: false, error: "Database error: " + insertError.message };
    }

    await syncCount(junctionId);

    // If this participant became the host, update the junction's moderator_identity for legacy/fallback
    if (isMod && junction.moderatorIdentity !== participant.identity) {
      await supabase
        .from("junctions")
        .update({ moderator_identity: participant.identity })
        .eq("id", junctionId);
    }
  } else {
    // Update existing participant (re-joining) - preserve role and force-mute state!
    const existing = junction.participants.find((p) => p.identity === participant.identity);
    const shouldKeepModMute = Boolean(existing?.isMutedByMod || participant.isMutedByMod);
    const encodedColor = encodeParticipantColor(
      participant.color || existing?.color,
      participant.cardBgColor || existing?.cardBgColor,
      participant.cardPattern || existing?.cardPattern
    );

    const { error: updateError } = await supabase
      .from("junction_participants")
      .update({
        name: participant.name,
        avatar: participant.avatar || existing?.avatar || "zap",
        color: encodedColor,
        role: isMod ? "moderator" : (existing?.role || participant.role || "speaker"),
        is_muted_by_mod: shouldKeepModMute,
        is_muted: shouldKeepModMute ? true : (existing?.isMuted !== undefined ? existing.isMuted : true),
      })
      .eq("junction_id", junctionId)
      .eq("identity", participant.identity);

    if (updateError) {
      console.error("Failed to update participant:", updateError);
    }

    // If re-joining and should become host, update moderator_identity
    if (isMod && junction.moderatorIdentity !== participant.identity) {
      await supabase
        .from("junctions")
        .update({ moderator_identity: participant.identity })
        .eq("id", junctionId);
    }
  }

  const updated = await fetchJunctionWithParticipants(junctionId);
  return { success: true, junction: updated };
}

export async function removeParticipantFromJunction(junctionId: string, identity: string) {
  // Remove the participant
  await supabase
    .from("junction_participants")
    .delete()
    .eq("junction_id", junctionId)
    .or(`identity.eq.${identity},id.eq.${identity}`);

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
}

export async function moderateParticipant(
  junctionId: string,
  moderatorIdentity: string,
  targetIdentity: string,
  action: "mute" | "unmute" | "kick" | "ban" | "promote_mod" | "demote_mod"
): Promise<{ success: boolean; error?: string; junction?: Junction }> {
  const junction = await fetchJunctionWithParticipants(junctionId);

  if (!junction) {
    return { success: false, error: "Junction not found" };
  }

  const modParticipant = junction.participants.find(p => p.identity === moderatorIdentity);
  if (!modParticipant || modParticipant.role !== "moderator") {
    return { success: false, error: "Unauthorized: Only Moderators can perform moderation actions" };
  }

  if (action === "mute") {
    await supabase
      .from("junction_participants")
      .update({ is_muted: true, is_muted_by_mod: true, is_speaking: false })
      .eq("junction_id", junctionId)
      .eq("identity", targetIdentity);
  } else if (action === "unmute") {
    await supabase
      .from("junction_participants")
      .update({ is_muted_by_mod: false, is_muted: false })
      .eq("junction_id", junctionId)
      .eq("identity", targetIdentity);
  } else if (action === "kick") {
    await supabase
      .from("junction_participants")
      .delete()
      .eq("junction_id", junctionId)
      .eq("identity", targetIdentity);
    await syncCount(junctionId);
  } else if (action === "ban") {
    // Add to banned list
    const currentBanned = junction.bannedIdentities || [];
    if (!currentBanned.includes(targetIdentity)) {
      currentBanned.push(targetIdentity);
    }
    await supabase
      .from("junctions")
      .update({ banned_identities: currentBanned })
      .eq("id", junctionId);

    // Remove from participants
    await supabase
      .from("junction_participants")
      .delete()
      .eq("junction_id", junctionId)
      .eq("identity", targetIdentity);
    await syncCount(junctionId);
  } else if (action === "promote_mod") {
    const target = junction.participants.find((p) => p.identity === targetIdentity);
    if (!target) {
      return { success: false, error: "Target participant not in junction" };
    }

    // Promote new co-moderator
    await supabase
      .from("junction_participants")
      .update({ role: "moderator" })
      .eq("junction_id", junctionId)
      .eq("identity", targetIdentity);
      
  } else if (action === "demote_mod") {
    const target = junction.participants.find((p) => p.identity === targetIdentity);
    if (!target) {
      return { success: false, error: "Target participant not in junction" };
    }

    // Cannot demote yourself (must leave or have another mod do it to ensure 1 mod exists)
    if (targetIdentity === moderatorIdentity) {
      return { success: false, error: "Cannot demote yourself" };
    }

    await supabase
      .from("junction_participants")
      .update({ role: "speaker" })
      .eq("junction_id", junctionId)
      .eq("identity", targetIdentity);
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

  const participant = junction.participants.find((p) => p.identity === identity);
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
    .eq("junction_id", junctionId)
    .eq("identity", identity);

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
  updates: { name?: string; avatar?: string; color?: string; isMuted?: boolean }
): Promise<{ success: boolean; error?: string; junction?: Junction }> {
  const junction = await fetchJunctionWithParticipants(junctionId);

  if (!junction) {
    return { success: false, error: "Junction not found" };
  }

  const existing = junction.participants.find((p) => p.identity === identity);
  if (!existing) {
    return { success: false, error: "Participant not found" };
  }

  const updatePayload: Record<string, any> = {};
  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.avatar !== undefined) updatePayload.avatar = updates.avatar;
  if (updates.color !== undefined) updatePayload.color = updates.color;
  if (updates.isMuted !== undefined) updatePayload.is_muted = updates.isMuted;

  if (Object.keys(updatePayload).length > 0) {
    await supabase
      .from("junction_participants")
      .update(updatePayload)
      .eq("junction_id", junctionId)
      .eq("identity", identity);
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

  const modParticipant = junction.participants.find(p => p.identity === moderatorIdentity);
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
  return { success: true, junction: updated };
}

export async function deleteJunction(junctionId: string, creatorId?: string): Promise<boolean> {
  if (creatorId) {
    const junction = await fetchJunctionWithParticipants(junctionId);
    if (!junction) return false;
    if (junction.creatorId !== creatorId) return false;
  }

  // Participants are cascade-deleted by the FK constraint
  const { error } = await supabase
    .from("junctions")
    .delete()
    .eq("id", junctionId);

  return !error;
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

  const target = junction.participants.find((p) => p.identity === targetIdentity);
  if (!target) {
    return { success: false, error: "Target participant not in junction" };
  }

  if (target.identity === reporterIdentity) {
    return { success: false, error: "Cannot report yourself" };
  }

  const currentReports = target.reportedBy || [];
  if (currentReports.includes(reporterIdentity)) {
    return { success: false, error: "You have already reported this user" };
  }

  const newReports = [...currentReports, reporterIdentity];

  // Require majority of the room to ban (min 2 reports for small rooms)
  // 3-4 people: 2 reports
  // 5-6 people: 3 reports
  // 7 people: 4 reports
  const requiredReports = Math.max(2, Math.ceil(junction.participants.length / 2));

  if (newReports.length >= requiredReports) {
    // Execute ban directly without requiring a specific moderator auth
    const currentBanned = junction.bannedIdentities || [];
    if (!currentBanned.includes(targetIdentity)) {
      currentBanned.push(targetIdentity);
    }
    await supabase
      .from("junctions")
      .update({ banned_identities: currentBanned })
      .eq("id", junctionId);

    await supabase
      .from("junction_participants")
      .delete()
      .eq("junction_id", junctionId)
      .eq("identity", targetIdentity);
      
    await syncCount(junctionId);

    const updated = await fetchJunctionWithParticipants(junctionId);
    return { success: true, junction: updated, banned: true };
  } else {
    await supabase
      .from("junction_participants")
      .update({ reported_by: newReports })
      .eq("junction_id", junctionId)
      .eq("identity", targetIdentity);
      
    const updated = await fetchJunctionWithParticipants(junctionId);
    return { success: true, junction: updated, banned: false };
  }
}

