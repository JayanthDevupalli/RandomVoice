import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { normalizeRecoveryCode } from "@/lib/recovery-utils";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function hashRecoveryCode(normalizedCode: string): string {
  return "sha256:" + crypto.createHash("sha256").update(normalizedCode).digest("hex");
}

function constantTimeMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyStoredRecoveryCode(enteredCode: string, storedValue: string): boolean {
  const normalizedEntered = normalizeRecoveryCode(enteredCode);
  if (!normalizedEntered || !storedValue) return false;

  if (storedValue.startsWith("sha256:")) {
    return constantTimeMatch(hashRecoveryCode(normalizedEntered), storedValue);
  }

  return constantTimeMatch(normalizedEntered, normalizeRecoveryCode(storedValue));
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const ipLimit = checkRateLimit(`recover_ip:${ip}`, 5, 15 * 60_000);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Too many recovery attempts. Please wait 15 minutes and try again." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } }
      );
    }

    const { username, recoveryCode, newPassword } = await request.json();

    if (!username || !recoveryCode || !newPassword) {
      return NextResponse.json(
        { error: "Username, recovery code, and new password are all required." },
        { status: 400 }
      );
    }

    if (typeof newPassword !== "string" || newPassword.length < 6 || newPassword.length > 128) {
      return NextResponse.json(
        { error: "New password must be between 6 and 128 characters long." },
        { status: 400 }
      );
    }

    const cleanUsername = String(username).trim();
    const userLimit = checkRateLimit(`recover_user:${cleanUsername.toLowerCase()}`, 5, 15 * 60_000);
    if (!userLimit.allowed) {
      return NextResponse.json(
        { error: "Too many recovery attempts for this account. Please try again later." },
        { status: 429, headers: { "Retry-After": String(userLimit.retryAfterSeconds) } }
      );
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

    if (!serviceRoleKey || !supabaseUrl) {
      console.error("Missing SUPABASE_SERVICE_ROLE_KEY for account recovery");
      return NextResponse.json(
        { error: "Account recovery is temporarily unavailable. Please contact support." },
        { status: 500 }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Locate the user profile via privileged service-role client
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, username, recovery_code, social_links")
      .ilike("username", cleanUsername)
      .maybeSingle();

    const genericInvalidResponse = () =>
      NextResponse.json(
        { error: "Invalid username or recovery code. Please check and try again." },
        { status: 400 }
      );

    if (profileError || !profile) {
      return genericInvalidResponse();
    }

    // 2. Check private account_recovery_secrets table first, fallback to legacy columns
    let storedSecret: string | null = null;
    try {
      const { data: secretRow } = await adminClient
        .from("account_recovery_secrets")
        .select("code_hash")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (secretRow?.code_hash) {
        storedSecret = secretRow.code_hash;
      }
    } catch {
      // Private table not migrated yet; fall back to legacy profile field
    }

    if (!storedSecret) {
      storedSecret = profile.recovery_code || profile.social_links?.recovery_code || null;
    }

    if (!storedSecret || !verifyStoredRecoveryCode(String(recoveryCode), storedSecret)) {
      return genericInvalidResponse();
    }

    // 3. Update the user password in Supabase Auth via Admin Client
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      profile.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error("Error updating user password via admin API:", updateError);
      return NextResponse.json(
        { error: "Could not update password right now. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Password has been successfully updated. You can now log in.",
      username: profile.username,
    });
  } catch (err: any) {
    console.error("Account recovery error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred during account recovery." },
      { status: 500 }
    );
  }
}
