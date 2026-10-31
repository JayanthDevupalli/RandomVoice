import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase as anonSupabase } from "@/lib/supabase";
import { getGlobalReports, updateGlobalReportStatus } from "@/lib/junctions-store";
import { UserReportRecord, UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (serviceKey && url) {
    return createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return anonSupabase;
}

async function verifyAdminAuth(
  request: NextRequest,
  fallbackUser?: { username?: string; role?: string }
): Promise<{ authorized: boolean; role?: UserRole; username?: string }> {
  const authHeader = request.headers.get("authorization");
  const secretKey = request.headers.get("x-admin-key");

  const expectedSecret = process.env.ADMIN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (secretKey && expectedSecret && secretKey === expectedSecret) {
    return { authorized: true, role: "super_admin", username: "super_admin" };
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
        if (dbRole === "super_admin" || dbRole === "admin" || dbRole === "manager") {
          return { authorized: true, role: dbRole as UserRole, username };
        }
      }
    } catch (e) {
      console.error("verifyAdminAuth error in admin/reports:", e);
    }
  }

  return { authorized: false };
}

// GET: Retrieve all persistent and live reports
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requesterUsername = searchParams.get("requesterUsername");
    const requesterRole = searchParams.get("requesterRole");

    const auth = await verifyAdminAuth(request, {
      username: requesterUsername || undefined,
      role: requesterRole || undefined,
    });
    if (!auth.authorized) {
      return NextResponse.json({ error: "Unauthorized: Staff access required." }, { status: 403 });
    }

    const adminClient = getAdminClient();
    const reportsMap = new Map<string, UserReportRecord>();

    // 1. Load active in-memory reports
    const inMemoryReports = getGlobalReports();
    for (const r of inMemoryReports) {
      if (r && r.id) {
        reportsMap.set(r.id, r);
      }
    }

    // 2. Load platform reports persisted on Super Admin ('jayanthadmin') profile
    try {
      const { data: adminProf } = await adminClient
        .from("profiles")
        .select("social_links")
        .ilike("username", "jayanthadmin")
        .maybeSingle();

      const platformReports = adminProf?.social_links?.platform_reports;
      if (Array.isArray(platformReports)) {
        for (const r of platformReports) {
          if (r && r.id && !reportsMap.has(r.id)) {
            reportsMap.set(r.id, r);
          }
        }
      }
    } catch (e) {
      console.error("Error fetching admin platform_reports:", e);
    }

    // 3. Scan user profiles for any reports stored directly in social_links.reports
    try {
      const { data: userProfiles } = await adminClient
        .from("profiles")
        .select("id, username, social_links")
        .not("social_links", "is", null)
        .limit(100);

      if (userProfiles) {
        for (const u of userProfiles) {
          const links = u.social_links;
          if (links && Array.isArray(links.reports)) {
            for (const r of links.reports) {
              if (r) {
                const repId = r.id || `rep_${r.timestamp || Date.now()}_${r.targetIdentity || u.username}`;
                if (!reportsMap.has(repId)) {
                  reportsMap.set(repId, {
                    id: repId,
                    reporterIdentity: r.reporter || r.reporterIdentity || "Anonymous",
                    reporterName: r.reporterName || r.reporter || "Anonymous",
                    targetIdentity: r.targetIdentity || u.username,
                    targetName: r.targetName || u.username,
                    targetUsername: r.targetUsername || u.username,
                    targetAvatar: r.targetAvatar || "user",
                    targetIsGuest: false,
                    junctionId: r.junctionId || "",
                    junctionName: r.junctionName || "Voice Room",
                    category: r.category || "General",
                    reason: r.reason || "Reported for community violation",
                    timestamp: r.timestamp || Date.now(),
                    createdAt: r.createdAt || new Date(r.timestamp || Date.now()).toISOString(),
                    status: r.status || "pending",
                  });
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("Error fetching user reports from profiles:", e);
    }

    const mergedReports = Array.from(reportsMap.values()).sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
    );

    return NextResponse.json({ reports: mergedReports });
  } catch (err: any) {
    console.error("Admin reports GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Update report status (e.g. resolve or dismiss report)
export async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: "Unauthorized: Staff access required." }, { status: 403 });
    }

    const body = await request.json();
    const { reportId, status } = body;

    if (!reportId || !status || !["pending", "resolved", "dismissed"].includes(status)) {
      return NextResponse.json({ error: "Missing or invalid report update parameters." }, { status: 400 });
    }

    // Update in-memory
    updateGlobalReportStatus(reportId, status);

    // Update in Super Admin profile
    const adminClient = getAdminClient();
    try {
      const { data: adminProf } = await adminClient
        .from("profiles")
        .select("id, social_links")
        .ilike("username", "jayanthadmin")
        .maybeSingle();

      if (adminProf) {
        const links = adminProf.social_links || {};
        const platformReports = Array.isArray(links.platform_reports) ? links.platform_reports : [];
        const updated = platformReports.map((r: any) =>
          r.id === reportId ? { ...r, status } : r
        );
        await adminClient
          .from("profiles")
          .update({
            social_links: {
              ...links,
              platform_reports: updated,
            },
          })
          .eq("id", adminProf.id);
      }
    } catch (e) {
      console.error("Error updating platform_reports in admin profile:", e);
    }

    return NextResponse.json({ success: true, message: `Report status updated to ${status}.` });
  } catch (err: any) {
    console.error("Admin reports PATCH error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Remove a report entry
export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized || (auth.role !== "super_admin" && auth.role !== "admin")) {
      return NextResponse.json({ error: "Unauthorized: Admin clearance required to delete reports." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get("reportId");

    if (!reportId) {
      return NextResponse.json({ error: "Missing reportId parameter." }, { status: 400 });
    }

    const adminClient = getAdminClient();
    try {
      const { data: adminProf } = await adminClient
        .from("profiles")
        .select("id, social_links")
        .ilike("username", "jayanthadmin")
        .maybeSingle();

      if (adminProf) {
        const links = adminProf.social_links || {};
        const platformReports = Array.isArray(links.platform_reports) ? links.platform_reports : [];
        const filtered = platformReports.filter((r: any) => r.id !== reportId);
        await adminClient
          .from("profiles")
          .update({
            social_links: {
              ...links,
              platform_reports: filtered,
            },
          })
          .eq("id", adminProf.id);
      }
    } catch (e) {
      console.error("Error removing report from admin profile:", e);
    }

    return NextResponse.json({ success: true, message: "Report deleted successfully." });
  } catch (err: any) {
    console.error("Admin reports DELETE error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

