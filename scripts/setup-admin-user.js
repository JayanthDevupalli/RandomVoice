const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://pyxaklzbhymupsbconqh.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const username = "jayanthadmin";
  const email = "jayanthadmin@users.yapclub.com";
  const userId = "91a0c532-09bd-4236-be79-a900574da961";

  // Check what columns exist by trying a minimal insert first
  console.log("Attempting minimal insert into profiles...");
  const { data: minProfile, error: minErr } = await supabase
    .from("profiles")
    .upsert({
      id: userId,
      username: username,
      avatar: "zap",
      bio: "YapClub Founder & Root Main Administrator",
      card_bg_color: "#1E1B4B",
    })
    .select();

  if (minErr) {
    console.error("Minimal insert error:", minErr);
  } else {
    console.log("Profile successfully created/upserted:", minProfile);
  }

  // Try updating with role if column exists
  const { error: roleErr } = await supabase
    .from("profiles")
    .update({ role: "super_admin" })
    .eq("id", userId);

  if (roleErr) {
    console.log("Note: 'role' column not present in profiles table yet. Run SQL migration to add it.");
  } else {
    console.log("Role column updated with 'super_admin'!");
  }
}

main().catch(console.error);
