import { NextRequest } from "next/server";
import { dashboardAuthorized, dashboardKeyUnavailable, unauthorized } from "@/lib/access";
import { databaseUnavailable, isLocalFallbackEnabled, supabase } from "@/lib/supabase";
import { credentialSchema } from "@/lib/validation";
import { addLocalCredential, listLocalCredentials } from "@/lib/local-store";

export async function GET(request: NextRequest) {
  if (!dashboardAuthorized(request)) return unauthorized();
  if (!supabase && isLocalFallbackEnabled) return Response.json(listLocalCredentials());
  if (!supabase) return databaseUnavailable();
  const { data, error } = await supabase.from("credentials").select("*").order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: NextRequest) {
  if (!process.env.ACAMS_DASHBOARD_KEY && process.env.NODE_ENV === "production") return dashboardKeyUnavailable();
  if (!dashboardAuthorized(request)) return unauthorized();
  const parsed = credentialSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid credential" }, { status: 400 });
  const credential = { ...parsed.data, value: parsed.data.type === "RFID" ? parsed.data.value.toUpperCase() : parsed.data.value };
  if (!supabase && isLocalFallbackEnabled) {
    const result = addLocalCredential(credential);
    if ("error" in result) return Response.json({ error: result.error }, { status: 409 });
    return Response.json(result.data, { status: 201 });
  }
  if (!supabase) return databaseUnavailable();
  const { data, error } = await supabase.from("credentials").insert(credential).select("*").single();
  if (error) return Response.json({ error: error.code === "23505" ? "That credential already exists." : error.message }, { status: 400 });
  return Response.json(data, { status: 201 });
}