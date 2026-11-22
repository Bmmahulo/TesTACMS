import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && serviceRoleKey);
export const isLocalFallbackEnabled = !isSupabaseConfigured && process.env.NODE_ENV !== "production";

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

export function databaseUnavailable() {
  return Response.json(
    { error: "Supabase is not configured. Add the server environment variables and apply supabase/schema.sql." },
    { status: 503 },
  );
}