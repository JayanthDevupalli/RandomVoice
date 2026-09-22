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
  role: string;
  is_muted: boolean;
  is_muted_by_mod: boolean;
  is_speaking: boolean;
  joined_at: number;
  connection_quality: string;
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
    currentCount: row.current_count,
    createdAt: row.created_at,
    isCustom: row.is_custom,
    creatorId: row.creator_id || undefined,
    moderatorIdentity: row.moderator_identity,
    isLocked: row.is_locked,
    bannedIdentities: row.banned_identities || [],
    participants: participants.map(rowToParticipant),
  };
}

function rowToParticipant(row: ParticipantRow): JunctionParticipant {
  return {
    id: row.id,
    identity: row.identity,
    name: row.name,
    avatar: row.avatar,
    color: row.color,
    role: row.role as JunctionParticipant["role"],
    isMuted: row.is_muted,
    isMutedByMod: row.is_muted_by_mod,
    isSpeaking: row.is_speaking,
    joinedAt: row.joined_at,
    connectionQuality: row.connection_quality as JunctionParticipant["connectionQuality"],
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

  return rowToJunction(jRow as JunctionRow, (pRows || []) as ParticipantRow[]);
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

  const isAlreadyPresent = junction.participants.some((p) => p.identity === participant.identity);

  if (junction.currentCount >= junction.maxParticipants && !isAlreadyPresent) {
    return { success: false, error: "Junction is full (Max 7 seats reached)" };
  }

  const isCreator = participant.identity === junction.creatorId;

  // Dynamic host assignment: first person to join an empty room becomes the moderator/host.
  // This applies whether moderator_identity is empty (new room) or the current moderator has left.
  const isRoomEmpty = junction.participants.length === 0;
  const currentModPresent = junction.participants.some((p) => p.identity === junction.moderatorIdentity);
  
  // A participant becomes a mod if they are the creator, OR if they were already the mod, OR if there's no mod present.
  let isMod = false;
  if (isCreator) {
    isMod = true;
  } else if (participant.identity === junction.moderatorIdentity) {
    isMod = true;
  } else if (isRoomEmpty || !currentModPresent) {
    isMod = true;
  }

  if (!isAlreadyPresent) {
    // Insert new participant
    await supabase.from("junction_participants").insert({
      id: participant.id,
      junction_id: junctionId,
      identity: participant.identity,
      name: participant.name,
      avatar: participant.avatar || "zap",
      color: participant.color || "#6366F1",
      role: isMod ? "moderator" : (participant.role || "speaker"),
      is_muted: participant.isMuted || false,
      is_muted_by_mod: false,
      is_speaking: participant.isSpeaking || false,
      joined_at: Date.now(),
      connection_quality: participant.connectionQuality || "excellent",
    });
    await syncCount(junctionId);

    // If this participant became the host, update the junction's moderator_identity
    if (isMod && junction.moderatorIdentity !== participant.identity) {
      await supabase
        .from("junctions")
        .update({ moderator_identity: participant.identity })
        .eq("id", junctionId);
        
      if (junction.moderatorIdentity) {
        await supabase
          .from("junction_participants")
          .update({ role: "speaker" })
          .eq("junction_id", junctionId)
          .eq("identity", junction.moderatorIdentity);
      }
    }
  } else {
    // Update existing participant (re-joining)
    const existing = junction.participants.find((p) => p.identity === participant.identity);
    await supabase
      .from("junction_participants")
      .update({
        name: participant.name,
        avatar: participant.avatar || existing?.avatar || "zap",
        color: participant.color || existing?.color || "#6366F1",
        role: isMod ? "moderator" : (existing?.role || participant.role || "speaker"),
      })
      .eq("junction_id", junctionId)
      .eq("identity", participant.identity);

    // If re-joining and should become host, update moderator_identity and demote old host if necessary
    if (isMod && junction.moderatorIdentity !== participant.identity) {
      await supabase
        .from("junctions")
        .update({ moderator_identity: participant.identity })
        .eq("id", junctionId);
        
      if (junction.moderatorIdentity) {
        await supabase
          .from("junction_participants")
          .update({ role: "speaker" })
          .eq("junction_id", junctionId)
          .eq("identity", junction.moderatorIdentity);
      }
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

  // Check if moderator left — if so, promote oldest remaining
  const junction = await fetchJunctionWithParticipants(junctionId);
  if (!junction) return;

  if (junction.moderatorIdentity === identity && junction.participants.length > 0) {
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
  action: "mute" | "unmute" | "kick" | "ban" | "transfer_mod"
): Promise<{ success: boolean; error?: string; junction?: Junction }> {
  const junction = await fetchJunctionWithParticipants(junctionId);

  if (!junction) {
    return { success: false, error: "Junction not found" };
  }

  if (junction.moderatorIdentity !== moderatorIdentity) {
    return { success: false, error: "Unauthorized: Only the Moderator can perform moderation actions" };
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
      .update({ is_muted_by_mod: false })
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
  } else if (action === "transfer_mod") {
    const target = junction.participants.find((p) => p.identity === targetIdentity);
    if (!target) {
      return { success: false, error: "Target participant not in junction" };
    }

    // Demote current moderator
    await supabase
      .from("junction_participants")
      .update({ role: "speaker" })
      .eq("junction_id", junctionId)
      .eq("identity", moderatorIdentity);

    // Promote new moderator
    await supabase
      .from("junction_participants")
      .update({ role: "moderator" })
      .eq("junction_id", junctionId)
      .eq("identity", targetIdentity);

    await supabase
      .from("junctions")
      .update({ moderator_identity: targetIdentity })
      .eq("id", junctionId);
  }

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

