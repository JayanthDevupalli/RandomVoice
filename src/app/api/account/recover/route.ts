import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyRecoveryCode } from "@/lib/recovery-utils";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { username, recoveryCode, newPassword } = await request.json();

    if (!username || !recoveryCode || !newPassword) {
      return NextResponse.json(
        { error: "Username, recovery code, and new password are all required." },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim();

    // 1. Locate the user profile by username
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .ilike("username", cleanUsername)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "No account found with this username." },
        { status: 404 }
      );
    }

    // 2. Validate the recovery code
    const storedCode = profile.recovery_code || profile.social_links?.recovery_code;

    if (!storedCode) {
      return NextResponse.json(
        { error: "No recovery code is registered for this account. Please contact support." },
        { status: 400 }
      );
    }

    const isCodeValid = verifyRecoveryCode(recoveryCode, storedCode);
    if (!isCodeValid) {
      return NextResponse.json(
        { error: "Invalid recovery code. Please check and try again." },
        { status: 400 }
      );
    }

    // 3. Update the user password in Supabase Auth via Admin Client
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

    if (!serviceRoleKey || !supabaseUrl) {
      console.error("Missing SUPABASE_SERVICE_ROLE_KEY for account recovery");
      return NextResponse.json(
        {
          error:
            "Password reset requires SUPABASE_SERVICE_ROLE_KEY in .env.local. Please copy your service_role secret key from Supabase Dashboard (Settings -> API) to .env.local to enable server password reset.",
        },
        { status: 500 }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      profile.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error("Error updating user password via admin API:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Password has been successfully updated. You can now log in.",
      username: profile.username,
    });
  } catch (err: any) {
    console.error("Account recovery error:", err);
    return NextResponse.json(
      { error: err.message || "An unexpected error occurred during account recovery." },
      { status: 500 }
    );
  }
}
