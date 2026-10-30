import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase as anonSupabase } from "@/lib/supabase";

export interface MaintenanceData {
  enabled: boolean;
  title: string;
  message: string;
  severity: "warning" | "alert" | "info";
  updated_at: string | null;
  updated_by: string | null;
}

export const DEFAULT_MAINTENANCE_STATE: MaintenanceData = {
  enabled: false,
  title: "Maintenance in Progress",
  message: "Platform updates in progress. Voice rooms & features remain active!",
  severity: "warning",
  updated_at: null,
  updated_by: null,
};

// Global in-memory cache for node process resilience
declare global {
  var __yapclub_maintenance_cache__: MaintenanceData | undefined;
}

export function getMemoryCache(): MaintenanceData {
  if (!globalThis.__yapclub_maintenance_cache__) {
    globalThis.__yapclub_maintenance_cache__ = { ...DEFAULT_MAINTENANCE_STATE };
  }
  return globalThis.__yapclub_maintenance_cache__;
}

export function setMemoryCache(data: MaintenanceData) {
  globalThis.__yapclub_maintenance_cache__ = { ...data };
}

export function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (serviceKey && url) {
    return createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return anonSupabase;
}

export function isMainAdmin(username?: string, role?: string): boolean {
  return role === "super_admin";
}

export async function verifySuperAdminAuth(
  request: NextRequest,
  fallbackUser?: { username?: string; role?: string }
): Promise<{ authorized: boolean; username?: string }> {
  const authHeader = request.headers.get("authorization");
  const secretKey = request.headers.get("x-admin-key");

  const expectedSecret = process.env.ADMIN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (secretKey && expectedSecret && secretKey === expectedSecret) {
    return { authorized: true, username: "super_admin" };
  }

  const token =
    authHeader?.replace(/^Bearer\s+/i, "") ||
    request.nextUrl.searchParams.get("token") ||
    request.headers.get("x-supabase-token") ||
    undefined;

  const adminClient = getAdminClient();

  if (token) {
    try {
      const {
        data: { user: authUser },
        error,
      } = await adminClient.auth.getUser(token);
      if (!error && authUser) {
        const { data: profile } = await adminClient
          .from("profiles")
          .select("*")
          .eq("id", authUser.id)
          .maybeSingle();

        const username = profile?.username || authUser.user_metadata?.username || "";
        const dbRole = profile?.role || profile?.social_links?.role;
        if (dbRole === "super_admin") {
          return { authorized: true, username };
        }
      }
    } catch (e) {
      console.warn("verifySuperAdminAuth token check warning:", e);
    }
  }

  return { authorized: false };
}

// GET handler logic
export async function getMaintenanceResponse(): Promise<NextResponse> {
  const adminClient = getAdminClient();

  try {
    // 1. Try reading from system_settings table
    const { data, error } = await adminClient
      .from("system_settings")
      .select("value, updated_at, updated_by")
      .eq("key", "maintenance_mode")
      .maybeSingle();

    if (!error && data && data.value) {
      const val = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
      const resolved: MaintenanceData = {
        enabled: Boolean(val.enabled),
        title: val.title || DEFAULT_MAINTENANCE_STATE.title,
        message: val.message || DEFAULT_MAINTENANCE_STATE.message,
        severity: val.severity || "warning",
        updated_at: data.updated_at || val.updated_at || null,
        updated_by: data.updated_by || val.updated_by || null,
      };
      setMemoryCache(resolved);
      return NextResponse.json({ maintenance: resolved });
    }
  } catch (err) {
    console.warn("system_settings table query note (falling back to profiles/memory):", err);
  }

  // 2. Fallback: check profiles table for jayanthadmin's social_links->maintenance_mode
  try {
    const { data: superProfile } = await adminClient
      .from("profiles")
      .select("social_links")
      .ilike("username", "jayanthadmin")
      .maybeSingle();

    if (superProfile?.social_links?.maintenance_mode) {
      const val = superProfile.social_links.maintenance_mode;
      const resolved: MaintenanceData = {
        enabled: Boolean(val.enabled),
        title: val.title || DEFAULT_MAINTENANCE_STATE.title,
        message: val.message || DEFAULT_MAINTENANCE_STATE.message,
        severity: val.severity || "warning",
        updated_at: val.updated_at || null,
        updated_by: val.updated_by || "jayanthadmin",
      };
      setMemoryCache(resolved);
      return NextResponse.json({ maintenance: resolved });
    }
  } catch (err) {
    console.warn("profiles fallback note:", err);
  }

  // 3. Fallback to memory cache
  return NextResponse.json({ maintenance: getMemoryCache() });
}

// POST / PATCH handler logic
export async function updateMaintenanceResponse(request: NextRequest): Promise<NextResponse> {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const {
      enabled,
      title,
      message,
      severity,
      requesterUsername,
      requesterRole,
    } = body;

    const auth = await verifySuperAdminAuth(request, {
      username: requesterUsername,
      role: requesterRole,
    });

    if (!auth.authorized) {
      return NextResponse.json(
        {
          error:
            "Unauthorized: Only the Root Super Admin (jayanthadmin) has clearance to toggle platform maintenance mode.",
        },
        { status: 403 }
      );
    }

    const currentCache = getMemoryCache();
    const updatedState: MaintenanceData = {
      enabled: Boolean(enabled),
      title: (title || currentCache.title || DEFAULT_MAINTENANCE_STATE.title).trim(),
      message: (message || currentCache.message || DEFAULT_MAINTENANCE_STATE.message).trim(),
      severity: severity || currentCache.severity || "warning",
      updated_at: new Date().toISOString(),
      updated_by: auth.username || requesterUsername || "jayanthadmin",
    };

    // Update in-memory cache immediately
    setMemoryCache(updatedState);

    const adminClient = getAdminClient();

    // 1. Try persisting to system_settings table
    try {
      await adminClient.from("system_settings").upsert(
        {
          key: "maintenance_mode",
          value: updatedState,
          updated_at: updatedState.updated_at,
          updated_by: updatedState.updated_by,
        },
        { onConflict: "key" }
      );
    } catch (dbErr) {
      console.warn("system_settings upsert warning:", dbErr);
    }

    // 2. Also mirror into profiles for jayanthadmin (social_links) as resilient fallback
    try {
      const { data: prof } = await adminClient
        .from("profiles")
        .select("social_links")
        .ilike("username", "jayanthadmin")
        .maybeSingle();

      const existingLinks = prof?.social_links || {};
      await adminClient
        .from("profiles")
        .update({
          social_links: {
            ...existingLinks,
            maintenance_mode: updatedState,
          },
        })
        .ilike("username", "jayanthadmin");
    } catch (mirrorErr) {
      console.warn("profiles mirror warning:", mirrorErr);
    }

    // 3. Broadcast Realtime event to all connected clients
    try {
      const ch = adminClient.channel("maintenance_mode_broadcast");
      await ch.send({
        type: "broadcast",
        event: "maintenance_status_changed",
        payload: updatedState,
      });
    } catch (bErr) {
      console.warn("Realtime broadcast note:", bErr);
    }

    return NextResponse.json({
      success: true,
      message: updatedState.enabled
        ? "Platform Maintenance Mode has been ACTIVATED across the entire website."
        : "Platform Maintenance Mode has been DEACTIVATED. Normal operation restored.",
      maintenance: updatedState,
    });
  } catch (err: any) {
    console.error("Maintenance update error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

