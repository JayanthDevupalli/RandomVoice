import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "⚠️  Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables.\n" +
    "   Rooms (junctions) will not persist. See supabase-schema.sql and .env.example for setup."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://pyxaklzbhymupsbconqh.supabase.co",
  supabaseAnonKey || "sb_publishable_i_fCLoaQX4XYvajt7sDWAg_2HW_sG7O"
);
